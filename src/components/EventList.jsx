import { useState, useRef, useEffect } from 'react';
import { useBaby } from './BabyContext';
import { Milk, MessageCircle, Edit3, Trash2, ChevronLeft, ChevronRight, Calendar, History, FilterX, Pill, RotateCcw, X } from 'lucide-react';
import { Diaper, TummyTime, SpitUp, TopFeed, Breastfeed } from './Icons';

// ─── SwipeableRow ────────────────────────────────────────────────────────────
function SwipeableRow({ children, onDelete, onEdit, onNote }) {
  const startXRef    = useRef(0);
  const dragged      = useRef(false); // true if pointer moved meaningfully
  const isDraggingRef = useRef(false);
  const [offsetX, setOffsetX] = useState(0); // live drag delta
  const [snapX,   setSnapX]   = useState(0); // snapped resting position
  const [isDragging, setIsDragging] = useState(false);

  const DRAG_THRESHOLD  = 8;   // px before we consider it a drag (not a click)
  const SNAP_THRESHOLD  = 40;  // px to decide snapping open vs closed
  const SNAP_LEFT       = -104; // snapped open left  (Note + Edit)
  const SNAP_RIGHT      =  64;  // snapped open right (Delete)

  const clamp = (v) => Math.max(-120, Math.min(120, v));
  const close = () => { setSnapX(0); setOffsetX(0); };

  // Combined current visual position
  const visualX = isDragging ? snapX + offsetX : snapX;

  // ── Pointer start ──
  const onStart = (clientX) => {
    startXRef.current = clientX;
    dragged.current = false;
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  // ── Pointer move ──
  const onMove = (clientX) => {
    if (!isDraggingRef.current) return;
    const delta = clientX - startXRef.current;
    if (Math.abs(delta) > DRAG_THRESHOLD) dragged.current = true;
    setOffsetX(clamp(delta));
  };

  // ── Pointer end ──
  const onEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    if (!dragged.current) {
      // Treat as a tap — close if open
      setSnapX(0);
      setOffsetX(0);
      return;
    }

    const total = snapX + offsetX;
    // Decide snap
    if (total < -SNAP_THRESHOLD)      setSnapX(SNAP_LEFT);
    else if (total > SNAP_THRESHOLD)  setSnapX(SNAP_RIGHT);
    else                               setSnapX(0);
    setOffsetX(0);
  };

  // Touch handlers
  const handleTouchStart = (e) => onStart(e.touches[0].clientX);
  const handleTouchMove  = (e) => onMove(e.touches[0].clientX);
  const handleTouchEnd   = ()  => onEnd();

  // Mouse handlers
  const handleMouseDown  = (e) => onStart(e.clientX);
  const handleMouseMove  = (e) => { if (isDraggingRef.current) onMove(e.clientX); };
  const handleMouseUp    = ()  => onEnd();

  const revealed = -visualX;  // how much of left (Note+Edit) panel is visible
  const rightRev =  visualX;  // how much of right (Delete) panel is visible

  const transition = isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.2,0.8,0.2,1)';

  return (
    <div
      style={{ position: 'relative', overflow: 'hidden', width: '100%', userSelect: 'none' }}
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
    >
      {/* Foreground — rendered FIRST so action panels stack on top naturally */}
      <div
        style={{ position: 'relative', background: 'var(--card-bg)', transform: `translateX(${visualX}px)`, transition }}
        onClick={snapX !== 0 ? close : undefined}
      >
        {children}
      </div>

      {/* RIGHT-SWIPE: Delete (red) from the LEFT */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'stretch', pointerEvents: rightRev > 0 ? 'auto' : 'none' }}>
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); close(); onDelete(); }}
          style={{ width: `${Math.max(0, rightRev)}px`, overflow: 'hidden', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: isDragging ? 'none' : 'width 0.25s' }}>
          {rightRev > 20 && <Trash2 size={18} color="white" />}
        </div>
      </div>

      {/* LEFT-SWIPE: Note (violet) + Edit (purple) from the RIGHT */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end', pointerEvents: revealed > 0 ? 'auto' : 'none' }}>
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); close(); onEdit(); }}
          style={{ width: `${Math.max(0, Math.min(revealed - 20, 52))}px`, overflow: 'hidden', background: '#6d28d9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: isDragging ? 'none' : 'width 0.25s' }}>
          {revealed > 40 && <Edit3 size={18} color="white" />}
        </div>
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); close(); onNote(); }}
          style={{ width: `${Math.min(Math.max(0, revealed), 52)}px`, overflow: 'hidden', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: isDragging ? 'none' : 'width 0.25s' }}>
          {revealed > 20 && <MessageCircle size={18} color="white" />}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function EventList() {
  const {
    events, updateEvent, deleteEvent,
    page, setPage, totalCount, PAGE_SIZE,
    filters, toggleFilter, loading,
    dateFilter, setGotoDate, allTimeStats,
    restoreFromTrash, fetchDeletedEvents,
  } = useBaby();

  const [editingEvent, setEditingEvent]     = useState(null);
  const [commentingId, setCommentingId]     = useState(null);
  const [commentDraft, setCommentDraft]     = useState('');
  const [windowStart, setWindowStart]       = useState(0);
  const [showBin, setShowBin]               = useState(false);
  const [deletedItems, setDeletedItems]     = useState([]);

  const WINDOW_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(totalCount / (PAGE_SIZE || 50)));

  // Load deleted items when bin opens
  useEffect(() => {
    if (showBin && fetchDeletedEvents) {
      fetchDeletedEvents().then(setDeletedItems);
    }
  }, [showBin]); // eslint-disable-line

  // ── helpers ─────────────────────────────────────────────────────────────
  const getLocalDate = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  };
  const today = getLocalDate();
  const firstDate = allTimeStats.firstEventTime
    ? new Date(new Date(allTimeStats.firstEventTime).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]
    : '2024-01-01';

  const FEED_TYPES = ['top', 'mom_l', 'mom_r'];
  const isFeed = (type) => FEED_TYPES.includes(type);

  const getIcon = (event) => {
    const { type, is_diaper_free } = event;
    if (type === 'top')    return <TopFeed size={16} />;
    if (type === 'mom_l')  return <Breastfeed size={16} />;
    if (type === 'mom_r')  return <Breastfeed size={16} flip />;
    if (isFeed(type))      return <Milk size={16} />;
    if (type === 'diaper') return is_diaper_free ? <TummyTime size={16} /> : <Diaper size={16} />;
    if (type === 'spit_up') return <SpitUp size={16} />;
    if (type === 'medicine') return <Pill size={16} />;
    return null;
  };

  const getDetails = (event) => {
    if (isFeed(event.type)) {
      const method = event.type === 'mom_l' ? 'Mom (L)' : event.type === 'mom_r' ? 'Mom (R)' : 'Top';
      return `${method}${event.amount_ml ? ` · ${event.amount_ml}ml` : ''}`;
    }
    if (event.type === 'diaper') {
      const typeStr = event.is_diaper_free ? 'Diaper Free' : 'Diaper';
      const pee  = event.pee_amount  && event.pee_amount  !== 'none' ? `Pee (${event.pee_amount.charAt(0).toUpperCase()})`  : '';
      const poop = event.poop_amount && event.poop_amount !== 'none' ? `Poop (${event.poop_amount.charAt(0).toUpperCase()})` : '';
      const details = [poop, pee].filter(Boolean).join(' | ');
      return details ? `${typeStr} | ${details}` : typeStr;
    }
    if (event.type === 'spit_up') {
      const intensity = event.intensity ? event.intensity.charAt(0).toUpperCase() + event.intensity.slice(1) : 'Minor';
      return `Spit-up (${intensity})`;
    }
    if (event.type === 'medicine') return 'Meds';
    return '';
  };

  const getSubtitle = (event) => {
    const start = new Date(event.start_time);
    const dateStr = start.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
    const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    let s = `${dateStr} | ${timeStr}`;
    if (isFeed(event.type)) {
      if (!event.end_time) {
        s += ' | ⏱ Active';
      } else {
        const durationMs = (new Date(event.end_time) - start) - (event.total_paused_ms || 0);
        const mins = Math.round(durationMs / 60000);
        s += mins < 1 ? ` | ${Math.round(durationMs / 1000)}s` : ` | ${mins}m`;
      }
    }
    return s;
  };

  const toLocalInput = (iso) =>
    iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

  const getColorStyle = (type) => {
    if (type === 'top')                       return { background: 'var(--primary)',        color: 'white' };
    if (type === 'mom_l' || type === 'mom_r') return { background: 'var(--primary-light)',  color: 'var(--primary)' };
    if (type === 'diaper')                    return { background: 'var(--secondary-light)', color: 'var(--secondary)' };
    if (type === 'spit_up')                   return { background: '#fef3c7',               color: '#b45309' };
    if (type === 'medicine')                  return { background: '#e0e7ff',               color: '#4338ca' };
    return { background: 'var(--primary-light)', color: 'var(--primary)' };
  };

  // ── handlers ─────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    const { id, ...updates } = editingEvent;
    await updateEvent(id, updates);
    setEditingEvent(null);
  };

  const handleSaveNote = async (id) => {
    await updateEvent(id, { notes: commentDraft.trim() });
    setCommentingId(null);
  };

  const handleRestore = async (id) => {
    await restoreFromTrash(id);
    fetchDeletedEvents().then(setDeletedItems);
  };

  const clearAllFilters = () => {
    FILTER_OPTIONS.forEach(opt => { if (filters.includes(opt.id)) toggleFilter(opt.id); });
    setGotoDate(null);
  };

  const FILTER_OPTIONS = [
    { id: 'mom_l',      label: 'Mom L'  },
    { id: 'mom_r',      label: 'Mom R'  },
    { id: 'top',        label: 'Top'    },
    { id: 'diaper',     label: 'Diaper' },
    { id: 'diaper_free',label: 'D Free' },
    { id: 'medicine',   label: 'Meds'   },
  ];

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Card ── */}
      <div className="card">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>

          {/* History icon */}
          <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '8px', borderRadius: '12px', display: 'flex', flexShrink: 0 }}>
            <History size={20} />
          </div>

          {/* Recycle Bin icon — next to log icon */}
          <button onClick={() => setShowBin(true)} title="Recycle Bin"
            style={{ flexShrink: 0, background: 'var(--border-soft)', color: 'var(--text-muted)', border: 'none', borderRadius: '10px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Trash2 size={17} />
          </button>

          {/* Scrollable filter chips */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', flex: 1, msOverflowStyle: 'none', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', alignItems: 'center' }} className="hide-scrollbar">

            {/* Date chip */}
            <label style={{ position: 'relative', flexShrink: 0, cursor: 'pointer', display: 'block' }}>
              <div style={{ padding: '6px 12px', borderRadius: '20px', border: '1px solid', borderColor: dateFilter ? 'var(--primary)' : 'var(--border-soft)', background: dateFilter ? 'var(--primary-light)' : 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: '6px', color: dateFilter ? 'var(--primary)' : 'var(--text-muted)', pointerEvents: 'none' }}>
                <Calendar size={14} />
                <span style={{ fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                  {dateFilter ? (() => {
                    const [y, m, d] = dateFilter.split('-');
                    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return `${d}-${months[parseInt(m)-1]}-${y.slice(2)}`;
                  })() : 'Date'}
                </span>
              </div>
              <input type="date" min={firstDate} max={today} value={dateFilter || ''}
                onChange={(e) => { const v = e.target.value; if (v && v >= firstDate && v <= today) setGotoDate(v); }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10, WebkitAppearance: 'none', display: 'block' }}
              />
            </label>

            <div style={{ width: '1px', height: '16px', background: 'var(--border-soft)', flexShrink: 0 }} />

            {FILTER_OPTIONS.map(opt => {
              const isActive = filters.includes(opt.id);
              return (
                <button key={opt.id} onClick={() => toggleFilter(opt.id)} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', border: '1px solid', borderColor: isActive ? 'var(--primary)' : 'var(--border-soft)', background: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.03)', color: isActive ? 'white' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s ease', flexShrink: 0 }}>
                  {opt.label}
                </button>
              );
            })}
          </div>



          {/* Clear filters */}
          {(filters.length > 0 || dateFilter) && (
            <button onClick={clearAllFilters} title="Clear all filters"
              style={{ flexShrink: 0, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: '10px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <FilterX size={17} />
            </button>
          )}
        </div>

        {/* Event list */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <p style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading activities...</p>
          ) : events.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No activities found matching filters.</p>
          ) : (
            events.map(event => (
              <SwipeableRow
                key={String(event.id)}
                onDelete={() => deleteEvent(event.id)}
                onEdit={() => setEditingEvent({ ...event })}
                onNote={() => { setCommentingId(event.id); setCommentDraft(event.notes || ''); }}
              >
                <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-soft)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ ...getColorStyle(event.type), padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {getIcon(event)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600' }}>{getDetails(event)}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{getSubtitle(event)}</div>
                    </div>
                  </div>

                  {/* Inline comment editor */}
                  {commentingId === event.id && (
                    <div style={{ marginLeft: '44px', marginTop: '12px' }}>
                      <textarea className="comment-textarea" rows={3} placeholder="Add a note…"
                        value={commentDraft}
                        onChange={e => setCommentDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveNote(event.id); }}
                      />
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button className="comment-save-btn" onClick={() => handleSaveNote(event.id)}>Save</button>
                        <button className="comment-save-btn" style={{ background: 'transparent', color: 'var(--text-muted)' }} onClick={() => setCommentingId(null)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Saved note preview */}
                  {event.notes && event.notes.trim() && commentingId !== event.id && (
                    <p style={{ margin: '2px 0 0 44px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
                      "{event.notes}"
                    </p>
                  )}
                </div>
              </SwipeableRow>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && !dateFilter && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-soft)' }}>
            <button className="icon-action-btn" disabled={windowStart === 0} onClick={() => setWindowStart(Math.max(0, windowStart - WINDOW_SIZE))} style={{ opacity: windowStart === 0 ? 0.2 : 1 }}>
              <ChevronLeft size={18} />
            </button>

            {Array.from({ length: Math.min(WINDOW_SIZE, totalPages - windowStart) }, (_, i) => {
              const p = windowStart + i;
              const isActive = p === page;
              return (
                <button key={p}
                  onClick={() => {
                    setPage(p);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    if (p >= windowStart + WINDOW_SIZE - 1 && p < totalPages - 1) {
                      setWindowStart(Math.min(totalPages - WINDOW_SIZE, windowStart + WINDOW_SIZE));
                    }
                  }}
                  style={{ width: '32px', height: '32px', border: isActive ? '2px solid var(--primary)' : '1px solid var(--border-soft)', borderRadius: '8px', background: isActive ? 'var(--primary)' : 'transparent', color: isActive ? 'white' : 'var(--text-muted)', fontSize: '13px', fontWeight: isActive ? '700' : '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s ease' }}
                >
                  {p + 1}
                </button>
              );
            })}

            <button className="icon-action-btn" disabled={windowStart + WINDOW_SIZE >= totalPages} onClick={() => setWindowStart(Math.min(totalPages - WINDOW_SIZE, windowStart + WINDOW_SIZE))} style={{ opacity: windowStart + WINDOW_SIZE >= totalPages ? 0.2 : 1 }}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {editingEvent && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '20px' }}>Edit Activity</h2>

            <span className="intensity-label">Start Time</span>
            <input type="datetime-local" className="input-field"
              value={toLocalInput(editingEvent.start_time)}
              onChange={(e) => setEditingEvent({ ...editingEvent, start_time: new Date(e.target.value).toISOString() })}
            />

            {isFeed(editingEvent.type) && (
              <>
                <span className="intensity-label">End Time</span>
                <input type="datetime-local" className="input-field"
                  value={toLocalInput(editingEvent.end_time)}
                  onChange={(e) => setEditingEvent({ ...editingEvent, end_time: new Date(e.target.value).toISOString() })}
                />
                {editingEvent.type === 'top' && (
                  <>
                    <span className="intensity-label">Amount (ml)</span>
                    <input type="number" className="input-field"
                      value={editingEvent.amount_ml || ''}
                      onChange={(e) => setEditingEvent({ ...editingEvent, amount_ml: parseInt(e.target.value) })}
                    />
                  </>
                )}
              </>
            )}

            {editingEvent.type === 'diaper' && (
              <>
                <span className="intensity-label">Pee Intensity</span>
                <div className="intensity-grid">
                  {['none', 'light', 'heavy'].map(amt => (
                    <button key={amt} className={`intensity-button ${editingEvent.pee_amount === amt ? 'active mint' : ''}`}
                      onClick={() => setEditingEvent({ ...editingEvent, pee_amount: amt })}>
                      {amt}
                    </button>
                  ))}
                </div>
                <span className="intensity-label">Poop Intensity</span>
                <div className="intensity-grid">
                  {['none', 'light', 'heavy'].map(amt => (
                    <button key={amt} className={`intensity-button ${editingEvent.poop_amount === amt ? 'active mint' : ''}`}
                      onClick={() => setEditingEvent({ ...editingEvent, poop_amount: amt })}>
                      {amt}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                  <input type="checkbox" id="edit_diaper_free"
                    checked={!!editingEvent.is_diaper_free}
                    onChange={(e) => setEditingEvent({ ...editingEvent, is_diaper_free: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                  />
                  <label htmlFor="edit_diaper_free" style={{ fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    Diaper Free (Accident / Tummy Time)
                  </label>
                </div>
              </>
            )}

            <div className="grid-2">
              <button className="button-primary" style={{ background: '#eee', color: '#666' }} onClick={() => setEditingEvent(null)}>Cancel</button>
              <button className="button-primary" onClick={handleSaveEdit}>Update</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recycle Bin Modal (bottom sheet) ── */}
      {showBin && (
        <div className="modal-overlay" onClick={() => setShowBin(false)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '80vh', borderRadius: '24px 24px 0 0', overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 20px)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Recycle Bin</h2>
              <button className="icon-action-btn" onClick={() => setShowBin(false)}><X size={22} /></button>
            </div>

            {deletedItems.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Trash is empty</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {deletedItems.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-soft)' }}>
                    <div style={{ ...getColorStyle(item.type), padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {getIcon(item)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600' }}>{getDetails(item)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{getSubtitle(item)}</div>
                    </div>
                    <button
                      onClick={() => handleRestore(item.id)}
                      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--primary-light)', color: 'var(--primary)', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      <RotateCcw size={13} /> Restore
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px', fontStyle: 'italic' }}>
              Last 10 deleted items. Tap Restore to recover.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
