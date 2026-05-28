-- ── Database Migration: Expand Event Types ────────────────────────────────────
-- Expands the type check constraint in public.baby_events to allow tummy_time and massage.

BEGIN;

-- 1. Drop the existing type check constraint
ALTER TABLE public.baby_events DROP CONSTRAINT IF EXISTS baby_events_type_check;

-- 2. Add the expanded type check constraint including tummy_time and massage
ALTER TABLE public.baby_events ADD CONSTRAINT baby_events_type_check CHECK (
  type IN ('top', 'mom_l', 'mom_r', 'diaper', 'medicine', 'spit_up', 'weight', 'tummy_time', 'massage')
);

COMMIT;
