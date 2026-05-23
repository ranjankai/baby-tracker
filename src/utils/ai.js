// Clean JSON regex helper
const cleanJson = (text) => {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text.replace(/```json|```/g, "").trim();
};

/**
 * Dual-Tier AI Router: Calls the Vercel Serverless Function securely.
 */
export async function callDualTierAI(prompt, tier = "protocol", responseMimeType = "text/plain") {
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, tier, responseMimeType })
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error(`Vercel API returned ${response.status} without JSON.`);
    }
    
    if (!response.ok) {
      throw new Error(`Vercel API [${response.status}]: ${data.error || 'Failed to call AI API'} - ${data.details || ''}`);
    }

    return data.text;
  } catch (error) {
    console.error("Vercel API Route failed:", error);
    throw error;
  }
}

let cachedEnvironmentContext = null;
const LOCATION = "M3M Golf Estate, Sector 65, Gurgaon, India";

async function getEnvironmentContext(ageContext = "<3 month old") {
  if (cachedEnvironmentContext) return cachedEnvironmentContext;
  
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' });
  const scoutPrompt = `Today is ${today}. Return a 2-sentence summary of the CURRENT atmospheric and climate conditions TODAY which can affect a ${ageContext} baby girl's health in ${LOCATION}.`;

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
export async function askBabyTrackerQuestion(question, events, allTimeStats) {
  let ageContext = "<3 month old";
  if (allTimeStats?.firstEventTime) {
    const birthDate = new Date(allTimeStats.firstEventTime);
    const diffMs = Date.now() - birthDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks > 0) {
      ageContext = `${diffWeeks} week old (approx ${diffDays} days)`;
    } else {
      ageContext = `${diffDays} day old`;
    }
  }

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
  const envContext = await getEnvironmentContext(ageContext);

  const insightPrompt = `
    You are a world-class pediatric expert and your friends are first time parents of this ${ageContext} newborn girl under discussion.
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

/**
 * Filtered Log Summarizer: Generates 2-line numerical insight for filtered logs.
 */
export async function generateFilteredSummary(events, allTimeStats) {
  let ageContext = "<3 month old";
  if (allTimeStats?.firstEventTime) {
    const birthDate = new Date(allTimeStats.firstEventTime);
    const diffMs = Date.now() - birthDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks > 0) {
      ageContext = `${diffWeeks} week old (approx ${diffDays} days)`;
    } else {
      ageContext = `${diffDays} day old`;
    }
  }

  const prompt = `You are a pediatric data analyst.
The parents have filtered their baby's logs to a specific subset.
Baby Age: ${ageContext}.

TASK: Analyze these logs and provide numerical insights.

RULES:
- Focus strictly on numerical insights (e.g., percentages, averages, time distributions).
- Be incredibly concise—one sentence per field.
- Do NOT provide general pediatric advice, just deep data analysis.
- You MUST return ONLY a raw JSON object matching the exact structure below.

REQUIRED JSON FORMAT:
{
  "summary": "A pure numerical summary of the logs.",
  "insight": "An ultra-cool, mind-blowing numeric insight or hidden correlation found in this specific data."
}

Logs: ${JSON.stringify(events.slice(0, 150))}
  `;

  try {
    const resultJson = await callDualTierAI(prompt, "insight", "text/plain");
    try {
      return JSON.parse(cleanJson(resultJson));
    } catch (parseError) {
      console.error("JSON Parse Error. Raw response:", resultJson);
      throw parseError;
    }
  } catch (err) {
    console.error("Filtered Summary Error:", err);
    return {
      summary: "Could not generate summary at this time.",
      insight: "Please try again later or adjust your filters."
    };
  }
}
