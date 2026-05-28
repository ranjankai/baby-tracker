import { useState, useEffect } from 'react';
import { Milk, Timer, X, MessageCircle, Square, Play, Pause, Sparkles } from 'lucide-react';
import { Diaper, TummyTime, SpitUp, TopFeed, Breastfeed, QuickLogIcon } from './Icons';
import { useBaby } from './BabyContext';

// ── Reusable inline comment toggler used inside every modal ──────────────────
function InlineComment({ value, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: '12px' }}>
      <button
        type="button"
        className={`comment-icon-btn ${value ? 'has-note' : ''}`}
        onClick={() => setOpen(o => !o)}
        style={{ borderRadius: '10px', padding: '7px 12px', fontSize: '13px', fontFamily: 'var(--sans)', gap: '6px' }}
      >
        <MessageCircle size={14} />
        <span style={{ fontWeight: 500 }}>{value ? 'Edit note' : 'Add a note'}</span>
      </button>

      <div className={`comment-expand ${open ? 'open' : ''}`}>
        <textarea
          className="comment-textarea"
          rows={2}
          placeholder="Type a note…"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ marginTop: '8px' }}
        />
      </div>

      {!open && value && (
        <p style={{ margin: '6px 2px 0', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
          "{value}"
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
export default function QuickLog() {
  const { 
    addEvent, 
    updateEvent, 
    events, 
    lastFeed, 
    activeTummyTime, 
    activeMassage, 
    metrics,
    tummyTarget,
    massageTarget
  } = useBaby();

  // ── Active feed/timed session: the latest session event without an end_time. ────
  const [activeFeed, setActiveFeed] = useState(null);
  const [timer, setTimer]           = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(null);

  // ── Diaper / Diaper Free modal ─────────────────────────────────────────────
  const [showDiaperModal, setShowDiaperModal] = useState(false);
  const [peeAmount,  setPeeAmount]  = useState('none');
  const [poopAmount, setPoopAmount] = useState('none');
  const [isDiaperFree, setIsDiaperFree] = useState(false);
  const [diaperNote, setDiaperNote] = useState('');
  const [diaperTime, setDiaperTime] = useState('');

  // ── Spit-up modal ─────────────────────────────────────────────────────────
  const [showSpitUpModal, setShowSpitUpModal] = useState(false);
  const [spitUpIntensity, setSpitUpIntensity] = useState('minor');
  const [spitUpNote, setSpitUpNote] = useState('');
  const [spitUpTime, setSpitUpTime] = useState('');

  // ── Bottle stop modal ─────────────────────────────────────────────────────
  const [showBottleStopModal, setShowBottleStopModal] = useState(false);
  const [bottleStopId,  setBottleStopId]  = useState(null); // captured at Stop press
  const [bottleAmount,  setBottleAmount]  = useState('');
  const [bottleNote,    setBottleNote]    = useState('');
  const [bottleElapsed, setBottleElapsed] = useState(0);
  const [isStopping,    setIsStopping]    = useState(false); // prevents double-tap on stop
  const [isPausing,     setIsPausing]     = useState(false); // prevents double-tap on pause/resume

  const getLocalDatetime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  const FEED_TYPES = ['top', 'mom_l', 'mom_r'];
  const isFeed = (type) => FEED_TYPES.includes(type);

  // ── Derive active feed / session and suggested side ──────────────────────────────
  const [suggestedSide, setSuggestedSide] = useState(null);

  useEffect(() => {
    // 1. Detect if a feed, tummy time, or massage is currently running (no end_time)
    if (lastFeed && isFeed(lastFeed.type) && !lastFeed.end_time) {
      setActiveFeed({ ...lastFeed, isCountdown: false });
    } else if (activeTummyTime) {
      const remainingQuota = Math.max(0, (tummyTarget * 60) - (metrics?.tummyTimeTodaySeconds || 0));
      setActiveFeed({ ...activeTummyTime, isCountdown: true, maxDuration: remainingQuota });
    } else if (activeMassage) {
      const remainingQuota = Math.max(0, (massageTarget * 60) - (metrics?.massageTodaySeconds || 0));
      setActiveFeed({ ...activeMassage, isCountdown: true, maxDuration: remainingQuota });
    } else {
      setActiveFeed(null);
    }

    // 2. Suggest opposite side based on the latest Mom feed
    if (lastFeed && (lastFeed.type === 'mom_l' || lastFeed.type === 'mom_r')) {
      setSuggestedSide(lastFeed.type === 'mom_l' ? 'mom_r' : 'mom_l');
    }
  }, [lastFeed, activeTummyTime, activeMassage, metrics]);

  // ── Automatic Stop for Countdowns ──────────────────────────────────────────
  const handleAutoStop = async (session) => {
    let totalPaused = session.total_paused_ms || 0;
    // Set end_time to exactly maxDuration + totalPaused after start_time
    const startMs = new Date(session.start_time).getTime();
    const endTime = new Date(startMs + (session.maxDuration || (session.type === 'tummy_time' ? tummyTarget * 60 : massageTarget * 60)) * 1000 + totalPaused).toISOString();

    await updateEvent(session.id, { 
      end_time: endTime,
      is_paused: false,
      paused_at: null,
      total_paused_ms: totalPaused
    });
  };

  // ── Live timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeFeed) { setTimer(0); return; }
    
    const start = new Date(activeFeed.start_time).getTime();
    const totalPaused = activeFeed.total_paused_ms || 0;

    const calculateTime = () => {
      let elapsedSeconds = 0;
      if (activeFeed.is_paused) {
        // If paused, freeze timer at (paused_at - start - total_paused)
        const pauseTime = new Date(activeFeed.paused_at).getTime();
        elapsedSeconds = Math.floor(((pauseTime - start) - totalPaused) / 1000);
      } else {
        // If running, timer is (now - start - total_paused)
        elapsedSeconds = Math.floor(((Date.now() - start) - totalPaused) / 1000);
      }

      if (activeFeed.isCountdown) {
        // Reverse timer from 15:00
        const remaining = (activeFeed.maxDuration || (activeFeed.type === 'tummy_time' ? tummyTarget * 60 : massageTarget * 60)) - elapsedSeconds;
        return Math.max(0, remaining);
      } else {
        return elapsedSeconds;
      }
    };

    setTimer(calculateTime()); // initial set

    if (activeFeed.is_paused) return; // Don't run interval if paused

    const interval = setInterval(() => {
      const t = calculateTime();
      setTimer(t);

      // Auto-stop if countdown reaches 0:00
      if (activeFeed.isCountdown && t <= 0) {
        clearInterval(interval);
        handleAutoStop(activeFeed);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeFeed]);

  // Reset isPausing as soon as the DB confirms the pause/resume (is_paused flipped)
  useEffect(() => { setIsPausing(false); }, [activeFeed?.is_paused]);

  const formatTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStartMomFeed = async (side) => {
    setIsSubmitting(side);
    const timeout = setTimeout(() => setIsSubmitting(null), 5000); // 5s safety hatch
    try {
      await addEvent({ type: side === 'left' ? 'mom_l' : 'mom_r' });
    } catch (error) {
      if (error?.code === '23505') {
        window.location.reload(); // Out of sync, fetch latest state
      } else {
        setIsSubmitting(null);
      }
    } finally {
      clearTimeout(timeout);
    }
  };

  const handlePauseFeed = () => {
    if (!activeFeed || isPausing) return;
    setIsPausing(true);
    const pausedAt = new Date().toISOString();
    // Optimistic: freeze timer and flip icon immediately, don't wait for DB
    setActiveFeed(prev => ({ ...prev, is_paused: true, paused_at: pausedAt }));
    updateEvent(activeFeed.id, { is_paused: true, paused_at: pausedAt });
  };

  const handleResumeFeed = () => {
    if (!activeFeed || isPausing) return;
    setIsPausing(true);
    const pauseDuration = Date.now() - new Date(activeFeed.paused_at).getTime();
    const newTotalPaused = (activeFeed.total_paused_ms || 0) + pauseDuration;
    // Optimistic: unfreeze timer immediately, don't wait for DB
    setActiveFeed(prev => ({ ...prev, is_paused: false, paused_at: null, total_paused_ms: newTotalPaused }));
    updateEvent(activeFeed.id, { is_paused: false, paused_at: null, total_paused_ms: newTotalPaused });
  };


  const handleStopMomFeed = () => {
    if (!activeFeed) return;
    
    let totalPaused = activeFeed.total_paused_ms || 0;
    let endTime = new Date().toISOString();

    if (activeFeed.is_paused) {
      // If stopped while paused, the feed actually ended at the pause moment
      endTime = activeFeed.paused_at;
    }

    updateEvent(activeFeed.id, { 
      end_time: endTime,
      is_paused: false,
      paused_at: null,
      total_paused_ms: totalPaused
    });
  };

  const handleStartBottle = async () => {
    setIsSubmitting('top');
    const timeout = setTimeout(() => setIsSubmitting(null), 5000); // 5s safety hatch
    try {
      await addEvent({ type: 'top' });
    } catch (error) {
      if (error?.code === '23505') {
        window.location.reload(); // Out of sync, fetch latest state
      } else {
        setIsSubmitting(null);
      }
    } finally {
      clearTimeout(timeout);
    }
  };

  const handleStopBottle = () => {
    if (!activeFeed) return;
    
    // Calculate final timer value, accounting for a current pause if applicable
    let finalTimer = timer;
    let totalPaused = activeFeed.total_paused_ms || 0;
    if (activeFeed.is_paused) {
      // Re-calculate timer for the modal display based on when it was paused
      const start = new Date(activeFeed.start_time).getTime();
      finalTimer = Math.floor(((new Date(activeFeed.paused_at).getTime() - start) - (activeFeed.total_paused_ms || 0)) / 1000);
    }

    setBottleStopId(activeFeed.id);
    setBottleElapsed(finalTimer);
    setBottleAmount('');
    setBottleNote('');
    setShowBottleStopModal(true);
  };

  const handleStartTummyTime = async () => {
    setIsSubmitting('tummy_time');
    const timeout = setTimeout(() => setIsSubmitting(null), 5000); // 5s safety hatch
    try {
      await addEvent({ type: 'tummy_time' });
    } catch (error) {
      if (error?.code === '23505') {
        window.location.reload();
      } else {
        setIsSubmitting(null);
      }
    } finally {
      clearTimeout(timeout);
    }
  };

  const handleStartMassage = async () => {
    setIsSubmitting('massage');
    const timeout = setTimeout(() => setIsSubmitting(null), 5000); // 5s safety hatch
    try {
      await addEvent({ type: 'massage' });
    } catch (error) {
      if (error?.code === '23505') {
        window.location.reload();
      } else {
        setIsSubmitting(null);
      }
    } finally {
      clearTimeout(timeout);
    }
  };

  const handleStopActiveFeed = () => {
    if (isStopping) return;          // guard: ignore second tap
    setIsStopping(true);             // disable immediately, don't wait for DB
    if (activeFeed?.type === 'top') handleStopBottle();
    else handleStopMomFeed();        // tummy_time and massage use exact same logic
  };


  const handleConfirmBottleStop = () => {

    if (!bottleStopId) return;

    // We need to re-find the activeFeed to get the latest pause data for the final DB write
    const entry = events.find(e => e.id === bottleStopId);
    let totalPaused = entry?.total_paused_ms || 0;
    let endTime = new Date().toISOString();

    if (entry?.is_paused) {
      // If stopped while paused, end_time is the pause moment
      endTime = entry.paused_at;
    }

    updateEvent(bottleStopId, {
      end_time: endTime,
      is_paused: false,
      paused_at: null,
      total_paused_ms: totalPaused,
      ...(bottleAmount ? { amount_ml: parseInt(bottleAmount) } : {}),
      ...(bottleNote.trim() ? { notes: bottleNote.trim() } : {}),
    });
    setBottleStopId(null);
    setShowBottleStopModal(false);
  };

  const openDiaperModal = (isFree = false) => {
    setIsDiaperFree(isFree);
    setDiaperTime(getLocalDatetime());
    setShowDiaperModal(true);
  };

  const openSpitUpModal = () => {
    setSpitUpTime(getLocalDatetime());
    setShowSpitUpModal(true);
  };

  const handleLogDiaper = () => {
    const payload = {
      type: 'diaper',
      pee_amount: peeAmount,
      poop_amount: poopAmount,
      is_diaper_free: isDiaperFree,
      ...(diaperNote.trim() ? { notes: diaperNote.trim() } : {}),
    };
    if (diaperTime) payload.start_time = new Date(diaperTime).toISOString();

    addEvent(payload);
    setPeeAmount('none');
    setPoopAmount('none');
    setIsDiaperFree(false);
    setDiaperNote('');
    setDiaperTime('');
    setShowDiaperModal(false);
  };

  const handleLogSpitUp = () => {
    const payload = {
      type: 'spit_up',
      intensity: spitUpIntensity,
      ...(spitUpNote.trim() ? { notes: spitUpNote.trim() } : {})
    };
    if (spitUpTime) payload.start_time = new Date(spitUpTime).toISOString();

    addEvent(payload);
    setSpitUpIntensity('minor');
    setSpitUpNote('');
    setSpitUpTime('');
    setShowSpitUpModal(false);
  };


  // ── Derived ───────────────────────────────────────────────────────────────
  const isBottleActive = activeFeed?.type === 'top';
  const anyActive      = !!activeFeed;

  useEffect(() => {
    if (anyActive) {
      setIsSubmitting(null);
      setIsPausing(false); // reset whenever activeFeed updates (pause/resume resolved)
    } else {
      setIsStopping(false);
      setIsPausing(false);
    }
  }, [anyActive]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="card">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {!anyActive && (
            <>
              <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '8px', borderRadius: '12px', display: 'flex', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <QuickLogIcon size={22} />
              </div>
              <span style={{ marginLeft: '10px', fontWeight: '700', fontSize: '16px', lineHeight: 1, color: 'var(--text-main)' }}>
                Quick Log
              </span>
            </>
          )}
        </div>
        {anyActive && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <button className="button-primary" onClick={handleStopActiveFeed}
              title="Stop"
              disabled={isStopping}
              style={{ background: 'var(--accent)', color: 'white', padding: '0', flex: 1, height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '14px', border: 'none', cursor: isStopping ? 'not-allowed' : 'pointer', opacity: isStopping ? 0.5 : 1, transition: 'opacity 0.15s' }}>
              <Square size={20} fill="currentColor" />
            </button>
            <button className="button-primary"
              onPointerDown={e => { e.preventDefault(); if (!isPausing) (activeFeed.is_paused ? handleResumeFeed : handlePauseFeed)(); }}
              title={activeFeed.is_paused ? 'Resume' : 'Pause'}
              disabled={isPausing}
              style={{ background: activeFeed.is_paused ? 'var(--secondary)' : '#f3f0ff', color: activeFeed.is_paused ? 'white' : 'var(--primary)', padding: '0', flex: 1, height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '14px', border: 'none', cursor: isPausing ? 'not-allowed' : 'pointer', opacity: isPausing ? 0.5 : 1, transition: 'opacity 0.15s', touchAction: 'manipulation' }}>
              {activeFeed.is_paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
            </button>
            <div className={`metric-pill ${
              activeFeed.is_paused ? 'amber' : 
              activeFeed.type === 'tummy_time' ? 'mint' : 
              activeFeed.type === 'massage' ? 'rose' : 
              'lavender'
            }`} style={{ fontWeight: '700', height: '48px', padding: '0 18px', borderRadius: '14px', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {formatTimer(timer)}
            </div>
          </div>
        )}
      </div>

      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>

        {/* Row 1: Feeding & Spit-up */}
        <button className={`button-primary ${suggestedSide === 'mom_l' ? 'suggested-side' : ''}`} 
          onClick={() => handleStartMomFeed('left')}
          disabled={anyActive || isSubmitting !== null}
          style={{ 
            background: 'var(--primary-light)', 
            color: 'var(--primary)', 
            opacity: (anyActive || isSubmitting) ? 0.45 : 1,
            border: suggestedSide === 'mom_l' ? '2px solid var(--primary)' : 'none',
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <Breastfeed size={16} /> Left
        </button>

        <button className={`button-primary ${suggestedSide === 'mom_r' ? 'suggested-side' : ''}`} 
          onClick={() => handleStartMomFeed('right')}
          disabled={anyActive || isSubmitting !== null}
          style={{ 
            background: 'var(--primary-light)', 
            color: 'var(--primary)', 
            opacity: (anyActive || isSubmitting) ? 0.45 : 1,
            border: suggestedSide === 'mom_r' ? '2px solid var(--primary)' : 'none',
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <Breastfeed size={16} flip /> Right
        </button>

        <button className="button-primary" onClick={handleStartBottle}
          disabled={anyActive || isSubmitting !== null}
          style={{ 
            background: 'var(--primary)', 
            color: 'white', 
            opacity: (anyActive || isSubmitting) ? 0.45 : 1,
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <TopFeed size={16} /> Top
        </button>

        <button className="button-primary" onClick={openSpitUpModal}
          style={{ 
            background: '#fef3c7', 
            color: '#b45309',
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <SpitUp size={16} /> Spit-up
        </button>

        {/* Row 2: Outputs & Timed activities */}
        <button className="button-primary" onClick={() => openDiaperModal(false)}
          style={{ 
            background: 'var(--secondary-light)', 
            color: 'var(--secondary)',
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <Diaper size={16} /> Diaper
        </button>

        <button className="button-primary" onClick={() => openDiaperModal(true)}
          style={{ 
            background: 'var(--secondary-light)', 
            color: 'var(--secondary)',
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <TummyTime size={16} /> Free
        </button>

        <button className="button-primary" onClick={handleStartTummyTime}
          disabled={anyActive || isSubmitting !== null}
          style={{ 
            background: 'var(--secondary-light)', 
            color: 'var(--secondary)', 
            opacity: (anyActive || isSubmitting) ? 0.45 : 1,
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <TummyTime size={16} /> Tummy
        </button>

        <button className="button-primary" onClick={handleStartMassage}
          disabled={anyActive || isSubmitting !== null}
          style={{ 
            background: '#ffe1ea', 
            color: 'var(--accent)', 
            opacity: (anyActive || isSubmitting) ? 0.45 : 1,
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <Sparkles size={16} /> Massage
        </button>

      </div>

      {/* Diaper Modal */}
      {showDiaperModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '20px' }}>{isDiaperFree ? 'Log Diaper Free 🍃' : 'Log Diaper 👶'}</h2>

            <span className="intensity-label">Pee</span>
            <div className="segmented-control">
              <div 
                className="segmented-sliding-bg mint" 
                style={{ 
                  width: 'calc((100% - 8px) / 3)',
                  left: `calc(4px + (${['none', 'light', 'heavy'].indexOf(peeAmount)} * (100% - 8px) / 3))`
                }} 
              />
              {['none', 'light', 'heavy'].map(amt => (
                <button key={amt} className={`segmented-item ${peeAmount === amt ? 'active' : ''}`}
                  onClick={() => setPeeAmount(amt)}>
                  {amt}
                </button>
              ))}
            </div>

            <span className="intensity-label">Poop</span>
            <div className="segmented-control">
              <div 
                className="segmented-sliding-bg mint" 
                style={{ 
                  width: 'calc((100% - 8px) / 3)',
                  left: `calc(4px + (${['none', 'light', 'heavy'].indexOf(poopAmount)} * (100% - 8px) / 3))`
                }} 
              />
              {['none', 'light', 'heavy'].map(amt => (
                <button key={amt} className={`segmented-item ${poopAmount === amt ? 'active' : ''}`}
                  onClick={() => setPoopAmount(amt)}>
                  {amt}
                </button>
              ))}
            </div>



            <div style={{ marginTop: '16px' }}>
              <span className="intensity-label">Time (optional, defaults to now)</span>
              <input 
                type="datetime-local" 
                className="input-field" 
                value={diaperTime} 
                onChange={(e) => setDiaperTime(e.target.value)}
                style={{ marginTop: '4px' }}
              />
            </div>

            <InlineComment value={diaperNote} onChange={setDiaperNote} />

            <div className="grid-2" style={{ marginTop: '20px' }}>
              <button className="button-primary" style={{ background: '#eee', color: '#666' }}
                onClick={() => { setShowDiaperModal(false); setDiaperNote(''); setIsDiaperFree(false); }}>
                Cancel
              </button>
              <button className="button-primary" onClick={handleLogDiaper}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottle Stop Modal */}
      {showBottleStopModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '4px' }}>Bottle Done 🍼</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px', marginBottom: '20px' }}>
              Session: <strong>{formatTimer(bottleElapsed)}</strong>
            </p>

            <span className="intensity-label">Amount (ml) — optional</span>
            <input type="number" className="input-field" placeholder="e.g. 90"
              value={bottleAmount} onChange={e => setBottleAmount(e.target.value)} autoFocus />

            <InlineComment value={bottleNote} onChange={setBottleNote} />

            <div className="grid-2" style={{ marginTop: '20px' }}>
              <button className="button-primary" style={{ background: '#eee', color: '#666' }}
                onClick={() => setShowBottleStopModal(false)}>
                Cancel
              </button>
              <button className="button-primary" onClick={handleConfirmBottleStop}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Spit-up Modal */}
      {showSpitUpModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '20px' }}>Log Spit-up 🤢</h2>

            <span className="intensity-label">Intensity</span>
            <div className="segmented-control">
              <div 
                className="segmented-sliding-bg amber" 
                style={{ 
                  width: 'calc((100% - 8px) / 2)',
                  left: `calc(4px + (${['minor', 'major'].indexOf(spitUpIntensity)} * (100% - 8px) / 2))`
                }} 
              />
              {['minor', 'major'].map(amt => (
                <button key={amt} className={`segmented-item ${spitUpIntensity === amt ? 'active' : ''}`}
                  onClick={() => setSpitUpIntensity(amt)}>
                  {amt}
                </button>
              ))}
            </div>

            <div style={{ marginTop: '16px' }}>
              <span className="intensity-label">Time (optional, defaults to now)</span>
              <input 
                type="datetime-local" 
                className="input-field" 
                value={spitUpTime} 
                onChange={(e) => setSpitUpTime(e.target.value)}
                style={{ marginTop: '4px' }}
              />
            </div>

            <InlineComment value={spitUpNote} onChange={setSpitUpNote} />

            <div className="grid-2" style={{ marginTop: '20px' }}>
              <button className="button-primary" style={{ background: '#eee', color: '#666' }}
                onClick={() => { setShowSpitUpModal(false); setSpitUpNote(''); }}>
                Cancel
              </button>
              <button className="button-primary" onClick={handleLogSpitUp}>Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
