import { GoogleGenerativeAI } from '@google/generative-ai';

// Uses the secure GEMINI_API_KEY from Vercel's backend environment
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt, tier = "protocol", responseMimeType = "text/plain" } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const chains = {
    // INSIGHT TIER: Deep analysis, pattern recognition, long-context summaries
    "insight": [
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ],
    // PROTOCOL TIER: Strict data extraction, boolean logic, fast NLP parsing
    "protocol": [
      'gemma-4-31b-it',
      'gemma-4-26b-a4b-it'
    ]
  };

  const waterfall = chains[tier] || chains["protocol"];
  let lastError = null;

  for (const modelName of waterfall) {
    try {
      const modelConfig = { 
        model: modelName,
        generationConfig: { responseMimeType },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      };

      const model = genAI.getGenerativeModel(modelConfig);
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      return res.status(200).json({ text: responseText });
    } catch (error) {
      console.error(`AI Tier [${tier}]: ${modelName} failed | Error: ${error.message}`);
      lastError = error;
      
      // Only abort the entire chain on API key errors. 
      if (error.message && error.message.toLowerCase().includes('api key')) {
        break;
      }
    }
  }

  return res.status(500).json({ 
    error: 'All models in the waterfall failed.', 
    details: lastError?.message || "Unknown error" 
  });
}
