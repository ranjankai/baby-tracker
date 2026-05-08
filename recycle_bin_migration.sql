-- Run this in Supabase Dashboard → SQL Editor

-- 1. Create the Recycle Bin table mirroring baby_events
-- This uses INCLUDING ALL to get constraints and defaults
CREATE TABLE IF NOT EXISTS public.deleted_baby_events (
    id         BIGINT PRIMARY KEY,
    start_time TIMESTAMPTZ NOT NULL,
    end_time   TIMESTAMPTZ,
    type       TEXT NOT NULL,
    amount_ml  NUMERIC,
    pee_amount  TEXT,
    poop_amount TEXT,
    is_diaper_free BOOLEAN,
    notes      TEXT,
    intensity  TEXT,
    total_paused_ms BIGINT,
    deleted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Trigger function to enforce 10-row limit
-- Keeps only the 10 most recently deleted items
CREATE OR REPLACE FUNCTION enforce_deleted_baby_events_limit()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.deleted_baby_events
  WHERE id NOT IN (
    SELECT id FROM public.deleted_baby_events
    ORDER BY deleted_at DESC
    LIMIT 10
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger
DROP TRIGGER IF EXISTS limit_deleted_baby_events ON public.deleted_baby_events;
CREATE TRIGGER limit_deleted_baby_events
AFTER INSERT ON public.deleted_baby_events
FOR EACH ROW EXECUTE FUNCTION enforce_deleted_baby_events_limit();

-- 4. RPC for Move to Trash
-- This is atomic: inserts into trash then deletes from source
CREATE OR REPLACE FUNCTION move_to_trash(target_id BIGINT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.deleted_baby_events (id, start_time, end_time, type, amount_ml, pee_amount, poop_amount, is_diaper_free, notes, intensity, total_paused_ms)
  SELECT id, start_time, end_time, type, amount_ml, pee_amount, poop_amount, is_diaper_free, notes, intensity, total_paused_ms 
  FROM public.baby_events WHERE id = target_id;
  
  DELETE FROM public.baby_events WHERE id = target_id;
END;
$$ LANGUAGE plpgsql;

-- 5. RPC for Restore from Trash
-- This is atomic: inserts back into source then deletes from trash
CREATE OR REPLACE FUNCTION restore_from_trash(target_id BIGINT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.baby_events (id, start_time, end_time, type, amount_ml, pee_amount, poop_amount, is_diaper_free, notes, intensity, total_paused_ms)
  SELECT id, start_time, end_time, type, amount_ml, pee_amount, poop_amount, is_diaper_free, notes, intensity, total_paused_ms 
  FROM public.deleted_baby_events WHERE id = target_id;
  
  DELETE FROM public.deleted_baby_events WHERE id = target_id;
END;
$$ LANGUAGE plpgsql;

-- 6. RLS and Realtime
ALTER TABLE public.deleted_baby_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for all users" ON public.deleted_baby_events;
CREATE POLICY "Enable all for all users" ON public.deleted_baby_events FOR ALL USING (true) WITH CHECK (true);

-- Add to publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.deleted_baby_events;
