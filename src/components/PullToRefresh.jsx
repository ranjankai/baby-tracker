import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PullToRefresh({ onRefresh, children }) {
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef(null);

  const PULL_THRESHOLD = 80;

  useEffect(() => {
    const handleTouchStart = (e) => {
      if (window.scrollY <= 0) {
        setStartY(e.touches[0].pageY);
      } else {
        setStartY(0);
      }
    };

    const handleTouchMove = (e) => {
      if (startY === 0 || isRefreshing) return;

      const y = e.touches[0].pageY;
      setCurrentY(y);

      const distance = Math.max(0, y - startY);
      const resistanceDistance = Math.pow(distance, 0.85);
      
      if (distance > 0) {
        setPullDistance(resistanceDistance);
        if (resistanceDistance > 10) {
          if (e.cancelable) e.preventDefault();
        }
      }
    };

    const handleTouchEnd = () => {
      if (pullDistance > PULL_THRESHOLD && !isRefreshing) {
        handleRefresh();
      }
      setStartY(0);
      setPullDistance(0);
    };

    const handleRefresh = async () => {
      setIsRefreshing(true);
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
      setTimeout(() => setIsRefreshing(false), 800);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [startY, pullDistance, isRefreshing, onRefresh]);

  return (
    <div ref={containerRef} className="pull-to-refresh-container" style={{ position: 'relative' }}>
      <div 
        style={{ 
          position: 'absolute',
          top: `${Math.min(pullDistance - 40, 20)}px`,
          left: '50%',
          transform: `translateX(-50%) rotate(${pullDistance * 2}deg)`,
          opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
          background: 'var(--bg-card)',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 1000,
          transition: pullDistance === 0 ? 'all 0.3s ease' : 'none',
          color: 'var(--primary)'
        }}
      >
        <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
      </div>

      {isRefreshing && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--primary)',
          color: 'white',
          padding: '6px 16px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 'bold',
          zIndex: 2000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <RefreshCw size={14} className="animate-spin" />
          Syncing Latest Data...
        </div>
      )}

      {children}
    </div>
  );
}
