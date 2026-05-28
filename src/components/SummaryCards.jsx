import { useState } from 'react';
import { useBaby } from './BabyContext';
import { getMetrics } from '../utils/metrics';
import { MousePointer2, Droplets, Utensils, Hash, Wind, ChevronRight, Sparkles, Settings } from 'lucide-react';
import { SpitUp, TummyTime } from './Icons';

export default function SummaryCards() {
  const { 
    allTimeStats, 
    aiInsights, 
    metrics, 
    tummyTarget, 
    massageTarget, 
    setTummyTarget, 
    setMassageTarget 
  } = useBaby();

  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [tempTummyTarget, setTempTummyTarget] = useState(tummyTarget);
  const [tempMassageTarget, setTempMassageTarget] = useState(massageTarget);
  // Use pre-calculated metrics from context if available, otherwise show empty state
  const m = metrics || {
    lastFeed: '—', lastPee: '—', lastPoop: '—',
    lastFeedRaw: null, lastPeeRaw: null, lastPoopRaw: null,
    feedsToday: 0, peesToday: 0, poopsToday: 0, hoursElapsed: 0,
    totalDiapers: 0, avgDiapersPerDay: '—',
    spitUps24h: 0, spitUpsMajor: 0, spitUpsMinor: 0,
  };

  const pillStyle = {
    padding: '6px',
    marginBottom: '8px',
    width: '100%',
    justifyContent: 'center',
  };

  return (
    <div style={{ position: 'relative', marginBottom: '24px' }}>
      <div className="summary-scroll-container">

      {/* Feed */}
      <div className={`card summary-card ${m.lastFeedRaw !== null && m.lastFeedRaw > 3 ? 'glowing-alert' : ''}`}>
        <div className="metric-pill lavender" style={pillStyle}>
          <Utensils size={14} /> Feed
        </div>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>{m.lastFeed}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
          {m.feedsToday} in {m.hoursElapsed}h
        </div>
        {aiInsights?.micro?.feed && (
          <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '6px', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <MousePointer2 size={10} /> {aiInsights.micro.feed}
          </div>
        )}
      </div>

      {/* Pee */}
      <div className={`card summary-card ${m.lastPeeRaw !== null && m.lastPeeRaw > 4 ? 'glowing-alert' : ''}`}>
        <div className="metric-pill mint" style={pillStyle}>
          <Droplets size={14} /> Pee
        </div>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>{m.lastPee}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
          {m.peesToday} in {m.hoursElapsed}h
        </div>
        {aiInsights?.micro?.pee && (
          <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '6px', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <MousePointer2 size={10} /> {aiInsights.micro.pee}
          </div>
        )}
      </div>

      {/* Spit-up */}
      <div className="card summary-card">
        <div className="metric-pill amber" style={pillStyle}>
          <SpitUp size={14} /> Spit-up
        </div>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>{m.spitUps24h} in 24h</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
          <span style={{ fontSize: '10px' }}>{m.spitUpsMinor} minor</span>
          {m.spitUpsMajor > 0 && (
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#b45309', marginLeft: '6px' }}>
              {m.spitUpsMajor} major
            </span>
          )}
        </div>
        {aiInsights?.micro?.spit_up && (
          <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '6px', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <MousePointer2 size={10} /> {aiInsights.micro.spit_up}
          </div>
        )}
      </div>

      {/* Poop */}
      <div className={`card summary-card ${m.lastPoopRaw !== null && m.lastPoopRaw > 24 ? 'glowing-alert' : ''}`}>
        <div className="metric-pill amber" style={pillStyle}>
          <Wind size={14} /> Poop
        </div>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>{m.lastPoop}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
          {m.poopsToday} in {m.hoursElapsed}h
        </div>
        {aiInsights?.micro?.poop && (
          <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '6px', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <MousePointer2 size={10} /> {aiInsights.micro.poop}
          </div>
        )}
      </div>

      {/* Tummy Time */}
      <div className="card summary-card" style={{ position: 'relative' }}>
        <button 
          onClick={() => {
            setTempTummyTarget(tummyTarget);
            setTempMassageTarget(massageTarget);
            setIsTargetModalOpen(true);
          }}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            opacity: 0.4,
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'opacity 0.2s',
          }}
          className="icon-action-btn"
          title="Edit Daily Goals"
        >
          <Settings size={12} />
        </button>
        <div className="metric-pill mint" style={pillStyle}>
          <TummyTime size={14} /> Tummy
        </div>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>
          {(() => {
            const todaySecs = m.tummyTimeTodaySeconds || 0;
            const remaining = Math.max(0, (tummyTarget * 60) - todaySecs);
            if (remaining === 0) return 'Done 🎉';
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            return secs > 0 ? `${mins}m ${secs}s left` : `${mins}m left`;
          })()}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
          Last: {m.lastTummyTime || '—'}
        </div>
        {aiInsights?.micro?.tummy_time && (
          <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '6px', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <MousePointer2 size={10} /> {aiInsights.micro.tummy_time}
          </div>
        )}
      </div>

      {/* Massage */}
      <div className="card summary-card" style={{ position: 'relative' }}>
        <button 
          onClick={() => {
            setTempTummyTarget(tummyTarget);
            setTempMassageTarget(massageTarget);
            setIsTargetModalOpen(true);
          }}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            opacity: 0.4,
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'opacity 0.2s',
          }}
          className="icon-action-btn"
          title="Edit Daily Goals"
        >
          <Settings size={12} />
        </button>
        <div className="metric-pill rose" style={pillStyle}>
          <Sparkles size={14} /> Massage
        </div>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>
          {(() => {
            const todaySecs = m.massageTodaySeconds || 0;
            const remaining = Math.max(0, (massageTarget * 60) - todaySecs);
            if (remaining === 0) return 'Done 🎉';
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            return secs > 0 ? `${mins}m ${secs}s left` : `${mins}m left`;
          })()}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
          Last: {m.lastMassage || '—'}
        </div>
        {aiInsights?.micro?.massage && (
          <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '6px', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <MousePointer2 size={10} /> {aiInsights.micro.massage}
          </div>
        )}
      </div>

      {/* Diaper Stats */}
      <div className="card summary-card">
        <div className="metric-pill rose" style={pillStyle}>
          <Hash size={14} /> Diapers
        </div>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>{m.totalDiapers} total</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
          {m.avgDiapersPerDay}/day
        </div>
        {aiInsights?.micro?.stats && (
          <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '6px', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <MousePointer2 size={10} /> {aiInsights.micro.stats}
          </div>
        )}
      </div>

      {/* Weight */}
      <div className="card summary-card">
        <div className="metric-pill lavender" style={pillStyle}>
          <MousePointer2 size={14} style={{ transform: 'rotate(45deg)' }} /> Weight
        </div>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>
          {m.latestWeight ? `${m.latestWeight} kg` : '—'}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
          {m.latestWeight ? (
            parseFloat(m.weightTrend) > 0 ? `+${m.weightTrend}kg gain` : 
            parseFloat(m.weightTrend) < 0 ? `${m.weightTrend}kg loss` : 
            'Stable'
          ) : 'No logs'}
        </div>
        {aiInsights?.micro?.weight && (
          <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '6px', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <MousePointer2 size={10} /> {aiInsights.micro.weight}
          </div>
        )}
      </div>

      </div>

      {/* Scroll hint — fades out after first interaction via CSS */}
      <div className="scroll-hint" style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: '6px',
        width: '48px',
        background: 'linear-gradient(to right, transparent, var(--bg-app) 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        pointerEvents: 'none',
      }}>
        <ChevronRight size={22} style={{ opacity: 0.35, marginRight: '4px', color: 'var(--text-main)' }} />
      </div>

      {/* Daily Goals Selector Modal */}
      {isTargetModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
          <div className="modal-content" style={{ maxWidth: '340px' }}>
            <h2 style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Daily Goals 🎯
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '0', marginBottom: '20px' }}>
              Customize daily countdown targets for baby sessions.
            </p>

            {/* Tummy Time Target */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Tummy Time Goal</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>
                  {tempTummyTarget} min
                </span>
              </div>
              <input 
                type="range" 
                min="5" 
                max="60" 
                step="5"
                value={tempTummyTarget} 
                onChange={(e) => setTempTummyTarget(parseInt(e.target.value))}
                className="slider-input"
                style={{ margin: '8px 0', width: '100%' }}
              />
            </div>

            {/* Massage Target */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Massage Goal</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>
                  {tempMassageTarget} min
                </span>
              </div>
              <input 
                type="range" 
                min="5" 
                max="60" 
                step="5"
                value={tempMassageTarget} 
                onChange={(e) => setTempMassageTarget(parseInt(e.target.value))}
                className="slider-input"
                style={{ margin: '8px 0', width: '100%' }}
              />
            </div>

            {/* Actions */}
            <div className="grid-2" style={{ marginTop: '24px' }}>
              <button 
                className="button-primary" 
                style={{ background: 'var(--border-soft)', color: 'var(--text-main)', border: 'none' }}
                onClick={() => setIsTargetModalOpen(false)}
              >
                Cancel
              </button>
              <button 
                className="button-primary" 
                onClick={() => {
                  setTummyTarget(tempTummyTarget);
                  setMassageTarget(tempMassageTarget);
                  setIsTargetModalOpen(false);
                }}
              >
                Save Goals
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
