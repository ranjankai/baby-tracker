-- Phase 2: Smart scheduling upgrade
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE public.med_schedules
  ADD COLUMN IF NOT EXISTS doses_per_day    NUMERIC,
  ADD COLUMN IF NOT EXISTS day_window_end   TEXT DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS suggested_times  JSONB;
