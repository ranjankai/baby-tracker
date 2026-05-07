import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";
import { GEMINI_API_KEY as GLOBAL_GEMINI_API_KEY } from '../_shared/config.ts';

// Environment setup
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Global Gemini API key — imported from _shared/config.ts

const genAI = new GoogleGenerativeAI(GLOBAL_GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const cleanJson = (text: string) => {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text.replace(/```json|```/g, "").trim();
};

Deno.serve(async (req) => {
  try {
    // 1. Get the last time the AI was updated
    const { data: currentInsight } = await supabase
      .from('ai_insights')
      .select('updated_at')
      .eq('id', 1)
      .single();

    const lastAIUpdate = currentInsight ? new Date(currentInsight.updated_at).getTime() : 0;
    const now = Date.now();

    // Condition 1: Has it been an hour?
    const oneHour = 60 * 60 * 1000;
    if (now - lastAIUpdate < oneHour) {
      console.log("Cooldown active (under 1 hour). Skipping AI generation.");
      return new Response("cooldown_active", { status: 200 });
    }

    // 2. Get the most recent user event
    const { data: allRecentEvents } = await supabase
      .from('baby_events')
      .select('start_time, notes')
      .order('start_time', { ascending: false })
      .limit(20);

    const latestUserEvent = allRecentEvents?.find(e => !e.notes?.startsWith('SYSTEM_MSG'));

    // Condition 2: Has a new user event been logged since the last AI update?
    if (latestUserEvent) {
      const lastEventTime = new Date(latestUserEvent.start_time).getTime();
      if (lastEventTime <= lastAIUpdate) {
        console.log("No new events since last AI update. Skipping AI generation.");
        return new Response("no_new_events", { status: 200 });
      }
    } else {
      return new Response("no_events_found", { status: 200 });
    }

    console.log("Conditions met. Fetching data for AI Analysis...");

    // 3. Fetch recent events (Last 50) for analysis
    const { data: rawLogs } = await supabase
      .from('baby_events')
      .select('type, start_time, amount_ml, pee_amount, poop_amount, intensity, notes')
      .order('start_time', { ascending: false })
      .limit(100);

    const logs = rawLogs?.filter(e => !e.notes?.startsWith('SYSTEM_MSG')).slice(0, 50);

    // 4. Phase 1: The "Scout" (Dedicated Weather/Env Call)
    const LOCATION = "M3M Golf Estate, Sector 65, Gurgaon, India";
    const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' });
    const scoutPrompt = `Today is ${today}. Return a 2-sentence summary of the CURRENT atmospheric and climate conditions TODAY which can affect a <3 month old baby girl's health in ${LOCATION}.`;

    
    let environmentContext = "No specific environmental data retrieved today.";
    try {
      console.log("Phase 1: Scout fetching environmental context...");
      const scoutModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        tools: [{ googleSearch: {} }] as any
      });
      const scoutResult = await scoutModel.generateContent(scoutPrompt);
      environmentContext = scoutResult.response.text();
      console.log("Scout Context:", environmentContext);
    } catch (e) {
      console.error("Scout failed, proceeding without live context:", e.message);
    }

    // 5. Phase 2: The "Expert" (Main Analysis)
    const prompt = `
      You are a world-class pediatric expert and your friends are first time parents of this newborn girl under discussion.
      LOCATION of Parents: ${LOCATION}.
      CURRENT ENVIRONMENT: ${environmentContext}

      NOTE: Events with type 'medicine' represent doses given to the baby. The medicine name and dosage are in the 'notes' field.
      TASK: Provide a deep analytical analysis based on these baby logs: ${JSON.stringify(logs)}. 
      
      RESPONSE FORMAT (JSON):
      {
        "strip": {
          "summary": "One genuinely deep insight (Max 30 words) focusing on the baby's data.",
          "details": "Deeper analysis of patterns and trends based on logs. Be analytical and personal.",
          "recommendation": "One clear action for the parents."
        },
        "micro": {
          "feed": "Short 4-5 word status",
          "pee": "Short 4-5 word status",
          "poop": "Short 4-5 word status",
          "spit_up": "Short 4-5 word status",
          "stats": "Short 4-5 word status"
        }
      }
      
      RULES:
      - Be warm, avuncular, and analytical in your response, don't give generic advice.
      - Factor the CURRENT ENVIRONMENT into your analysis and recommendation, if that improves the quality of advice.
      - Respond ONLY with the JSON.
    `;

    // 6. Gemini Waterfall
    const insightChain = [
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ];

    let insightResult = null;
    for (const modelName of insightChain) {
      try {
        console.log(`Attempting Expert Model: ${modelName}...`);
        const model = genAI.getGenerativeModel({ 
          model: modelName
          // NO TOOLS ATTACHED! The Scout already did the search.
        });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log(`Raw response from ${modelName}:`, text);
        insightResult = JSON.parse(cleanJson(text));
        console.log(`Success with ${modelName}`);
        break;
      } catch (err) {
        console.error(`${modelName} failed: ${err.message}`);
      }
    }

    if (!insightResult) throw new Error("All AI models failed.");

    // 6. Update ai_insights table
    await supabase
      .from('ai_insights')
      .update({
        strip_json: insightResult.strip,
        micro_json: insightResult.micro,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    return new Response("success", { status: 200 });

  } catch (err) {
    console.error("Fatal Error:", err.message);
    return new Response(err.message, { status: 500 });
  }
});
