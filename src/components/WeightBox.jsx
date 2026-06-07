import { useState } from 'react';
import { useBaby } from './BabyContext';
import { Plus, Scale, X } from 'lucide-react';

export default function WeightBox() {
  const { weightLogs, addEvent } = useBaby();
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const handleSaveWeight = async () => {
    if (!weightInput) return;
    setIsSubmitting(true);
    try {
      await addEvent({ type: 'weight', weight_kg: parseFloat(weightInput) });
      setShowWeightModal(false);
      setWeightInput('');
    } catch (e) {
      if (e.code === '23505') window.location.reload();
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderWeightGraph = () => {
    if (!weightLogs || weightLogs.length === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
          No weight data logged yet.
        </div>
      );
    }
    
    const latest = weightLogs[weightLogs.length - 1];
    const isFirst = weightLogs.length === 1;

    // Weight bounds (Y-axis)
    const weights = weightLogs.map(l => parseFloat(l.weight_kg));
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const rangeW = maxW - minW === 0 ? 1 : maxW - minW;
    
    // Time bounds (X-axis)
    const times = weightLogs.map(l => new Date(l.start_time).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const rangeT = maxTime - minTime === 0 ? 1 : maxTime - minTime;

    // We calculate coordinates as percentages (0-100)
    // padding: 4% left/right, 15% top/bottom
    const getXPercent = (time) => weightLogs.length === 1 ? 50 : 4 + ((time - minTime) / rangeT) * 92;
    const getYPercent = (weight) => 85 - ((weight - minW) / rangeW) * 70;

    const pointsArray = weightLogs.map(log => ({
      x: getXPercent(new Date(log.start_time).getTime()),
      y: getYPercent(parseFloat(log.weight_kg))
    }));
    
    const pointsString = pointsArray.map(p => `${p.x},${p.y}`).join(' ');
    
    // For the gradient fill, we need to close the shape at the bottom
    const firstX = pointsArray[0].x;
    const lastX = pointsArray[pointsArray.length - 1].x;
    const fillPoints = `${firstX},100 ${pointsString} ${lastX},100`;

    const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1 }}>{latest.weight_kg} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>kg</span></div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', paddingLeft: '4px' }}>
            {isFirst ? 'Birth Weight' : formatDate(new Date(latest.start_time).getTime())}
          </div>
        </div>
        
        <div 
          onClick={() => setSelectedPoint(null)}
          style={{ width: '100%', position: 'relative', height: '64px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginTop: '8px' }}
        >
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <defs>
              <linearGradient id="weightGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            
            {weightLogs.length > 1 && (
              <>
                <polygon points={fillPoints} fill="url(#weightGradient)" />
                <polyline fill="none" stroke="var(--primary)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" points={pointsString} />
              </>
            )}
          </svg>
          
          {/* Render absolute HTML dots so they don't stretch into ovals */}
          {pointsArray.map((p, i) => (
            <div 
              key={i} 
              onClick={(e) => { e.stopPropagation(); setSelectedPoint(selectedPoint === i ? null : i); }}
              style={{
                position: 'absolute',
                left: `${p.x}%`,
                top: `${p.y}%`,
                transform: 'translate(-50%, -50%)',
                width: '32px', // Large touch target
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: selectedPoint === i ? 10 : 2,
                cursor: 'pointer'
              }}
            >
              <div style={{
                width: selectedPoint === i ? '12px' : '8px',
                height: selectedPoint === i ? '12px' : '8px',
                borderRadius: '50%',
                backgroundColor: selectedPoint === i ? 'var(--primary)' : 'var(--card-bg)',
                border: '2px solid var(--primary)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease'
              }} />
              
              {/* Tooltip */}
              {selectedPoint === i && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  marginBottom: '6px',
                  backgroundColor: 'var(--text-main)',
                  color: 'var(--bg-app)',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none'
                }}>
                  <span style={{ fontSize: '13px', fontWeight: '800' }}>{weightLogs[i].weight_kg} kg</span>
                  <span style={{ fontSize: '10px', fontWeight: '600', opacity: 0.85, marginTop: '2px' }}>
                    {new Date(weightLogs[i].start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  {/* Arrow pointing down */}
                  <div style={{
                    position: 'absolute',
                    bottom: '-5px',
                    width: 0,
                    height: 0,
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop: '5px solid var(--text-main)'
                  }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* X-Axis Date Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.3px' }}>
          <span>{formatDate(minTime)}</span>
          {weightLogs.length > 1 && <span>{formatDate(maxTime)}</span>}
        </div>
      </div>
    );
  };

  try {
    return (
      <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', color: 'var(--primary)' }}><Scale size={18} /></span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-main)' }}>Weight</span>
          </div>
          <button 
            onClick={() => setShowWeightModal(true)} 
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '8px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          >
            <Plus size={16} />
          </button>
        </div>

        {renderWeightGraph()}

        {/* Edit Weight Modal */}
        {showWeightModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>Add Weight</h2>
                <button className="icon-action-btn" onClick={() => setShowWeightModal(false)}><X size={22} /></button>
              </div>
              
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Weight in kg</label>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="e.g. 3.50" 
                  value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  className="input-field"
                  style={{ fontSize: '24px', padding: '16px', textAlign: 'center', fontWeight: 'bold' }}
                  autoFocus
                />
              </div>
              
              <button 
                className="button-primary" 
                onClick={handleSaveWeight} 
                disabled={isSubmitting || !weightInput}
              >
                {isSubmitting ? 'Saving...' : 'Save Weight'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    console.error('WeightBox critical render error:', err);
    return null;
  }
}
