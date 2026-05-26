import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getMetrics } from '../utils/metrics';

const BabyContext = createContext();

const PAGE_SIZE = 50;
const SYSTEM_PREFIXES = ['SYSTEM_', 'AI_SYSTEM_INSIGHT:', 'SYSTEM_MSG:'];
const isSystemRow = (e) => SYSTEM_PREFIXES.some(p => e.notes?.startsWith(p));

export function BabyProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState([]);
  const [dateFilter, setDateFilter] = useState(null);

  const [lastFeed, setLastFeed] = useState(null); // The TRUE last feed for smart suggestions
  const [metrics, setMetrics] = useState(null); // The TRUE metrics for summary cards
  const [allTimeStats, setAllTimeStats] = useState({ totalDiapers: 0, firstEventTime: null });
  const [aiInsights, setAiInsights] = useState(null);
  const [weightLogs, setWeightLogs] = useState([]);

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
      const [y, m, d] = targetDate.split('-').map(Number);
      const start = new Date(y, m - 1, d, 0, 0, 0);
      const end = new Date(y, m - 1, d, 23, 59, 59);
      query = query.gte('start_time', start.toISOString()).lte('start_time', end.toISOString());
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
      }).subscribe();

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
    const newEvent = { start_time: new Date().toISOString(), ...eventData };
    if (!supabase) return null;
    const { data, error } = await supabase.from('baby_events').insert([newEvent]).select();
    if (error) throw error;
    return data ? data[0] : null;
  };

  const updateEvent = async (id, updates) => {
    if (!supabase) return false;
    const { data } = await supabase.from('baby_events').update(updates).eq('id', id).select();
    return !!data;
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
      lastFeed, metrics, restoreFromTrash, fetchDeletedEvents, weightLogs // Export the true last feed, metrics, and weights
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
