-- Migration: Fix RLS blocking booking_ref_counters trigger inserts
-- Problem: booking_ref_counters was created with RLS enabled (project default
--   for new tables) but no policies, so the generate_booking_ref() trigger's
--   INSERT ... ON CONFLICT was rejected with "new row violates row-level
--   security policy for table booking_ref_counters", which in turn blocked
--   every booking creation.
-- Fix: This table is internal bookkeeping only — no client ever queries it
--   directly — so RLS is the wrong tool here. Disable RLS on the table, and
--   additionally mark the trigger function SECURITY DEFINER so it always
--   runs with elevated privileges regardless of caller, as defense-in-depth
--   in case RLS is re-enabled on this table later (e.g. by an automated
--   linter).

-- ============================================================
-- UP
-- ============================================================

-- 1. Disable RLS on the internal counter table.
ALTER TABLE booking_ref_counters DISABLE ROW LEVEL SECURITY;

-- 2. Make the trigger function SECURITY DEFINER so it runs with the
--    privileges of its owner, bypassing RLS for its own operations
--    regardless of which role triggered the insert on `bookings`.
CREATE OR REPLACE FUNCTION public.generate_booking_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  year_int INT := EXTRACT(YEAR FROM NOW())::INT;
  year_str TEXT := year_int::TEXT;
  seq_num  INT;
BEGIN
  IF NEW.booking_ref IS NULL THEN
    INSERT INTO booking_ref_counters (shop_id, year, last_seq)
    VALUES (NEW.shop_id, year_int, 1)
    ON CONFLICT (shop_id, year)
    DO UPDATE SET last_seq = booking_ref_counters.last_seq + 1
    RETURNING last_seq INTO seq_num;

    NEW.booking_ref := 'BK-' || year_str || '-' || LPAD(seq_num::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END
$function$;


-- ============================================================
-- DOWN (rollback)
-- ============================================================
-- ALTER TABLE booking_ref_counters ENABLE ROW LEVEL SECURITY;
--
-- CREATE OR REPLACE FUNCTION public.generate_booking_ref()
--  RETURNS trigger
--  LANGUAGE plpgsql
-- AS $function$
-- DECLARE
--   year_int INT := EXTRACT(YEAR FROM NOW())::INT;
--   year_str TEXT := year_int::TEXT;
--   seq_num  INT;
-- BEGIN
--   IF NEW.booking_ref IS NULL THEN
--     INSERT INTO booking_ref_counters (shop_id, year, last_seq)
--     VALUES (NEW.shop_id, year_int, 1)
--     ON CONFLICT (shop_id, year)
--     DO UPDATE SET last_seq = booking_ref_counters.last_seq + 1
--     RETURNING last_seq INTO seq_num;
--
--     NEW.booking_ref := 'BK-' || year_str || '-' || LPAD(seq_num::TEXT, 6, '0');
--   END IF;
--   RETURN NEW;
-- END
-- $function$;