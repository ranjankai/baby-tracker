import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";
import { GEMINI_API_KEY as GLOBAL_GEMINI_API_KEY } from '../_shared/config.ts';

// Environment setup
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

// Global Gemini API key — imported from _shared/config.ts
const genAI = new GoogleGenerativeAI(GLOBAL_GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendTelegram(message: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const chatIds = TELEGRAM_CHAT_ID.split(',').map(id => id.trim()).filter(Boolean);
  for (const chatId of chatIds) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
      });
    } catch (e) { console.error(`Telegram fail:`, e); }
  }
}

Deno.serve(async (_req) => {
  try {
    let alertSent = false;
    let alertMessage = "";

    // 1. RULE-BASED: Latest Feed
    const { data: feeds } = await supabase.from('baby_events').select('start_time, end_time').in('type', ['top', 'mom_l', 'mom_r', 'bottle']).order('start_time', { ascending: false }).limit(1);
    if (feeds?.[0]) {
      // Reverted to start_time for feeding alert calculation
      const lastActionTime = new Date(feeds[0].start_time).getTime();
      const mins = (Date.now() - lastActionTime) / 60000;
      
      // Threshold: 2.75h (165 mins) to 3.75h (225 mins) window
      if (mins >= 165 && mins <= 225) {
        alertMessage = `🚨 <b>Feeding Reminder</b>\nIt has been <b>${(mins/60).toFixed(1)}h</b> since the last feed started.`;
        alertSent = true;
      }
    }

    // 2. RULE-BASED: Latest Pee
    const { data: diapers } = await supabase.from('baby_events').select('start_time').eq('type', 'diaper').neq('pee_amount', 'none').order('start_time', { ascending: false }).limit(1);
    if (!alertSent && diapers?.[0]) {
      const mins = (Date.now() - new Date(diapers[0].start_time).getTime()) / 60000;
      if (mins >= 240 && mins <= 300) {
        alertMessage = `🚨 <b>Diaper Reminder</b>\nIt has been <b>${(mins/60).toFixed(1)}h</b> since the last Pee.`;
        alertSent = true;
      }
    }

    // 3. RULE-BASED: Latest Poop
    const { data: poops } = await supabase.from('baby_events').select('start_time').eq('type', 'diaper').neq('poop_amount', 'none').order('start_time', { ascending: false }).limit(1);
    if (!alertSent && poops?.[0]) {
      const mins = (Date.now() - new Date(poops[0].start_time).getTime()) / 60000;
      if (mins >= 1440 && mins <= 1500) {
        alertMessage = `🚨 <b>Poop Reminder</b>\nIt has been <b>${(mins/60).toFixed(1)}h</b> since the last Poop.`;
        alertSent = true;
      }
    }

    // --- COOLDOWN PERSISTENCE (Stealth Strategy) ---
    // We check the last 20 stealth rows (diaper-free true) for recent notifications
    const { data: recentStealth } = await supabase.from('baby_events').select('start_time, notes').eq('type', 'diaper').eq('is_diaper_free', true).order('start_time', { ascending: false }).limit(20);

    const lastSystemEvent = recentStealth?.find(e => e.notes?.startsWith("SYSTEM_MSG:"));
    const lastAIRow = recentStealth?.find(e => e.notes?.startsWith("SYSTEM_MSG: AI_INSIGHT"));
    
    let timeSinceLastNudge = 9999;
    if (lastSystemEvent) {
      timeSinceLastNudge = (Date.now() - new Date(lastSystemEvent.start_time).getTime()) / 60000;
    }

    // ACTION: Fire Rule-Based Alert
    if (alertSent) {
      await sendTelegram(alertMessage);
      await supabase.from('baby_events').insert([{ type: 'diaper', is_diaper_free: true, start_time: new Date().toISOString(), notes: `SYSTEM_MSG: ALERT` }]);
      return new Response("alert_sent");
    }

    // ACTION: Fire AI Insight (2-hour Cooldown & Memory)
    if (timeSinceLastNudge >= 120) {
      const lastInsightText = lastAIRow?.notes?.split("AI_INSIGHT:")[1] || "None";
      const { data: rawLogs } = await supabase.from('baby_events').select('type, start_time, amount_ml, pee_amount, poop_amount, intensity, notes').order('start_time', { ascending: false }).limit(400);
      const logs = rawLogs?.filter(e => !e.notes?.startsWith('SYSTEM_MSG')).slice(0, 300);

      // Phase 1: The "Scout" (Dedicated Weather/Env Call)
      const LOCATION = "M3M Golf Estate, Sector 65, Gurgaon, India";
      const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' });
      const scoutPrompt = `Today is ${today}. Return a 2-sentence summary of the CURRENT atmospheric and climate conditions TODAY which can affect a <3 month old baby girl's health in ${LOCATION}.`;

      
      let environmentContext = "No specific environmental data retrieved today.";
      const scoutWaterfall = [
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash-lite'
      ];
      for (const modelName of scoutWaterfall) {
        try {
          console.log(`Nudge Phase 1: Scout fetching environmental context using ${modelName}...`);
          const scoutModel = genAI.getGenerativeModel({
            model: modelName,
            tools: [{ googleSearch: {} }] as any
          });
          const scoutResult = await scoutModel.generateContent(scoutPrompt);
          environmentContext = scoutResult.response.text();
          console.log(`Nudge Scout Context retrieved successfully via ${modelName}:`, environmentContext);
          break;
        } catch (e) {
          console.error(`Nudge Scout model ${modelName} failed:`, e.message);
          if (e.message && e.message.toLowerCase().includes('api key')) break;
        }
      }

      // Phase 2: The "Expert" (Main Analysis)
      const prompt = `You are a world-class pediatric expert and your friends are first time parents of this newborn girl under discussion.
      LOCATION of Parents: ${LOCATION}.
      CURRENT ENVIRONMENT: ${environmentContext}

      NOTE: Events with type 'medicine' represent doses given to the baby. The medicine name and dosage are in the 'notes' field.
      TASK: Provide one wise, expert pattern observation based on these baby logs: ${JSON.stringify(logs)}. 
      
      PREVIOUS INSIGHT: "${lastInsightText}".

      RULES:
      - Be warm, avuncular, and analytical in your response, don't give generic advice.
      - Max 50 words. No lists. No headers.
      - Factor the CURRENT ENVIRONMENT into your analysis and recommendation, if that improves the quality of advice.
      - Do NOT repeat the previous insight.`;

      // Dual-Tier Waterfall (Expert Phase - NO TOOLS attached)
      const insightChain = [
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite'
      ];
      let insightText = null;
      let lastError = null;
      for (const modelName of insightChain) {
        try {
          console.log(`Nudge Expert: Attempting ${modelName}...`);
          const model = genAI.getGenerativeModel({ 
            model: modelName
            // NO TOOLS ATTACHED!
          });
          const result = await model.generateContent(prompt);
          const response = result.response;
          if (!response.candidates || response.candidates.length === 0) throw new Error("Safety Block");
          insightText = response.text();
          console.log(`Nudge: Success with ${modelName}`);
          break;
        } catch (error) {
          console.error(`Nudge: ${modelName} failed | ${error.message}`);
          lastError = error;
          if (error.message.includes('400') || error.message.toLowerCase().includes('api key')) break;
        }
      }
      if (!insightText) throw lastError || new Error("All insight models failed.");

      console.log("Nudge: Sending to Telegram...");
      await sendTelegram(`🔮 <b>AI Neonatologist Insight:</b>\n<i>${insightText}</i>`);
      console.log("Nudge: Logging to DB...");
      await supabase.from('baby_events').insert([{ type: 'diaper', is_diaper_free: true, start_time: new Date().toISOString(), notes: `SYSTEM_MSG: AI_INSIGHT: ${insightText}` }]);
      return new Response("insight_sent");
    }

    return new Response("cooldown_active");
  } catch (err) {
    console.error("Nudge Master Error:", err.message);
    return new Response(err.message, { status: 500 });
  }
});
