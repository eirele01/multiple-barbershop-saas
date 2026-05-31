-- ============================================
-- 005 Loyalty Balance RPC Function
--
-- Creates a PostgreSQL function that computes the
-- loyalty balance for a customer at a shop using
-- SUM(points) with type-aware direction.
--
-- This is the source of truth for balance calculation
-- — always correct regardless of insertion order
-- (race conditions, manual adjustments, cron jobs).
-- ============================================

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

-- Grant execute to the service role (used by server-side API)
GRANT EXECUTE ON FUNCTION get_customer_loyalty_balance(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_customer_loyalty_balance(UUID, UUID) TO authenticated;
