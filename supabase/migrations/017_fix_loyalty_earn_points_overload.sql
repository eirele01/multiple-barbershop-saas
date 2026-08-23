-- ═══════════════════════════════════════════════════════════
-- 017: Fix loyalty_earn_points function overloading (PGRST203)
--
-- Problem:
--   Two overloads of loyalty_earn_points exist that differ only in the
--   p_type parameter type (character varying vs text). PostgREST/Supabase
--   RPC cannot choose between them, failing with:
--   "Could not choose the best candidate function"
--
-- Fix:
--   Drop the character varying overload, keeping the text overload.
--   (PostgREST sends JSON strings which map to text, so the text variant
--    is the correct one to keep.)
--
-- Verify afterwards with:
--   SELECT proname, pg_get_function_arguments(oid)
--   FROM pg_proc WHERE proname = 'loyalty_earn_points';
--   → should return exactly ONE row.
-- ═══════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.loyalty_earn_points(
  p_shop_id uuid,
  p_customer_id uuid,
  p_type character varying,
  p_points integer,
  p_booking_id uuid,
  p_reward_id uuid,
  p_note text,
  p_expires_at timestamptz
);
