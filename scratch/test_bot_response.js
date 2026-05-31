import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

// Manual .env parsing
const envContent = fs.readFileSync('.env', 'utf-8');
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length === 2) {
    process.env[parts[0].trim()] = parts[1].trim();
  }
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

const IST = "Asia/Kolkata";

function getISTDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}

async function getBabyAge() {
  const { data } = await supabase
    .from("baby_events").select("start_time, notes")
    .order("start_time", { ascending: true }).limit(50);
  const firstEvent = (data || []).find(e => !e.notes?.startsWith("SYSTEM_MSG:"));
  if (!firstEvent) return "<3 month old";
  const days  = Math.floor((Date.now() - new Date(firstEvent.start_time).getTime()) / 86400000);
  const weeks = Math.floor(days / 7);
  return weeks > 0 ? `${weeks} week old (approx ${days} days)` : `${days} day old`;
}

async function fetchEvents() {
  const from = `${getISTDate(-29)}T00:00:00.000Z`;
  const { data } = await supabase
    .from("baby_events").select("*")
    .gte("start_time", from)
    .order("start_time", { ascending: false });
  return (data || []).reverse().filter(e => !e.notes?.startsWith("SYSTEM_MSG:"));
}

function formatEventsForAI(events) {
  const groups = {};
  
  for (const e of events) {
    const d = new Date(e.start_time);
    const dateStr = d.toLocaleDateString("en-IN", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: IST
    });
    const timeStr = d.toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST
    });
    
    let desc = "";
    if (e.type === "diaper") {
      const parts = [];
      if (e.poop_amount && e.poop_amount !== "none") parts.push(`poop: ${e.poop_amount}`);
      if (e.pee_amount && e.pee_amount !== "none") parts.push(`pee: ${e.pee_amount}`);
      desc = `Diaper change (${parts.join(", ") || "dry"})`;
    } else if (e.type === "mom_l" || e.type === "mom_r") {
      desc = `Breastfeed (${e.type === "mom_l" ? "Left" : "Right"}) for ${e.duration_minutes || 0} mins`;
    } else if (e.type === "top") {
      desc = `Bottle feed (${e.amount_ml || 0} ml)`;
    } else if (e.type === "spit_up") {
      desc = `Spit-up`;
    } else if (e.type === "medicine") {
      desc = `Medicine: ${e.notes || ""}`;
    } else if (e.type === "tummy_time") {
      desc = `Tummy time`;
    } else if (e.type === "massage") {
      desc = `Massage`;
    } else {
      desc = `${e.type}`;
    }
    
    if (e.notes && e.notes !== "null" && !e.notes.startsWith("SYSTEM_MSG:") && e.type !== "medicine") {
      desc += ` | notes: "${e.notes}"`;
    }
    
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(`  • ${timeStr} — ${desc}`);
  }
  
  return Object.entries(groups)
    .map(([date, lines]) => `📅 ${date}\n${lines.join("\n")}`)
    .join("\n\n");
}

function getDailyStats(events) {
  const stats = {};
  
  for (const e of events) {
    const d = new Date(e.start_time);
    const dateStr = d.toLocaleDateString("en-IN", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: IST
    });
    
    if (!stats[dateStr]) {
      stats[dateStr] = { feeds: 0, diapers: 0, pees: 0, poops: 0, medicines: 0 };
    }
    
    const day = stats[dateStr];
    if (e.type === "diaper") {
      day.diapers++;
      if (e.pee_amount && e.pee_amount !== "none") day.pees++;
      if (e.poop_amount && e.poop_amount !== "none") day.poops++;
    } else if (e.type === "mom_l" || e.type === "mom_r" || e.type === "top") {
      day.feeds++;
    } else if (e.type === "medicine") {
      day.medicines++;
    }
  }
  
  return Object.entries(stats)
    .map(([date, s]) => `📅 ${date}:
  • Total Diapers: ${s.diapers} (Pees: ${s.pees}, Poops: ${s.poops})
  • Total Feeds: ${s.feeds}
  • Total Medicines: ${s.medicines}`)
    .join("\n\n");
}

async function test() {
  console.log("Fetching data...");
  const [ageContext, events] = await Promise.all([
    getBabyAge(),
    fetchEvents()
  ]);

  console.log(`Baby Age: ${ageContext}`);
  console.log(`Total events fetched from DB: ${events.length}`);
  
  const formattedLogs = formatEventsForAI(events);
  console.log(`\nFormatted logs preview (last 500 chars):\n${formattedLogs.slice(-500)}\n`);
  
  const targetDaysEvents = events.filter(e => e.start_time.startsWith('2026-05-27') || e.start_time.startsWith('2026-05-28'));
  console.log(`Total events in fetched data matching May 27 or 28: ${targetDaysEvents.length}`);
  
  const targetDiaperPoops = targetDaysEvents.filter(e => e.type === 'diaper' && e.poop_amount && e.poop_amount !== 'none');
  console.log(`\n--- DIAPER POOP EVENTS IN FETCHED DATA ---`);
  targetDiaperPoops.forEach(e => {
    console.log(`- Time: ${e.start_time}, poop_amount: ${e.poop_amount}, notes: "${e.notes}"`);
  });
  console.log(`Total poop events in fetched data for May 27/28: ${targetDiaperPoops.length}\n`);

  if (events.length > 0) {
    const sortedTimes = events.map(e => e.start_time).sort();
    console.log(`Oldest event fetched: ${sortedTimes[0]}`);
    console.log(`Newest event fetched: ${sortedTimes[sortedTimes.length - 1]}`);
  } else {
    console.log("No events fetched at all!");
  }

  // Filter events of type 'diaper' on May 28, 2026
  const diaperEvents = events.filter(e => e.type === 'diaper');
  console.log(`Total diaper events: ${diaperEvents.length}`);

  const currentLocalTime = new Date().toLocaleString("en-IN", {
    timeZone: IST, dateStyle: "full", timeStyle: "long",
  });

  const parentRequest = "How many poops yesterday"; // or "yesterday"

  const dailyStats = getDailyStats(events);
  console.log(`\nDaily stats summary:\n${dailyStats.slice(-500)}\n`);

  const prompt = `You are a pediatric expert assistant for the parents of a ${ageContext} newborn girl in Gurgaon.
CRITICAL: Factor the baby's exact age (${ageContext}) into all reasoning.

CURRENT TIME (IST): ${currentLocalTime}

TIMEZONE: All log timestamps are stored in UTC (ending in 'Z'). Convert to IST (+05:30) before showing any times. Never mention UTC to the parents.

EVENT TYPE GUIDE:
- type="diaper": diaper change. poop_amount field tells you if there was poop (any value other than "none" = poop occurred). pee_amount field tells you if there was pee.
- type="mom_l" or "mom_r": breastfeed on left/right breast. duration_minutes in the record.
- type="top": bottle/top-up feed.
- type="spit_up": spit-up event. severity in notes.
- type="medicine": dose given to baby. medicine name and dosage in the notes field.
- type="weight": weight measurement.
- type="tummy_time": tummy time session.
- type="massage": baby massage session.

PARENT'S REQUEST: "${parentRequest}"

DAILY STATISTICS SUMMARY (IST DETERMINISTIC COUNTS):
${dailyStats}

BABY LOGS (last 30 days in IST):
${formattedLogs}

OUTPUT FORMAT — Read the request and respond appropriately:
- If they want a LIST or LOG of events: respond with a clean day-by-day timestamped list grouped by IST date. Use "📅 DD-Mon" as a date header. One event per line: "  • HH:MM AM/PM — details". End with a one-line total count. PLAIN TEXT ONLY — no markdown bold, no asterisks.
- If they're asking a QUESTION: answer concisely in plain text, max 100 words. Start with a direct answer.
In both cases: no markdown formatting, no asterisks, no **bold**.

RULES:
- Only show events relevant to the request — filter by type, date range, and sub-type (e.g. poop vs pee) as needed.
- Factor environment only if directly relevant.`;

  console.log("\nCalling Gemini 3.1-flash-lite...");
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
  const result = await model.generateContent(prompt);
  console.log("\n--- GEMINI RESPONSE ---");
  console.log(result.response.text());
  console.log("-----------------------");
}

test();
