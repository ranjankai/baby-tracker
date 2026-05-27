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

// ── Date helpers (IST) ────────────────────────────────────────────────────────
const IST = "Asia/Kolkata";

function getISTDate(offsetDays = 0): string {
  // Returns yyyy-mm-dd in IST
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}

function formatDateDMY(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00Z"); // noon to avoid DST edge
  return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCFullYear()).slice(-2)}`;
}

// ── Gemini helpers ────────────────────────────────────────────────────────────
const PROTOCOL_MODELS = ["gemma-4-26b-a4b-it", "gemini-3.1-flash-lite"];
const INSIGHT_MODELS  = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

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
    .from("baby_events").select("start_time")
    .not("notes", "like", "SYSTEM_MSG%")
    .order("start_time", { ascending: true }).limit(1);

  if (!data?.[0]) return "<3 month old";
  const days  = Math.floor((Date.now() - new Date(data[0].start_time).getTime()) / 86400000);
  const weeks = Math.floor(days / 7);
  return weeks > 0 ? `${weeks} week old (approx ${days} days)` : `${days} day old`;
}

async function getEnvContext(ageContext: string): Promise<string> {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: IST });
  try {
    return await callGemini(
      `Today is ${today}. Give a 2-sentence summary of CURRENT atmospheric and climate conditions TODAY that can affect a ${ageContext} baby girl's health in ${LOCATION}.`,
      ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]
    );
  } catch {
    return "No live environmental data available.";
  }
}

// ── Conversation memory ───────────────────────────────────────────────────────
interface ContextRow { role: string; content: string; }

async function getContext(chatId: number): Promise<ContextRow[]> {
  // IST midnight → UTC
  const istOffsetMs   = 5.5 * 60 * 60 * 1000;
  const istNowMs      = Date.now() + istOffsetMs;
  const todayStartUTC = new Date(istNowMs - (istNowMs % 86400000) - istOffsetMs).toISOString();

  const { data: today } = await supabase
    .from("telegram_context").select("role, content")
    .eq("chat_id", chatId).gte("created_at", todayStartUTC)
    .order("created_at", { ascending: true });

  if (today && today.length >= 20) return today as ContextRow[];

  const { data: last20 } = await supabase
    .from("telegram_context").select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false }).limit(20);

  return ((last20 || []).reverse()) as ContextRow[];
}

async function saveContext(chatId: number, role: "user" | "assistant", content: string) {
  await supabase.from("telegram_context").insert({ chat_id: chatId, role, content });
}

function formatContextBlock(history: ContextRow[]): string {
  if (!history.length) return "";
  const lines = history.map(r => `${r.role === "user" ? "Parent" : "Assistant"}: ${r.content}`);
  return `\n[Conversation history]\n${lines.join("\n")}\n[End of history]\n`;
}

// ── Phase 1: Protocol tier — single unified extraction ────────────────────────
type OutputFormat = "answer" | "list" | "file_text" | "file_markdown" | "help";

interface Extraction {
  event_types: string[];  // e.g. ["diaper"] or ["all"]
  from_date:   string;    // yyyy-mm-dd IST
  to_date:     string;    // yyyy-mm-dd IST
  output_format: OutputFormat;
}

async function extractIntent(message: string, today: string): Promise<Extraction> {
  const prompt = `
You are a data extraction engine for a baby tracker Telegram bot.
Today's date is ${today} (IST, yyyy-mm-dd).

User message: "${message}"

Extract the following and output ONLY a raw JSON object with these exact keys:

{
  "event_types": array — pick from ["diaper","mom_l","mom_r","top","spit_up","medicine","weight"].
                 Use ["all"] only when the request spans multiple types with no specific focus.
                 "diaper" covers ALL pee/poop/diaper questions.
                 ["mom_l","mom_r","top"] covers ALL feeding questions.

  "from_date": "yyyy-mm-dd" — start of the date range in IST.
               Default for "answer": today (${today}).
               Default for "list" or "file_*": 7 days ago (${getISTDate(-6)}).

  "to_date": "yyyy-mm-dd" — end of the date range in IST. Default: today (${today}).

  "output_format": one of these exact strings:
    "help"          — message is /start, /help, or asking what the bot can do
    "answer"        — analytical question needing expert interpretation (e.g. "is this normal?", "when was last?", "how many today?")
    "list"          — user wants to SEE individual events as a timeline (e.g. "show me", "give me the logs", "list", "history")
    "file_text"     — user wants a downloadable file for their doctor (plain text .txt)
    "file_markdown" — user wants a downloadable file for ChatGPT or in markdown (.md)
}

Examples:
"give me poop logs last 7 days"    → {"event_types":["diaper"],"from_date":"${getISTDate(-6)}","to_date":"${today}","output_format":"list"}
"show me all feeds today"          → {"event_types":["mom_l","mom_r","top"],"from_date":"${today}","to_date":"${today}","output_format":"list"}
"when was her last feed?"          → {"event_types":["mom_l","mom_r","top"],"from_date":"${today}","to_date":"${today}","output_format":"answer"}
"is her spit up normal?"           → {"event_types":["spit_up"],"from_date":"${getISTDate(-6)}","to_date":"${today}","output_format":"answer"}
"export last 7 days for doctor"    → {"event_types":["all"],"from_date":"${getISTDate(-6)}","to_date":"${today}","output_format":"file_text"}
"export last 3 days for ChatGPT"   → {"event_types":["all"],"from_date":"${getISTDate(-2)}","to_date":"${today}","output_format":"file_markdown"}
"export poop data last 5 days"     → {"event_types":["diaper"],"from_date":"${getISTDate(-4)}","to_date":"${today}","output_format":"file_text"}
"/help"                            → {"event_types":["all"],"from_date":"${today}","to_date":"${today}","output_format":"help"}
`;

  try {
    const raw    = await callGemini(prompt, PROTOCOL_MODELS, true);
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as Extraction;
    // Sanitise dates
    if (!parsed.from_date) parsed.from_date = getISTDate(-6);
    if (!parsed.to_date)   parsed.to_date   = today;
    return parsed;
  } catch {
    // Safe default: general answer about today
    return { event_types: ["all"], from_date: today, to_date: today, output_format: "answer" };
  }
}

// ── DB fetch ──────────────────────────────────────────────────────────────────
async function fetchEvents(extraction: Extraction): Promise<any[]> {
  let query = supabase
    .from("baby_events").select("*")
    .gte("start_time", `${extraction.from_date}T00:00:00.000Z`)
    .lte("start_time", `${extraction.to_date}T23:59:59.999Z`)
    .not("notes", "like", "SYSTEM_MSG%")
    .order("start_time", { ascending: true });

  if (!extraction.event_types.includes("all")) {
    query = query.in("type", extraction.event_types);
  }

  const { data } = await query;
  return data || [];
}

// ── Phase 2: Insight tier — unified response generation ───────────────────────
async function generateResponse(
  question:   string,
  extraction: Extraction,
  events:     any[],
  ageContext: string,
  envContext: string,
  history:    ContextRow[]
): Promise<string> {

  const currentLocalTime = new Date().toLocaleString("en-IN", {
    timeZone: IST, dateStyle: "full", timeStyle: "long"
  });

  const priorHistory = history
    .filter(r => !(r.role === "user" && r.content === question))
    .slice(-40);
  const contextBlock = formatContextBlock(priorHistory);

  const dateRange = extraction.from_date === extraction.to_date
    ? formatDateDMY(extraction.from_date)
    : `${formatDateDMY(extraction.from_date)} → ${formatDateDMY(extraction.to_date)}`;

  const formatInstructions: Record<string, string> = {
    answer: `
FORMAT — Prose answer:
- Max 100 words. Start with a direct answer to the question.
- Be warm, avuncular, and analytical.`,

    list: `
FORMAT — Timestamped event list:
- Group events by IST date. Use "📅 DD-Mon" as a date header.
- Under each date, list each event on its own line: time (IST) and key details.
  e.g. "  • 02:15 AM — Poop (heavy)"  or  "  • 10:30 AM — Left breast, 18 min"
- Skip days with no matching events.
- End with a one-line total summary (e.g. "Total: 9 poops over 7 days").`,

    file_text: `
FORMAT — Clinical plain-text report:
Generate a structured report using exactly this layout:

👶 Baby Tracker Clinical Report (${dateRange})
=============================================

🍼 FEEDING SUMMARY:
[feeding counts, volumes, averages — skip section if no feeding events]

🧷 DIAPER DETAILS:
[wet count, dirty count, diaper-free sessions — skip if no diaper events]

💊 MEDICATIONS ADMINISTERED:
[med name: doses, times — skip section entirely if no medicine events]

🤢 GENERAL HEALTH:
[spit-up count minor/major, weights if any]

Be thorough and clinical. Use bullet points (•) for each data point.`,

    file_markdown: `
FORMAT — Structured Markdown report for ChatGPT analysis:
Generate a full markdown document using this layout:

# 👶 Baby Tracker Log Report
**Date Scope:** ${dateRange}
*Generated for ChatGPT pediatric analysis*

## 🍼 Feeding Metrics
[Markdown table with columns: Dimension | Value | Details]

## 🧷 Diaper Changes
[Markdown table with columns: Type | Count | Notes]

## 💊 Medications
[Bullet list — skip if no medicine events]

## 🩺 Clinical / Health Status
[Spit-ups, weights — bullet points]

Be thorough. Use proper markdown syntax.`,
  };

  const prompt = `
You are a pediatric expert assistant for the parents of a ${ageContext} newborn girl.
CRITICAL: Factor the baby's exact age (${ageContext}) into all physiological and developmental reasoning.

CURRENT TIME (IST): ${currentLocalTime}
CURRENT ENVIRONMENT (Gurgaon): ${envContext}

TIMEZONE RULE: All log timestamps are UTC (ending in 'Z'). Convert to IST (UTC+05:30) before displaying any times. Always show IST — never mention UTC or Z timestamps to the parents.
NOTE: type='medicine' events represent doses given to the baby. The medicine name/dosage is in the 'notes' field.
NOTE: For type='diaper' events — 'poop_amount' != 'none' means a poop occurred. 'pee_amount' != 'none' means a pee occurred.
${contextBlock}
CURRENT REQUEST: "${question}"
DATE RANGE: ${dateRange} (${events.length} matching events)
BABY LOGS: ${JSON.stringify(events)}

${formatInstructions[extraction.output_format] ?? formatInstructions.answer}

GENERAL RULES:
- Use conversation history to resolve references like "that", "the last one", "she".
- Factor environment only if directly relevant to the question.`;

  return await callGemini(prompt, INSIGHT_MODELS);
}

// ── Help message ──────────────────────────────────────────────────────────────
async function sendHelp(chatId: number) {
  await sendMessage(chatId, `👶 <b>Baby Tracker AI Assistant</b>

Same bot that sends your notifications — now two-way.

<b>🔍 Ask Me Anything</b>
• <i>"When was her last feed?"</i>
• <i>"How many wet diapers today?"</i>
• <i>"Is her poop frequency normal?"</i>
• <i>"She spit up a lot — should I worry?"</i>

<b>📋 View Event Logs</b>
• <i>"Give me poop logs for last 7 days"</i>
• <i>"Show me all feeds since yesterday"</i>
• <i>"List medicines given this week"</i>

<b>📄 Export as File</b>
• <i>"Export last 7 days for my doctor"</i>   → .txt
• <i>"Export last 3 days for ChatGPT"</i>     → .md
• <i>"Export poop data last 5 days"</i>       → filtered .txt`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Webhook self-registration
  if (req.method === "GET" && url.searchParams.get("register") === "1") {
    const webhookUrl = `https://vyaleoetmmxjsykirfop.supabase.co/functions/v1/telegram-bot`;
    const res  = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
    });
    return new Response(JSON.stringify(await res.json()), {
      headers: { "Content-Type": "application/json" }, status: res.ok ? 200 : 500,
    });
  }

  if (req.method === "GET") {
    return new Response("Baby Tracker Telegram Bot is running. GET ?register=1 to set webhook.", { status: 200 });
  }

  if (req.method !== "POST") return new Response("Method not allowed.", { status: 405 });

  let update: any;
  try { update = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }

  const message = update?.message;
  if (!message?.text) return new Response("ok");

  const chatId = message.chat.id as number;
  const text   = (message.text as string).trim();
  const today  = getISTDate();

  console.log(`[${chatId}] ${text}`);

  try {
    // ── Phase 1: Protocol tier — extract intent + data requirements ──
    const extraction = await extractIntent(text, today);
    console.log("Extraction:", JSON.stringify(extraction));

    // Help requires no DB or AI — respond immediately
    if (extraction.output_format === "help") {
      await sendHelp(chatId);
      return new Response("ok");
    }

    // Save user turn (fire-and-forget)
    saveContext(chatId, "user", text).catch(console.error);
    await sendMessage(chatId, "🔍 <i>Analysing logs…</i>");

    // Fetch everything in parallel
    const [ageContext, envContext, history, events] = await Promise.all([
      getBabyAge(),
      getBabyAge().then(a => getEnvContext(a)),
      getContext(chatId),
      fetchEvents(extraction),
    ]);

    if (!events.length) {
      await sendMessage(chatId,
        `⚠️ No events found for <b>${extraction.event_types.join(", ")}</b> between <b>${formatDateDMY(extraction.from_date)}</b> and <b>${formatDateDMY(extraction.to_date)}</b>.`
      );
      return new Response("ok");
    }

    // ── Phase 2: Insight tier — generate response ──
    const response = await generateResponse(text, extraction, events, ageContext, envContext, history);

    // Deliver as file or message
    if (extraction.output_format === "file_text" || extraction.output_format === "file_markdown") {
      const ext      = extraction.output_format === "file_markdown" ? "md" : "txt";
      const filename = `baby-${extraction.from_date}-to-${extraction.to_date}.${ext}`;
      const caption  = `📋 <b>Baby Tracker Report</b>\n${formatDateDMY(extraction.from_date)} → ${formatDateDMY(extraction.to_date)} • ${events.length} events`;
      await sendDocument(chatId, filename, response, caption);
    } else {
      await sendMessage(chatId, `🩺 <b>Expert Analysis</b>\n\n${response}`);
    }

    // Save assistant turn (fire-and-forget)
    saveContext(chatId, "assistant", response).catch(console.error);

  } catch (err: any) {
    console.error("Error:", err.message);
    await sendMessage(chatId, "⚠️ Something went wrong. Please try again.");
  }

  return new Response("ok");
});
