-- Run this in Supabase Dashboard → SQL Editor

-- 1. Add 'medicine' to baby_events type constraint
ALTER TABLE public.baby_events DROP CONSTRAINT IF EXISTS baby_events_type_check;
ALTER TABLE public.baby_events ADD CONSTRAINT baby_events_type_check
  CHECK (type IN ('top', 'mom_l', 'mom_r', 'diaper', 'spit_up', 'medicine'));

-- 2. Create med_schedules table (medicines as JSONB for per-med metadata)
CREATE TABLE IF NOT EXISTS public.med_schedules (
  id             BIGSERIAL PRIMARY KEY,
  medicines      JSONB NOT NULL,   -- [{name: "Colicaid (0.5ml)", max_per_day: 4}, ...]
  archetype      TEXT NOT NULL CHECK (archetype IN ('rotation', 'interval', 'time_window')),
  interval_hours NUMERIC,
  window_start   TEXT,
  window_end     TEXT,
  timing         TEXT DEFAULT 'anytime',
  nlp_input      TEXT,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS policies
ALTER TABLE public.med_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read for all"   ON public.med_schedules FOR SELECT USING (true);
CREATE POLICY "Enable insert for all" ON public.med_schedules FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all" ON public.med_schedules FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for all" ON public.med_schedules FOR DELETE USING (true);

-- 4. Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.med_schedules;
