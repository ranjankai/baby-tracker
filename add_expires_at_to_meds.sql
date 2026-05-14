-- Run this in Supabase Dashboard → SQL Editor

ALTER TABLE public.med_schedules 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Comment to track version
COMMENT ON COLUMN public.med_schedules.expires_at IS 'Optional expiration timestamp for limited-duration prescriptions';
