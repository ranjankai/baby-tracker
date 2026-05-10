import { useState, useEffect } from 'react';
import { Milk, Timer, X, MessageCircle, Square, Play, Pause } from 'lucide-react';
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
  const { addEvent, updateEvent, events, lastFeed } = useBaby();

  // ── Active feed: the latest feed event without an end_time. That's it. ────
  // One event at a time is enforced by UI, so this is always the one session.
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

  const getLocalDatetime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };


  const FEED_TYPES = ['top', 'mom_l', 'mom_r'];
  const isFeed = (type) => FEED_TYPES.includes(type);

  // ── Derive active feed from DB events ────────────────────────────────────
  // Rule: look at the single latest event (events[0], sorted DESC).
  // If it's a feed with no end_time → active. Anything else → nothing running.
  // ── Derive active feed and suggested side ──────────────────────────────
  const [suggestedSide, setSuggestedSide] = useState(null);

  useEffect(() => {
    // 1. Detect if a feed is currently running (no end_time)
    // We check lastFeed because it's the most recent feed activity
    if (lastFeed && isFeed(lastFeed.type) && !lastFeed.end_time) {
      setActiveFeed(lastFeed);
    } else {
      setActiveFeed(null);
    }

    // 2. Suggest opposite side based on the latest Mom feed
    // If the last feed was a Mom feed, suggest the opposite
    if (lastFeed && (lastFeed.type === 'mom_l' || lastFeed.type === 'mom_r')) {
      setSuggestedSide(lastFeed.type === 'mom_l' ? 'mom_r' : 'mom_l');
    }
  }, [lastFeed]);

  // ── Live timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeFeed) { setTimer(0); return; }
    
    const start = new Date(activeFeed.start_time).getTime();
    const totalPaused = activeFeed.total_paused_ms || 0;

    const calculateTime = () => {
      if (activeFeed.is_paused) {
        // If paused, freeze timer at (paused_at - start - total_paused)
        const pauseTime = new Date(activeFeed.paused_at).getTime();
        return Math.floor(((pauseTime - start) - totalPaused) / 1000);
      } else {
        // If running, timer is (now - start - total_paused)
        return Math.floor(((Date.now() - start) - totalPaused) / 1000);
      }
    };

    setTimer(calculateTime()); // initial set

    if (activeFeed.is_paused) return; // Don't run interval if paused

    const interval = setInterval(() => setTimer(calculateTime()), 1000);
    return () => clearInterval(interval);
  }, [activeFeed]);

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
    if (!activeFeed) return;
    updateEvent(activeFeed.id, { 
      is_paused: true, 
      paused_at: new Date().toISOString() 
    });
  };

  const handleResumeFeed = () => {
    if (!activeFeed) return;
    const pauseDuration = Date.now() - new Date(activeFeed.paused_at).getTime();
    updateEvent(activeFeed.id, {
      is_paused: false,
      paused_at: null,
      total_paused_ms: (activeFeed.total_paused_ms || 0) + pauseDuration
    });
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

  const handleStopActiveFeed = () => {
    if (activeFeed?.type === 'top') handleStopBottle();
    else handleStopMomFeed();
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
    }
  }, [anyActive]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="card">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '8px', borderRadius: '12px', display: 'flex', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <QuickLogIcon size={22} />
          </div>
          {!anyActive && (
            <span style={{ marginLeft: '10px', fontWeight: '700', fontSize: '16px', lineHeight: 1, color: 'var(--text-main)' }}>
              Quick Log
            </span>
          )}
        </div>
        {anyActive && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, marginLeft: '12px', minWidth: 0 }}>
            <button className="button-primary" onClick={handleStopActiveFeed}
              title="Stop"
              style={{ background: 'var(--accent)', color: 'white', padding: '0', flex: 1, height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '14px', border: 'none', cursor: 'pointer' }}>
              <Square size={20} fill="currentColor" />
            </button>
            <button className="button-primary" 
              onClick={activeFeed.is_paused ? handleResumeFeed : handlePauseFeed}
              title={activeFeed.is_paused ? 'Resume' : 'Pause'}
              style={{ background: activeFeed.is_paused ? 'var(--secondary)' : '#f3f0ff', color: activeFeed.is_paused ? 'white' : 'var(--primary)', padding: '0', flex: 1, height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '14px', border: 'none', cursor: 'pointer' }}>
              {activeFeed.is_paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
            </button>
            <div className={`metric-pill ${activeFeed.is_paused ? 'amber' : 'lavender'}`} style={{ fontWeight: '700', gap: '6px', height: '48px', padding: '0 16px', borderRadius: '14px', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
              {activeFeed.is_paused ? <Milk size={16} style={{ flexShrink: 0 }} /> : <Timer size={16} style={{ flexShrink: 0 }} />} 
              {formatTimer(timer)}
            </div>
          </div>
        )}
      </div>

      <div className="grid-3">

        {/* Row 1: Feeding */}
        <button className={`button-primary ${suggestedSide === 'mom_l' ? 'suggested-side' : ''}`} 
          onClick={() => handleStartMomFeed('left')}
          disabled={anyActive || isSubmitting !== null}
          style={{ 
            background: 'var(--primary-light)', 
            color: 'var(--primary)', 
            opacity: (anyActive || isSubmitting) ? 0.45 : 1,
            border: suggestedSide === 'mom_l' ? '2px solid var(--primary)' : 'none'
          }}>
          <Breastfeed size={20} /> {isSubmitting === 'left' ? 'Starting...' : 'Left'}
        </button>

        <button className={`button-primary ${suggestedSide === 'mom_r' ? 'suggested-side' : ''}`} 
          onClick={() => handleStartMomFeed('right')}
          disabled={anyActive || isSubmitting !== null}
          style={{ 
            background: 'var(--primary-light)', 
            color: 'var(--primary)', 
            opacity: (anyActive || isSubmitting) ? 0.45 : 1,
            border: suggestedSide === 'mom_r' ? '2px solid var(--primary)' : 'none'
          }}>
          <Breastfeed size={20} flip /> {isSubmitting === 'right' ? 'Starting...' : 'Right'}
        </button>

        <button className="button-primary" onClick={handleStartBottle}
          disabled={anyActive || isSubmitting !== null}
          style={{ background: 'var(--primary)', color: 'white', opacity: (anyActive || isSubmitting) ? 0.45 : 1 }}>
          <TopFeed size={20} /> {isSubmitting === 'top' ? 'Starting...' : 'Top'}
        </button>

        {/* Row 2: Outputs */}
        <button className="button-primary" onClick={() => openDiaperModal(false)}
          style={{ background: 'var(--secondary-light)', color: 'var(--secondary)' }}>
          <Diaper size={20} /> Diaper
        </button>

        <button className="button-primary" onClick={() => openDiaperModal(true)}
          style={{ background: 'var(--secondary-light)', color: 'var(--secondary)' }}>
          <TummyTime size={20} /> Free
        </button>

        <button className="button-primary" onClick={openSpitUpModal}
          style={{ background: '#fef3c7', color: '#b45309' }}>
          <SpitUp size={20} /> Spit-up
        </button>

      </div>

      {/* Diaper Modal */}
      {showDiaperModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '20px' }}>{isDiaperFree ? 'Log Diaper Free 🍃' : 'Log Diaper 👶'}</h2>

            <span className="intensity-label">Pee</span>
            <div className="intensity-grid">
              {['none', 'light', 'heavy'].map(amt => (
                <button key={amt} className={`intensity-button ${peeAmount === amt ? 'active mint' : ''}`}
                  onClick={() => setPeeAmount(amt)}>
                  {amt.charAt(0).toUpperCase() + amt.slice(1)}
                </button>
              ))}
            </div>

            <span className="intensity-label">Poop</span>
            <div className="intensity-grid">
              {['none', 'light', 'heavy'].map(amt => (
                <button key={amt} className={`intensity-button ${poopAmount === amt ? 'active mint' : ''}`}
                  onClick={() => setPoopAmount(amt)}>
                  {amt.charAt(0).toUpperCase() + amt.slice(1)}
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
            <div className="intensity-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {['minor', 'major'].map(amt => (
                <button key={amt} className={`intensity-button ${spitUpIntensity === amt ? 'active mint' : ''}`}
                  onClick={() => setSpitUpIntensity(amt)}>
                  {amt.charAt(0).toUpperCase() + amt.slice(1)}
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
