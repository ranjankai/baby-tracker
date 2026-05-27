import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, ArrowRight } from 'lucide-react';

export default function CustomCalendar({ fromDate, toDate, onChangeRange, firstDate, today }) {
  // Determine starting view month based on fromDate
  const getInitialMonth = () => {
    if (fromDate) {
      const [y, m, d] = fromDate.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  };

  const [viewMonth, setViewMonth] = useState(getInitialMonth);
  const [activeTab, setActiveTab] = useState('from'); // 'from' | 'to'

  // Update view month if fromDate changes externally
  useEffect(() => {
    if (fromDate) {
      const [y, m, d] = fromDate.split('-').map(Number);
      setViewMonth(new Date(y, m - 1, 1));
    }
  }, [fromDate]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth(); // 0-indexed

  // Month navigation helpers
  const handlePrevMonth = () => {
    setViewMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewMonth(new Date(year, month + 1, 1));
  };

  // Check navigation bounds
  const isPrevDisabled = () => {
    if (!firstDate) return false;
    const [fy, fm] = firstDate.split('-').map(Number);
    const limit = new Date(fy, fm - 1, 1);
    return new Date(year, month - 1, 1) < limit;
  };

  const isNextDisabled = () => {
    if (!today) return false;
    const [ty, tm] = today.split('-').map(Number);
    const limit = new Date(ty, tm - 1, 1);
    return new Date(year, month + 1, 1) > limit;
  };

  // Calendar math helpers
  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y, m) => new Date(y, m, 1).getDay(); // 0 = Sun

  const daysCount = getDaysInMonth(year, month);
  const offset = getFirstDayOfMonth(year, month);

  // Month title formatter
  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Grid builder
  const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const gridCells = [];

  // Padding cells
  for (let i = 0; i < offset; i++) {
    gridCells.push(null);
  }

  // Active days cells
  for (let d = 1; d <= daysCount; d++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    gridCells.push(`${year}-${mm}-${dd}`);
  }

  // Handle cell click
  const handleDateClick = (dateStr) => {
    const clickedDate = new Date(dateStr);
    clickedDate.setHours(0, 0, 0, 0);

    if (activeTab === 'from') {
      // Set From Date
      onChangeRange(dateStr, toDate);
      // Auto-advance toggle to 'to'
      setActiveTab('to');
      // If the current To Date is before the new From Date, sync To to match From
      if (toDate && new Date(toDate) < clickedDate) {
        onChangeRange(dateStr, dateStr);
      }
    } else {
      // Set To Date
      const parsedFrom = fromDate ? new Date(fromDate) : null;
      if (parsedFrom && clickedDate < parsedFrom) {
        // If clicked date is before From Date, move From back to match Clicked, or set both
        onChangeRange(dateStr, dateStr);
      } else {
        onChangeRange(fromDate, dateStr);
      }
      // Revert focus back to From for future edits
      setActiveTab('from');
    }
  };

  // Visual helper flags
  const checkStatus = (dateStr) => {
    if (!dateStr) return {};

    const cellDate = new Date(dateStr);
    cellDate.setHours(0, 0, 0, 0);

    const f = fromDate ? new Date(fromDate) : null;
    const t = toDate ? new Date(toDate) : null;
    if (f) f.setHours(0, 0, 0, 0);
    if (t) t.setHours(0, 0, 0, 0);

    const isFrom = f && cellDate.getTime() === f.getTime();
    const isTo = t && cellDate.getTime() === t.getTime();
    const isBetween = f && t && cellDate > f && cellDate < t;

    // Boundaries
    const firstLimit = firstDate ? new Date(firstDate) : null;
    const todayLimit = today ? new Date(today) : null;
    if (firstLimit) firstLimit.setHours(0, 0, 0, 0);
    if (todayLimit) todayLimit.setHours(0, 0, 0, 0);

    const isDisabled = (firstLimit && cellDate < firstLimit) || (todayLimit && cellDate > todayLimit);

    // Weekday details for track start/end
    const cellDayOfWeek = cellDate.getDay(); // 0 = Sun, 6 = Sat

    return { isFrom, isTo, isBetween, isDisabled, cellDayOfWeek };
  };

  return (
    <div className="custom-calendar-container">
      {/* ── Tab Switcher ── */}
      <div className="calendar-toggle-tabs">
        <div 
          className="calendar-toggle-pill" 
          style={{ 
            width: 'calc(50% - 6px)',
            left: activeTab === 'from' ? '3px' : 'calc(50% + 3px)'
          }} 
        />
        <button 
          className={`calendar-toggle-btn ${activeTab === 'from' ? 'active' : ''}`}
          onClick={() => setActiveTab('from')}
          aria-label="From Date"
          title="From Date"
        >
          <Calendar size={18} />
        </button>
        <button 
          className={`calendar-toggle-btn ${activeTab === 'to' ? 'active' : ''}`}
          onClick={() => setActiveTab('to')}
          aria-label="To Date"
          title="To Date"
        >
          <ArrowRight size={18} />
        </button>
      </div>

      {/* ── Calendar Month Navigation Header ── */}
      <div className="calendar-header">
        <button 
          className="calendar-nav-btn" 
          onClick={handlePrevMonth}
          disabled={isPrevDisabled()}
        >
          <ChevronLeft size={20} />
        </button>
        <span className="calendar-month-title">{monthLabel}</span>
        <button 
          className="calendar-nav-btn" 
          onClick={handleNextMonth}
          disabled={isNextDisabled()}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* ── Weekday Labels ── */}
      <div className="calendar-weekdays-grid">
        {weekdays.map((w, idx) => (
          <div key={idx} className="calendar-weekday">{w}</div>
        ))}
      </div>

      {/* ── Days Grid ── */}
      <div className="calendar-days-grid">
        {gridCells.map((dateStr, idx) => {
          if (!dateStr) {
            return <div key={`empty-${idx}`} className="calendar-day-cell empty" style={{ pointerEvents: 'none' }} />;
          }

          const { isFrom, isTo, isBetween, isDisabled, cellDayOfWeek } = checkStatus(dateStr);
          const cellDayNum = parseInt(dateStr.split('-')[2], 10);

          let cellClass = 'calendar-day-cell';
          if (isDisabled) cellClass += ' disabled';
          if (isFrom || isTo) cellClass += ' active-anchor';
          if (isBetween) cellClass += ' in-range';

          // Track border-radiuses to round continuous rows elegantly
          if (isBetween) {
            if (cellDayOfWeek === 0 || cellDayNum === 1) {
              cellClass += ' range-start-edge';
            }
            if (cellDayOfWeek === 6 || cellDayNum === daysCount) {
              cellClass += ' range-end-edge';
            }
          }

          return (
            <div 
              key={dateStr}
              className={cellClass}
              onClick={() => !isDisabled && handleDateClick(dateStr)}
            >
              {cellDayNum}
            </div>
          );
        })}
      </div>
    </div>
  );
}
