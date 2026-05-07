import { useBaby } from './BabyContext';
import { getMetrics } from '../utils/metrics';
import { MousePointer2, Droplets, Utensils, Hash, Wind, ChevronRight } from 'lucide-react';
import { SpitUp } from './Icons';

export default function SummaryCards() {
  const { allTimeStats, aiInsights, metrics } = useBaby();
  
  // Use pre-calculated metrics from context if available, otherwise show empty state
  const m = metrics || {
    lastFeed: '—', lastPee: '—', lastPoop: '—',
    lastFeedRaw: null, lastPeeRaw: null, lastPoopRaw: null,
    feedsToday: 0, peesToday: 0, poopsToday: 0, hoursElapsed: 0,
    totalDiapers: 0, avgDiapersPerDay: '—',
    spitUps24h: 0, spitUpsMajor: 0, spitUpsMinor: 0,
  };

  const cardStyle = {
    padding: '12px',
    textAlign: 'center',
    minWidth: 'calc(50vw - 24px)',
    width: 'calc(50vw - 24px)',
    flex: '0 0 auto',
    borderRadius: '16px',
    boxSizing: 'border-box',
  };

  const pillStyle = {
    padding: '6px',
    marginBottom: '8px',
    width: '100%',
    justifyContent: 'center',
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        gap: '10px',
        overflowX: 'auto',
        paddingBottom: '6px',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>

      {/* Feed */}
      <div className={`card ${m.lastFeedRaw !== null && m.lastFeedRaw > 3 ? 'glowing-alert' : ''}`} style={cardStyle}>
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
      <div className={`card ${m.lastPeeRaw !== null && m.lastPeeRaw > 4 ? 'glowing-alert' : ''}`} style={cardStyle}>
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
      <div className="card" style={cardStyle}>
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
      <div className={`card ${m.lastPoopRaw !== null && m.lastPoopRaw > 24 ? 'glowing-alert' : ''}`} style={cardStyle}>
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

      {/* Diaper Stats */}
      <div className="card" style={cardStyle}>
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

      </div>

      {/* Scroll hint — fades out after first interaction via CSS */}
      <div style={{
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
    </div>
  );
}
