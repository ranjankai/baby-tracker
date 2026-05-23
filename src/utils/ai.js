import { GoogleGenerativeAI } from '@google/generative-ai';

// Global API Key (Supports Gemini 2.x/3.x and Gemma 4)
const GLOBAL_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GLOBAL_GEMINI_API_KEY);

const cleanJson = (text) => {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text.replace(/```json|```/g, "").trim();
};

/**
 * Dual-Tier Waterfall for Gemini (Insight) and Gemma (Protocol) calls.
 */
export async function callDualTierAI(prompt, tier = "protocol", responseMimeType = "text/plain") {
  const chains = {
    // INSIGHT TIER: Deep analysis, pattern recognition, long-context summaries
    "insight": [
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ],
    // PROTOCOL TIER: Fast logic, decision trees, workflow orchestration
    "protocol": [
      'gemma-4-31b-it',
      'gemma-4-26b-a4b-it'
    ]
  };

  const waterfall = chains[tier] || chains["protocol"];
  let lastError = null;

  for (const modelName of waterfall) {
    try {
      console.log(`AI Tier [${tier}]: Attempting ${modelName}...`);
      const modelConfig = { 
        model: modelName,
        generationConfig: { responseMimeType },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ]
      };

      // We no longer attach tools here. The Scout phase handles search separately.
      const model = genAI.getGenerativeModel(modelConfig);

      const result = await model.generateContent(prompt);
      const response = await result.response;

      if (!response.candidates || response.candidates.length === 0) {
        throw new Error(`Safety filter blocked the response for ${modelName}`);
      }

      console.log(`AI Tier [${tier}]: Success with ${modelName}`);
      return response.text();
    } catch (error) {
      console.error(`AI Tier [${tier}]: ${modelName} failed | Status: ${error.status} | Error: ${error.message}`);
      lastError = error;
      // Only abort the entire chain on API key errors. 
      // Safety-filter 400s from individual models should fall through to the next model.
      if (error.message && error.message.toLowerCase().includes('api key')) {
        break;
      }
    }
  }

  throw lastError || new Error(`All models in [${tier}] tier failed.`);
}

let cachedEnvironmentContext = null;
const LOCATION = "M3M Golf Estate, Sector 65, Gurgaon, India";

async function getEnvironmentContext() {
  if (cachedEnvironmentContext) return cachedEnvironmentContext;
  
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' });
  const scoutPrompt = `Today is ${today}. Return a 2-sentence summary of the CURRENT atmospheric and climate conditions TODAY which can affect a <3 month old baby girl's health in ${LOCATION}.`;

  const scoutWaterfall = [
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite'
  ];

  for (const modelName of scoutWaterfall) {
    try {
      console.log(`Phase 1: Scout fetching environmental context using ${modelName}...`);
      const scoutModel = genAI.getGenerativeModel({
        model: modelName,
        tools: [{ googleSearch: {} }]
      });
      const result = await scoutModel.generateContent(scoutPrompt);
      cachedEnvironmentContext = result.response.text();
      console.log(`Scout Context retrieved successfully via ${modelName}:`, cachedEnvironmentContext);
      return cachedEnvironmentContext;
    } catch (e) {
      console.error(`Scout model ${modelName} failed:`, e.message || e);
      if (e.message && e.message.toLowerCase().includes('api key')) break;
    }
  }

  console.error("All Scout models failed to fetch environmental context.");
  return "No live environmental data available.";
}

/**
 * Chat Box Logic: Allows user to ask specific questions using Dual-Tier AI.
 */
export async function askBabyTrackerQuestion(question, events) {
  // Phase 1: Protocol Tier (Gemma) - Data Triage
  const protocolPrompt = `
    You are a data extraction rule generator for a baby tracking app.
    User Question: "${question}"
    Current Date/Time: ${new Date().toISOString()}
    
    Determine the data needed to answer this question.
    Output ONLY a JSON object:
    {
      "timeframe_hours": number (0 for all time, 24 for 1 day, etc.),
      "event_types": array of strings (e.g., ["diaper", "mom_l", "mom_r", "top", "spit_up", "medicine"] or ["all"])
    }
  `;

  let triage = { timeframe_hours: 24, event_types: ["all"] }; // safe default
  try {
    const triageJson = await callDualTierAI(protocolPrompt, "protocol", "application/json");
    triage = JSON.parse(cleanJson(triageJson));
  } catch (error) {
    console.warn("Triage AI failed, falling back to default (all events, 24h):", error.message);
    // Do NOT abort — proceed with the default triage so Gemini still answers
  }
  
  // Filter events based on triage
  let filteredEvents = events;
  if (triage.timeframe_hours > 0) {
    const cutoff = new Date(Date.now() - triage.timeframe_hours * 60 * 60 * 1000);
    filteredEvents = events.filter(e => new Date(e.start_time) >= cutoff);
  }
  if (triage.event_types && !triage.event_types.includes("all")) {
    filteredEvents = filteredEvents.filter(e => triage.event_types.includes(e.type));
  }

  // Phase 2: Insight Tier (Gemini) - Final Answer
  const envContext = await getEnvironmentContext();

  const insightPrompt = `
    You are a world-class pediatric expert and your friends are first time parents of this newborn girl under discussion.
    LOCATION of Parents: ${LOCATION}.
    CURRENT ENVIRONMENT: ${envContext}

    NOTE: Events with type 'medicine' represent doses given to the baby. The medicine name and dosage are in the 'notes' field.
    TASK: Answer this parent's question: "${question}" based on these baby logs: ${JSON.stringify(filteredEvents.slice(0, 100))}
    
    RULES:
    - Your FIRST sentence must directly and specifically answer the question asked. Do not pivot to general advice before doing so.
    - Be warm, avuncular, and analytical in your response, don't give generic advice.
    - Max 100 words.
    - Factor the CURRENT ENVIRONMENT into your analysis only if directly relevant to the question.
  `;

  try {
    return await callDualTierAI(insightPrompt, "insight", "text/plain");
  } catch (error) {
    console.error("Expert AI Error:", error);
    return "Sorry, the expert API call did not work.";
  }
}
