import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";

// ── Environment ───────────────────────────────────────────────────────────────
const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_TOKEN           = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const GEMINI_API_KEY           = Deno.env.get("GEMINI_API_KEY")!;
const LOCATION                 = "M3M Golf Estate, Sector 65, Gurgaon, India";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const genAI    = new GoogleGenerativeAI(GEMINI_API_KEY);

// ── Telegram helpers ──────────────────────────────────────────────────────────
async function tgPost(method: string, body: Record<string, unknown>) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

async function sendMessage(chatId: number, text: string) {
  // Telegram HTML mode; keep messages under 4096 chars
  const chunks = chunkText(text, 4000);
  for (const chunk of chunks) {
    await tgPost("sendMessage", {
      chat_id:    chatId,
      text:       chunk,
      parse_mode: "HTML",
    });
  }
}

async function sendDocument(chatId: number, filename: string, content: string, caption: string) {
  // Build a multipart/form-data body manually — Deno Fetch supports Blob
  const blob     = new Blob([content], { type: "text/plain" });
  const formData = new FormData();
  formData.append("chat_id",    String(chatId));
  formData.append("caption",    caption);
  formData.append("parse_mode", "HTML");
  formData.append("document",   blob, filename);

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
    method: "POST",
    body:   formData,
  });
}

function chunkText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  while (text.length > maxLen) {
    const slice = text.slice(0, maxLen);
    const lastNl = slice.lastIndexOf("\n");
    const cut = lastNl > 0 ? lastNl : maxLen;
    chunks.push(text.slice(0, cut));
    text = text.slice(cut).trimStart();
  }
  if (text.length) chunks.push(text);
  return chunks;
}

// ── Date / Time helpers (IST-aware) ──────────────────────────────────────────
const IST = "Asia/Kolkata";

function getISTDate(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: IST }); // yyyy-mm-dd
}

function formatDateDMY(iso: string): string {
  const d   = new Date(iso);
  const dd  = String(d.getDate()).padStart(2, "0");
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const yy  = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function formatTimeHM(iso: string): string {
  const d  = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mn}`;
}

// ── Log export formatters (ported from src/utils/exporter.js) ─────────────────
interface BabyEvent {
  type: string;
  start_time: string;
  end_time?: string;
  amount_ml?: number;
  pee_amount?: string;
  poop_amount?: string;
  is_diaper_free?: boolean;
  intensity?: string;
  notes?: string;
  weight_kg?: number;
  total_paused_ms?: number;
}

interface Summary {
  feeds: { topCount: number; topVolume: number; momLCount: number; momRCount: number; durations: number[] };
  diapers: { wet: number; dirty: number; diaperFree: number };
  meds: Record<string, string[]>;
  spitUps: { minor: number; major: number };
  weights: { date: string; val: number }[];
}

function getFeedDuration(e: BabyEvent): number {
  if (!e.start_time || !e.end_time) return 0;
  const elapsed = new Date(e.end_time).getTime() - new Date(e.start_time).getTime();
  const paused  = e.total_paused_ms || 0;
  return Math.max(0, Math.round((elapsed - paused) / 60000));
}

function aggregateEvents(events: BabyEvent[]): Summary {
  const s: Summary = {
    feeds:    { topCount: 0, topVolume: 0, momLCount: 0, momRCount: 0, durations: [] },
    diapers:  { wet: 0, dirty: 0, diaperFree: 0 },
    meds:     {},
    spitUps:  { minor: 0, major: 0 },
    weights:  [],
  };

  for (const e of events) {
    if (e.type === "top") {
      s.feeds.topCount++;
      s.feeds.topVolume += e.amount_ml || 0;
      if (e.end_time) s.feeds.durations.push(getFeedDuration(e));
    } else if (e.type === "mom_l") {
      s.feeds.momLCount++;
      if (e.end_time) s.feeds.durations.push(getFeedDuration(e));
    } else if (e.type === "mom_r") {
      s.feeds.momRCount++;
      if (e.end_time) s.feeds.durations.push(getFeedDuration(e));
    } else if (e.type === "diaper") {
      if (e.is_diaper_free) {
        s.diapers.diaperFree++;
      } else {
        if (e.pee_amount  && e.pee_amount  !== "none") s.diapers.wet++;
        if (e.poop_amount && e.poop_amount !== "none") s.diapers.dirty++;
      }
    } else if (e.type === "medicine") {
      const name = e.notes || "Unknown Med";
      if (!s.meds[name]) s.meds[name] = [];
      s.meds[name].push(e.start_time);
    } else if (e.type === "spit_up") {
      if (e.intensity === "major") s.spitUps.major++; else s.spitUps.minor++;
    } else if (e.type === "weight" && e.weight_kg) {
      s.weights.push({ date: e.start_time, val: e.weight_kg });
    }
  }
  return s;
}

function formatLogsToPlainText(events: BabyEvent[], startDate: string, endDate: string): string {
  const s         = aggregateEvents(events);
  const startStr  = formatDateDMY(startDate);
  const endStr    = formatDateDMY(endDate);
  const dateRange = startStr === endStr ? startStr : `${startStr} to ${endStr}`;

  const avgBottle = s.feeds.topCount > 0 ? Math.round(s.feeds.topVolume / s.feeds.topCount) : 0;
  const avgDur    = s.feeds.durations.length > 0
    ? Math.round(s.feeds.durations.reduce((a, b) => a + b, 0) / s.feeds.durations.length)
    : 0;

  let out = `👶 Baby Tracker Clinical Report (${dateRange})\n`;
  out += `=============================================\n\n`;

  out += `🍼 FEEDING SUMMARY:\n`;
  out += `• Breastfeeding: ${s.feeds.momLCount + s.feeds.momRCount} sessions (Left: ${s.feeds.momLCount}, Right: ${s.feeds.momRCount})\n`;
  out += `• Bottle (Top-feed): ${s.feeds.topCount} feeds (${s.feeds.topVolume}ml total)\n`;
  if (s.feeds.topCount > 0) out += `  └ Avg Bottle: ${avgBottle}ml\n`;
  if (avgDur > 0)           out += `  └ Avg Session Duration: ${avgDur} minutes\n`;
  out += `\n`;

  out += `🧷 DIAPER DETAILS:\n`;
  out += `• Wet Changes: ${s.diapers.wet}\n`;
  out += `• Dirty Changes: ${s.diapers.dirty}\n`;
  out += `• Diaper Free Sessions: ${s.diapers.diaperFree}\n`;
  out += `\n`;

  const medNames = Object.keys(s.meds);
  if (medNames.length > 0) {
    out += `💊 MEDICATIONS ADMINISTERED:\n`;
    for (const name of medNames) {
      const times = s.meds[name].map(formatTimeHM).join(", ");
      out += `• ${name}: ${s.meds[name].length} doses at [${times}]\n`;
    }
    out += `\n`;
  }

  out += `🤢 GENERAL HEALTH:\n`;
  out += `• Spit-ups: ${s.spitUps.minor + s.spitUps.major} total (Minor: ${s.spitUps.minor}, Major: ${s.spitUps.major})\n`;
  if (s.weights.length > 0) {
    const wList = s.weights.map(w => `${w.val}kg (${formatDateDMY(w.date)})`).join(", ");
    out += `• Recorded Weights: ${wList}\n`;
  }

  return out.trim();
}

function formatLogsToMarkdown(events: BabyEvent[], startDate: string, endDate: string): string {
  const s         = aggregateEvents(events);
  const startStr  = formatDateDMY(startDate);
  const endStr    = formatDateDMY(endDate);
  const dateRange = startStr === endStr ? startStr : `${startStr} to ${endStr}`;

  let out = `# 👶 Baby Tracker Log Report\n`;
  out += `**Date Scope:** ${dateRange}  \n`;
  out += `*Generated for ChatGPT pediatric analysis*\n\n`;

  out += `## 🍼 Feeding Metrics\n\n`;
  out += `| Dimension | Metrics & Averages | Details |\n`;
  out += `| :--- | :--- | :--- |\n`;
  out += `| **Breast Sessions** | ${s.feeds.momLCount + s.feeds.momRCount} times | Left Side: ${s.feeds.momLCount} | Right Side: ${s.feeds.momRCount} |\n`;
  out += `| **Top Feeds (Bottle)** | ${s.feeds.topCount} sessions | Total: ${s.feeds.topVolume}ml |\n`;
  if (s.feeds.topCount > 0) {
    out += `| **Avg Bottle Amount** | ${Math.round(s.feeds.topVolume / s.feeds.topCount)}ml | per session |\n`;
  }
  if (s.feeds.durations.length > 0) {
    const avgD = Math.round(s.feeds.durations.reduce((a, b) => a + b, 0) / s.feeds.durations.length);
    out += `| **Avg Session Time** | ${avgD} mins | exclusive of pause periods |\n`;
  }
  out += `\n`;

  out += `## 🧷 Diaper Changes\n\n`;
  out += `| Diaper Type | Frequency | Clinical Status |\n`;
  out += `| :--- | :--- | :--- |\n`;
  out += `| **Wet (Pee)** | ${s.diapers.wet} times | Satisfactory hydration indicator |\n`;
  out += `| **Dirty (Poop)** | ${s.diapers.dirty} times | Stool patterns logged |\n`;
  out += `| **Diaper Free** | ${s.diapers.diaperFree} times | Active skin recovery periods |\n`;
  out += `\n`;

  const medNames = Object.keys(s.meds);
  if (medNames.length > 0) {
    out += `## 💊 Medications Logs\n\n`;
    for (const name of medNames) {
      const times = s.meds[name].map(t => `\`${formatTimeHM(t)}\` (on ${formatDateDMY(t)})`).join(", ");
      out += `* **${name}**: ${s.meds[name].length} doses at [ ${times} ]\n`;
    }
    out += `\n`;
  }

  out += `## 🩺 Clinical / Health Status\n\n`;
  out += `* **Spit-ups**: ${s.spitUps.minor + s.spitUps.major} total (Minor: ${s.spitUps.minor} | Major: ${s.spitUps.major})\n`;
  if (s.weights.length > 0) {
    out += `* **Growth/Weights**:\n`;
    for (const w of s.weights) {
      out += `  - **${w.val} kg** on ${formatDateDMY(w.date)}\n`;
    }
  }

  return out.trim();
}

// ── Gemini helpers ────────────────────────────────────────────────────────────
async function callGemini(prompt: string, models: string[], jsonMode = false): Promise<string> {
  const mime = jsonMode ? "application/json" : "text/plain";
  for (const modelName of models) {
    try {
      const model  = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: mime },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (e: any) {
      console.error(`Gemini ${modelName} failed: ${e.message}`);
      if (e.message?.toLowerCase().includes("api key")) break;
    }
  }
  throw new Error("All Gemini models failed.");
}

async function getBabyAge(): Promise<string> {
  const { data } = await supabase
    .from("baby_events")
    .select("start_time")
    .not("notes", "like", "SYSTEM_MSG%")
    .order("start_time", { ascending: true })
    .limit(1);

  if (!data?.[0]) return "<3 month old";
  const diffMs    = Date.now() - new Date(data[0].start_time).getTime();
  const diffDays  = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  return diffWeeks > 0
    ? `${diffWeeks} week old (approx ${diffDays} days)`
    : `${diffDays} day old`;
}

async function getEnvironmentContext(ageContext: string): Promise<string> {
  const today       = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: IST });
  const scoutPrompt = `Today is ${today}. Return a 2-sentence summary of the CURRENT atmospheric and climate conditions TODAY which can affect a ${ageContext} baby girl's health in ${LOCATION}.`;
  try {
    return await callGemini(scoutPrompt, ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]);
  } catch {
    return "No live environmental data available.";
  }
}

// ── Conversation memory ──────────────────────────────────────────────────────
interface ContextRow { role: string; content: string; }

/** Returns conversation history: all of today (IST) OR last 20 — whichever is more messages. */
async function getContext(chatId: number): Promise<ContextRow[]> {
  // Compute IST midnight as a UTC ISO string
  const nowMs       = Date.now();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNowMs    = nowMs + istOffsetMs;
  const istMidnightMs = istNowMs - (istNowMs % 86400000); // floor to day boundary in IST
  const todayStartUTC = new Date(istMidnightMs - istOffsetMs).toISOString();

  // Fetch everything logged today in this chat (IST day)
  const { data: todayRows } = await supabase
    .from("telegram_context")
    .select("role, content")
    .eq("chat_id", chatId)
    .gte("created_at", todayStartUTC)
    .order("created_at", { ascending: true });

  if (todayRows && todayRows.length >= 20) {
    return todayRows as ContextRow[];
  }

  // Fewer than 20 messages today — pad with older messages up to 20 total
  const { data: last20 } = await supabase
    .from("telegram_context")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(20);

  return ((last20 || []).reverse()) as ContextRow[];
}

/** Persists a single turn (user or assistant) to the context table. */
async function saveContext(chatId: number, role: "user" | "assistant", content: string): Promise<void> {
  await supabase.from("telegram_context").insert({ chat_id: chatId, role, content });
}

/** Formats conversation history into a readable block for the Gemini prompt. */
function formatContextBlock(history: ContextRow[]): string {
  if (!history.length) return "";
  const lines = history.map(r => `${r.role === "user" ? "Parent" : "Assistant"}: ${r.content}`);
  return `\n[Conversation so far today]\n${lines.join("\n")}\n[End of conversation history]\n`;
}

// ── Intent classifier ─────────────────────────────────────────────────────────
interface Intent {
  type: "query" | "export" | "help";
  days?: number;       // for export: how many days back (default 7)
  from?: string;       // ISO date yyyy-mm-dd
  to?: string;         // ISO date yyyy-mm-dd
  format?: "text" | "markdown";
}

async function classifyIntent(message: string): Promise<Intent> {
  const today = getISTDate();
  const prompt = `
You are a command parser for a baby tracker Telegram bot.
Today's date is ${today} (yyyy-mm-dd, IST).

Message: "${message}"

Classify the user's intent into exactly one of:
1. "query"  — they want to ask a question about the baby's logs
2. "export" — they want to download/export logs as a file
3. "help"   — they want help, or the message is /start or /help

For "export", also parse:
- "days": number of days to cover (e.g. "last 7 days" → 7, "last 3 days" → 3, "today" → 1). Default: 7.
- "from": explicit start date if mentioned (yyyy-mm-dd). Omit if not mentioned.
- "to":   explicit end date if mentioned (yyyy-mm-dd). Omit if not mentioned.
- "format": "markdown" if they mention ChatGPT, markdown, or .md. Otherwise "text".

Output ONLY a raw JSON object:
{"type":"query"|"export"|"help","days":number,"from":"yyyy-mm-dd"|null,"to":"yyyy-mm-dd"|null,"format":"text"|"markdown"}
`;

  try {
    const raw    = await callGemini(prompt, ["gemma-4-26b-a4b-it", "gemini-3.1-flash-lite"], true);
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw);
    return parsed as Intent;
  } catch {
    // Heuristic fallback
    const lower = message.toLowerCase();
    if (/export|logs?|report|doctor|chatgpt|download|send file/.test(lower)) return { type: "export", days: 7, format: "text" };
    if (/^\/?(start|help)/.test(lower)) return { type: "help" };
    return { type: "query" };
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────
async function handleHelp(chatId: number) {
  const text = `👶 <b>Baby Tracker AI Assistant</b>

I'm your intelligent baby care companion. Here's what I can do:

<b>🔍 Ask Me Anything</b>
Just type your question naturally:
• <i>"When was her last feed?"</i>
• <i>"How many wet diapers today?"</i>
• <i>"Is her poop frequency normal?"</i>
• <i>"She spit up a lot today, should I be worried?"</i>

<b>📄 Export Logs</b>
Get a formatted file you can forward to your doctor or paste into ChatGPT:
• <i>"Export last 7 days"</i>
• <i>"Export today"</i>
• <i>"Export last 3 days for ChatGPT"</i> (sends Markdown format)
• <i>"Export May 20 to May 27"</i>

Notifications from this bot continue as before — this just adds a two-way conversation on top! 🎉`;

  await sendMessage(chatId, text);
}

async function handleQuery(chatId: number, question: string) {
  await sendMessage(chatId, "🔍 <i>Analysing logs…</i>");

  // ── Save user turn & fetch conversation context in parallel with data fetches ──
  const [, ageContext, envContext, history] = await Promise.all([
    saveContext(chatId, "user", question),
    getBabyAge(),
    getBabyAge().then(a => getEnvironmentContext(a)),
    getContext(chatId),
  ]);

  // Fetch deep baby event history
  const { data: rawEvents } = await supabase
    .from("baby_events")
    .select("*")
    .not("notes", "like", "SYSTEM_MSG%")
    .order("start_time", { ascending: false })
    .limit(400);

  const events = rawEvents || [];

  // Protocol tier — triage which event types to use
  const triagePrompt = `
You are a data extraction rule generator for a baby tracking app.
User Question: "${question}"
Current Date/Time: ${new Date().toISOString()}
Determine the data needed to answer this question.
Output ONLY a JSON object: {"event_types": array of strings from ["diaper","mom_l","mom_r","top","spit_up","medicine","weight"] or ["all"]}`;

  let filtered = events;
  try {
    const triageRaw = await callGemini(triagePrompt, ["gemma-4-26b-a4b-it", "gemini-3.1-flash-lite"], true);
    const triage    = JSON.parse(triageRaw.match(/\{[\s\S]*\}/)?.[0] ?? triageRaw);
    if (triage.event_types && !triage.event_types.includes("all")) {
      filtered = events.filter((e: any) => triage.event_types.includes(e.type));
    }
  } catch { /* use all events */ }

  const currentLocalTime = new Date().toLocaleString("en-IN", { timeZone: IST, dateStyle: "full", timeStyle: "long" });

  // Build conversation history block (excludes the current message which was just saved)
  // Slice off the last row if it's the message we just saved (avoid double-counting)
  const priorHistory = history.filter(r => !(r.role === "user" && r.content === question)).slice(-40);
  const contextBlock = formatContextBlock(priorHistory);

  const insightPrompt = `
You are a pediatric expert assistant answering questions from the parents of a ${ageContext} newborn girl in an ongoing conversation.
CRITICAL INSTRUCTION: You MUST heavily factor the baby's exact age (${ageContext}) into any physiological, digestive, or developmental reasoning.

CURRENT LOCAL TIME (IST): ${currentLocalTime}
CURRENT ENVIRONMENTAL CONTEXT: ${envContext}

CRITICAL TIMEZONE RULE: Timestamps in the JSON logs below are UTC (ending in 'Z'). Mentally convert to IST (UTC+05:30) before analysing. When mentioning times, always use IST (e.g., "1:30 AM", "4:15 PM") — never say UTC.

NOTE: Events with type 'medicine' represent doses given to the baby. The medicine name and dosage are in the 'notes' field.
${contextBlock}
CURRENT QUESTION: "${question}"
BABY LOGS: ${JSON.stringify(filtered)}

RULES:
- If the conversation history exists, use it to understand context (e.g. what "that" or "she" refers to).
- Your FIRST sentence must directly and specifically answer the current question.
- Be warm, avuncular, and analytical — no generic advice.
- Max 100 words.
- Factor the CURRENT ENVIRONMENT only if directly relevant.`;

  let answer = "";
  try {
    answer = await callGemini(insightPrompt, [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ]);
    await sendMessage(chatId, `🩺 <b>Expert Analysis</b>\n\n${answer}`);
  } catch {
    answer = "Expert AI is temporarily unavailable. Please try again in a moment.";
    await sendMessage(chatId, `⚠️ ${answer}`);
  }

  // Save bot reply to context (fire-and-forget)
  saveContext(chatId, "assistant", answer).catch(console.error);
}

async function handleExport(chatId: number, intent: Intent) {
  await sendMessage(chatId, "📄 <i>Preparing your report…</i>");

  // Resolve date range
  const today = getISTDate();
  const days  = intent.days ?? 7;
  const toDate   = intent.to   ?? today;
  const fromDate = intent.from ?? getISTDate(-(days - 1));

  // Fetch events in range (include full day by using 00:00 to 23:59:59)
  const fromISO = `${fromDate}T00:00:00.000Z`;
  const toISO   = `${toDate}T23:59:59.999Z`;

  const { data: events, error } = await supabase
    .from("baby_events")
    .select("*")
    .gte("start_time", fromISO)
    .lte("start_time", toISO)
    .not("notes", "like", "SYSTEM_MSG%")
    .order("start_time", { ascending: true });

  if (error || !events?.length) {
    await sendMessage(chatId, `⚠️ No events found between <b>${formatDateDMY(fromDate)}</b> and <b>${formatDateDMY(toDate)}</b>.`);
    return;
  }

  const format   = intent.format ?? "text";
  const content  = format === "markdown"
    ? formatLogsToMarkdown(events as BabyEvent[], fromDate, toDate)
    : formatLogsToPlainText(events as BabyEvent[], fromDate, toDate);

  const ext      = format === "markdown" ? "md" : "txt";
  const filename = `baby-report-${fromDate}-to-${toDate}.${ext}`;
  const caption  = `📋 <b>Baby Tracker Report</b>\n${formatDateDMY(fromDate)} → ${formatDateDMY(toDate)}\n${events.length} events • ${format === "markdown" ? "Markdown (ChatGPT)" : "Plain Text (Doctor)"}`;

  await sendDocument(chatId, filename, content, caption);
}

// ── Entry point ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Self-registration: GET /?register=1 registers this function as the Telegram webhook
  if (req.method === "GET" && url.searchParams.get("register") === "1") {
    // Allow explicit override; fall back to reconstructing from request
    const webhookUrl = url.searchParams.get("webhook_url")
      ?? `https://vyaleoetmmxjsykirfop.supabase.co/functions/v1/telegram-bot`;
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
      }
    );
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
      status: res.ok ? 200 : 500,
    });
  }

  if (req.method === "GET") {
    return new Response("Baby Tracker Telegram Bot is running. Add ?register=1 to register the webhook.", { status: 200 });
  }

  // Telegram sends POST for every incoming message
  if (req.method !== "POST") {
    return new Response("Method not allowed.", { status: 405 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const message = update?.message;
  if (!message?.text) {
    // Ignore non-text updates (stickers, reactions, etc.)
    return new Response("ok");
  }

  const chatId = message.chat.id as number;
  const text   = (message.text as string).trim();

  console.log(`Telegram message from chat ${chatId}: ${text}`);

  try {
    const intent = await classifyIntent(text);
    console.log("Classified intent:", JSON.stringify(intent));

    if (intent.type === "help") {
      await handleHelp(chatId);
    } else if (intent.type === "export") {
      await handleExport(chatId, intent);
    } else {
      await handleQuery(chatId, text);
    }
  } catch (err: any) {
    console.error("Handler error:", err.message);
    await sendMessage(chatId, "⚠️ Something went wrong on my end. Please try again.");
  }

  // Always return 200 quickly so Telegram doesn't retry
  return new Response("ok");
});
