-- Phase 2: Smart scheduling upgrade
-- Run in Supabase Dashboard → SQL Editor

-- 1. Add new columns
ALTER TABLE public.med_schedules
  ADD COLUMN IF NOT EXISTS doses_per_day    NUMERIC,
  ADD COLUMN IF NOT EXISTS day_window_end   TEXT DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS suggested_times  JSONB;

-- 2. Auto-upgrade existing interval rows → daily_spread model
--    doses_per_day = 24 / interval_hours  (e.g. 12h→2, 8h→3, 6h→4)
UPDATE public.med_schedules
SET
  doses_per_day           = ROUND(24.0 / NULLIF(interval_hours, 0)),
  min_hours_between_doses = GREATEST(COALESCE(min_hours_between_doses, 0), ROUND(interval_hours * 0.6)),
  day_window_end          = '22:00'
WHERE is_active = TRUE
  AND interval_hours IS NOT NULL
  AND doses_per_day IS NULL;

-- 3. Auto-upgrade existing time_window rows → daily_spread model (once-a-day)
UPDATE public.med_schedules
SET
  doses_per_day  = 1,
  day_window_end = COALESCE(window_end, '22:00')
WHERE is_active = TRUE
  AND archetype  = 'time_window'
  AND doses_per_day IS NULL;

-- 4. Auto-upgrade any remaining DAILY rows with no doses_per_day → 1x/day
UPDATE public.med_schedules
SET
  doses_per_day  = 1,
  day_window_end = '22:00'
WHERE is_active = TRUE
  AND doses_per_day IS NULL
  AND frequency_type IN ('DAILY', 'INTERVAL');
