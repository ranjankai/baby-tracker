import { useState, useEffect, useCallback } from 'react';
import { Settings, Plus, ChevronDown, ChevronUp, Loader, Pill } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { callDualTierAI } from '../utils/ai';

// ── Gemma outputs reasoning + multiple JSON blocks — extract the last valid one ──
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

// ── Hardened Medicine helpers ────────────────────────────────────────────────

function medName(m) { 
  if (!m) return '';
  return typeof m === 'string' ? m : m.name || ''; 
}
function medMax(m)  { 
  if (!m || typeof m === 'string') return null;
  return m.max_per_day || null; 
}

function getDayStart() {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function count24h(name, medEvents) {
  if (!name || !medEvents) return 0;
  const dayStart = getDayStart();
  return medEvents.filter(
    e => e.notes?.toLowerCase() === name.toLowerCase() &&
         new Date(e.start_time) >= dayStart
  ).length;
}

function isCapped(m, medEvents) {
  const name = medName(m);
  const max = medMax(m);
  if (!name) return false;
  return max !== null && count24h(name, medEvents) >= max;
}

// ── Due-calculation helpers (HARDENED) ───────────────────────────────────────

function getRotationDue(schedule, medEvents) {
  if (!schedule?.medicines) return null;
  const meds = schedule.medicines;
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
    if (m && !isCapped(m, events)) return medName(m);
  }
  return null;
}

function isIntervalDue(schedule, medEvents) {
  if (!schedule?.medicines?.[0] || !schedule.interval_hours) return false;
  const events = medEvents || [];
  const relevant = events
    .filter(e => schedule.medicines.some(m => medName(m).toLowerCase() === e.notes?.toLowerCase()))
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  if (relevant.length === 0) return true;
  return (Date.now() - new Date(relevant[0].start_time)) / 3600000 >= schedule.interval_hours;
}

function intervalHoursUntil(schedule, medEvents) {
  if (!schedule?.medicines?.[0] || !schedule.interval_hours) return null;
  const events = medEvents || [];
  const relevant = events
    .filter(e => schedule.medicines.some(m => medName(m).toLowerCase() === e.notes?.toLowerCase()))
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  if (relevant.length === 0) return null;
  const nextMs = new Date(relevant[0].start_time).getTime() + schedule.interval_hours * 3600000;
  return Math.max(0, (nextMs - Date.now()) / 3600000);
}

function isTimeWindowDue(schedule, medEvents) {
  if (!schedule?.window_start || !schedule.window_end) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sH, sM] = schedule.window_start.split(':').map(Number);
  const [eH, eM] = schedule.window_end.split(':').map(Number);
  if (cur < sH * 60 + sM || cur > eH * 60 + eM) return false;
  const winStart = new Date(now); winStart.setHours(sH, sM, 0, 0);
  const winEnd   = new Date(now); winEnd.setHours(eH, eM, 0, 0);
  return !(medEvents || []).some(e =>
    schedule.medicines.some(m => medName(m).toLowerCase() === e.notes?.toLowerCase()) &&
    new Date(e.start_time) >= winStart && new Date(e.start_time) <= winEnd
  );
}

function archetypeLabel(s) {
  if (s.archetype === 'rotation')    return 'Alternating';
  if (s.archetype === 'interval')    return s.interval_hours ? `Every ${s.interval_hours}h` : 'Daily Limit';
  if (s.archetype === 'time_window') return `${s.window_start}–${s.window_end}`;
  return '';
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MedRow({ s, dueMed, isDue, hoursUntil, medEvents, loggingMed, onTap }) {
  if (!s || !s.medicines) return null;
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
        {archetypeLabel(s)}{s.timing !== 'anytime' ? ` · ${s.timing} feed` : ''}
      </div>
      {s.medicines.map(m => {
        const name = medName(m);
        const max  = medMax(m);
        const n    = count24h(name, medEvents);
        const capped     = max !== null && n >= max;
        const isThisDue  = isDue && name && name.toLowerCase() === dueMed?.toLowerCase();
        const isLogging  = loggingMed === name;

        return (
          <button key={name || Math.random()}
            onClick={() => onTap(s, name, dueMed)}
            disabled={isLogging || capped}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%',
              background: capped ? 'var(--bg-app)' : isThisDue ? 'var(--primary-light)' : 'var(--bg-app)',
              border: `1.5px solid ${isThisDue && !capped ? 'var(--primary)' : 'var(--border-soft)'}`,
              borderRadius: '12px', padding: '10px 14px', cursor: capped ? 'not-allowed' : 'pointer',
              marginBottom: '6px', fontFamily: 'var(--sans)', transition: 'all 0.2s',
              opacity: capped ? 0.5 : 1,
              animation: isThisDue && !capped ? 'pulse-suggestion 3s cubic-bezier(0.4,0,0.6,1) infinite' : 'none',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ fontSize: '16px' }}>💊</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: isThisDue && !capped ? 'var(--primary)' : 'var(--text-main)' }}>
                {name}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                ({n}{max ? `/${max}` : ''} today)
              </span>
              {s.expires_at && (
                <span style={{ fontSize: '10px', color: '#b45309', fontWeight: 700, marginLeft: '4px', opacity: 0.8 }}>
                  ⌛ {Math.ceil((new Date(s.expires_at) - Date.now()) / 86400000)}d left
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {capped && (
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', background: '#fef3c7', borderRadius: '99px', padding: '2px 8px' }}>
                  MAX
                </span>
              )}
              {isThisDue && !capped && (
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', borderRadius: '99px', padding: '2px 8px' }}>
                  DUE
                </span>
              )}
              {!isDue && s.archetype === 'interval' && hoursUntil != null && !capped && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>in {hoursUntil.toFixed(1)}h</span>
              )}
              {isLogging
                ? <Loader size={14} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                : <span style={{ fontSize: '16px', opacity: 0.4 }}>○</span>
              }
            </div>
          </button>
        );
      })}
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
                    {(s.medicines || []).map(m => medMax(m) ? `${medName(m)} (max ${medMax(m)}/day)` : medName(m)).join(' → ')}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {archetypeLabel(s)}{s.timing !== 'anytime' ? ` · ${s.timing} feed` : ''}
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
              placeholder={`"Alternate Colicaid and Neopeptine, Colicaid max 4/day, Neopeptine max 3/day"\n"Vitamin D3 0.5ml once at night"\n"Gripe water every 4 hours"`}
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
          <div style={{ background: 'var(--bg-app)', borderRadius: '14px', padding: '16px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              You said: <em>"{nlpInput}"</em>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px' }}>
                <strong>Medicines:</strong>{' '}
                {parsedConfirm.medicines?.map(m =>
                  medMax(m) ? `${medName(m)} (max ${medMax(m)}/day)` : medName(m)
                ).join(' → ')}
              </div>
              <div style={{ fontSize: '14px' }}><strong>Schedule:</strong> {
                parsedConfirm.archetype === 'rotation'    ? 'Alternating (one per dose)' :
                parsedConfirm.archetype === 'interval'    ? (parsedConfirm.interval_hours ? `Every ${parsedConfirm.interval_hours}h` : 'Daily Limit') :
                `${parsedConfirm.window_start}–${parsedConfirm.window_end} daily`
              }</div>
              {parsedConfirm.timing !== 'anytime' && (
                <div style={{ fontSize: '14px' }}><strong>Timing hint:</strong> {parsedConfirm.timing} feed</div>
              )}
              {parsedConfirm.duration_days && (
                <div style={{ fontSize: '14px', color: '#b45309', fontWeight: 600 }}>
                  <strong>Duration:</strong> {parsedConfirm.duration_days} days
                </div>
              )}
            </div>
            <div className="grid-2">
              <button className="button-primary" style={{ background: '#eee', color: '#666' }} onClick={() => setParsedConfirm(null)}>Edit</button>
              <button className="button-primary" onClick={onConfirm}>Save ✓</button>
            </div>
          </div>
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

  // ── Fetch ─────────────────────────────────────────────────────────────────
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
      console.log('[MedBox] Data fetched:', { schedules: sRes.data?.length, events: eRes.data?.length });
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

  // ── Protected Render ───────────────────────────────────────────────────────
  try {
    if (loadingData) return null;

    // Computed dues with hardened safety
    const dues = schedules.map(s => {
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
      const prompt = `Parse this baby medicine schedule. Input: "${nlpInput}"

Archetypes:
- rotation: medicines alternate one per dose
- interval: give every N hours
- time_window: give once in a time window

Output ONLY valid JSON:
{
  "archetype": "rotation"|"interval"|"time_window",
  "medicines": [{"name": "Name", "max_per_day": null or number}],
  "interval_hours": null or number,
  "window_start": null or "HH:MM",
  "window_end": null or "HH:MM",
  "timing": "before"|"after"|"with"|"anytime",
  "duration_days": null or number,
  "confidence": "high"|"medium"|"low"
}`;
      try {
        let raw;
        try {
          raw = await callDualTierAI(prompt, 'protocol', 'text/plain');
        } catch (protocolErr) {
          raw = await callDualTierAI(prompt, 'insight', 'text/plain');
        }
        setParsedConfirm(extractLastJson(raw));
      } catch (e) {
        console.error('NLP parse error:', e.message);
        setParseError(`Could not parse: ${e.message}`);
      } finally { setIsParsing(false); }
    };

    const handleConfirmSchedule = async () => {
      if (!parsedConfirm || !supabase) return;
      const { error } = await supabase.from('med_schedules').insert([{
        medicines:      parsedConfirm.medicines,
        archetype:      parsedConfirm.archetype,
        interval_hours: parsedConfirm.interval_hours || null,
        window_start:   parsedConfirm.window_start   || null,
        window_end:     parsedConfirm.window_end     || null,
        timing:         parsedConfirm.timing         || 'anytime',
        expires_at:     parsedConfirm.duration_days 
          ? new Date(Date.now() + parsedConfirm.duration_days * 86400000).toISOString()
          : null,
        nlp_input:      nlpInput,
      }]);
      if (error) {
        setParseError(`Save failed: ${error.message}`);
        return;
      }
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

        {(anyDue || isExpanded) && dues.map(({ s, dueMed, isDue, hoursUntil }) => (
          <MedRow key={s.id} s={s} dueMed={dueMed} isDue={isDue} hoursUntil={hoursUntil}
            medEvents={medEvents} loggingMed={loggingMed} onTap={handleMedTap} />
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
    return null; // Fail silently to protect main app
  }
}
