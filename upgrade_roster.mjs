import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

// Support loading local .env file manually in Node
if (fs.existsSync('.env')) {
  const env = fs.readFileSync('.env', 'utf-8');
  env.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
}

const GLOBAL_GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GLOBAL_GEMINI_API_KEY);

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vyaleoetmmxjsykirfop.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5YWxlb2V0bW14anN5a2lyZm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTY1MzYsImV4cCI6MjA5MTczMjUzNn0.Qp4nEKv1TW638Yfw_Gx7WfdhVzU_ARsfX0J-ONvX51U';

const supabase = createClient(supabaseUrl, supabaseKey);

async function callDualTierAI(prompt, tier = 'protocol', responseMimeType = 'text/plain') {
  const chains = {
    'insight': [
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ],
    'protocol': [
      'gemma-4-31b-it',
      'gemma-4-26b-a4b-it'
    ]
  };
  const waterfall = chains[tier] || chains['protocol'];
  let lastError = null;
  for (const modelName of waterfall) {
    try {
      console.log(`AI Tier [${tier}]: Attempting ${modelName}...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      console.log(`AI Tier [${tier}]: Success with ${modelName}`);
      return response.text();
    } catch (error) {
      console.error(`${modelName} failed | Error: ${error.message}`);
      lastError = error;
      if (error.message && error.message.toLowerCase().includes('api key')) break;
    }
  }
  throw lastError || new Error(`All models in [${tier}] tier failed.`);
}

function medName(m) {
  if (!m) return '';
  return typeof m === 'string' ? m : (m.name || '');
}

function extractLastJson(text) {
  const stripped = text.replace(/```json|```/g, '');
  const blocks = [];
  let depth = 0, start = -1;
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (stripped[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) { blocks.push(stripped.slice(start, i + 1)); start = -1; }
    }
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    try { return JSON.parse(blocks[i]); } catch (_) {}
  }
  throw new Error('No valid JSON found');
}

async function run() {
  // 1. Fetch active schedules
  const { data: schedules, error } = await supabase
    .from('med_schedules')
    .select('*')
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at');

  if (error) { console.error('Fetch error:', error.message); process.exit(1); }
  if (!schedules.length) { console.log('No active schedules found.'); process.exit(0); }

  console.log(`\n📋 Found ${schedules.length} active schedule(s):\n`);
  schedules.forEach(s => {
    const names = (s.medicines || []).map(m => medName(m)).join(' → ');
    console.log(`  id:${s.id} | ${names} | doses_per_day:${s.doses_per_day ?? 'n/a'}`);
    if (s.nlp_input) console.log(`         nlp_input: "${s.nlp_input}"`);
  });

  // 2. Build upgrade prompt
  const roster = schedules.map(s => {
    const names = (s.medicines || []).map(m => medName(m)).join(' → ');
    const src = s.nlp_input ? `"${s.nlp_input}"` : `${names} (no original text)`;
    return `  - id:${s.id} | ${src} | current: archetype=${s.archetype}, interval_hours=${s.interval_hours ?? 'n/a'}, doses_per_day=${s.doses_per_day ?? 'n/a'}`;
  }).join('\n');

  const prompt = `You are upgrading an existing pediatric medication roster to a new smart scheduling model.

EXISTING ROSTER:
${roster}

TASK:
1. Convert EVERY medication above to the "daily_spread" model: doses_per_day + min_hours_between_doses + day_window_end + suggested_times
2. Holistically distribute all doses across the waking day 07:00–22:00 with no conflicts
3. Minimum 30 minutes gap between different meds at same time slot
4. Align same-frequency meds to same times where possible (parent convenience)
5. Use the original prescription text (nlp_input) as ground truth for dose count and frequency

Return ALL meds as is_modified=true in roster_plan.

OUTPUT ONLY valid JSON:
{
  "roster_plan": [
    {
      "existing_id": 123,
      "is_new": false,
      "is_modified": true,
      "change_reason": "Upgraded to daily_spread model",
      "medicines": [{"name": "MedicineName Dose Unit"}],
      "frequency_type": "DAILY",
      "doses_per_day": 2,
      "min_hours_between_doses": 4,
      "day_window_end": "22:00",
      "suggested_times": ["08:00", "20:00"],
      "timing": "after",
      "confidence": "high"
    }
  ],
  "optimization_note": "One sentence summary",
  "conflicts": []
}`;

  // 3. Call via insight tier (same as app)
  console.log('\n🧠 Calling insight tier...\n');
  const raw = await callDualTierAI(prompt, 'insight', 'text/plain');
  const plan = extractLastJson(raw);

  console.log('📊 Proposed roster_plan:\n');
  plan.roster_plan.forEach(p => {
    const names = (p.medicines || []).map(m => medName(m)).join(' → ');
    console.log(`  ✦ id:${p.existing_id} | ${names}`);
    console.log(`    doses_per_day: ${p.doses_per_day ?? 'null'} | min_gap: ${p.min_hours_between_doses}h | window_end: ${p.day_window_end}`);
    console.log(`    suggested_times: [${(p.suggested_times || []).join(', ')}]`);
    console.log(`    reason: ${p.change_reason}\n`);
  });

  if (plan.optimization_note) console.log(`🧠 ${plan.optimization_note}\n`);

  // 4. Write updates to Supabase
  console.log('💾 Writing to Supabase...\n');
  for (const p of plan.roster_plan) {
    if (!p.existing_id) continue;
    const { error: updateError } = await supabase
      .from('med_schedules')
      .update({
        doses_per_day:           p.doses_per_day           ?? null,
        day_window_end:          p.day_window_end          ?? '22:00',
        suggested_times:         p.suggested_times         ?? null,
        min_hours_between_doses: p.min_hours_between_doses ?? null,
        timing:                  p.timing                  ?? 'anytime',
        // intentionally NOT updating medicines — never let AI rewrite the canonical drug name
        interval_hours:          null,
        frequency_type:          p.frequency_type          ?? 'DAILY',
      })
      .eq('id', p.existing_id);

    const names = (p.medicines || []).map(m => medName(m)).join(' → ');
    if (updateError) console.error(`  ✗ id:${p.existing_id} | ${names} — ${updateError.message}`);
    else             console.log(`  ✓ id:${p.existing_id} | ${names}`);
  }

  console.log('\n✅ Done.\n');
}

run().catch(e => { console.error(e); process.exit(1); });
