-- Phase 1: Medicine schema upgrade
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE public.med_schedules
  ADD COLUMN IF NOT EXISTS frequency_type         TEXT DEFAULT 'DAILY',
  ADD COLUMN IF NOT EXISTS specific_days          JSONB,
  ADD COLUMN IF NOT EXISTS preferred_times        JSONB,
  ADD COLUMN IF NOT EXISTS max_doses_per_24h      NUMERIC,
  ADD COLUMN IF NOT EXISTS min_hours_between_doses NUMERIC,
  ADD COLUMN IF NOT EXISTS is_tapering_regimen    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS taper_steps            JSONB;

-- Backfill frequency_type for existing rows
UPDATE public.med_schedules
SET frequency_type = CASE
  WHEN archetype = 'interval'    THEN 'INTERVAL'
  WHEN archetype = 'time_window' THEN 'DAILY'
  ELSE 'DAILY'
END
WHERE frequency_type IS NULL OR frequency_type = 'DAILY';
