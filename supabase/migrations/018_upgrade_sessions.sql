-- Migration 018: Upgrade Sessions Table
-- Tracks PayMongo checkout sessions created for plan upgrades.
-- The webhook uses metadata.shop_id to upgrade the plan, so this table
-- is for record-keeping/auditing only (non-fatal if it doesn't exist yet).

CREATE TABLE IF NOT EXISTS upgrade_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  paymongo_session_id TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',   -- pending | paid | failed | expired
  amount            BIGINT NOT NULL DEFAULT 0,          -- in centavos
  currency          TEXT NOT NULL DEFAULT 'PHP',
  from_plan         TEXT NOT NULL DEFAULT 'basic',
  to_plan           TEXT NOT NULL DEFAULT 'upgraded',
  billing_interval  TEXT NOT NULL DEFAULT 'monthly',   -- monthly | yearly
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id)
);

-- Index for webhook lookups by PayMongo session id
CREATE INDEX IF NOT EXISTS idx_upgrade_sessions_paymongo_session
  ON upgrade_sessions (paymongo_session_id);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at_upgrade_sessions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_upgrade_sessions_updated_at ON upgrade_sessions;
CREATE TRIGGER trg_upgrade_sessions_updated_at
  BEFORE UPDATE ON upgrade_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_upgrade_sessions();

-- RLS: only service role should manage these (no public/anonymous access)
ALTER TABLE upgrade_sessions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated shop admins to read their own shop's upgrade sessions
CREATE POLICY "upgrade_sessions_admin_read"
  ON upgrade_sessions
  FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM users WHERE id = auth.uid()
    )
  );