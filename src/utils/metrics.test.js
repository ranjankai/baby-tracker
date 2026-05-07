import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getMetrics, timeSinceLast } from './metrics';

describe('metrics unit tests (hermetic)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates total feeds since midnight', () => {
    vi.setSystemTime(new Date('2026-04-14T10:00:00Z'));
    
    const events = [
      { id: 1, type: 'feed', start_time: '2026-04-14T08:30:00Z' },
      { id: 2, type: 'feed', start_time: '2026-04-14T01:00:00Z' },
      { id: 3, type: 'feed', start_time: '2026-04-13T12:00:00Z' }, // 22 hours ago, safe
      { id: 4, type: 'diaper', diaper_type: 'pee', time: '2026-04-14T09:00:00Z' }
    ];

    const metrics = getMetrics(events);
    expect(metrics.feedsSinceMidnight).toBe(2);
  });

  it('calculates poops and pees since midnight', () => {
    vi.setSystemTime(new Date('2026-04-14T15:00:00Z'));
    
    const events = [
      { id: 1, type: 'diaper', pee_amount: 'light', poop_amount: 'none', time: '2026-04-14T08:30:00Z' },
      { id: 2, type: 'diaper', pee_amount: 'none', poop_amount: 'heavy', time: '2026-04-14T10:00:00Z' },
      { id: 3, type: 'diaper', pee_amount: 'heavy', poop_amount: 'light', time: '2026-04-14T12:00:00Z' },
      { id: 4, type: 'diaper', pee_amount: 'none', poop_amount: 'none', time: '2026-04-14T14:00:00Z' },
      { id: 5, type: 'diaper', pee_amount: 'heavy', poop_amount: 'none', time: '2026-04-13T12:00:00Z' }, // Safe yesterday
    ];

    const metrics = getMetrics(events);
    expect(metrics.peesSinceMidnight).toBe(2); // evt 1, evt 3
    expect(metrics.poopsSinceMidnight).toBe(2); // evt 2, evt 3
    expect(metrics.heavyPeesSinceMidnight).toBe(1);
    expect(metrics.lightPeesSinceMidnight).toBe(1);
    expect(metrics.heavyPoopsSinceMidnight).toBe(1);
    expect(metrics.lightPoopsSinceMidnight).toBe(1);
  });

  it('calculates pees in the last 6 hours', () => {
    // Current time is 18:00
    vi.setSystemTime(new Date('2026-04-14T18:00:00Z'));

    const events = [
      { id: 1, type: 'diaper', pee_amount: 'heavy', poop_amount: 'none', time: '2026-04-14T17:30:00Z' }, // < 6 hours
      { id: 2, type: 'diaper', pee_amount: 'light', poop_amount: 'none', time: '2026-04-14T13:00:00Z' }, // < 6 hours
      { id: 3, type: 'diaper', pee_amount: 'light', poop_amount: 'none', time: '2026-04-14T11:00:00Z' }, // > 6 hours (7 hours ago)
    ];

    const metrics = getMetrics(events);
    expect(metrics.peesLast6Hours).toBe(2);
  });

  it('timeSinceLast gets the correct string representation', () => {
    vi.setSystemTime(new Date('2026-04-14T12:00:00Z'));

    const events = [
      { id: 1, type: 'diaper', time: '2026-04-14T11:15:00Z' } // 45 mins ago
    ];

    const timeStr = timeSinceLast(events, 'diaper');
    expect(timeStr).toBe('45m ago');

    const noEventStr = timeSinceLast(events, 'feed');
    expect(noEventStr).toBe('No data');
  });

  it('timeSinceLast formats correctly for over an hour', () => {
    vi.setSystemTime(new Date('2026-04-14T12:00:00Z'));

    const events = [
      { id: 1, type: 'feed', start_time: '2026-04-14T10:30:00Z' } // 1h 30m ago
    ];

    const timeStr = timeSinceLast(events, 'feed');
    expect(timeStr).toBe('1h 30m ago');
  });
});
