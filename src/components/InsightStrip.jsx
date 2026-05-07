import { useState } from 'react';
import { Sparkles, ChevronRight, X, Info, Loader2 } from 'lucide-react';
import { useBaby } from './BabyContext';

export default function InsightStrip() {
  const { aiInsights, loading } = useBaby();
  const [showDetail, setShowDetail] = useState(false);

  // Fallback data for when AI is loading or fails
  const fallback = {
    summary: "Analyzing your latest logs...",
    details: "The AI is currently processing your recent feeding and diaper trends to identify unique patterns for your baby.",
    recommendation: "Keep logging as you go to improve analysis accuracy."
  };

  const current = aiInsights?.strip || fallback;

  const updatedAt = aiInsights?.updatedAt ? new Date(aiInsights.updatedAt).getTime() : 0;
  const isStale = Date.now() - updatedAt > 3 * 60 * 60 * 1000;
  const statusColor = isStale ? '#f59e0b' : '#10b981'; // Amber vs Emerald

  if (loading && !aiInsights) {
    return (
      <div className="insight-strip card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.7 }}>
        <Loader2 size={14} className="animate-spin text-primary" />
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Updating insights...</div>
      </div>
    );
  }

  return (
    <>
      <div 
        className="insight-strip card" 
        onClick={() => setShowDetail(true)}
        style={{ 
          margin: '8px 0', 
          padding: '12px 16px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          background: isStale 
            ? 'linear-gradient(90deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.12))'
            : 'linear-gradient(90deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.12))',
          border: `1px solid ${statusColor}66`,
          boxShadow: `0 0 10px ${statusColor}22`,
          cursor: 'pointer',
          transition: 'all 0.3s ease',
        }}
      >
        <div 
          className="metric-pill" 
          style={{ 
            padding: '4px', width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
            background: `${statusColor}22`, color: statusColor, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <Sparkles size={16} />
        </div>
        <div style={{ flex: 1, fontSize: '14px', fontWeight: '500', color: statusColor, lineHeight: '1.4' }}>
          {current.summary}
        </div>
        <ChevronRight size={16} style={{ color: statusColor, opacity: 0.5, flexShrink: 0 }} />
      </div>

      {showDetail && (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} style={{ color: statusColor }} />
                <h2 style={{ margin: 0 }}>AI Analysis</h2>
                <span style={{ 
                  fontSize: '10px', 
                  padding: '2px 6px', 
                  borderRadius: '10px', 
                  background: `${statusColor}22`, 
                  color: statusColor,
                  fontWeight: 'bold',
                  textTransform: 'uppercase'
                }}>
                  {isStale ? 'Stale' : 'Live'}
                </span>
              </div>
              <button onClick={() => setShowDetail(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className="card" style={{ background: 'rgba(167, 139, 250, 0.05)', border: '1px solid rgba(167, 139, 250, 0.1)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '14px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Info size={14} /> Why am I seeing this?
                </h3>
                {aiInsights?.updatedAt && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.8 }}>
                    {(() => {
                      const d = new Date(aiInsights.updatedAt);
                      const day = String(d.getDate()).padStart(2, '0');
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const hours = String(d.getHours()).padStart(2, '0');
                      const minutes = String(d.getMinutes()).padStart(2, '0');
                      return `${day}/${month}-${hours}:${minutes} IST`;
                    })()}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-muted)' }}>
                {current.details}
              </p>
            </div>

            <div style={{ padding: '0 4px' }}>
              <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)', marginBottom: '8px' }}>
                Recommendation
              </h4>
              <p style={{ fontSize: '14px', fontWeight: '500' }}>
                {current.recommendation}
              </p>
            </div>

            <button 
              className="button-primary" 
              onClick={() => setShowDetail(false)}
              style={{ marginTop: '24px', width: '100%' }}
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
