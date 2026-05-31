-- ============================================
-- 002: Booking Reference Auto-Generation Trigger
-- ============================================
-- Creates/updates the trigger that auto-generates
-- booking_ref in format: BK-YYYY-XXXXXX
-- (year + 6-digit zero-padded sequence per shop)
--
-- Uses CREATE OR REPLACE so it's safe to re-run.
-- ============================================

CREATE OR REPLACE FUNCTION generate_booking_ref()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT := TO_CHAR(NOW(), 'YYYY');
  seq_num  INT;
BEGIN
  SELECT COUNT(*) + 1 INTO seq_num
  FROM bookings
  WHERE shop_id = NEW.shop_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.booking_ref := 'BK-' || year_str || '-' || LPAD(seq_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_booking_ref()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booking_ref IS NULL THEN
    NEW.booking_ref := generate_booking_ref();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then recreate
DROP TRIGGER IF EXISTS trg_set_booking_ref ON bookings;

CREATE TRIGGER trg_set_booking_ref
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_booking_ref();
