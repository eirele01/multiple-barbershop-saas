-- Migration 021: upgrade_sessions → append-only history
--
-- Previously `UNIQUE (shop_id)` allowed only ONE session row per shop, so:
--   1. Every new checkout REPLACED the previous one (no real billing history)
--   2. Free-plan plan changes (downgrades) never recorded a row
--   3. A stale paid row for a failed activation lingered forever
--
-- Now:
--   - Multiple rows per shop (true history) — idempotency is keyed on the
--     PayMongo checkout session id instead.
--   - Free-plan changes append a row with status 'applied' (amount 0).
--   - latest-session lookups use (shop_id, created_at DESC).

ALTER TABLE public.upgrade_sessions DROP CONSTRAINT IF EXISTS upgrade_sessions_shop_id_key;

-- Keep idempotency keyed on the PayMongo checkout session (partial unique:
-- free-plan rows have NULL session id and are allowed to repeat).
CREATE UNIQUE INDEX IF NOT EXISTS upgrade_sessions_paymongo_session_id_key
  ON public.upgrade_sessions (paymongo_session_id)
  WHERE paymongo_session_id IS NOT NULL;

-- Shop lookup index for billing history (newest first)
CREATE INDEX IF NOT EXISTS idx_upgrade_sessions_shop_created
  ON public.upgrade_sessions (shop_id, created_at DESC);