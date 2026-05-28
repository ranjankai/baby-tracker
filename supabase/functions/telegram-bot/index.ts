import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";

// ── Environment ───────────────────────────────────────────────────────────────
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_TOKEN            = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const GEMINI_API_KEY            = Deno.env.get("GEMINI_API_KEY")!;
const LOCATION                  = "M3M Golf Estate, Sector 65, Gurgaon, India";

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
  for (const chunk of chunkText(text, 4000)) {
    await tgPost("sendMessage", { chat_id: chatId, text: chunk, parse_mode: "HTML" });
  }
}

async function sendDocument(chatId: number, filename: string, content: string, caption: string) {
  const formData = new FormData();
  formData.append("chat_id",    String(chatId));
  formData.append("caption",    caption);
  formData.append("parse_mode", "HTML");
  formData.append("document",   new Blob([content], { type: "text/plain" }), filename);
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
    method: "POST",
    body:   formData,
  });
}

function chunkText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  while (text.length > maxLen) {
    const slice = text.slice(0, maxLen);
    const cut   = slice.lastIndexOf("\n") > 0 ? slice.lastIndexOf("\n") : maxLen;
    chunks.push(text.slice(0, cut));
    text = text.slice(cut).trimStart();
  }
  if (text.length) chunks.push(text);
  return chunks;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
const IST = "Asia/Kolkata";

function getISTDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}

// ── Gemini ────────────────────────────────────────────────────────────────────
const INSIGHT_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

async function callGemini(prompt: string): Promise<string> {
  for (const modelName of INSIGHT_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      });
      return (await model.generateContent(prompt)).response.text();
    } catch (e: any) {
      console.error(`${modelName} failed: ${e.message}`);
      if (e.message?.toLowerCase().includes("api key")) break;
    }
  }
  throw new Error("All Gemini models failed.");
}

// ── Baby context ──────────────────────────────────────────────────────────────
async function getBabyAge(): Promise<string> {
  const { data } = await supabase
    .from("baby_events").select("start_time, notes")
    .order("start_time", { ascending: true }).limit(50);
  const firstEvent = (data || []).find(e => !e.notes?.startsWith("SYSTEM_MSG:"));
  if (!firstEvent) return "<3 month old";
  const days  = Math.floor((Date.now() - new Date(firstEvent.start_time).getTime()) / 86400000);
  const weeks = Math.floor(days / 7);
  return weeks > 0 ? `${weeks} week old (approx ${days} days)` : `${days} day old`;
}

async function getEnvContext(ageContext: string): Promise<string> {
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: IST,
  });
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const r = await model.generateContent(
      `Today is ${today}. Give a 2-sentence summary of CURRENT atmospheric/climate conditions TODAY that can affect a ${ageContext} baby girl's health in ${LOCATION}.`
    );
    return r.response.text();
  } catch { return ""; }
}

// ── Conversation memory ───────────────────────────────────────────────────────
interface ContextRow { role: string; content: string; }

async function getContext(chatId: number): Promise<ContextRow[]> {
  const istOffsetMs   = 5.5 * 60 * 60 * 1000;
  const istNowMs      = Date.now() + istOffsetMs;
  const todayStartUTC = new Date(istNowMs - (istNowMs % 86400000) - istOffsetMs).toISOString();

  const { data: todayRows } = await supabase
    .from("telegram_context").select("role, content")
    .eq("chat_id", chatId).gte("created_at", todayStartUTC)
    .order("created_at", { ascending: true });

  if (todayRows && todayRows.length >= 20) return todayRows as ContextRow[];

  const { data: last20 } = await supabase
    .from("telegram_context").select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false }).limit(20);

  return ((last20 || []).reverse()) as ContextRow[];
}

async function saveContext(chatId: number, role: "user" | "assistant", content: string) {
  await supabase.from("telegram_context").insert({ chat_id: chatId, role, content });
}

// ── Data fetch — last 30 days of all events ───────────────────────────────────
async function fetchEvents(): Promise<any[]> {
  const from = `${getISTDate(-29)}T00:00:00.000Z`;
  const { data } = await supabase
    .from("baby_events").select("*")
    .gte("start_time", from)
    .order("start_time", { ascending: false });
  return (data || []).reverse().filter(e => !e.notes?.startsWith("SYSTEM_MSG:"));
}

function formatEventsForAI(events: any[]): string {
  const groups: Record<string, string[]> = {};
  
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
      const parts: string[] = [];
      if (e.poop_amount && e.poop_amount !== "none") parts.push(`poop: ${e.poop_amount}`);
      if (e.pee_amount && e.pee_amount !== "none") parts.push(`pee: ${e.pee_amount}`);
      const label = e.is_diaper_free ? "Diaper Free session" : "Diaper change";
      desc = `${label} (${parts.join(", ") || "dry"})`;
    } else if (e.type === "mom_l" || e.type === "mom_r") {
      desc = `Breastfeed (${e.type === "mom_l" ? "Left" : "Right"}) for ${e.duration_minutes || 0} mins`;
    } else if (e.type === "top") {
      desc = `Bottle feed (${e.amount_ml || 0} ml)`;
    } else if (e.type === "spit_up") {
      desc = `Spit-up`;
    } else if (e.type === "medicine") {
      desc = `Medicine: ${e.notes || ""}`;
    } else if (e.type === "tummy_time") {
      if (e.end_time) {
        const start = new Date(e.start_time).getTime();
        const end = new Date(e.end_time).getTime();
        const durationMs = Math.max(0, (end - start) - (e.total_paused_ms || 0));
        const durationMins = Math.floor(durationMs / 60000);
        const durationSecs = Math.floor((durationMs % 60000) / 1000);
        const durStr = durationMins > 0 ? `${durationMins}m ${durationSecs}s` : `${durationSecs}s`;
        desc = `Tummy time (${durStr})`;
      } else {
        desc = `Tummy time (active/ongoing)`;
      }
    } else if (e.type === "massage") {
      if (e.end_time) {
        const start = new Date(e.start_time).getTime();
        const end = new Date(e.end_time).getTime();
        const durationMs = Math.max(0, (end - start) - (e.total_paused_ms || 0));
        const durationMins = Math.floor(durationMs / 60000);
        const durationSecs = Math.floor((durationMs % 60000) / 1000);
        const durStr = durationMins > 0 ? `${durationMins}m ${durationSecs}s` : `${durationSecs}s`;
        desc = `Massage (${durStr})`;
      } else {
        desc = `Massage (active/ongoing)`;
      }
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

function getDailyStats(events: any[]): string {
  const stats: Record<string, { feeds: number; diapers: number; pees: number; poops: number; diaperFree: number; medicines: number; tummyTimeSeconds: number; massageSeconds: number }> = {};
  
  for (const e of events) {
    const d = new Date(e.start_time);
    const dateStr = d.toLocaleDateString("en-IN", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: IST
    });
    
    if (!stats[dateStr]) {
      stats[dateStr] = { feeds: 0, diapers: 0, pees: 0, poops: 0, diaperFree: 0, medicines: 0, tummyTimeSeconds: 0, massageSeconds: 0 };
    }
    
    const day = stats[dateStr];
    if (e.type === "diaper") {
      if (e.is_diaper_free) {
        day.diaperFree++;
      } else {
        day.diapers++;
      }
      if (e.pee_amount && e.pee_amount !== "none") day.pees++;
      if (e.poop_amount && e.poop_amount !== "none") day.poops++;
    } else if (e.type === "mom_l" || e.type === "mom_r" || e.type === "top") {
      day.feeds++;
    } else if (e.type === "medicine") {
      day.medicines++;
    } else if (e.type === "tummy_time" && e.end_time) {
      const start = new Date(e.start_time).getTime();
      const end = new Date(e.end_time).getTime();
      const durationMs = Math.max(0, (end - start) - (e.total_paused_ms || 0));
      day.tummyTimeSeconds += Math.floor(durationMs / 1000);
    } else if (e.type === "massage" && e.end_time) {
      const start = new Date(e.start_time).getTime();
      const end = new Date(e.end_time).getTime();
      const durationMs = Math.max(0, (end - start) - (e.total_paused_ms || 0));
      day.massageSeconds += Math.floor(durationMs / 1000);
    }
  }
  
  return Object.entries(stats)
    .map(([date, s]) => {
      const tummyMin = Math.floor(s.tummyTimeSeconds / 60);
      const tummySec = s.tummyTimeSeconds % 60;
      const massageMin = Math.floor(s.massageSeconds / 60);
      const massageSec = s.massageSeconds % 60;
      
      const statsList = [
        `• Total Diapers: ${s.diapers} (Pees: ${s.pees}, Poops: ${s.poops})`,
        s.diaperFree > 0 ? `• Diaper Free Sessions: ${s.diaperFree}` : null,
        `• Total Feeds: ${s.feeds}`,
        s.medicines > 0 ? `• Total Medicines: ${s.medicines}` : null,
        s.tummyTimeSeconds > 0 ? `• Total Tummy Time: ${tummyMin}m ${tummySec}s` : null,
        s.massageSeconds > 0 ? `• Total Massage Time: ${massageMin}m ${massageSec}s` : null,
      ].filter(Boolean);
      
      return `📅 ${date}:\n  ${statsList.join("\n  ")}`;
    })
    .join("\n\n");
}

// ── Help message ──────────────────────────────────────────────────────────────
async function sendHelp(chatId: number) {
  await sendMessage(chatId, `👶 <b>Baby Tracker AI Assistant</b>

Same bot that sends your notifications — now two-way.

Just talk to me naturally. Examples:

<b>Questions</b>
• "When was her last feed?"
• "How many wet diapers today?"
• "Is her poop frequency normal?"

<b>Logs</b>
• "Give me poop logs for last 7 days"
• "Show me all feeds since yesterday"
• "List medicines given this week"

<b>Export as file</b>
• "Export last 7 days for my doctor"
• "Export last 3 days for ChatGPT"
• "Export poop logs last 5 days for doctor"`);
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("register") === "1") {
    const webhookUrl = `https://vyaleoetmmxjsykirfop.supabase.co/functions/v1/telegram-bot`;
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
    });
    return new Response(JSON.stringify(await res.json()), {
      headers: { "Content-Type": "application/json" }, status: res.ok ? 200 : 500,
    });
  }

  if (req.method === "GET") return new Response("Baby Tracker bot running. GET ?register=1 to set webhook.", { status: 200 });
  if (req.method !== "POST") return new Response("Method not allowed.", { status: 405 });

  let update: any;
  try { update = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }

  const msg = update?.message;
  if (!msg?.text) return new Response("ok");

  const chatId = msg.chat.id as number;
  const text   = (msg.text as string).trim();
  const lower  = text.toLowerCase();

  console.log(`[${chatId}] ${text}`);

  // Help
  if (lower === "/start" || lower === "/help" || lower === "start" || lower === "help") {
    await sendHelp(chatId);
    return new Response("ok");
  }

  // Is this a file export request? (delivery mechanism only — Gemini still generates content)
  const isExport = /\b(export|download|send|file|markdown|md|txt|for.*doctor|for.*chatgpt)\b/.test(lower);
  const isMarkdown = /\b(markdown|md|chatgpt)\b/.test(lower);

  saveContext(chatId, "user", text).catch(console.error);
  await sendMessage(chatId, "🔍 <i>Analysing logs…</i>");

  try {
    const [ageContext, envContext, history, events] = await Promise.all([
      getBabyAge(),
      getBabyAge().then(a => getEnvContext(a)),
      getContext(chatId),
      fetchEvents(),
    ]);

    const currentLocalTime = new Date().toLocaleString("en-IN", {
      timeZone: IST, dateStyle: "full", timeStyle: "long",
    });

    const contextBlock = history.length
      ? `\n[Conversation history]\n${history.filter(r => !(r.role === "user" && r.content === text)).slice(-40).map(r => `${r.role === "user" ? "Parent" : "Assistant"}: ${r.content}`).join("\n")}\n[End of history]\n`
      : "";

    const formatRule = isExport
      ? (isMarkdown
          ? `OUTPUT FORMAT — The user wants a file to share. Generate a thorough, structured clinical report using markdown formatting. Use bold headers, bullet points, and tables if useful. Sections: FEEDING SUMMARY, DIAPER DETAILS (pee + poop separately), MEDICATIONS, GENERAL HEALTH. Be clinical and complete.`
          : `OUTPUT FORMAT — The user wants a file to share. Generate a thorough, structured plain-text clinical report with sections: FEEDING SUMMARY, DIAPER DETAILS (pee + poop separately), MEDICATIONS, GENERAL HEALTH. Use bullet points. Be clinical and complete. NO MARKDOWN.`)
      : `OUTPUT FORMAT — Read the request and respond appropriately:
- If they want a LIST or LOG of events: respond with a clean day-by-day timestamped list grouped by IST date. Use "📅 DD-Mon" as a date header. One event per line: "  • HH:MM AM/PM — details". End with a one-line total count. PLAIN TEXT ONLY — no markdown bold, no asterisks.
- If they're asking a QUESTION: answer concisely in plain text, max 100 words. Start with a direct answer.
In both cases: no markdown formatting, no asterisks, no **bold**.`;

    const formattedLogs = formatEventsForAI(events);
    const dailyStats = getDailyStats(events);

    const prompt = `You are a pediatric expert assistant for the parents of a ${ageContext} newborn girl in Gurgaon.
CRITICAL: Factor the baby's exact age (${ageContext}) into all reasoning.

CURRENT TIME (IST): ${currentLocalTime}
${envContext ? `CURRENT ENVIRONMENT: ${envContext}` : ""}

EVENT TYPE GUIDE:
- type="diaper": diaper change or diaper-free session. If is_diaper_free=true, it represents "Diaper Free" time. poop_amount tells you if there was poop (any value other than "none" = poop occurred). pee_amount tells you if there was pee.
- type="mom_l" or "mom_r": breastfeed on left/right breast. duration_minutes in the record.
- type="top": bottle/top-up feed.
- type="spit_up": spit-up event. severity in notes.
- type="medicine": dose given to baby. medicine name and dosage in the notes field.
- type="weight": weight measurement.
- type="tummy_time": tummy time session. Shows duration calculated from start_time and end_time (minus total_paused_ms).
- type="massage": baby massage session. Shows duration calculated from start_time and end_time (minus total_paused_ms).
${contextBlock}
PARENT'S REQUEST: "${text}"

DAILY STATISTICS SUMMARY (IST DETERMINISTIC COUNTS):
${dailyStats}

BABY LOGS (last 30 days in IST):
${formattedLogs}

${formatRule}

RULES:
- Use conversation history to resolve references ("that", "the last one", "she").
- Only show events relevant to the request — filter by type, date range, and sub-type (e.g. poop vs pee) as needed.
- Factor environment only if directly relevant.`;

    const response = await callGemini(prompt);

    if (isExport) {
      const today = getISTDate();
      const ext = isMarkdown ? "md" : "txt";
      const filename = `baby-report-${today}.${ext}`;
      await sendDocument(chatId, filename, response, `📋 <b>Baby Tracker Report</b>`);
    } else {
      await sendMessage(chatId, response);
    }

    saveContext(chatId, "assistant", response).catch(console.error);
  } catch (err: any) {
    console.error("Error:", err.message);
    await sendMessage(chatId, "⚠️ Something went wrong. Please try again.");
  }

  return new Response("ok");
});
