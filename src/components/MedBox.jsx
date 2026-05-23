import { useState, useEffect, useCallback } from 'react';
import { Settings, Plus, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { callDualTierAI } from '../utils/ai';

// ── JSON extractor (handles reasoning models that emit multiple blocks) ────────
function extractLastJson(text) {
  if (!text) throw new Error('Empty model response');
  const stripped = text.replace(/```json|```/g, '');
  const blocks = [];
  let depth = 0, start = -1;
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (stripped[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) { blocks.push(stripped.slice(start, i + 1)); start = -1; }
    }
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    try { return JSON.parse(blocks[i]); } catch (_) {}
  }
  throw new Error('No valid JSON found in model response');
}

// ── Medicine name helper ──────────────────────────────────────────────────────
function medName(m) {
  if (!m) return '';
  return typeof m === 'string' ? m : (m.name || '');
}

// ── 24h dose count (rolling calendar day) ────────────────────────────────────
function getDayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

function count24h(name, medEvents) {
  if (!name || !medEvents) return 0;
  const dayStart = getDayStart();
  return medEvents.filter(
    e => e.notes?.toLowerCase() === name.toLowerCase() &&
         new Date(e.start_time) >= dayStart
  ).length;
}

// ── Min-gap check: has N hours elapsed since last dose of this med? ───────────
function minGapElapsed(name, medEvents, minHours) {
  if (!minHours || !name || !medEvents?.length) return true;
  const relevant = medEvents
    .filter(e => e.notes?.toLowerCase() === name.toLowerCase())
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  if (!relevant.length) return true;
  return (Date.now() - new Date(relevant[0].start_time)) / 3_600_000 >= minHours;
}

function hoursUntilMinGap(name, medEvents, minHours) {
  if (!minHours || !name || !medEvents?.length) return null;
  const relevant = medEvents
    .filter(e => e.notes?.toLowerCase() === name.toLowerCase())
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  if (!relevant.length) return null;
  const nextMs = new Date(relevant[0].start_time).getTime() + minHours * 3_600_000;
  return Math.max(0, (nextMs - Date.now()) / 3_600_000);
}

// ── Taper: calculate active phase and current dose ────────────────────────────
function getTaperPhase(s) {
  if (!s?.is_tapering_regimen || !s.taper_steps?.length || !s.created_at) return null;
  const dayOffset = Math.floor((Date.now() - new Date(s.created_at)) / 86_400_000);
  let cumDay = 0;
  for (const step of s.taper_steps) {
    cumDay += step.durationInDays;
    if (dayOffset < cumDay) return step;
  }
  return s.taper_steps[s.taper_steps.length - 1]; // last phase (maintenance)
}

// ── Due logic ─────────────────────────────────────────────────────────────────

function isCapped(s, name, medEvents) {
  const cap = s.max_doses_per_24h;
  if (!cap || !name) return false;
  return count24h(name, medEvents) >= cap;
}

function getRotationDue(s, medEvents) {
  if (!s?.medicines) return null;
  const meds = s.medicines;
  const events = medEvents || [];
  const relevant = events
    .filter(e => meds.some(m => medName(m).toLowerCase() === e.notes?.toLowerCase()))
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  let startIdx = 0;
  if (relevant.length > 0) {
    const lastIdx = meds.findIndex(m => medName(m).toLowerCase() === relevant[0].notes?.toLowerCase());
    startIdx = (lastIdx < 0 ? 0 : lastIdx + 1) % meds.length;
  }
  for (let i = 0; i < meds.length; i++) {
    const m = meds[(startIdx + i) % meds.length];
    if (m && !isCapped(s, medName(m), events)) return medName(m);
  }
  return null;
}

function isIntervalDue(s, medEvents) {
  if (!s?.medicines?.[0] || !s.interval_hours) return false;
  const events = medEvents || [];
  const relevant = events
    .filter(e => s.medicines.some(m => medName(m).toLowerCase() === e.notes?.toLowerCase()))
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  if (!relevant.length) return true;
  return (Date.now() - new Date(relevant[0].start_time)) / 3_600_000 >= s.interval_hours;
}

function intervalHoursUntil(s, medEvents) {
  if (!s?.medicines?.[0] || !s.interval_hours) return null;
  const events = medEvents || [];
  const relevant = events
    .filter(e => s.medicines.some(m => medName(m).toLowerCase() === e.notes?.toLowerCase()))
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  if (!relevant.length) return null;
  const nextMs = new Date(relevant[0].start_time).getTime() + s.interval_hours * 3_600_000;
  return Math.max(0, (nextMs - Date.now()) / 3_600_000);
}

function isTimeWindowDue(s, medEvents) {
  if (!s?.window_start || !s.window_end) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sH, sM] = s.window_start.split(':').map(Number);
  const [eH, eM] = s.window_end.split(':').map(Number);
  if (cur < sH * 60 + sM || cur > eH * 60 + eM) return false;
  const winStart = new Date(now); winStart.setHours(sH, sM, 0, 0);
  const winEnd   = new Date(now); winEnd.setHours(eH, eM, 0, 0);
  return !(medEvents || []).some(e =>
    s.medicines.some(m => medName(m).toLowerCase() === e.notes?.toLowerCase()) &&
    new Date(e.start_time) >= winStart && new Date(e.start_time) <= winEnd
  );
}

function isSOSDue(s, name, medEvents) {
  // SOS: always available unless daily cap hit or min gap not elapsed
  if (isCapped(s, name, medEvents)) return false;
  if (!minGapElapsed(name, medEvents, s.min_hours_between_doses)) return false;
  return true;
}

// ── SPECIFIC_DAYS: is today one of the scheduled days? ───────────────────────
function isSpecificDayDue(s, medEvents) {
  if (!s?.specific_days?.length) return false;
  const todayISO = new Date().getDay() || 7; // JS 0=Sun → convert to ISO 1=Mon…7=Sun
  if (!s.specific_days.includes(todayISO)) return false;
  // Within today, treat like time_window or simply once-per-day
  const dayStart = getDayStart();
  return !(medEvents || []).some(e =>
    s.medicines.some(m => medName(m).toLowerCase() === e.notes?.toLowerCase()) &&
    new Date(e.start_time) >= dayStart
  );
}

// ── Labels ────────────────────────────────────────────────────────────────────
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function archetypeLabel(s) {
  if (s.frequency_type === 'SOS') return 'SOS / As needed';
  if (s.frequency_type === 'SPECIFIC_DAYS' && s.specific_days?.length)
    return s.specific_days.map(d => DAY_NAMES[d] || d).join(', ');
  if (s.archetype === 'rotation')    return 'Alternating';
  if (s.archetype === 'interval')    return s.interval_hours ? `Every ${s.interval_hours}h` : 'Daily';
  if (s.archetype === 'time_window') return (s.window_start && s.window_end) ? `${s.window_start}–${s.window_end}` : 'Daily';
  return 'Daily';
}

// ── NLP prompt ────────────────────────────────────────────────────────────────
const NLP_PROMPT = (input) => `You are a pediatric prescription parser. Parse the following into structured JSON.

Input: "${input}"

Rules:
- archetype: "rotation" = medicines alternate each dose | "interval" = fixed gap | "time_window" = once within a daily window | "sos" = as-needed
- frequency_type: "DAILY" | "INTERVAL" | "SPECIFIC_DAYS" | "SOS"
- specific_days uses ISO weekday numbers: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
- For tapering/step-up regimens set isTaperingRegimen=true and fill taperSteps
- Include dosage in the medicine name string (e.g. "Neopeptine 0.5ml")

Output ONLY valid JSON (no explanation):
{
  "archetype": "rotation" | "interval" | "time_window" | "sos",
  "frequency_type": "DAILY" | "INTERVAL" | "SPECIFIC_DAYS" | "SOS",
  "medicines": [{"name": "MedicineName Dose Unit"}],
  "interval_hours": null or number,
  "window_start": null or "HH:MM",
  "window_end": null or "HH:MM",
  "specific_days": null or [1,4],
  "preferred_times": null or ["08:00","20:00"],
  "timing": "before" | "after" | "with" | "anytime",
  "max_doses_per_24h": null or number,
  "min_hours_between_doses": null or number,
  "duration_days": null or number,
  "is_tapering_regimen": false or true,
  "taper_steps": null or [{"phaseOrder":1,"durationInDays":3,"doseValue":5,"doseUnit":"ml"}],
  "confidence": "high" | "medium" | "low"
}`;

// ── Sub-components ────────────────────────────────────────────────────────────

function TaperBadge({ s }) {
  const phase = getTaperPhase(s);
  if (!phase) return null;
  const total = s.taper_steps?.length || 0;
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, color: '#7c3aed', background: '#ede9fe',
      borderRadius: '99px', padding: '2px 7px', marginLeft: '4px' }}>
      Phase {phase.phaseOrder}/{total} · {phase.doseValue}{phase.doseUnit}
    </span>
  );
}

// MedRow removed to group properly in the main render loop.

function ConfirmPreview({ p, nlpInput, onEdit, onConfirm }) {
  const taperSteps = p.taper_steps;
  return (
    <div style={{ background: 'var(--bg-app)', borderRadius: '14px', padding: '16px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        You said: <em>"{nlpInput}"</em>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
        <div style={{ fontSize: '14px' }}>
          <strong>Medicines:</strong>{' '}
          {p.medicines?.map(m => medName(m)).join(' → ')}
        </div>
        <div style={{ fontSize: '14px' }}>
          <strong>Type:</strong>{' '}
          {p.frequency_type === 'SOS'            ? 'SOS / As needed' :
           p.frequency_type === 'SPECIFIC_DAYS'  ? `Specific days: ${(p.specific_days || []).map(d => DAY_NAMES[d]).join(', ')}` :
           p.archetype === 'rotation'            ? 'Alternating (one per dose)' :
           p.archetype === 'interval'            ? `Every ${p.interval_hours}h` :
           p.window_start                        ? `Window ${p.window_start}–${p.window_end}` :
           'Daily'}
        </div>
        {p.timing && p.timing !== 'anytime' && (
          <div style={{ fontSize: '14px' }}><strong>Timing:</strong> {p.timing} feed</div>
        )}
        {p.preferred_times?.length > 0 && (
          <div style={{ fontSize: '14px' }}><strong>Times:</strong> {p.preferred_times.join(', ')}</div>
        )}
        {p.max_doses_per_24h && (
          <div style={{ fontSize: '14px', color: '#b45309' }}>
            <strong>Cap:</strong> max {p.max_doses_per_24h}/day
          </div>
        )}
        {p.min_hours_between_doses && (
          <div style={{ fontSize: '14px' }}>
            <strong>Min gap:</strong> {p.min_hours_between_doses}h between doses
          </div>
        )}
        {p.duration_days && (
          <div style={{ fontSize: '14px', color: '#b45309', fontWeight: 600 }}>
            <strong>Duration:</strong> {p.duration_days} days
          </div>
        )}
        {p.is_tapering_regimen && taperSteps?.length > 0 && (
          <div style={{ fontSize: '14px' }}>
            <strong>Taper:</strong>
            <div style={{ marginTop: '4px', paddingLeft: '8px', borderLeft: '2px solid var(--border-soft)' }}>
              {taperSteps.map((step, i) => (
                <div key={i} style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Phase {step.phaseOrder}: {step.doseValue}{step.doseUnit} × {step.durationInDays}d
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ fontSize: '12px', color: p.confidence === 'high' ? 'var(--secondary)' : '#b45309' }}>
          Confidence: {p.confidence}
        </div>
      </div>
      <div className="grid-2">
        <button className="button-primary" style={{ background: '#eee', color: '#666' }} onClick={onEdit}>Edit</button>
        <button className="button-primary" onClick={onConfirm}>Save ✓</button>
      </div>
    </div>
  );
}

function ConfigModal({ schedules, nlpInput, setNlpInput, isParsing, parsedConfirm, parseError,
                       onParse, onConfirm, onDelete, onClose, setParsedConfirm, setParseError }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>💊 Medicine Schedules</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-muted)' }}>✕</button>
        </div>

        {schedules.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            {schedules.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(s.medicines || []).map(m => medName(m)).join(' → ')}
                    {s.is_tapering_regimen && <TaperBadge s={s} />}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {archetypeLabel(s)}{s.timing && s.timing !== 'anytime' ? ` · ${s.timing} feed` : ''}
                    {s.max_doses_per_24h ? ` · max ${s.max_doses_per_24h}/day` : ''}
                    {s.expires_at && (
                      <span style={{ color: '#b45309', fontWeight: 600 }}>
                        {' '}· Expires {new Date(s.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => onDelete(s.id)} style={{ background: '#fff1f1', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: '#d32f2f', fontWeight: 600, fontFamily: 'var(--sans)', marginLeft: '8px' }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {!parsedConfirm ? (
          <>
            <span className="intensity-label">Add a new schedule</span>
            <textarea
              className="comment-textarea"
              rows={3}
              placeholder={`"Alternate Colicaid and Neopeptine max 3/day each"\n"Brufen SOS max 2/day min 6h gap"\n"Prednisolone 5ml/day for 3 days then 2.5ml/day for 3 days"\n"Vitamin D3 0.5ml every night"`}
              value={nlpInput}
              onChange={e => { setNlpInput(e.target.value); setParseError(''); }}
              style={{ marginBottom: '10px', width: '100%' }}
            />
            {parseError && <p style={{ color: '#d32f2f', fontSize: '12px', margin: '0 0 10px' }}>{parseError}</p>}
            <button className="button-primary" onClick={onParse} disabled={isParsing || !nlpInput.trim()}>
              {isParsing
                ? <><Loader size={14} style={{ marginRight: '6px', animation: 'spin 1s linear infinite' }} />Parsing...</>
                : 'Parse →'}
            </button>
          </>
        ) : (
          <ConfirmPreview
            p={parsedConfirm}
            nlpInput={nlpInput}
            onEdit={() => setParsedConfirm(null)}
            onConfirm={onConfirm}
          />
        )}
      </div>
    </div>
  );
}

function OverrideModal({ override, onCancel, onConfirm }) {
  if (!override) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 style={{ marginBottom: '12px' }}>⚠️ Override Schedule?</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
          <strong>{override.dueMedName}</strong> is due next.<br />
          Are you sure you want to log <strong>{override.medName}</strong> instead?<br />
          <span style={{ fontSize: '12px' }}>The rotation will re-anchor from this dose.</span>
        </p>
        <div className="grid-2">
          <button className="button-primary" style={{ background: '#eee', color: '#666' }} onClick={onCancel}>Cancel</button>
          <button className="button-primary" onClick={() => onConfirm(override.medName)}>Log {override.medName}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MedBox() {
  const [schedules, setSchedules]         = useState([]);
  const [medEvents, setMedEvents]         = useState([]);
  const [loadingData, setLoadingData]     = useState(true);
  const [isExpanded, setIsExpanded]       = useState(false);

  const [showConfig, setShowConfig]       = useState(false);
  const [nlpInput, setNlpInput]           = useState('');
  const [isParsing, setIsParsing]         = useState(false);
  const [parsedConfirm, setParsedConfirm] = useState(null);
  const [parseError, setParseError]       = useState('');

  const [override, setOverride]           = useState(null);
  const [loggingMed, setLoggingMed]       = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!supabase) return;
    try {
      const [sRes, eRes] = await Promise.all([
        supabase.from('med_schedules').select('*')
          .eq('is_active', true)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('created_at'),
        supabase.from('baby_events').select('id,start_time,notes,type')
          .eq('type', 'medicine').order('start_time', { ascending: false }).limit(300),
      ]);
      if (sRes.data) setSchedules(sRes.data);
      if (eRes.data) setMedEvents(eRes.data);
    } catch (e) { console.error('MedBox fetch error:', e); }
    finally { setLoadingData(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const onVis = () => { if (document.visibilityState === 'visible') fetchData(); };
    document.addEventListener('visibilitychange', onVis);
    if (!supabase) return;
    const ch = supabase.channel('medbox-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baby_events', filter: 'type=eq.medicine' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'med_schedules' }, fetchData)
      .subscribe();
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      supabase.removeChannel(ch);
    };
  }, [fetchData]);

  // ── Protected render ───────────────────────────────────────────────────────
  try {
    if (loadingData) return null;

    const dues = schedules.map(s => {
      if (s.frequency_type === 'SOS') {
        const name = medName(s.medicines?.[0]);
        // SOS is never "due", just available
        const gapLeft = hoursUntilMinGap(name, medEvents, s.min_hours_between_doses);
        return { s, dueMed: null, isDue: false, hoursUntil: gapLeft };
      }
      if (s.frequency_type === 'SPECIFIC_DAYS') {
        const name = medName(s.medicines?.[0]);
        return { s, dueMed: name, isDue: isSpecificDayDue(s, medEvents) };
      }
      if (s.archetype === 'rotation') {
        const dueMed = getRotationDue(s, medEvents);
        return { s, dueMed, isDue: dueMed !== null };
      }
      if (s.archetype === 'interval') {
        const isDue = isIntervalDue(s, medEvents);
        return { s, dueMed: medName(s.medicines?.[0]), isDue, hoursUntil: isDue ? null : intervalHoursUntil(s, medEvents) };
      }
      if (s.archetype === 'time_window') {
        return { s, dueMed: medName(s.medicines?.[0]), isDue: isTimeWindowDue(s, medEvents) };
      }
      return { s, dueMed: null, isDue: false };
    });
    const anyDue = dues.some(d => d.isDue);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const logMedicine = async (name) => {
      if (!supabase || loggingMed || !name) return;
      setLoggingMed(name);
      try {
        await supabase.from('baby_events').insert([{
          type: 'medicine', start_time: new Date().toISOString(), notes: name,
        }]);
      } catch (e) { console.error('Med log error:', e); }
      finally { setLoggingMed(null); }
    };

    const handleMedTap = (s, name, dueMed) => {
      if (s.archetype === 'rotation' && name && name.toLowerCase() !== dueMed?.toLowerCase()) {
        setOverride({ schedule: s, medName: name, dueMedName: dueMed });
        return;
      }
      logMedicine(name);
    };

    const handleParseNlp = async () => {
      if (!nlpInput.trim()) return;
      setIsParsing(true); setParseError(''); setParsedConfirm(null);
      try {
        const raw = await callDualTierAI(NLP_PROMPT(nlpInput), 'insight', 'text/plain');
        setParsedConfirm(extractLastJson(raw));
      } catch (e) {
        console.error('NLP parse error:', e.message);
        setParseError(`Could not parse: ${e.message}`);
      } finally { setIsParsing(false); }
    };

    const handleConfirmSchedule = async () => {
      if (!parsedConfirm || !supabase) return;
      const p = parsedConfirm;
      const { error } = await supabase.from('med_schedules').insert([{
        medicines:               p.medicines,
        archetype:               p.archetype,
        frequency_type:          p.frequency_type          || 'DAILY',
        interval_hours:          p.interval_hours          || null,
        window_start:            p.window_start            || null,
        window_end:              p.window_end              || null,
        specific_days:           p.specific_days           || null,
        preferred_times:         p.preferred_times         || null,
        timing:                  p.timing                  || 'anytime',
        max_doses_per_24h:       p.max_doses_per_24h       || null,
        min_hours_between_doses: p.min_hours_between_doses || null,
        is_tapering_regimen:     p.is_tapering_regimen     || false,
        taper_steps:             p.taper_steps             || null,
        expires_at: p.duration_days
          ? new Date(Date.now() + p.duration_days * 86_400_000).toISOString()
          : null,
        nlp_input: nlpInput,
      }]);
      if (error) { setParseError(`Save failed: ${error.message}`); return; }
      setNlpInput(''); setParsedConfirm(null); setShowConfig(false);
      fetchData();
    };

    const handleDelete = async (id) => {
      if (!supabase) return;
      await supabase.from('med_schedules').update({ is_active: false }).eq('id', id);
      fetchData();
    };

    if (schedules.length === 0) {
      return (
        <div className="card" style={{ padding: '14px 20px' }}>
          <button onClick={() => setShowConfig(true)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            width: '100%', background: 'transparent', border: '1.5px dashed var(--border-soft)',
            borderRadius: '14px', padding: '14px', cursor: 'pointer', color: 'var(--text-muted)',
            fontFamily: 'var(--sans)', fontSize: '14px', fontWeight: 600,
          }}>
            <Plus size={15} /> Add medicine schedule
          </button>
          {showConfig && (
            <ConfigModal
              schedules={schedules} nlpInput={nlpInput} setNlpInput={setNlpInput}
              isParsing={isParsing} parsedConfirm={parsedConfirm} parseError={parseError}
              onParse={handleParseNlp} onConfirm={handleConfirmSchedule} onDelete={handleDelete}
              onClose={() => setShowConfig(false)} setParsedConfirm={setParsedConfirm} setParseError={setParseError}
            />
          )}
        </div>
      );
    }

    return (
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (anyDue || isExpanded) ? '14px' : 0 }}>
          <button
            onClick={() => !anyDue && setIsExpanded(e => !e)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', cursor: anyDue ? 'default' : 'pointer', padding: 0, fontFamily: 'var(--sans)' }}>
            <span style={{ fontSize: '15px' }}>💊</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-main)' }}>
              {anyDue ? 'Medicines' : 'All meds up to date'}
            </span>
            {!anyDue && <span style={{ fontSize: '13px', color: 'var(--secondary)', fontWeight: 700 }}>✓</span>}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={() => setShowConfig(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '8px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <Settings size={15} />
            </button>
            {!anyDue && (
              <button onClick={() => setIsExpanded(e => !e)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            )}
          </div>
        </div>

        {(anyDue || isExpanded) && Object.entries(
          dues.reduce((acc, d) => {
            const label = archetypeLabel(d.s);
            if (!acc[label]) acc[label] = [];
            acc[label].push(d);
            return acc;
          }, {})
        ).map(([label, groupDues]) => (
          <div key={label} style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', paddingLeft: '4px' }}>
              {label}
            </div>
            {groupDues.map(({ s, dueMed, isDue, hoursUntil }) => (
              (s.medicines || []).map(m => {
                const name     = medName(m);
                const n        = count24h(name, medEvents);
                const cap      = s.max_doses_per_24h;
                const capped   = cap != null && n >= cap;
                const gapLeft  = s.frequency_type === 'SOS'
                  ? hoursUntilMinGap(name, medEvents, s.min_hours_between_doses)
                  : null;
                const gapBlock = gapLeft != null && gapLeft > 0;
                const disabled = capped || gapBlock;
                const isThisDue = isDue && name && name.toLowerCase() === dueMed?.toLowerCase();
                const isLogging = loggingMed === name;

                return (
                  <button key={s.id + '-' + (name || Math.random())}
                    onClick={() => handleMedTap(s, name, dueMed)}
                    disabled={isLogging || disabled}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%',
                      background: disabled ? 'var(--bg-app)' : isThisDue ? 'var(--primary-light)' : 'var(--bg-app)',
                      border: `1.5px solid ${isThisDue && !disabled ? 'var(--primary)' : 'var(--border-soft)'}`,
                      borderRadius: '12px', padding: '10px 14px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      marginBottom: '6px', fontFamily: 'var(--sans)', transition: 'all 0.2s',
                      opacity: disabled ? 0.5 : 1,
                      animation: isThisDue && !disabled ? 'pulse-suggestion 3s cubic-bezier(0.4,0,0.6,1) infinite' : 'none',
                    }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>💊</span>
                        <span style={{ fontWeight: 600, fontSize: '14px',
                          color: isThisDue && !disabled ? 'var(--primary)' : 'var(--text-main)' }}>
                          {name}
                        </span>
                        {s.is_tapering_regimen && <TaperBadge s={s} />}
                        {s.expires_at && (
                          <span style={{ fontSize: '10px', color: '#b45309', fontWeight: 700, marginLeft: '4px', opacity: 0.8 }}>
                            ⌛ {Math.ceil((new Date(s.expires_at) - Date.now()) / 86_400_000)}d left
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '24px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span>({n}{cap ? `/${cap} max` : ''} today)</span>
                        {s.timing && s.timing !== 'anytime' ? <span>· {s.timing} feed</span> : null}
                        {s.preferred_times?.length ? <span>· {s.preferred_times.join(', ')}</span> : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {capped && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309',
                          background: '#fef3c7', borderRadius: '99px', padding: '2px 8px' }}>MAX REACHED</span>
                      )}
                      {gapBlock && !capped && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          wait {gapLeft.toFixed(1)}h
                        </span>
                      )}
                      {isThisDue && !disabled && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)',
                          background: 'var(--primary-light)', borderRadius: '99px', padding: '2px 8px' }}>DUE</span>
                      )}
                      {!isDue && s.archetype === 'interval' && hoursUntil != null && !disabled && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>due in {hoursUntil.toFixed(1)}h</span>
                      )}
                      {isLogging
                        ? <Loader size={14} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                        : <span style={{ fontSize: '16px', opacity: 0.4 }}>○</span>
                      }
                    </div>
                  </button>
                );
              })
            ))}
          </div>
        ))}

        {showConfig && (
          <ConfigModal
            schedules={schedules} nlpInput={nlpInput} setNlpInput={setNlpInput}
            isParsing={isParsing} parsedConfirm={parsedConfirm} parseError={parseError}
            onParse={handleParseNlp} onConfirm={handleConfirmSchedule} onDelete={handleDelete}
            onClose={() => setShowConfig(false)} setParsedConfirm={setParsedConfirm} setParseError={setParseError}
          />
        )}
        {override && (
          <OverrideModal
            override={override}
            onCancel={() => setOverride(null)}
            onConfirm={(name) => { logMedicine(name); setOverride(null); }}
          />
        )}
      </div>
    );
  } catch (err) {
    console.error('MedBox critical render error:', err);
    return null;
  }
}
