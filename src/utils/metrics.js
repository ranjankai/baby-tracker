const FEED_TYPES = ['top', 'mom_l', 'mom_r'];
const isFeed = (type) => FEED_TYPES.includes(type);

// "Today" starts at 11pm the previous evening
function getDayStart() {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0); // midnight — simpler and more intuitive than 11pm
  return cutoff;
}

function hoursAgoStr(isoTime) {
  if (!isoTime) return '—';
  const diff = (Date.now() - new Date(isoTime).getTime()) / 3600000;
  if (diff < 0) return 'just now';
  return `${diff.toFixed(1)}h ago`;
}

function hoursAgoRaw(isoTime) {
  if (!isoTime) return null;
  const diff = (Date.now() - new Date(isoTime).getTime()) / 3600000;
  return diff < 0 ? 0 : diff;
}

export function getMetrics(events, allTimeStats = null) {
  if (!events || events.length === 0) {
    return {
      lastFeed: '—', lastPee: '—', lastPoop: '—',
      lastFeedRaw: null, lastPeeRaw: null, lastPoopRaw: null,
      feedsToday: 0, peesToday: 0, poopsToday: 0, hoursElapsed: 0,
      totalDiapers: 0, avgDiapersPerDay: '—',
      spitUps24h: 0, spitUpsMajor: 0, spitUpsMinor: 0,
    };
  }

  const now = new Date();
  const dayStart = getDayStart();
  const hoursElapsed = Math.floor((now - dayStart) / 3600000);

  // Sort newest first (DB already returns this order, but be safe)
  const sorted = [...events].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  // Last feed (x.xh ago)
  const lastFeedEvent = sorted.find(e => isFeed(e.type));
  // Reverted to start_time for feeding "ago" calculation as requested
  const lastFeedTime = lastFeedEvent?.start_time;
  const lastFeed = hoursAgoStr(lastFeedTime);
  const lastFeedRaw = hoursAgoRaw(lastFeedTime);

  // Last pee (x.xh ago)
  const lastPeeEvent = sorted.find(e => e.type === 'diaper' && e.pee_amount && e.pee_amount !== 'none');
  const lastPee = hoursAgoStr(lastPeeEvent?.start_time);
  
  // Last poop (x.xh ago)
  const lastPoopEvent = sorted.find(e => e.type === 'diaper' && e.poop_amount && e.poop_amount !== 'none');
  const lastPoop = hoursAgoStr(lastPoopEvent?.start_time);
  
  const lastPeeRaw = hoursAgoRaw(lastPeeEvent?.start_time);
  const lastPoopRaw = hoursAgoRaw(lastPoopEvent?.start_time);

  // Since 11pm last night
  const todayEvents = sorted.filter(e => new Date(e.start_time) >= dayStart);
  const feedsToday = todayEvents.filter(e => isFeed(e.type)).length;
  const peesToday  = todayEvents.filter(e => e.type === 'diaper' && e.pee_amount && e.pee_amount !== 'none').length;
  const poopsToday = todayEvents.filter(e => e.type === 'diaper' && e.poop_amount && e.poop_amount !== 'none').length;

  // Spit-ups in last 24h
  const cutoff24h = new Date(Date.now() - 24 * 3600000);
  const spitUps24hEvents = sorted.filter(e => e.type === 'spit_up' && new Date(e.start_time) >= cutoff24h);
  const spitUps24h = spitUps24hEvents.length;
  const spitUpsMajor = spitUps24hEvents.filter(e => e.intensity === 'major').length;
  const spitUpsMinor = spitUps24hEvents.filter(e => e.intensity === 'minor').length;

  // Total diapers (all time)
  // Use allTimeStats if provided, otherwise fallback to local events array
  const totalDiapers = allTimeStats ? allTimeStats.totalDiapers : events.filter(e => e.type === 'diaper' && !e.is_diaper_free).length;

  // Avg diapers / day (denominator = days since first event in DB)
  const firstEventTime = allTimeStats?.firstEventTime || sorted[sorted.length - 1]?.start_time;
  
  let avgDiapersPerDay = '—';
  if (firstEventTime && totalDiapers > 0) {
    const daysSinceFirst = (now - new Date(firstEventTime)) / 86400000;
    // Round days up to 1 if it's less than 1, to avoid infinite/huge averages on day 1
    const effectiveDays = Math.max(1, daysSinceFirst);
    avgDiapersPerDay = Math.round(totalDiapers / effectiveDays).toString();
  }

  return {
    lastFeed, lastPee, lastPoop,
    lastFeedRaw, lastPeeRaw, lastPoopRaw,
    feedsToday, peesToday, poopsToday, hoursElapsed,
    totalDiapers, avgDiapersPerDay,
    spitUps24h, spitUpsMajor, spitUpsMinor,
    latestWeight: sorted.find(e => e.type === 'weight')?.weight_kg || null,
    weightTrend: (() => {
      const weights = sorted.filter(e => e.type === 'weight');
      if (weights.length < 2) return 0;
      return (parseFloat(weights[0].weight_kg) - parseFloat(weights[weights.length - 1].weight_kg)).toFixed(2);
    })()
  };
}
