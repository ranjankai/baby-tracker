import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

const CASES = [
  'neopeptine 0.5 ml 2x/day for 3 days',
  'brufen sos max 2/day min 6h gap',
  'alternate colicaid and neopeptine max 3/day each',
  'prednisolone 5ml once daily for 3 days then 2.5ml for 3 days then 1.25ml for 3 days',
  'vitamin D3 0.5ml every Monday and Thursday for 10 weeks',
];

const NLP_PROMPT = (input) => `You are a pediatric prescription parser. Parse the following into structured JSON.

Input: "${input}"

Rules:
- archetype: "rotation" = medicines alternate each dose | "interval" = fixed gap | "time_window" = once within a daily window | "sos" = as-needed
- frequency_type: "DAILY" | "INTERVAL" | "SPECIFIC_DAYS" | "SOS"
- specific_days uses ISO weekday numbers: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
- For tapering/step-up regimens set isTaperingRegimen=true and fill taperSteps
- Include dosage in the medicine name string (e.g. "Neopeptine 0.5ml")

Output ONLY valid JSON (no explanation):
{
  "archetype": "rotation" | "interval" | "time_window" | "sos",
  "frequency_type": "DAILY" | "INTERVAL" | "SPECIFIC_DAYS" | "SOS",
  "medicines": [{"name": "MedicineName Dose Unit"}],
  "interval_hours": null or number,
  "window_start": null or "HH:MM",
  "window_end": null or "HH:MM",
  "specific_days": null or [1,4],
  "preferred_times": null or ["08:00","20:00"],
  "timing": "before" | "after" | "with" | "anytime",
  "max_doses_per_24h": null or number,
  "min_hours_between_doses": null or number,
  "duration_days": null or number,
  "is_tapering_regimen": false or true,
  "taper_steps": null or [{"phaseOrder":1,"durationInDays":3,"doseValue":5,"doseUnit":"ml"}],
  "confidence": "high" | "medium" | "low"
}`;

async function test() {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  for (const input of CASES) {
    console.log(`\n──────────────────────────────────────────`);
    console.log(`INPUT: ${input}`);
    try {
      const result = await model.generateContent(NLP_PROMPT(input));
      console.log(result.response.text());
    } catch (err) {
      console.error('ERROR:', err.message);
    }
  }
}

test();
