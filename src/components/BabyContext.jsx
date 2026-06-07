import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getMetrics } from '../utils/metrics';

const BabyContext = createContext();

const PAGE_SIZE = 50;
const SYSTEM_PREFIXES = ['SYSTEM_', 'AI_SYSTEM_INSIGHT:', 'SYSTEM_MSG:'];
const isSystemRow = (e) => SYSTEM_PREFIXES.some(p => e.notes?.startsWith(p));

const DEFAULT_TARGET_MINUTES = 15;

export function BabyProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState([]);
  const [dateFilter, setDateFilter] = useState(null);

  const [lastFeed, setLastFeed] = useState(null); // The TRUE last feed for smart suggestions
  const [activeTummyTime, setActiveTummyTime] = useState(null);
  const [activeMassage, setActiveMassage] = useState(null);
  const [metrics, setMetrics] = useState(null); // The TRUE metrics for summary cards
  const [allTimeStats, setAllTimeStats] = useState({ totalDiapers: 0, firstEventTime: null });
  const [aiInsights, setAiInsights] = useState(null);
  const [weightLogs, setWeightLogs] = useState([]);
  const inFlightInserts = useRef({});
  const tempToRealIdMap = useRef({});

  // Tummy and Massage customizable targets (in minutes, persisted)
  const [tummyTarget, setTummyTargetState] = useState(() => {
    const saved = localStorage.getItem('baby_tracker_tummy_target');
    return saved ? parseInt(saved, 10) : DEFAULT_TARGET_MINUTES;
  });
  const [massageTarget, setMassageTargetState] = useState(() => {
    const saved = localStorage.getItem('baby_tracker_massage_target');
    return saved ? parseInt(saved, 10) : DEFAULT_TARGET_MINUTES;
  });

  const setTummyTarget = async (mins) => {
    setTummyTargetState(mins);
    localStorage.setItem('baby_tracker_tummy_target', mins);
    if (supabase) {
      await supabase.from('baby_settings').upsert({ key: 'tummy_target', value: JSON.stringify(mins) });
    }
  };
  const setMassageTarget = async (mins) => {
    setMassageTargetState(mins);
    localStorage.setItem('baby_tracker_massage_target', mins);
    if (supabase) {
      await supabase.from('baby_settings').upsert({ key: 'massage_target', value: JSON.stringify(mins) });
    }
  };

  const stateRef = useRef({ page: 0, filters: [], dateFilter: null });
  useEffect(() => {
    stateRef.current = { page, filters, dateFilter };
  }, [page, filters, dateFilter]);

  const fetchEvents = useCallback(async (targetPage, targetFilters, targetDate) => {
    if (!supabase) return;
    
    // If we have a date filter, we show ALL logs for that date (no pagination)
    // Otherwise, we use the standard 50-item pages
    const from = targetDate ? 0 : targetPage * PAGE_SIZE;
    const to = targetDate ? 2000 : from + PAGE_SIZE - 1;
    
    let query = supabase
      .from('baby_events')
      .select('*', { count: 'exact' })
      .order('start_time', { ascending: false });

    if (targetDate) {
      let startStr, endStr;
      if (targetDate.includes(':')) {
        [startStr, endStr] = targetDate.split(':');
      } else {
        startStr = targetDate;
        endStr = targetDate;
      }
      const [ys, ms, ds] = startStr.split('-').map(Number);
      const [ye, me, de] = endStr.split('-').map(Number);
      const start = new Date(ys, ms - 1, ds, 0, 0, 0).toISOString();
      const end = new Date(ye, me - 1, de, 23, 59, 59).toISOString();
      query = query.gte('start_time', start).lte('start_time', end);
    }

    if (targetFilters.length > 0) {
      const orParts = [];
      const types = targetFilters.filter(f => !['diaper_free', 'pee', 'poop'].includes(f));
      if (types.length > 0) orParts.push(`type.in.(${types.join(',')})`);
      if (targetFilters.includes('diaper_free')) orParts.push('is_diaper_free.eq.true');
      if (targetFilters.includes('pee')) orParts.push('pee_amount.in.(light,heavy)');
      if (targetFilters.includes('poop')) orParts.push('poop_amount.in.(light,heavy)');
      query = query.or(orParts.join(','));
    }

    const { data, count, error } = await query.range(from, to);
    if (!error && data) {
      setEvents(data.filter(e => !isSystemRow(e)));
      setTotalCount(count || 0);
    }
  }, []);

  // Sync on page, filter, or date change
  useEffect(() => {
    fetchEvents(page, filters, dateFilter);
  }, [page, filters, dateFilter, fetchEvents]);

  // One-time setup: stats, Realtime, visibility
  useEffect(() => {
    if (!supabase) return;

    const fetchGlobalState = async () => {
      try {
        // 1. Fetch latest 100 events to calculate metrics (Today's counts, last timestamps)
        // This is independent of the UI filters applied to the main activity list.
        const { data: recentEvents } = await supabase
          .from('baby_events')
          .select('*')
          .order('start_time', { ascending: false })
          .limit(100);

        // 2. Fetch baby_settings
        const { data: settingsData } = await supabase
          .from('baby_settings')
          .select('*');
        if (settingsData) {
          const tummy = settingsData.find(s => s.key === 'tummy_target');
          const massage = settingsData.find(s => s.key === 'massage_target');
          if (tummy) {
            setTummyTargetState(parseInt(tummy.value, 10));
            localStorage.setItem('baby_tracker_tummy_target', tummy.value);
          }
          if (massage) {
            setMassageTargetState(parseInt(massage.value, 10));
            localStorage.setItem('baby_tracker_massage_target', massage.value);
          }
        }

        const [diaperRes, firstRes, weightRes] = await Promise.all([
          supabase.from('baby_events').select('*', { count: 'exact', head: true }).eq('type', 'diaper').eq('is_diaper_free', false),
          supabase.from('baby_events').select('start_time').order('start_time', { ascending: true }).limit(1),
          supabase.from('baby_events').select('*').eq('type', 'weight').order('start_time', { ascending: true }),
        ]);
        
        const stats = {
          totalDiapers: diaperRes.count || 0,
          firstEventTime: firstRes.data?.[0]?.start_time || null,
          weightLogs: weightRes.data || [],
        };

        if (recentEvents) {
          setMetrics(getMetrics(recentEvents, stats));
          const feed = recentEvents.find(e => ['top', 'mom_l', 'mom_r'].includes(e.type));
          if (feed) setLastFeed(feed);

          const activeTT = recentEvents.find(e => e.type === 'tummy_time' && !e.end_time);
          setActiveTummyTime(activeTT || null);

          const activeMsg = recentEvents.find(e => e.type === 'massage' && !e.end_time);
          setActiveMassage(activeMsg || null);
        }
        if (weightRes.data) {
          setWeightLogs(weightRes.data);
        }
        
        setAllTimeStats(stats);
      } catch (err) {
        console.error('[BabyContext] fetchGlobalState error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGlobalState();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchEvents(stateRef.current.page, stateRef.current.filters, stateRef.current.dateFilter);
        fetchGlobalState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const channel = supabase.channel('events-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baby_events' }, () => {
        fetchEvents(stateRef.current.page, stateRef.current.filters, stateRef.current.dateFilter);
        fetchGlobalState(); // Update lastFeed and stats on any change
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baby_settings' }, (payload) => {
        const { new: newRow } = payload;
        if (newRow) {
          if (newRow.key === 'tummy_target') {
            setTummyTargetState(parseInt(newRow.value, 10));
            localStorage.setItem('baby_tracker_tummy_target', newRow.value);
          }
          if (newRow.key === 'massage_target') {
            setMassageTargetState(parseInt(newRow.value, 10));
            localStorage.setItem('baby_tracker_massage_target', newRow.value);
          }
        }
      })
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      supabase.removeChannel(channel);
    };
  }, [fetchEvents]);

  // AI insights — isolated
  useEffect(() => {
    if (!supabase) return;
    const fetchAI = async () => {
      const { data, error } = await supabase.from('ai_insights').select('*').eq('id', 1).single();
      if (!error && data) {
        setAiInsights({ strip: data.strip_json, micro: data.micro_json, updatedAt: data.updated_at });
      }
    };
    fetchAI();
    const handleVisibilityAI = () => {
      if (document.visibilityState === 'visible') fetchAI();
    };
    document.addEventListener('visibilitychange', handleVisibilityAI);
    const aiChannel = supabase.channel('ai-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ai_insights' }, (payload) => {
        if (payload.new) setAiInsights({ strip: payload.new.strip_json, micro: payload.new.micro_json, updatedAt: payload.new.updated_at });
      }).subscribe();
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityAI);
      supabase.removeChannel(aiChannel);
    };
  }, []);

  const addEvent = async (eventData) => {
    const tempId = 'temp_' + Date.now();
    const newEvent = { id: tempId, start_time: new Date().toISOString(), ...eventData };

    // Optimistic state updates
    if (['top', 'mom_l', 'mom_r'].includes(eventData.type)) {
      setLastFeed(newEvent);
    } else if (eventData.type === 'tummy_time') {
      setActiveTummyTime(newEvent);
    } else if (eventData.type === 'massage') {
      setActiveMassage(newEvent);
    }

    if (!supabase) return null;
    
    // Create a clean payload for database insertion without temp ID
    const dbPayload = { start_time: newEvent.start_time, ...eventData };
    const promise = (async () => {
      const { data, error } = await supabase.from('baby_events').insert([dbPayload]).select();
      if (error) throw error;
      return data ? data[0] : null;
    })();

    // Track the in-flight insert
    inFlightInserts.current[tempId] = promise;

    try {
      const savedEvent = await promise;
      if (savedEvent) {
        // Map the temporary ID to the resolved database ID
        tempToRealIdMap.current[tempId] = savedEvent.id;

        if (['top', 'mom_l', 'mom_r'].includes(savedEvent.type)) {
          setLastFeed(savedEvent);
        } else if (savedEvent.type === 'tummy_time') {
          setActiveTummyTime(savedEvent);
        } else if (savedEvent.type === 'massage') {
          setActiveMassage(savedEvent);
        }
      }
      return savedEvent;
    } catch (error) {
      // Rollback optimistic updates on error
      if (['top', 'mom_l', 'mom_r'].includes(eventData.type)) {
        setLastFeed(prev => prev?.id === tempId ? null : prev);
      } else if (eventData.type === 'tummy_time') {
        setActiveTummyTime(prev => prev?.id === tempId ? null : prev);
      } else if (eventData.type === 'massage') {
        setActiveMassage(prev => prev?.id === tempId ? null : prev);
      }
      throw error;
    } finally {
      // Clean up the ref once resolved/rejected
      delete inFlightInserts.current[tempId];
    }
  };

  const updateEvent = async (id, updates) => {
    if (!supabase) return false;
    
    let targetId = id;
    const originalId = id;

    // Check if there's an in-flight mapping for this temporary ID
    if (typeof id === 'string' && id.startsWith('temp_')) {
      if (tempToRealIdMap.current[id]) {
        targetId = tempToRealIdMap.current[id];
      } else {
        // Wait for the in-flight insert promise to resolve
        try {
          const insertPromise = inFlightInserts.current[id];
          if (insertPromise) {
            const savedEvent = await insertPromise;
            if (savedEvent) {
              targetId = savedEvent.id;
              tempToRealIdMap.current[id] = savedEvent.id;
            }
          }
        } catch (err) {
          console.error('[BabyContext] Error waiting for in-flight insert during updateEvent:', err);
          return false;
        }
      }
    }

    // Optimistic state updates - match either the original (temp) ID or the resolved database ID
    const matchesId = (prevEvent) => {
      if (!prevEvent) return false;
      return prevEvent.id === originalId || prevEvent.id === targetId;
    };

    setLastFeed(prev => matchesId(prev) ? { ...prev, ...updates } : prev);
    setActiveTummyTime(prev => matchesId(prev) ? { ...prev, ...updates } : prev);
    setActiveMassage(prev => matchesId(prev) ? { ...prev, ...updates } : prev);

    try {
      const { data, error } = await supabase.from('baby_events').update(updates).eq('id', targetId).select();
      if (error) throw error;
      return !!data;
    } catch (err) {
      console.error('[BabyContext] updateEvent DB error:', err);
      return false;
    }
  };

  const deleteEvent = async (id) => {
    if (!supabase) return;
    const { error } = await supabase.rpc('move_to_trash', { target_id: id });
    if (error) console.error('[BabyContext] move_to_trash error:', error);
  };

  const restoreFromTrash = async (id) => {
    if (!supabase) return;
    const { error } = await supabase.rpc('restore_from_trash', { target_id: id });
    if (error) console.error('[BabyContext] restore_from_trash error:', error);
  };

  const fetchDeletedEvents = async () => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('deleted_baby_events')
      .select('*')
      .order('deleted_at', { ascending: false })
      .limit(10);
    if (error) { console.error('[BabyContext] fetchDeletedEvents error:', error); return []; }
    return data || [];
  };

  const fetchEventsForRange = useCallback(async (startDateStr, endDateStr) => {
    if (!supabase) return [];
    const [ys, ms, ds] = startDateStr.split('-').map(Number);
    const [ye, me, de] = endDateStr.split('-').map(Number);
    const start = new Date(ys, ms - 1, ds, 0, 0, 0).toISOString();
    const end = new Date(ye, me - 1, de, 23, 59, 59).toISOString();

    const { data, error } = await supabase
      .from('baby_events')
      .select('*')
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('[BabyContext] fetchEventsForRange error:', error);
      return [];
    }
    return (data || []).filter(e => !isSystemRow(e));
  }, []);

  const toggleFilter = (filter) => {
    setFilters(prev => {
      const next = prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter];
      setPage(0);
      return next;
    });
  };

  const setGotoDate = (date) => {
    setDateFilter(date);
    setPage(0);
  };

  return (
    <BabyContext.Provider value={{
      events, addEvent, updateEvent, deleteEvent, loading, allTimeStats, aiInsights,
      page, setPage, totalCount, PAGE_SIZE, filters, toggleFilter, dateFilter, setGotoDate,
      lastFeed, activeTummyTime, activeMassage, metrics, restoreFromTrash, fetchDeletedEvents, fetchEventsForRange, weightLogs,
      tummyTarget, massageTarget, setTummyTarget, setMassageTarget
    }}>
      {children}
    </BabyContext.Provider>
  );
}

export function useBaby() {
  const context = useContext(BabyContext);
  if (!context) throw new Error('useBaby must be used within a BabyProvider');
  return context;
}
