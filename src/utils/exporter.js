// Helper to format Date to dd-mm-yy (India Regional Protocol)
export const formatDateDMY = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
};

// Helper to format Time to HH:MM (24-hour style)
export const formatTimeHM = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

// Compute difference in minutes between two ISO date strings, discounting paused time
const getFeedDuration = (event) => {
  if (!event.start_time || !event.end_time) return 0;
  const elapsedMs = new Date(event.end_time) - new Date(event.start_time);
  const pausedMs = event.total_paused_ms || 0;
  return Math.max(0, Math.round((elapsedMs - pausedMs) / 60000));
};

// Main parser to aggregate event data
const aggregateEvents = (events) => {
  const summary = {
    feeds: { topCount: 0, topVolume: 0, momLCount: 0, momRCount: 0, durations: [] },
    diapers: { wet: 0, dirty: 0, diaperFree: 0 },
    meds: {}, // med_name: [] times
    spitUps: { minor: 0, major: 0 },
    weights: []
  };

  events.forEach(e => {
    if (e.type === 'top') {
      summary.feeds.topCount++;
      summary.feeds.topVolume += (e.amount_ml || 0);
      if (e.end_time) {
        summary.feeds.durations.push(getFeedDuration(e));
      }
    } else if (e.type === 'mom_l') {
      summary.feeds.momLCount++;
      if (e.end_time) {
        summary.feeds.durations.push(getFeedDuration(e));
      }
    } else if (e.type === 'mom_r') {
      summary.feeds.momRCount++;
      if (e.end_time) {
        summary.feeds.durations.push(getFeedDuration(e));
      }
    } else if (e.type === 'diaper') {
      if (e.is_diaper_free) {
        summary.diapers.diaperFree++;
      } else {
        const pee = e.pee_amount && e.pee_amount !== 'none';
        const poop = e.poop_amount && e.poop_amount !== 'none';
        if (pee) summary.diapers.wet++;
        if (poop) summary.diapers.dirty++;
      }
    } else if (e.type === 'medicine') {
      const name = e.notes || 'Unknown Med';
      if (!summary.meds[name]) summary.meds[name] = [];
      summary.meds[name].push(e.start_time);
    } else if (e.type === 'spit_up') {
      if (e.intensity === 'major') {
        summary.spitUps.major++;
      } else {
        summary.spitUps.minor++;
      }
    } else if (e.type === 'weight') {
      summary.weights.push({ date: e.start_time, val: e.weight_kg });
    }
  });

  return summary;
};

// Generates bullet points suitable for messaging apps
export const formatLogsToPlainText = (events, startDate, endDate) => {
  const s = aggregateEvents(events);
  const startStr = formatDateDMY(startDate);
  const endStr = formatDateDMY(endDate);
  const dateRange = startStr === endStr ? startStr : `${startStr} to ${endStr}`;

  let out = `👶 Baby Tracker Clinical Report (${dateRange})\n`;
  out += `=============================================\n\n`;

  // 1. Feeding
  const totalBottle = s.feeds.topVolume;
  const avgBottle = s.feeds.topCount > 0 ? Math.round(totalBottle / s.feeds.topCount) : 0;
  const avgDur = s.feeds.durations.length > 0
    ? Math.round(s.feeds.durations.reduce((a, b) => a + b, 0) / s.feeds.durations.length)
    : 0;

  out += `🍼 FEEDING SUMMARY:\n`;
  out += `• Breastfeeding: ${s.feeds.momLCount + s.feeds.momRCount} sessions (Left: ${s.feeds.momLCount}, Right: ${s.feeds.momRCount})\n`;
  out += `• Bottle (Top-feed): ${s.feeds.topCount} feeds (${totalBottle}ml total)\n`;
  if (s.feeds.topCount > 0) out += `  └ Avg Bottle: ${avgBottle}ml\n`;
  if (avgDur > 0) out += `  └ Avg Session Duration: ${avgDur} minutes\n`;
  out += `\n`;

  // 2. Diapers
  out += `🧷 DIAPER DETAILS:\n`;
  out += `• Wet Changes: ${s.diapers.wet}\n`;
  out += `• Dirty Changes: ${s.diapers.dirty}\n`;
  out += `• Diaper Free Sessions: ${s.diapers.diaperFree}\n`;
  out += `\n`;

  // 3. Medicines
  const medNames = Object.keys(s.meds);
  if (medNames.length > 0) {
    out += `💊 MEDICATIONS ADMINISTERED:\n`;
    medNames.forEach(name => {
      const times = s.meds[name].map(t => formatTimeHM(t)).join(', ');
      out += `• ${name}: ${s.meds[name].length} doses at [${times}]\n`;
    });
    out += `\n`;
  }

  // 4. Spit-ups & Weight
  out += `🤢 GENERAL HEALTH:\n`;
  out += `• Spit-ups: ${s.spitUps.minor + s.spitUps.major} total (Minor: ${s.spitUps.minor}, Major: ${s.spitUps.major})\n`;
  if (s.weights.length > 0) {
    const weightsList = s.weights.map(w => `${w.val}kg (${formatDateDMY(w.date)})`).join(', ');
    out += `• Recorded Weights: ${weightsList}\n`;
  }

  return out.trim();
};

// Generates highly structured Markdown table suited for ChatGPT
export const formatLogsToMarkdown = (events, startDate, endDate) => {
  const s = aggregateEvents(events);
  const startStr = formatDateDMY(startDate);
  const endStr = formatDateDMY(endDate);
  const dateRange = startStr === endStr ? startStr : `${startStr} to ${endStr}`;

  let out = `# 👶 Baby Tracker Log Report\n`;
  out += `**Date Scope:** ${dateRange}  \n`;
  out += `*Generated for ChatGPT pediatric analysis*\n\n`;

  // Feeds table
  out += `## 🍼 Feeding Metrics\n\n`;
  out += `| Dimension | Metrics & Averages | Details |\n`;
  out += `| :--- | :--- | :--- |\n`;
  out += `| **Breast Sessions** | ${s.feeds.momLCount + s.feeds.momRCount} times | Left Side: ${s.feeds.momLCount} \| Right Side: ${s.feeds.momRCount} |\n`;
  out += `| **Top Feeds (Bottle)** | ${s.feeds.topCount} sessions | Total: ${s.feeds.topVolume}ml drank |\n`;
  if (s.feeds.topCount > 0) {
    out += `| **Avg Bottle Amount** | ${Math.round(s.feeds.topVolume / s.feeds.topCount)}ml | per session |\n`;
  }
  const allDurs = s.feeds.durations;
  if (allDurs.length > 0) {
    const avgD = Math.round(allDurs.reduce((a, b) => a + b, 0) / allDurs.length);
    out += `| **Avg Session Time** | ${avgD} mins | exclusive of pause periods |\n`;
  }
  out += `\n`;

  // Diapers table
  out += `## 🧷 Diaper Changes\n\n`;
  out += `| Diaper Type | Frequency | Clinical Status |\n`;
  out += `| :--- | :--- | :--- |\n`;
  out += `| **Wet (Pee)** | ${s.diapers.wet} times | Satisfactory hydration indicator |\n`;
  out += `| **Dirty (Poop)** | ${s.diapers.dirty} times | Stool patterns logged |\n`;
  out += `| **Diaper Free** | ${s.diapers.diaperFree} times | Active skin recovery periods |\n`;
  out += `\n`;

  // Meds list
  const medNames = Object.keys(s.meds);
  if (medNames.length > 0) {
    out += `## 💊 Medications Logs\n\n`;
    medNames.forEach(name => {
      const times = s.meds[name].map(t => `\`${formatTimeHM(t)}\` (on ${formatDateDMY(t)})`).join(', ');
      out += `* **${name}**: ${s.meds[name].length} doses administered at [ ${times} ]\n`;
    });
    out += `\n`;
  }

  // Health
  out += `## 🩺 Clinical / Health Status\n\n`;
  out += `* **Spit-ups**: ${s.spitUps.minor + s.spitUps.major} total (Minor: ${s.spitUps.minor} | Major: ${s.spitUps.major})\n`;
  if (s.weights.length > 0) {
    out += `* **Growth/Weights**:\n`;
    s.weights.forEach(w => {
      out += `  - **${w.val} kg** on ${formatDateDMY(w.date)}\n`;
    });
  }

  return out.trim();
};
