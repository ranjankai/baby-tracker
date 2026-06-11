import { useState, useEffect } from 'react';
import { Milk, Timer, X, MessageCircle, Square, Play, Pause, Sparkles } from 'lucide-react';
import { Diaper, TummyTime, SpitUp, TopFeed, Breastfeed, QuickLogIcon } from './Icons';
import { useBaby } from './BabyContext';

// ── Timer Formatter ──────────────────────────────────────────────────────────
function formatTimer(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ── Retro Flip Split-Flap Clock ──────────────────────────────────────────────
function FlipTimer({ seconds }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  const m1 = String(mins).padStart(2, '0')[0];
  const m2 = String(mins).padStart(2, '0')[1];
  const s1 = String(secs).padStart(2, '0')[0];
  const s2 = String(secs).padStart(2, '0')[1];

  return (
    <div className="flip-clock-container">
      <div key={`m1-${m1}`} className="flip-card">{m1}</div>
      <div key={`m2-${m2}`} className="flip-card">{m2}</div>
      <div className="flip-clock-divider">:</div>
      <div key={`s1-${s1}`} className="flip-card">{s1}</div>
      <div key={`s2-${s2}`} className="flip-card">{s2}</div>
    </div>
  );
}

// ── Reusable Concurrent Active Session Timer Capsule (Chain-Link) ──────────
function ActiveSessionCapsule({ session, onPause, onResume, onStop, tummyTarget, massageTarget, metrics }) {
  const [timer, setTimer] = useState(0);

  const isCountdown = session.type === 'tummy_time'; // ONLY tummy_time is a countdown! Massage is count-up!

  useEffect(() => {
    const start = new Date(session.start_time).getTime();
    const totalPaused = session.total_paused_ms || 0;

    const calculateTime = () => {
      let elapsedSeconds = 0;
      if (session.is_paused) {
        const pauseTime = new Date(session.paused_at).getTime();
        elapsedSeconds = Math.floor(((pauseTime - start) - totalPaused) / 1000);
      } else {
        elapsedSeconds = Math.floor(((Date.now() - start) - totalPaused) / 1000);
      }

      if (isCountdown) {
        // Tummy Time countdown from remaining target quota
        const todaySecs = metrics?.tummyTimeTodaySeconds || 0;
        const remainingQuota = Math.max(0, (tummyTarget * 60) - todaySecs);
        const remaining = remainingQuota - elapsedSeconds;
        return Math.max(0, remaining);
      } else {
        // Count up for Feeds and Massage
        return elapsedSeconds;
      }
    };

    setTimer(calculateTime());

    if (session.is_paused) return;

    const interval = setInterval(() => {
      const t = calculateTime();
      setTimer(t);

      // Auto-stop Tummy Time countdown if it hits 0
      if (isCountdown && t <= 0) {
        clearInterval(interval);
        onStop(session, true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session, tummyTarget, massageTarget, metrics]);

  // Activity-specific styling and labeling
  let label = '';
  let Icon = null;
  let themeColor = 'var(--primary)';

  if (session.type === 'mom_l') {
    label = 'Mom (L)';
    Icon = Breastfeed;
    themeColor = 'var(--primary)';
  } else if (session.type === 'mom_r') {
    label = 'Mom (R)';
    Icon = Breastfeed;
    themeColor = 'var(--primary)';
  } else if (session.type === 'top') {
    label = 'Bottle';
    Icon = TopFeed;
    themeColor = 'var(--primary)';
  } else if (session.type === 'tummy_time') {
    label = 'Tummy Time';
    Icon = TummyTime;
    themeColor = '#10b981';
  } else if (session.type === 'massage') {
    label = 'Massage';
    Icon = Sparkles;
    themeColor = '#f472b6';
  }

  return (
    <div className="active-session-row" style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      width: '100%',
      padding: '8px 10px',
      borderRadius: '16px',
      border: '1.5px solid var(--border-soft)',
      background: 'rgba(255, 255, 255, 0.85)',
      boxSizing: 'border-box',
      margin: '2px 0',
      gap: '4px'
    }}>
      {/* Left side: Activity Name */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: '700', fontSize: '14px', color: '#4a4a4a', whiteSpace: 'nowrap', flexShrink: 0, paddingLeft: '4px' }}>
          {label}
        </span>
      </div>

      {/* Right side: Controls & Flip Timer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {/* Circular Stop Button */}
        <button 
          onClick={() => onStop(session, false)}
          className="timer-control-btn"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: 'none',
            background: 'var(--accent-light)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0
          }}
          title="Stop"
        >
          <Square size={10} fill="currentColor" />
        </button>

        {/* Retro Flip Clock Timer */}
        <FlipTimer seconds={timer} />

        {/* Play/Pause Button */}
        <button 
          onClick={() => session.is_paused ? onResume(session) : onPause(session)}
          className="timer-control-btn"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: 'none',
            background: session.is_paused ? 'var(--secondary-light)' : 'rgba(0, 0, 0, 0.04)',
            color: session.is_paused ? 'var(--secondary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0
          }}
          title={session.is_paused ? 'Resume' : 'Pause'}
        >
          {session.is_paused ? <Play size={10} fill="currentColor" /> : <Pause size={10} fill="currentColor" />}
        </button>
      </div>
    </div>
  );
}

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

  const [isSubmitting, setIsSubmitting] = useState(null);
  const [bottleElapsed, setBottleElapsed] = useState(0);
  const [isStopping,    setIsStopping]    = useState(false);
  const [isPausing,     setIsPausing]     = useState(false);

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

  // ── Derive suggested side ──────────────────────────────────────────────
  const [suggestedSide, setSuggestedSide] = useState(null);

  useEffect(() => {
    const lastBreastfeed = events.find(e => e.type === 'mom_l' || e.type === 'mom_r');
    if (lastBreastfeed) {
      setSuggestedSide(lastBreastfeed.type === 'mom_l' ? 'mom_r' : 'mom_l');
    } else {
      setSuggestedSide(null);
    }
  }, [events]);

  const getLocalDatetime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  const FEED_TYPES = ['top', 'mom_l', 'mom_r'];
  const isFeed = (type) => FEED_TYPES.includes(type);


  const handlePauseSession = (session) => {
    if (isPausing || session.is_paused) return;
    setIsPausing(true);
    const pausedAt = new Date().toISOString();
    updateEvent(session.id, { is_paused: true, paused_at: pausedAt }).then(() => setIsPausing(false));
  };

  const handleResumeSession = (session) => {
    if (isPausing || !session.is_paused || !session.paused_at) return;
    setIsPausing(true);
    const pauseDuration = Date.now() - new Date(session.paused_at).getTime();
    const newTotalPaused = (session.total_paused_ms || 0) + pauseDuration;
    updateEvent(session.id, { is_paused: false, paused_at: null, total_paused_ms: newTotalPaused }).then(() => setIsPausing(false));
  };

  const handleStopSession = async (session, isAutoStop = false) => {
    if (isStopping) return;
    setIsStopping(true);

    if (session.type === 'top') {
      let finalTimer = 0;
      const start = new Date(session.start_time).getTime();
      const totalPaused = session.total_paused_ms || 0;
      if (session.is_paused) {
        finalTimer = Math.floor(((new Date(session.paused_at).getTime() - start) - totalPaused) / 1000);
      } else {
        finalTimer = Math.floor(((Date.now() - start) - totalPaused) / 1000);
      }
      setBottleStopId(session.id);
      setBottleElapsed(finalTimer);
      setBottleAmount('');
      setBottleNote('');
      setShowBottleStopModal(true);
      setIsStopping(false);
      return;
    }

    let totalPaused = session.total_paused_ms || 0;
    let endTime = new Date().toISOString();

    if (session.is_paused) {
      endTime = session.paused_at;
    }

    if (isAutoStop) {
      const startMs = new Date(session.start_time).getTime();
      endTime = new Date(startMs + (tummyTarget * 60) * 1000 + totalPaused).toISOString();
    }

    await updateEvent(session.id, {
      end_time: endTime,
      is_paused: false,
      paused_at: null,
      total_paused_ms: totalPaused
    });
    setIsStopping(false);
  };

  const handleStartMomFeed = async (side) => {
    setIsSubmitting(side);
    const timeout = setTimeout(() => setIsSubmitting(null), 5000); // 5s safety hatch
    try {
      await addEvent({ type: side === 'left' ? 'mom_l' : 'mom_r' });
      setIsSubmitting(null);
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

  const handleStartBottle = async () => {
    setIsSubmitting('top');
    const timeout = setTimeout(() => setIsSubmitting(null), 5000); // 5s safety hatch
    try {
      await addEvent({ type: 'top' });
      setIsSubmitting(null);
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

  const handleStartTummyTime = async () => {
    setIsSubmitting('tummy_time');
    const timeout = setTimeout(() => setIsSubmitting(null), 5000); // 5s safety hatch
    try {
      await addEvent({ type: 'tummy_time' });
      setIsSubmitting(null);
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
      setIsSubmitting(null);
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
  const activeFeedSession = lastFeed && isFeed(lastFeed.type) && !lastFeed.end_time;
  const isBottleActive = activeFeedSession && lastFeed.type === 'top';

  const activeSessions = [];
  if (activeFeedSession) activeSessions.push(lastFeed);
  if (activeTummyTime) activeSessions.push(activeTummyTime);
  if (activeMassage) activeSessions.push(activeMassage);

  const anyActive = activeSessions.length > 0;

  // Strict co-occurrence helper flags
  const isFeedActive = !!activeFeedSession;
  const isTummyActive = !!activeTummyTime;
  const isMassageActive = !!activeMassage;
  const isTummyOrMassageActive = isTummyActive || isMassageActive;

  useEffect(() => {
    if (anyActive) {
      setIsSubmitting(null);
    } else {
      setIsStopping(false);
      setIsPausing(false);
    }
  }, [anyActive]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="card">

      {/* Header / Dynamic Brand Title Takeover */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: '16px', minHeight: '38px', width: '100%' }}>
        {!anyActive ? (
          <>
            <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '8px', borderRadius: '12px', display: 'flex', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <QuickLogIcon size={22} />
            </div>
            <span style={{ marginLeft: '10px', fontWeight: '700', fontSize: '16px', lineHeight: 1, color: 'var(--text-main)' }}>
              Quick Log
            </span>
          </>
        ) : (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '6px', 
            justifyContent: 'center', 
            alignItems: 'center', 
            width: '100%',
            padding: '0'
          }}>
            {activeSessions.map(session => (
              <ActiveSessionCapsule 
                key={session.id}
                session={session}
                tummyTarget={tummyTarget}
                massageTarget={massageTarget}
                metrics={metrics}
                onPause={handlePauseSession}
                onResume={handleResumeSession}
                onStop={handleStopSession}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>

        {/* Row 1: Feeding & Spit-up */}
        {(() => {
          const isActive = activeFeedSession?.type === 'mom_l';
          const isSuggested = !activeFeedSession && suggestedSide === 'mom_l';
          const isDisabled = (isFeedActive && !isActive) || isTummyOrMassageActive || isSubmitting !== null;
          return (
            <button className={`button-primary ${isSuggested ? 'suggested-side' : ''}`} 
              onClick={() => isActive ? handleStopSession(activeFeedSession) : handleStartMomFeed('left')}
              disabled={isDisabled}
              style={{ 
                background: isActive ? 'var(--primary)' : 'var(--primary-light)', 
                color: isActive ? 'white' : 'var(--primary)', 
                opacity: isDisabled ? 0.45 : 1,
                border: isActive ? '2px solid white' : (isSuggested ? '2px dashed var(--primary)' : 'none'),
                boxShadow: 'none',
                padding: '10px 4px',
                fontSize: '13px',
                borderRadius: '12px'
              }}>
              <Breastfeed size={16} /> Left
            </button>
          );
        })()}

        {(() => {
          const isActive = activeFeedSession?.type === 'mom_r';
          const isSuggested = !activeFeedSession && suggestedSide === 'mom_r';
          const isDisabled = (isFeedActive && !isActive) || isTummyOrMassageActive || isSubmitting !== null;
          return (
            <button className={`button-primary ${isSuggested ? 'suggested-side' : ''}`} 
              onClick={() => isActive ? handleStopSession(activeFeedSession) : handleStartMomFeed('right')}
              disabled={isDisabled}
              style={{ 
                background: isActive ? 'var(--primary)' : 'var(--primary-light)', 
                color: isActive ? 'white' : 'var(--primary)', 
                opacity: isDisabled ? 0.45 : 1,
                border: isActive ? '2px solid white' : (isSuggested ? '2px dashed var(--primary)' : 'none'),
                boxShadow: 'none',
                padding: '10px 4px',
                fontSize: '13px',
                borderRadius: '12px'
              }}>
              <Breastfeed size={16} flip /> Right
            </button>
          );
        })()}

        {(() => {
          const isActive = activeFeedSession?.type === 'top';
          const isDisabled = (isFeedActive && !isActive) || isTummyOrMassageActive || isSubmitting !== null;
          return (
            <button className="button-primary" onClick={() => isActive ? handleStopSession(activeFeedSession) : handleStartBottle()}
              disabled={isDisabled}
              style={{ 
                background: isActive ? 'var(--primary)' : 'var(--primary-light)', 
                color: isActive ? 'white' : 'var(--primary)', 
                opacity: isDisabled ? 0.45 : 1,
                boxShadow: 'none',
                border: isActive ? '2px solid white' : 'none',
                padding: '10px 4px',
                fontSize: '13px',
                borderRadius: '12px'
              }}>
              <TopFeed size={16} /> Top
            </button>
          );
        })()}

        <button className="button-primary" onClick={openSpitUpModal}
          disabled={isSubmitting !== null}
          style={{ 
            background: '#fef3c7', 
            color: '#b45309',
            opacity: isSubmitting !== null ? 0.45 : 1,
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <SpitUp size={16} /> Spit-up
        </button>

        {/* Row 2: Outputs & Timed activities */}
        <button className="button-primary" onClick={() => openDiaperModal(false)}
          disabled={isSubmitting !== null}
          style={{ 
            background: 'var(--secondary-light)', 
            color: 'var(--secondary)',
            opacity: isSubmitting !== null ? 0.45 : 1,
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <Diaper size={16} /> Diaper
        </button>

        <button className="button-primary" onClick={() => openDiaperModal(true)}
          disabled={isSubmitting !== null}
          style={{ 
            background: 'var(--secondary-light)', 
            color: 'var(--secondary)',
            opacity: isSubmitting !== null ? 0.45 : 1,
            padding: '10px 4px',
            fontSize: '13px',
            borderRadius: '12px'
          }}>
          <TummyTime size={16} /> Free
        </button>

        {(() => {
          const isActive = !!activeTummyTime;
          const isDisabled = isFeedActive || isSubmitting !== null;
          return (
            <button className="button-primary" onClick={() => isActive ? handleStopSession(activeTummyTime) : handleStartTummyTime()}
              disabled={isDisabled}
              style={{ 
                background: 'var(--secondary-light)', 
                color: 'var(--secondary)', 
                opacity: isDisabled ? 0.45 : 1,
                boxShadow: 'none',
                border: isActive ? '1.5px solid #10b981' : 'none',
                padding: '10px 4px',
                fontSize: '13px',
                borderRadius: '12px'
              }}>
              <TummyTime size={16} /> Tummy
            </button>
          );
        })()}

        {(() => {
          const isActive = !!activeMassage;
          const isDisabled = isFeedActive || isSubmitting !== null;
          return (
            <button className="button-primary" onClick={() => isActive ? handleStopSession(activeMassage) : handleStartMassage()}
              disabled={isDisabled}
              style={{ 
                background: '#ffe1ea', 
                color: 'var(--accent)', 
                opacity: isDisabled ? 0.45 : 1,
                boxShadow: 'none',
                border: isActive ? '1.5px solid #f472b6' : 'none',
                padding: '10px 4px',
                fontSize: '13px',
                borderRadius: '12px'
              }}>
              <Sparkles size={16} /> Massage
            </button>
          );
        })()}

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
