-- Migration 014: Data Integrity Fixes
-- Covers: advisory locks, indexes, CHECK constraints, welcome bonus uniqueness, paymongo fix

-- ============================================
-- 1. Advisory lock helper function (p3-18)
-- ============================================

-- Atomic loyalty point operation with advisory lock.
-- Acquires a per-shop lock before reading/modifying the balance,
-- preventing race conditions in concurrent operations.
--
-- Usage:
--   SELECT loyalty_earn_points(
--     p_shop_id := 'uuid',
--     p_customer_id := 'uuid',
--     p_type := 'earned',
--     p_points := 5,
--     p_booking_id := 'uuid',
--     p_note := 'Earned from booking'
--   );
CREATE OR REPLACE FUNCTION loyalty_earn_points(
  p_shop_id        UUID,
  p_customer_id    UUID,
  p_type           VARCHAR(20),
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
  -- Advisory lock scoped to shop_id (hashtext to get bigint)
  PERFORM pg_advisory_lock(hashtext(p_shop_id::text));

  -- Calculate current balance using type-aware SUM
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

  -- Calculate new balance based on type
  IF p_type IN ('earned', 'welcome_bonus', 'adjusted') THEN
    v_balance_after := v_current_balance + p_points;
  ELSE
    -- 'redeemed', 'expired' — deduct
    v_balance_after := GREATEST(0, v_current_balance - p_points);
  END IF;

  -- Insert ledger entry
  INSERT INTO loyalty_points (
    shop_id, customer_id, booking_id, reward_id,
    type, points, balance_after, note, expires_at
  ) VALUES (
    p_shop_id, p_customer_id, p_booking_id, p_reward_id,
    p_type, p_points, v_balance_after, p_note, p_expires_at
  );

  PERFORM pg_advisory_unlock(hashtext(p_shop_id::text));

  RETURN v_balance_after;
END;
$$;

-- ============================================
-- 2. Welcome bonus uniqueness (p3-19)
-- ============================================

-- Prevents TOCTOU race: two concurrent bookings for the same customer
-- would both see "no welcome bonus" and insert duplicates.
-- The unique index makes the second insert fail with a duplicate key error.
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_points_welcome_bonus_unique
  ON loyalty_points (shop_id, customer_id)
  WHERE type = 'welcome_bonus';

-- ============================================
-- 3. Missing foreign key indexes (p3-20)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_bookings_service_id ON bookings (service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_reward_id ON bookings (reward_id);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_method_id ON bookings (payment_method_id);
CREATE INDEX IF NOT EXISTS idx_bookings_verified_by ON bookings (verified_by);
CREATE INDEX IF NOT EXISTS idx_bookings_cancelled_by ON bookings (cancelled_by);

CREATE INDEX IF NOT EXISTS idx_loyalty_points_booking_id ON loyalty_points (booking_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_reward_id ON loyalty_points (reward_id);

CREATE INDEX IF NOT EXISTS idx_reviews_booking_id ON reviews (booking_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews (customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_barber_id ON reviews (barber_id);
CREATE INDEX IF NOT EXISTS idx_reviews_replied_by ON reviews (replied_by);

CREATE INDEX IF NOT EXISTS idx_gallery_barber_id ON gallery (barber_id);
CREATE INDEX IF NOT EXISTS idx_gallery_service_id ON gallery (service_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_payment_verifications_reviewed_by ON payment_verifications (reviewed_by);

-- ============================================
-- 4. CHECK constraints (p3-21)
-- ============================================

ALTER TABLE services
  ADD CONSTRAINT chk_services_price_non_negative CHECK (price >= 0);

ALTER TABLE services
  ADD CONSTRAINT chk_services_duration_positive CHECK (duration_mins > 0);

ALTER TABLE products
  ADD CONSTRAINT chk_products_price_non_negative CHECK (price >= 0);

ALTER TABLE loyalty_points
  ADD CONSTRAINT chk_loyalty_points_nonzero CHECK (points != 0);

-- ============================================
-- 5. Fix booking payment_method CHECK for 'paymongo' (p3-23)
-- ============================================

-- Drop existing constraint and recreate with 'paymongo' included.
-- We use a DO block to handle the case where the constraint might
-- already include 'paymongo' (idempotent migration).
DO $$
DECLARE
  v_constraint_name TEXT;
  v_constraint_def TEXT;
BEGIN
  -- Find the existing payment_method CHECK constraint
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'bookings'::regclass
    AND contype = 'c'
    AND conname LIKE 'chk_bookings_payment_method%';

  IF v_constraint_name IS NOT NULL THEN
    -- Get the definition to check if 'paymongo' is already included
    SELECT pg_get_constraintdef(oid) INTO v_constraint_def
    FROM pg_constraint
    WHERE conname = v_constraint_name;

    -- Only update if 'paymongo' is not already in the constraint
    IF v_constraint_def NOT LIKE '%paymongo%' THEN
      EXECUTE FORMAT('ALTER TABLE bookings DROP CONSTRAINT %I', v_constraint_name);
      EXECUTE 'ALTER TABLE bookings ADD CONSTRAINT chk_bookings_payment_method_valid ' ||
              "CHECK" || "(payment_method IS NULL OR payment_method IN ('cod', 'gcash', 'bank_transfer', 'maya', 'paymongo'))";
    END IF;
  END IF;
END $$;
