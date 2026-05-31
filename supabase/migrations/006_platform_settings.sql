-- ============================================
-- Platform Settings Table
-- Key-value store for super admin configuration
-- ============================================

CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  updated_at timestamptz DEFAULT now()
);

-- Seed default values
INSERT INTO platform_settings (key, value) VALUES
  ('platform_name', 'BarberShop SaaS'),
  ('platform_url', 'https://yourdomain.com'),
  ('support_email', 'support@yourdomain.com'),
  ('upgraded_monthly_price', '499'),
  ('upgraded_yearly_price', '4990'),
  ('maintenance_mode', 'false'),
  ('maintenance_message', 'We are performing scheduled maintenance. We will be back shortly.')
ON CONFLICT (key) DO NOTHING;

-- RLS: Only super_admin can read/write platform_settings
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can read platform_settings"
  ON platform_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Super admin can insert platform_settings"
  ON platform_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Super admin can update platform_settings"
  ON platform_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_platform_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_settings_updated_at();
