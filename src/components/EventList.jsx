import { useState } from 'react';
import { useBaby } from './BabyContext';
import { Milk, MessageCircle, Edit3, Trash2, ChevronLeft, ChevronRight, Calendar, History, FilterX, Pill } from 'lucide-react';
import { Diaper, TummyTime, SpitUp, TopFeed, Breastfeed } from './Icons';

export default function EventList() {
  const { events, updateEvent, deleteEvent, page, setPage, totalCount, PAGE_SIZE, filters, toggleFilter, loading, dateFilter, setGotoDate, allTimeStats } = useBaby();
  const [editingEvent, setEditingEvent] = useState(null);
  const [commentingId, setCommentingId] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [windowStart, setWindowStart] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const WINDOW_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(totalCount / (PAGE_SIZE || 50)));

  // Format local date for input min/max (YYYY-MM-DD)
  const getLocalDate = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };
  const today = getLocalDate();
  const firstDate = allTimeStats.firstEventTime 
    ? new Date(new Date(allTimeStats.firstEventTime).getTime() - (new Date().getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0] 
    : '2024-01-01';

  const FEED_TYPES = ['top', 'mom_l', 'mom_r'];
  const isFeed = (type) => FEED_TYPES.includes(type);

  const getIcon = (event) => {
    const { type, is_diaper_free } = event;
    if (type === 'top') return <TopFeed size={16} />;
    if (type === 'mom_l') return <Breastfeed size={16} />;
    if (type === 'mom_r') return <Breastfeed size={16} flip />;
    if (isFeed(type)) return <Milk size={16} />;
    if (type === 'diaper') {
      return is_diaper_free ? <TummyTime size={16} /> : <Diaper size={16} />;
    }
    if (type === 'spit_up') return <SpitUp size={16} />;
    if (type === 'medicine') return <Pill size={16} />;
    return null;
  };

  const getDetails = (event) => {
    if (isFeed(event.type)) {
      const method = event.type === 'mom_l' ? 'Mom (L)' : event.type === 'mom_r' ? 'Mom (R)' : 'Top';
      const amount = event.amount_ml ? ` · ${event.amount_ml}ml` : '';
      return `${method}${amount}`;
    }
    if (event.type === 'diaper') {
      const typeStr = event.is_diaper_free ? 'Diaper Free' : 'Diaper';
      const pee = event.pee_amount && event.pee_amount !== 'none' ? `Pee (${event.pee_amount.charAt(0).toUpperCase()})` : '';
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

    let displayStr = `${dateStr} | ${timeStr}`;

    if (isFeed(event.type)) {
      if (!event.end_time) {
        displayStr += ' | ⏱ Active';
      } else {
        const totalPaused = event.total_paused_ms || 0;
        const durationMs = (new Date(event.end_time) - start) - totalPaused;
        const mins = Math.round(durationMs / 60000);
        if (mins < 1) {
          displayStr += ` | ${Math.round(durationMs / 1000)}s`;
        } else {
          displayStr += ` | ${mins}m`;
        }
      }
    }

    return displayStr;
  };

  const toLocalInput = (iso) =>
    iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

  const handleSaveEdit = async () => {
    const { id, ...updates } = editingEvent;
    await updateEvent(id, updates);
    setEditingEvent(null);
  };

  const handleSaveNote = async (id) => {
    await updateEvent(id, { notes: commentDraft.trim() });
    setCommentingId(null);
  };

  const handleDelete = async (id) => {
    console.log('[EventList] handleDelete called for ID:', id);
    // Removing window.confirm for now to rule out browser blocking
    await deleteEvent(id);
  };

  const getColorStyle = (type) => {
    if (type === 'top') return { background: 'var(--primary)', color: 'white' };
    if (type === 'mom_l' || type === 'mom_r') return { background: 'var(--primary-light)', color: 'var(--primary)' };
    if (type === 'diaper') return { background: 'var(--secondary-light)', color: 'var(--secondary)' };
    if (type === 'spit_up') return { background: '#fef3c7', color: '#b45309' };
    if (type === 'medicine') return { background: '#e0e7ff', color: '#4338ca' };
    return { background: 'var(--primary-light)', color: 'var(--primary)' };
  };

  const FILTER_OPTIONS = [
    { id: 'mom_l', label: 'Mom L' },
    { id: 'mom_r', label: 'Mom R' },
    { id: 'top', label: 'Top' },
    { id: 'diaper', label: 'Diaper' },
    { id: 'diaper_free', label: 'D Free' },
    { id: 'medicine', label: 'Meds' }
  ];

  return (
    <>
      <div className="card">
      {/* Header Row: Logo | Filters | Clear */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        marginBottom: '16px',
        paddingBottom: '4px'
      }}>
        {/* 1. History Logo */}
        <div style={{ 
          background: 'var(--primary-light)', 
          color: 'var(--primary)', 
          padding: '8px', 
          borderRadius: '12px', 
          display: 'flex',
          flexShrink: 0 
        }}>
          <History size={20} />
        </div>

        {/* 2. Scrollable Filters & Date */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          overflowX: 'auto', 
          flex: 1,
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          alignItems: 'center'
        }} className="hide-scrollbar">
          {/* Date Chip */}
          <label style={{ position: 'relative', flexShrink: 0, cursor: 'pointer', display: 'block' }}>
            <div style={{ 
              padding: '6px 12px', 
              borderRadius: '20px', 
              border: '1px solid',
              borderColor: dateFilter ? 'var(--primary)' : 'var(--border-soft)',
              background: dateFilter ? 'var(--primary-light)' : 'rgba(255,255,255,0.03)',
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              color: dateFilter ? 'var(--primary)' : 'var(--text-muted)',
              pointerEvents: 'none' // Clicks pass through to input
            }}>
              <Calendar size={14} />
              <span style={{ fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                {dateFilter ? (() => {
                  const [y, m, d] = dateFilter.split('-');
                  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  return `${d}-${months[parseInt(m) - 1]}-${y.slice(2)}`;
                })() : 'Date'}
              </span>
            </div>
            <input 
              type="date"
              min={firstDate}
              max={today}
              value={dateFilter || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val && val >= firstDate && val <= today) {
                  setGotoDate(val);
                }
              }}
              style={{ 
                position: 'absolute', 
                inset: 0,
                width: '100%', 
                height: '100%', 
                opacity: 0, 
                cursor: 'pointer',
                zIndex: 10,
                WebkitAppearance: 'none',
                display: 'block'
              }}
            />
          </label>

          {/* Divider */}
          <div style={{ width: '1px', height: '16px', background: 'var(--border-soft)', flexShrink: 0 }} />

          {/* Filter Chips */}
          {FILTER_OPTIONS.map(opt => {
            const isActive = filters.includes(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => toggleFilter(opt.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--primary)' : 'var(--border-soft)',
                  background: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                  color: isActive ? 'white' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* 3. Clear Filter Icon */}
        {(filters.length > 0 || dateFilter) && (
          <button 
            onClick={() => {
              FILTER_OPTIONS.forEach(opt => {
                if (filters.includes(opt.id)) toggleFilter(opt.id);
              });
              setGotoDate(null);
            }}
            style={{ 
              flexShrink: 0,
              background: 'rgba(239, 68, 68, 0.1)', 
              color: '#ef4444', 
              border: 'none', 
              borderRadius: '10px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Clear all filters"
          >
            <FilterX size={18} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {loading || isFetching ? (
          <p style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading activities...</p>
        ) : events.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No activities found matching filters.</p>
        ) : (
          events.map(event => (
            <div
              key={String(event.id)}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}
            >
              {/* Main row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  ...getColorStyle(event.type),
                  padding: '8px', 
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {getIcon(event)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>
                    {getDetails(event)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {getSubtitle(event)}
                    </div>
                    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                      <button
                        className="icon-action-btn"
                        style={{ color: event.notes && event.notes.trim() ? 'var(--primary)' : 'var(--text-muted)' }}
                        onClick={() => {
                          if (commentingId === event.id) {
                            setCommentingId(null);
                          } else {
                            setCommentingId(event.id);
                            setCommentDraft(event.notes || '');
                          }
                        }}
                        title="Add/Edit Note"
                      >
                        <MessageCircle size={16} />
                      </button>

                      <button
                        onClick={() => setEditingEvent({ ...event })}
                        className="icon-action-btn"
                        title="Edit event"
                      >
                        <Edit3 size={16} />
                      </button>

                      <button
                        onClick={() => handleDelete(event.id)}
                        className="icon-action-btn delete"
                        title="Delete event"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Inline Comment Editor */}
              {commentingId === event.id && (
                <div style={{ marginLeft: '44px', marginTop: '12px' }}>
                  <textarea
                    className="comment-textarea"
                    rows={3}
                    placeholder="Add a note…"
                    value={commentDraft}
                    onChange={e => setCommentDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveNote(event.id);
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                    <button className="comment-save-btn" onClick={() => handleSaveNote(event.id)}>Save</button>
                    <button className="comment-save-btn" style={{ background: 'transparent', color: 'var(--text-muted)' }} onClick={() => setCommentingId(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Saved note preview (when comment box is closed) */}
              {event.notes && event.notes.trim() && commentingId !== event.id && (
                <p style={{
                  margin: '8px 0 0 44px',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  fontStyle: 'italic',
                  lineHeight: 1.4,
                }}>
                  "{event.notes}"
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Sliding Window Pagination - Only show if more than 1 page AND no date filter is active */}
      {totalPages > 1 && !dateFilter && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '4px',
          marginTop: '16px', 
          paddingTop: '16px', 
          borderTop: '1px solid var(--border-soft)' 
        }}>
        {/* Slide window left */}
        <button
          className="icon-action-btn"
          disabled={windowStart === 0}
          onClick={() => setWindowStart(Math.max(0, windowStart - WINDOW_SIZE))}
          style={{ opacity: windowStart === 0 ? 0.2 : 1 }}
        >
          <ChevronLeft size={18} />
        </button>

        {/* Page number buttons */}
        {Array.from({ length: Math.min(WINDOW_SIZE, totalPages - windowStart) }, (_, i) => {
          const p = windowStart + i;
          const isActive = p === page;
          return (
            <button
              key={p}
              onClick={() => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                // Auto-advance window if we go to edge page
                if (p >= windowStart + WINDOW_SIZE - 1 && p < totalPages - 1) {
                  setWindowStart(Math.min(totalPages - WINDOW_SIZE, windowStart + WINDOW_SIZE));
                }
              }}
              style={{
                width: '32px',
                height: '32px',
                border: isActive ? '2px solid var(--primary)' : '1px solid var(--border-soft)',
                borderRadius: '8px',
                background: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? 'white' : 'var(--text-muted)',
                fontSize: '13px',
                fontWeight: isActive ? '700' : '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
            >
              {p + 1}
            </button>
          );
        })}

        {/* Slide window right */}
        <button
          className="icon-action-btn"
          disabled={windowStart + WINDOW_SIZE >= totalPages}
          onClick={() => setWindowStart(Math.min(totalPages - WINDOW_SIZE, windowStart + WINDOW_SIZE))}
          style={{ opacity: windowStart + WINDOW_SIZE >= totalPages ? 0.2 : 1 }}
        >
          <ChevronRight size={18} />
        </button>
        </div>
      )}
    </div>

    {/* Edit Modal */}
      {editingEvent && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '20px' }}>Edit Activity</h2>

            <span className="intensity-label">Start Time</span>
            <input
              type="datetime-local"
              className="input-field"
              value={toLocalInput(editingEvent.start_time)}
              onChange={(e) => setEditingEvent({ ...editingEvent, start_time: new Date(e.target.value).toISOString() })}
            />

            {isFeed(editingEvent.type) && (
              <>
                <span className="intensity-label">End Time</span>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={toLocalInput(editingEvent.end_time)}
                  onChange={(e) => setEditingEvent({ ...editingEvent, end_time: new Date(e.target.value).toISOString() })}
                />
                {editingEvent.type === 'top' && (
                  <>
                    <span className="intensity-label">Amount (ml)</span>
                    <input
                      type="number"
                      className="input-field"
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
                    <button
                      key={amt}
                      className={`intensity-button ${editingEvent.pee_amount === amt ? 'active mint' : ''}`}
                      onClick={() => setEditingEvent({ ...editingEvent, pee_amount: amt })}
                    >
                      {amt}
                    </button>
                  ))}
                </div>
                <span className="intensity-label">Poop Intensity</span>
                <div className="intensity-grid">
                  {['none', 'light', 'heavy'].map(amt => (
                    <button
                      key={amt}
                      className={`intensity-button ${editingEvent.poop_amount === amt ? 'active mint' : ''}`}
                      onClick={() => setEditingEvent({ ...editingEvent, poop_amount: amt })}
                    >
                      {amt}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                  <input
                    type="checkbox"
                    id="edit_diaper_free"
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
    </>
  );
}
