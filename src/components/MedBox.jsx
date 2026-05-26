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

// ── Min-gap helpers ───────────────────────────────────────────────────────────
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
  return s.taper_steps[s.taper_steps.length - 1];
}

// ── Due logic helpers ─────────────────────────────────────────────────────────
function isCapped(s, name, medEvents) {
  const cap = s.max_doses_per_24h || s.doses_per_day;
  if (!cap || !name) return false;
  return count24h(name, medEvents) >= cap;
}

// ── NEW: Dose-spreading within therapeutic window ─────────────────────────────
// Clinical model: "N times a day" = distribute N doses across waking hours,
// computing the ideal next-dose time dynamically from doses remaining + time left.

function getWindowEnd(s) {
  const [h, m] = (s.day_window_end || '22:00').split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0); return d;
}

function getLastDoseToday(name, medEvents) {
  const dayStart = getDayStart();
  const relevant = medEvents
    .filter(e => e.notes?.toLowerCase() === name.toLowerCase() && new Date(e.start_time) >= dayStart)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  return relevant.length ? new Date(relevant[0].start_time) : null;
}

function computeNextDoseTime(s, medEvents) {
  const name = medName(s.medicines?.[0]);
  if (!s.doses_per_day) return null;

  const now          = new Date();
  const windowEnd    = getWindowEnd(s);
  const givenToday   = count24h(name, medEvents);
  const dosesLeft    = s.doses_per_day - givenToday;

  if (dosesLeft <= 0) return null; // all done today

  const windowLeftHours = Math.max(0, (windowEnd - now) / 3_600_000);
  const minGap          = s.min_hours_between_doses || 0;
  // Spread remaining doses evenly across remaining window, respecting min gap
  const idealSpacing    = dosesLeft > 0 ? windowLeftHours / dosesLeft : 0;
  const spacingHours    = Math.max(minGap, idealSpacing);

  const lastDose = getLastDoseToday(name, medEvents);
  if (!lastDose) return now; // no dose today yet → due now

  const nextDue = new Date(lastDose.getTime() + spacingHours * 3_600_000);
  return nextDue > windowEnd ? windowEnd : nextDue;
}

function isDailySpreadDue(s, medEvents) {
  const name = medName(s.medicines?.[0]);
  if (!s.doses_per_day) return false;

  const givenToday = count24h(name, medEvents);
  if (givenToday >= s.doses_per_day) return false;

  const now = new Date();
  if (now > getWindowEnd(s)) return false; // past bedtime

  // Enforce min gap from last dose before declaring due
  if (!minGapElapsed(name, medEvents, s.min_hours_between_doses)) return false;

  const nextDue = computeNextDoseTime(s, medEvents);
  if (!nextDue) return false;
  return now >= nextDue;
}

function hoursUntilDailySpread(s, medEvents) {
  // Also respect min gap
  const name    = medName(s.medicines?.[0]);
  const minGapH = hoursUntilMinGap(name, medEvents, s.min_hours_between_doses);
  const nextDue = computeNextDoseTime(s, medEvents);
  if (!nextDue) return null;
  const fromNextDue = Math.max(0, (nextDue - Date.now()) / 3_600_000);
  return minGapH != null ? Math.max(minGapH, fromNextDue) : fromNextDue;
}

function nextDailySpreadLabel(s, medEvents) {
  const name = medName(s.medicines?.[0]);
  // If min gap hasn't elapsed, show that as next time
  const minGapH = hoursUntilMinGap(name, medEvents, s.min_hours_between_doses);
  if (minGapH != null && minGapH > 0) {
    const t = new Date(Date.now() + minGapH * 3_600_000);
    return t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  const nextDue = computeNextDoseTime(s, medEvents);
  if (!nextDue) return null;
  return nextDue.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── Legacy due logic (backward compat for old DB rows) ────────────────────────
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
  const now = new Date();
  let winStart, winEnd;
  if (!s?.window_start || !s.window_end) {
    winStart = new Date(now); winStart.setHours(0, 0, 0, 0);
    winEnd   = new Date(now); winEnd.setHours(23, 59, 59, 999);
  } else {
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sH, sM] = s.window_start.split(':').map(Number);
    const [eH, eM] = s.window_end.split(':').map(Number);
    if (cur < sH * 60 + sM || cur > eH * 60 + eM) return false;
    winStart = new Date(now); winStart.setHours(sH, sM, 0, 0);
    winEnd   = new Date(now); winEnd.setHours(eH, eM, 0, 0);
  }
  return !(medEvents || []).some(e =>
    s.medicines.some(m => medName(m).toLowerCase() === e.notes?.toLowerCase()) &&
    new Date(e.start_time) >= winStart && new Date(e.start_time) <= winEnd
  );
}

function isSpecificDayDue(s, medEvents) {
  if (!s?.specific_days?.length) return false;
  const todayISO = new Date().getDay() || 7;
  if (!s.specific_days.includes(todayISO)) return false;
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
  if (s.archetype === 'rotation') return 'Alternating';
  if (s.doses_per_day) return `${s.doses_per_day}×/day`;
  return 'Daily';
}

// ── NLP Roster Prompt ─────────────────────────────────────────────────────────
const NLP_ROSTER_PROMPT = (input, activeSchedules) => {
  const rosterContext = activeSchedules.length === 0
    ? 'No medications currently active.'
    : activeSchedules.map(s => {
        const names  = (s.medicines || []).map(m => medName(m)).join(' → ');
        const sched  = s.doses_per_day
          ? `${s.doses_per_day}x/day, min_gap ${s.min_hours_between_doses || 0}h, window_end ${s.day_window_end || '22:00'}`
          : s.archetype === 'interval'    ? `every ${s.interval_hours}h`
          : s.archetype === 'time_window' ? `${s.window_start}–${s.window_end}`
          : s.frequency_type === 'SOS'    ? 'SOS'
          : 'daily';
        const times = s.suggested_times?.length ? `, at: [${s.suggested_times.join(', ')}]` : '';
        return `  - id:${s.id} | ${names} | ${sched}${times}`;
      }).join('\n');

  return `You are a pediatric medication scheduler. Optimally schedule a new medication into an existing active roster using a greedy, minimal-disruption algorithm.

NEW MEDICATION:
"${input}"

CURRENT ACTIVE ROSTER:
${rosterContext}

OPTIMIZATION RULES (follow strictly, in priority order):
1. SOS DETECTION (highest priority): If the phrasing contains ANY of — "SOS", "as needed", "when needed", "PRN", "if required", "max X times", "upto X times", "not more than X" — set frequency_type="SOS", doses_per_day=null, suggested_times=null, max_doses_per_24h=X, min_hours_between_doses=reasonable gap. Do NOT schedule fixed times for SOS meds.
2. Parse non-SOS meds using the "daily_spread" model: doses_per_day + min_hours_between_doses + day_window_end + suggested_times
3. Treat "Nx/day", "N times a day", "N times daily" as doses_per_day=N (never as interval_hours)
4. Reserve interval archetype ONLY for true strict-interval meds (e.g. "every 8 hours exactly", antibiotics)
5. Find suggested_times for the new med that fit in the GAPS of the existing schedule
6. Minimum 30 minutes buffer between any two different meds at the same time slot
7. If possible, align same-frequency meds to the SAME times (parent convenience)
8. Only nudge an existing med if a genuine collision is unavoidable — minimize total changes (greedy)
9. NEVER change archetype, frequency_type, doses_per_day of an existing med

OUTPUT ONLY valid JSON — no explanation outside the JSON:
{
  "roster_plan": [
    {
      "existing_id": null,
      "is_new": true,
      "is_modified": false,
      "change_reason": null,
      "medicines": [{"name": "MedicineName Dose Unit"}],
      "archetype": "daily_spread",
      "frequency_type": "DAILY",
      "doses_per_day": 2,
      "min_hours_between_doses": 4,
      "day_window_end": "22:00",
      "suggested_times": ["09:00", "17:00"],
      "timing": "after",
      "max_doses_per_24h": null,
      "duration_days": null,
      "is_tapering_regimen": false,
      "taper_steps": null,
      "confidence": "high"
    }
  ],
  "optimization_note": "One sentence summary of scheduling decisions",
  "conflicts": []
}

Rules for existing meds in roster_plan:
- Include ALL active meds (new + existing) in roster_plan
- Unchanged existing meds: existing_id=their_id, is_new=false, is_modified=false, suggested_times=their current times
- Nudged existing meds: is_modified=true, fill change_reason with why
- specific_days: ISO weekday numbers 1=Mon…7=Sun`;
};

// ── NLP Upgrade Prompt (re-optimises the entire existing roster) ──────────────
const NLP_UPGRADE_PROMPT = (activeSchedules) => {
  const roster = activeSchedules.map(s => {
    const names = (s.medicines || []).map(m => medName(m)).join(' → ');
    const src   = s.nlp_input ? `"${s.nlp_input}"` : `${names} (no original text)`;
    return `  - id:${s.id} | ${src} | current: archetype=${s.archetype}, interval_hours=${s.interval_hours ?? 'n/a'}, doses_per_day=${s.doses_per_day ?? 'n/a'}`;
  }).join('\n');

  return `You are upgrading an existing pediatric medication roster to a new smart scheduling model.

EXISTING ROSTER:
${roster}

TASK:
1. Convert EVERY medication above to the "daily_spread" model: doses_per_day + min_hours_between_doses + day_window_end + suggested_times
2. Holistically distribute all doses across the waking day 07:00–22:00 with no conflicts
3. Minimum 30 minutes gap between different meds at same time slot
4. Align same-frequency meds to same times where possible (parent convenience)
5. Use the original prescription text (nlp_input) as ground truth for dose count and frequency

Return ALL meds as is_modified=true in roster_plan.

OUTPUT ONLY valid JSON:
{
  "roster_plan": [
    {
      "existing_id": 123,
      "is_new": false,
      "is_modified": true,
      "change_reason": "Upgraded from interval_hours:12 to 2x/day daily_spread model",
      "medicines": [{"name": "MedicineName Dose Unit"}],
      "archetype": "daily_spread",
      "frequency_type": "DAILY",
      "doses_per_day": 2,
      "min_hours_between_doses": 4,
      "day_window_end": "22:00",
      "suggested_times": ["08:00", "20:00"],
      "timing": "after",
      "max_doses_per_24h": null,
      "duration_days": null,
      "is_tapering_regimen": false,
      "taper_steps": null,
      "confidence": "high"
    }
  ],
  "optimization_note": "One sentence summary of upgrade decisions",
  "conflicts": []
}`;
};

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

// ── Roster Diff Editor ────────────────────────────────────────────────────────
function RosterDiffEditor({ plan, nlpInput, onEdit, onConfirm }) {
  const [editedPlan, setEditedPlan] = useState(
    (plan.roster_plan || []).map((item, i) => ({ ...item, _idx: i }))
  );
  const [editKey, setEditKey]       = useState(null); // "rowIdx-timeIdx"
  const [timeInput, setTimeInput]   = useState('');

  const startEdit = (rowIdx, tIdx, val) => {
    setEditKey(`${rowIdx}-${tIdx}`);
    setTimeInput(val);
  };

  const commitEdit = () => {
    if (!editKey) return;
    const [ri, ti] = editKey.split('-').map(Number);
    setEditedPlan(prev => prev.map((item, i) => {
      if (i !== ri) return item;
      const newTimes = [...(item.suggested_times || [])];
      newTimes[ti] = timeInput;
      return { ...item, suggested_times: newTimes };
    }));
    setEditKey(null);
  };

  const newItems  = editedPlan.filter(p => p.is_new);
  const modItems  = editedPlan.filter(p => p.is_modified && !p.is_new);
  const sameItems = editedPlan.filter(p => !p.is_new && !p.is_modified);

  const renderRow = (item, rowIdx) => {
    const names   = (item.medicines || []).map(m => medName(m)).join(' → ');
    const isNew   = item.is_new;
    const isMod   = item.is_modified;
    const canEdit = isNew || isMod;
    const bg      = isNew ? '#f0fdf4' : isMod ? '#fffbeb' : 'var(--bg-app)';
    const border  = isNew ? '#86efac' : isMod ? '#fcd34d' : 'var(--border-soft)';
    const badge   = isNew
      ? <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803d', background: '#dcfce7', borderRadius: '99px', padding: '2px 8px' }}>NEW ✨</span>
      : isMod
        ? <span style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: '99px', padding: '2px 8px' }}>NUDGED</span>
        : <span style={{ fontSize: '10px', color: 'var(--text-muted)', borderRadius: '99px', padding: '2px 8px' }}>Unchanged</span>;

    return (
      <div key={rowIdx} style={{
        background: bg, border: `1.5px solid ${border}`,
        borderRadius: '12px', padding: '12px 14px', marginBottom: '8px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>{names}</span>
            {item.doses_per_day && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                {item.doses_per_day}×/day
                {item.timing && item.timing !== 'anytime' ? ` · ${item.timing} feed` : ''}
                {item.duration_days ? ` · ${item.duration_days}d` : ''}
                {item.min_hours_between_doses ? ` · min ${item.min_hours_between_doses}h gap` : ''}
              </span>
            )}
          </div>
          {badge}
        </div>

        {/* Editable time pills */}
        {(item.suggested_times?.length > 0) && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Times:</span>
            {item.suggested_times.map((t, tIdx) => {
              const key = `${rowIdx}-${tIdx}`;
              const isEditing = editKey === key;
              return isEditing ? (
                <input
                  key={tIdx} type="time" value={timeInput}
                  onChange={e => setTimeInput(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => e.key === 'Enter' && commitEdit()}
                  autoFocus
                  style={{
                    fontSize: '12px', fontWeight: 700, padding: '3px 8px',
                    border: '1.5px solid var(--primary)', borderRadius: '8px',
                    background: 'white', color: 'var(--primary)',
                    fontFamily: 'var(--sans)', outline: 'none', width: '92px',
                  }}
                />
              ) : (
                <button
                  key={tIdx}
                  onClick={() => canEdit && startEdit(rowIdx, tIdx, t)}
                  title={canEdit ? 'Tap to edit time' : undefined}
                  style={{
                    fontSize: '12px', fontWeight: 700, padding: '3px 10px',
                    border: '1.5px solid var(--border-soft)', borderRadius: '8px',
                    background: 'white', color: isNew ? '#15803d' : isMod ? '#92400e' : 'var(--text-main)',
                    fontFamily: 'var(--sans)', cursor: canEdit ? 'pointer' : 'default',
                    transition: 'border-color 0.15s',
                  }}
                >
                  {t}{canEdit ? ' ✎' : ''}
                </button>
              );
            })}
          </div>
        )}

        {/* Change reason */}
        {item.change_reason && (
          <div style={{
            fontSize: '11px', color: '#92400e', marginTop: '8px', paddingTop: '8px',
            borderTop: '1px dashed #fcd34d', lineHeight: 1.5,
          }}>
            ↳ {item.change_reason}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ background: 'var(--bg-app)', borderRadius: '14px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        You said: <em>"{nlpInput}"</em>
      </p>

      {/* AI optimization note */}
      {plan.optimization_note && (
        <div style={{
          fontSize: '12px', color: '#166534', background: '#f0fdf4',
          borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', lineHeight: 1.5,
        }}>
          🧠 {plan.optimization_note}
        </div>
      )}

      {/* Conflict warnings */}
      {plan.conflicts?.length > 0 && (
        <div style={{
          fontSize: '12px', color: '#92400e', background: '#fff7ed',
          borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', lineHeight: 1.5,
        }}>
          ⚠️ {plan.conflicts.join(' · ')}
        </div>
      )}

      {/* NEW meds */}
      {newItems.length > 0 && (
        <>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>Adding</div>
          {newItems.map(item => renderRow(item, editedPlan.indexOf(item)))}
        </>
      )}

      {/* Nudged existing meds */}
      {modItems.length > 0 && (
        <>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.6px', margin: '12px 0 6px' }}>Adjusted</div>
          {modItems.map(item => renderRow(item, editedPlan.indexOf(item)))}
        </>
      )}

      {/* Untouched meds */}
      {sameItems.length > 0 && (
        <>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.6px', margin: '12px 0 6px' }}>Unchanged</div>
          {sameItems.map(item => renderRow(item, editedPlan.indexOf(item)))}
        </>
      )}

      <div className="grid-2" style={{ marginTop: '16px' }}>
        <button className="button-primary" style={{ background: '#eee', color: '#666' }} onClick={onEdit}>
          ← Edit
        </button>
        <button className="button-primary" onClick={() => onConfirm(editedPlan)}>
          Save All ✓
        </button>
      </div>
    </div>
  );
}

// ── Config Modal ──────────────────────────────────────────────────────────────
function ConfigModal({ schedules, nlpInput, setNlpInput, isParsing, parsedPlan, parseError,
                       onParse, onConfirm, onDelete, onClose, setParsedPlan, setParseError }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>💊 Medicine Schedules</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-muted)' }}>✕</button>
        </div>

        {/* Existing schedules list */}
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
                    {archetypeLabel(s)}
                    {s.timing && s.timing !== 'anytime' ? ` · ${s.timing} feed` : ''}
                    {s.suggested_times?.length ? ` · ${s.suggested_times.join(', ')}` : ''}
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

        {/* Add new / edit roster */}
        {!parsedPlan ? (
          <>
            <span className="intensity-label">Add a new medication</span>
            <textarea
              className="comment-textarea"
              rows={3}
              placeholder={`"Neopeptine 0.5ml twice a day after feeds for 3 days"\n"Brufen SOS max 2/day min 6h gap"\n"Prednisolone 5ml once daily for 3 days then 2.5ml for 3 days"\n"Vitamin D3 0.5ml every Monday and Thursday"`}
              value={nlpInput}
              onChange={e => { setNlpInput(e.target.value); setParseError(''); }}
              style={{ marginBottom: '10px', width: '100%' }}
            />
            {parseError && <p style={{ color: '#d32f2f', fontSize: '12px', margin: '0 0 10px' }}>{parseError}</p>}
            <button className="button-primary" onClick={onParse} disabled={isParsing || !nlpInput.trim()}>
              {isParsing
                ? <><Loader size={14} style={{ marginRight: '6px', animation: 'spin 1s linear infinite' }} />Optimising schedule…</>
                : 'Schedule →'}
            </button>
          </>
        ) : (
          <RosterDiffEditor
            plan={parsedPlan}
            nlpInput={nlpInput}
            onEdit={() => setParsedPlan(null)}
            onConfirm={onConfirm}
          />
        )}
      </div>
    </div>
  );
}

// ── Override Modal ────────────────────────────────────────────────────────────
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
  const [schedules, setSchedules]     = useState([]);
  const [medEvents, setMedEvents]     = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isExpanded, setIsExpanded]   = useState(false);

  const [showConfig, setShowConfig]   = useState(false);
  const [nlpInput, setNlpInput]       = useState('');
  const [isParsing, setIsParsing]     = useState(false);
  const [parsedPlan, setParsedPlan]   = useState(null);
  const [parseError, setParseError]   = useState('');

  const [override, setOverride]       = useState(null);
  const [loggingMed, setLoggingMed]   = useState(null);

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

    // ── Compute due status for each schedule ──────────────────────────────────
    const dues = schedules.map(s => {
      if (s.frequency_type === 'SOS') {
        const name = medName(s.medicines?.[0]);
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
      // ── Daily spread (all upgraded meds — single code path) ───────────────
      if (s.doses_per_day) {
        const isDue      = isDailySpreadDue(s, medEvents);
        const hoursUntil = isDue ? null : hoursUntilDailySpread(s, medEvents);
        const nextLabel  = !isDue ? nextDailySpreadLabel(s, medEvents) : null;
        return { s, dueMed: medName(s.medicines?.[0]), isDue, hoursUntil, nextLabel };
      }
      // Fallback for any un-migrated rows (should not exist after SQL migration)
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
      setIsParsing(true); setParseError(''); setParsedPlan(null);
      try {
        // Pass full active roster into the AI prompt
        const raw = await callDualTierAI(NLP_ROSTER_PROMPT(nlpInput, schedules), 'insight', 'text/plain');
        setParsedPlan(extractLastJson(raw));
      } catch (e) {
        console.error('NLP parse error:', e.message);
        setParseError(`Could not parse: ${e.message}`);
      } finally { setIsParsing(false); }
    };

    const handleUpgradeRoster = async () => {
      if (!schedules.length) return;
      setIsParsing(true); setParseError(''); setParsedPlan(null);
      try {
        const raw = await callDualTierAI(NLP_UPGRADE_PROMPT(schedules), 'insight', 'text/plain');
        setParsedPlan(extractLastJson(raw));
      } catch (e) {
        console.error('Upgrade parse error:', e.message);
        setParseError(`Could not upgrade: ${e.message}`);
      } finally { setIsParsing(false); }
    };

    const handleConfirmSchedule = async (editedRosterPlan) => {
      if (!editedRosterPlan || !supabase) return;

      const newItems = editedRosterPlan.filter(p => p.is_new);
      // All modified items — includes both nudged (add-new flow) and full upgrades
      const modItems = editedRosterPlan.filter(p => p.is_modified && !p.is_new && p.existing_id);

      // ── Insert new meds ────────────────────────────────────────────────────
      for (const p of newItems) {
        const { error } = await supabase.from('med_schedules').insert([{
          medicines:               p.medicines,
          archetype:               'interval', // daily_spread stored as interval for DB compat
          frequency_type:          p.frequency_type          || 'DAILY',
          doses_per_day:           p.doses_per_day           || null,
          day_window_end:          p.day_window_end          || '22:00',
          suggested_times:         p.suggested_times         || null,
          interval_hours:          null, // no longer used for daily_spread meds
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
      }

      // ── Full field update for modified/upgraded existing meds ──────────────
      for (const p of modItems) {
        const { error } = await supabase.from('med_schedules')
          .update({
            doses_per_day:           p.doses_per_day           || null,
            day_window_end:          p.day_window_end          || '22:00',
            suggested_times:         p.suggested_times         || null,
            min_hours_between_doses: p.min_hours_between_doses || null,
            timing:                  p.timing                  || 'anytime',
            // intentionally NOT updating medicines — never let AI rewrite the canonical drug name
            interval_hours:          null, // clear legacy field on upgrade
          })
          .eq('id', p.existing_id);
        if (error) { setParseError(`Update failed: ${error.message}`); return; }
      }

      setNlpInput(''); setParsedPlan(null); setShowConfig(false);
      fetchData();
    };

    const handleDelete = async (id) => {
      if (!supabase) return;
      await supabase.from('med_schedules').update({ is_active: false }).eq('id', id);
      fetchData();
    };

    // ── Empty state ────────────────────────────────────────────────────────────
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
              isParsing={isParsing} parsedPlan={parsedPlan} parseError={parseError}
              onParse={handleParseNlp} onConfirm={handleConfirmSchedule} onDelete={handleDelete}
              onClose={() => setShowConfig(false)} setParsedPlan={setParsedPlan} setParseError={setParseError}
            />
          )}
        </div>
      );
    }

    // ── Main render ────────────────────────────────────────────────────────────
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
            {groupDues.map(({ s, dueMed, isDue, hoursUntil, nextLabel }) => (
              (s.medicines || []).map(m => {
                const name      = medName(m);
                const n         = count24h(name, medEvents);
                const cap       = s.max_doses_per_24h || s.doses_per_day;
                const capped    = cap != null && n >= cap;
                const gapLeft   = s.frequency_type === 'SOS'
                  ? hoursUntilMinGap(name, medEvents, s.min_hours_between_doses)
                  : null;
                const gapBlock  = gapLeft != null && gapLeft > 0;
                const disabled  = capped || gapBlock;
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
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '24px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>({n}{cap ? `/${cap}` : ''} today)</span>
                        {s.timing && s.timing !== 'anytime' ? <span>· {s.timing} feed</span> : null}
                        {s.suggested_times?.length ? <span>· {s.suggested_times.join(', ')}</span> : null}
                        {/* Smart next-dose suggestion */}
                        {!isDue && nextLabel ? (
                          <span style={{ color: 'var(--secondary)', fontWeight: 600 }}>· next ~{nextLabel}</span>
                        ) : null}
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
                      {!isDue && !nextLabel && hoursUntil != null && !disabled && (
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
            isParsing={isParsing} parsedPlan={parsedPlan} parseError={parseError}
            onParse={handleParseNlp} onConfirm={handleConfirmSchedule} onDelete={handleDelete}
            onClose={() => setShowConfig(false)} setParsedPlan={setParsedPlan} setParseError={setParseError}
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
