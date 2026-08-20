-- ============================================================================
-- 015: SCHEMA COMPLETION — CONSOLIDATED MIGRATION
-- ============================================================================
-- Purpose:
--   Closes every gap between the LIVE Supabase schema and what the application
--   code expects, so the customer flow (booking create, payments, loyalty, email)
--   actually works. Safe to run more than once (idempotent).
--
--   This single file bundles the important pieces of migrations 002, 005, 008,
--   009, 004, 012, 013, 014 plus critical FIXES that the earlier files did NOT
--   cover:
--
--   1. booking_ref auto-generation TRIGGER          (required by POST /api/bookings/create)
--   2. Enum-typed COLUMNS converted to TEXT so the app's string values are accepted
--      (bookings.status, bookings.payment_status, bookings.payment_type,
--       bookings.payment_method, loyalty_points.type, loyalty_rewards.type,
--       payment_verifications.status, activity_logs.action)
--   3. Missing columns: loyalty_points.expired
--   4. Nullable fixes: activity_logs.user_id, payment_verifications.payment_method_id + customer_id
--   5. RPC functions: get_customer_loyalty_balance, loyalty_earn_points, get_my_shop_id, get_my_role
--   6. Correct bookings.payment_method CHECK constraint (all values the app writes)
--   7. platform_settings email seed rows (Resend platform config)
--   8. Performance indexes
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste this file → Run.
--   (This path is required because direct Postgres port 5432 is not reachable
--    from the dev machine; the SQL Editor runs inside Supabase's network.)
-- ============================================================================


-- ============================================================================
-- PART 0 — SAFETY: idempotent schema corrections
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0.1 Convert enum-typed columns to TEXT where the app writes plain-text
--     values that are NOT members of the enum.
--
--     Guarded: only alters the column when its type is a Postgres ENUM.
--     Existing data is preserved (each enum label becomes its text string).
-- ----------------------------------------------------------------------------

-- bookings.status (booking_status enum is missing 'pending_payment')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'bookings'::regclass AND a.attname = 'status' AND t.typtype = 'e'
  ) THEN
    ALTER TABLE bookings ALTER COLUMN status SET DATA TYPE text;
  END IF;
END $$;

-- bookings.payment_status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'bookings'::regclass AND a.attname = 'payment_status' AND t.typtype = 'e'
  ) THEN
    ALTER TABLE bookings ALTER COLUMN payment_status SET DATA TYPE text;
  END IF;
END $$;

-- bookings.payment_type (enum lacks 'manual'/'paymongo' written by the app)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'bookings'::regclass AND a.attname = 'payment_type' AND t.typtype = 'e'
  ) THEN
    ALTER TABLE bookings ALTER COLUMN payment_type SET DATA TYPE text;
  END IF;
END $$;

-- bookings.payment_method (app writes 'gcash_paymongo','maya_paymongo','instapay','qrph', NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'bookings'::regclass AND a.attname = 'payment_method' AND t.typtype = 'e'
  ) THEN
    ALTER TABLE bookings ALTER COLUMN payment_method SET DATA TYPE text;
  END IF;
END $$;

-- loyalty_points.type (app writes 'earned'|'welcome_bonus'|'adjusted'|'redeemed'|'expired')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'loyalty_points'::regclass AND a.attname = 'type' AND t.typtype = 'e'
  ) THEN
    ALTER TABLE loyalty_points ALTER COLUMN type SET DATA TYPE text;
  END IF;
END $$;

-- loyalty_rewards.type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'loyalty_rewards'::regclass AND a.attname = 'type' AND t.typtype = 'e'
  ) THEN
    ALTER TABLE loyalty_rewards ALTER COLUMN type SET DATA TYPE text;
  END IF;
END $$;

-- payment_verifications.status (app writes 'pending','verified','rejected','more_info')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'payment_verifications'::regclass AND a.attname = 'status' AND t.typtype = 'e'
  ) THEN
    ALTER TABLE payment_verifications ALTER COLUMN status SET DATA TYPE text;
  END IF;
END $$;

-- activity_logs.action (app writes e.g. 'booking.created','payment.paymongo_paid')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'activity_logs'::regclass AND a.attname = 'action' AND t.typtype = 'e'
  ) THEN
    ALTER TABLE activity_logs ALTER COLUMN action SET DATA TYPE text;
  END IF;
END $$;
-- ----------------------------------------------------------------------------
-- 0.2 MISSING COLUMNS
-- ----------------------------------------------------------------------------

-- loyalty_points.expired — used by utils/server/loyaltyEngine.ts
--   expireOldPoints() filters `.is('expired', null)`. Column may not exist.
ALTER TABLE loyalty_points
  ADD COLUMN IF NOT EXISTS expired BOOLEAN DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- 0.3 NULLABILITY FIXES — the app writes NULL for system / guest context-less rows.
--
--   NOTE: The live activity_logs table may be MISSING user_id entirely (the app
--   ships a manual "ALTER TABLE activity_logs ALTER COLUMN user_id DROP NOT NULL"
--   fix-up in server/api/admin/migration-status.get.ts), so each statement first
--   ensures the column EXISTS before touching NOT NULL. Safe to re-run.
-- ----------------------------------------------------------------------------

-- activity_logs.user_id — system-generated events write user_id = NULL.
--   ADD COLUMN IF NOT EXISTS first so we never fail on a missing column.
ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE activity_logs
  ALTER COLUMN user_id DROP NOT NULL;

-- payment_verifications.payment_method_id — PayMongo entries store NULL here.
ALTER TABLE payment_verifications
  ADD COLUMN IF NOT EXISTS payment_method_id UUID;
ALTER TABLE payment_verifications
  ALTER COLUMN payment_method_id DROP NOT NULL;

-- payment_verifications.customer_id — guest/manual payments store NULL customer.
ALTER TABLE payment_verifications
  ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE payment_verifications
  ALTER COLUMN customer_id DROP NOT NULL;
-- ============================================================================
-- PART 1 — BOOKING_REF AUTO-GENERATION TRIGGER
-- (required so POST /api/bookings/create works — the app does not send booking_ref)
-- ============================================================================

-- Canonical pattern: a single trigger function that guards the NULL case itself
-- and assigns the *text* booking_ref directly into NEW. This avoids the bug in
-- 002's `set_booking_ref()` wrapper, which did `NEW.booking_ref := generate_booking_ref()`
-- while generate_booking_ref() returns TRIGGER (a record) -> would raise
-- "cannot cast type record to text" and abort every booking insert (the app
-- never sends booking_ref, so it relies entirely on this trigger).
CREATE OR REPLACE FUNCTION generate_booking_ref()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  year_str TEXT := TO_CHAR(NOW(), 'YYYY');
  seq_num  INT;
BEGIN
  IF NEW.booking_ref IS NULL THEN
    SELECT COUNT(*) + 1 INTO seq_num
    FROM bookings
    WHERE shop_id = NEW.shop_id
      AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
    NEW.booking_ref := 'BK-' || year_str || '-' || LPAD(seq_num::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END
$$;

-- Remove any pre-existing trigger (covers 002's trg_set_booking_ref and any
-- alternate name in 013) so the corrected function is what actually fires.
DROP TRIGGER IF EXISTS trg_set_booking_ref ON bookings;
DROP TRIGGER IF EXISTS trg_generate_booking_ref ON bookings;

CREATE TRIGGER trg_set_booking_ref
  BEFORE INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION generate_booking_ref();

COMMENT ON TRIGGER trg_set_booking_ref ON bookings IS
  'Auto-fills bookings.booking_ref = BK-YYYY-XXXXXX before insert (no-op if already set)';


-- ============================================================================
-- PART 2 — RPC / HELPER FUNCTIONS used by the app
-- ============================================================================

-- 2.1 Loyalty balance (type-aware SUM). Source of truth for balance.
CREATE OR REPLACE FUNCTION get_customer_loyalty_balance(
  p_shop_id UUID,
  p_customer_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT COALESCE(
    SUM(
      CASE
        WHEN type IN ('earned', 'welcome_bonus', 'adjusted') THEN points
        WHEN type IN ('redeemed', 'expired') THEN -points
        ELSE 0
      END
    ),
    0
  ) INTO v_balance
  FROM loyalty_points
  WHERE shop_id = p_shop_id
    AND customer_id = p_customer_id;

  RETURN GREATEST(v_balance, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_loyalty_balance(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_customer_loyalty_balance(UUID, UUID) TO authenticated;

-- 2.2 Atomic loyalty earn/redeem with advisory lock (prevents race conditions)
CREATE OR REPLACE FUNCTION loyalty_earn_points(
  p_shop_id        UUID,
  p_customer_id    UUID,
  p_type           text,
  p_points         INT,
  p_booking_id     UUID DEFAULT NULL,
  p_reward_id      UUID DEFAULT NULL,
  p_note           TEXT   DEFAULT NULL,
  p_expires_at     TIMESTAMPTZ DEFAULT NULL
)
RETURNS INT  -- returns balance_after
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_balance  INT;
  v_balance_after    INT;
BEGIN
  PERFORM pg_advisory_lock(hashtext(p_shop_id::text));

  SELECT COALESCE(
    SUM(
      CASE
        WHEN type IN ('earned', 'welcome_bonus', 'adjusted') THEN points
        WHEN type IN ('redeemed', 'expired') THEN -points
        ELSE 0
      END
    ), 0
  ) INTO v_current_balance
  FROM loyalty_points
  WHERE shop_id = p_shop_id
    AND customer_id = p_customer_id;

  IF p_type IN ('earned', 'welcome_bonus', 'adjusted') THEN
    v_balance_after := v_current_balance + p_points;
  ELSE
    v_balance_after := GREATEST(0, v_current_balance - p_points);
  END IF;

  INSERT INTO loyalty_points (
    shop_id, customer_id, booking_id, reward_id,
    type, points, balance_after, note, expires_at, expired
  ) VALUES (
    p_shop_id, p_customer_id, p_booking_id, p_reward_id,
    p_type, p_points, v_balance_after, p_note, p_expires_at, NULL
  );

  PERFORM pg_advisory_unlock(hashtext(p_shop_id::text));
  RETURN v_balance_after;
END;
$$;

GRANT EXECUTE ON FUNCTION loyalty_earn_points(UUID, UUID, text, INT, UUID, UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION loyalty_earn_points(UUID, UUID, text, INT, UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;

-- 2.3 RLS helper functions used by policies (SECURITY DEFINER bypasses recursion)
CREATE OR REPLACE FUNCTION public.get_my_shop_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT shop_id FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- ===========================================================================
-- Part 3 - CORRECT bookings.payment_method CHECK constraint
-- ----------------------------------------------------------------------------
-- The app writes these payment_method values (see bookings/create.post.ts +
-- the PayMongo edge function), none of which can be rejected by a restrictive
-- CHECK:
--    'cod','gcash','maya','bank_transfer','insta'   -- wizard method selections
--    'gcash_paymongo','maya_paymongo'                -- PayMongo wallet links
--    'instapay','qrph'                               -- PayMongo bank rails
--    'paymongo'                                      -- generic PayMongo
--    NULL                                            -- loyalty redemptions
--
-- Earlier migrations shipped a narrower CHECK that would REJECT 'insta',
-- 'gcash_paymongo','maya_paymongo','instapay','qrph'. This step drops every
-- pre-existing payment_method CHECK on bookings and installs a single correct
-- one. Safe + idempotent: the drop is guarded by an existence test and the
-- add recreates a uniquely-named constraint (dropped first if it already exists
-- on a re-run).
-- ===========================================================================
DO $$
DECLARE
  conname text;
BEGIN
  FOR conname IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'bookings'::regclass
      AND c.contype = 'c'
      AND c.conname ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS %I', conname);
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND contype = 'c'
      AND conname = 'chk_bookings_payment_method_valid'
  ) THEN
    ALTER TABLE bookings DROP CONSTRAINT chk_bookings_payment_method_valid;
  END IF;

  ALTER TABLE bookings
  ADD CONSTRAINT chk_bookings_payment_method_valid
  CHECK (
    payment_method IS NULL
    OR payment_method IN (
      'cod',
      'gcash',
      'maya',
      'bank_transfer',
      'insta',
      'gcash_paymongo',
      'maya_paymongo',
      'instapay',
      'qrph',
      'paymongo'
    )
  );
END
$$;


-- ===========================================================================
-- Part 4 - platform_settings seed (Resend transactional-email config)
-- ----------------------------------------------------------------------------
-- Supabase functions send-reminders / customer-notifications read these at
-- runtime via `supabase.from('platform_settings').select('value').eq('key', ...)`.
-- The platform_settings table created in 013 has ONLY (key, value) columns.
-- INSERT ... ON CONFLICT makes this safe to re-run (idempotent).
-- ===========================================================================
INSERT INTO platform_settings (key, value)
VALUES
  ('platform_resend_api_key', ''),
  ('platform_sender_email',    'notifications@reservationph.com'),
  ('platform_sender_name',     'BarberShop SaaS')
ON CONFLICT (key) DO NOTHING;


-- ===========================================================================
-- Part 5 - Performance indexes (consolidated; IF NOT EXISTS => idempotent)
-- ===========================================================================
-- bookings
CREATE INDEX IF NOT EXISTS idx_bookings_shop_status        ON bookings (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer           ON bookings (customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_barber_time        ON bookings (barber_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status     ON bookings (payment_method, payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_shop       ON bookings (shop_id, created_at DESC);

-- scheduling / availability scan window
CREATE INDEX IF NOT EXISTS idx_bookings_availability
  ON bookings (shop_id, barber_id, start_time, end_time)
  WHERE status IN ('pending', 'pending_payment', 'confirmed', 'in_progress');

-- loyalty_points
CREATE INDEX IF NOT EXISTS idx_loyalty_points_user_shop    ON loyalty_points (customer_id, shop_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_booking      ON loyalty_points (booking_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_expiry
  ON loyalty_points (shop_id, expires_at)
  WHERE (expired IS NULL OR expired = false);

-- loyalty_rewards
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_shop        ON loyalty_rewards (shop_id);

-- payment_verifications
CREATE INDEX IF NOT EXISTS idx_payment_verifications_booking ON payment_verifications (booking_id);

-- reviews
CREATE INDEX IF NOT EXISTS idx_reviews_shop                ON reviews (shop_id);
CREATE INDEX IF NOT EXISTS idx_reviews_booking             ON reviews (booking_id);

-- missing FK index per audit 3.1 (guarded: created only if the column exists,
-- which Part 0.3 guarantees, but kept defensive because of the divergent live DDL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'activity_logs'::regclass AND attname = 'user_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs (user_id)';
  END IF;
END $$;

COMMENT ON TABLE loyalty_points IS 'Points ledger for customers: earned/welcome_bonus/adjusted (+) , redeemed/expired (-)';
