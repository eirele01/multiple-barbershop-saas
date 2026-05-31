-- ============================================
-- BARBERSHOP SAAS — COMPLETE DATABASE SCHEMA
-- Supabase / PostgreSQL with Row Level Security
-- Based on Section 7 of the Blueprint
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 7.2 SHOPS TABLE (created first — referenced by users.shop_id)
-- ============================================
CREATE TABLE IF NOT EXISTS shops (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT,
  logo_url              TEXT,
  cover_image_url       TEXT,
  owner_id              UUID,

  -- Subscription
  plan                  TEXT DEFAULT 'basic' CHECK (plan IN ('basic','upgraded')),
  plan_status           TEXT DEFAULT 'active' CHECK (plan_status IN ('active','inactive','trial')),
  plan_start_date       TIMESTAMPTZ,
  plan_end_date         TIMESTAMPTZ,

  -- Contact
  email                 TEXT,
  phone                 TEXT,
  address_street        TEXT,
  address_city          TEXT,
  address_state         TEXT,
  address_zip           TEXT,
  address_country       TEXT DEFAULT 'PH',
  latitude              NUMERIC,
  longitude             NUMERIC,

  -- Social Links
  facebook_url          TEXT,
  instagram_url         TEXT,
  tiktok_url            TEXT,

  -- Theme
  primary_color         TEXT DEFAULT '#8A8A8F',
  accent_color          TEXT DEFAULT '#1D1D1F',
  font_family           TEXT DEFAULT 'Inter',

  -- Booking Settings
  booking_settings      JSONB DEFAULT '{
    "slot_duration": 30,
    "buffer_time": 0,
    "max_advance_days": 30,
    "cancellation_hours": 24,
    "require_deposit": false,
    "deposit_percentage": 0
  }'::jsonb,

  -- Working Hours
  working_hours         JSONB DEFAULT '[]'::jsonb,

  -- Timezone (defaults to Philippines timezone)
  timezone              TEXT DEFAULT 'Asia/Manila',

  -- Payment Settings (UPGRADED plan only)
  paymongo_enabled      BOOLEAN DEFAULT false,
  manual_payment_enabled BOOLEAN DEFAULT true,
  paymongo_public_key   TEXT,
  paymongo_secret_key   TEXT,
  gcash_enabled         BOOLEAN DEFAULT true,
  maya_enabled          BOOLEAN DEFAULT true,
  instapay_enabled      BOOLEAN DEFAULT true,
  qr_ph_enabled         BOOLEAN DEFAULT true,

  -- Email Settings (UPGRADED plan only)
  resend_api_key        TEXT,
  sender_email          TEXT,
  sender_name           TEXT,
  email_confirmation    BOOLEAN DEFAULT true,
  email_reminder        BOOLEAN DEFAULT true,
  reminder_hours        JSONB DEFAULT '[24, 2]'::jsonb,

  -- Loyalty Settings (UPGRADED plan only)
  loyalty_enabled       BOOLEAN DEFAULT false,
  loyalty_earn_rate     INTEGER DEFAULT 1,
  loyalty_earn_base     INTEGER DEFAULT 100,
  loyalty_welcome_bonus INTEGER DEFAULT 50,
  loyalty_expiry_months INTEGER DEFAULT 12,
  loyalty_tiers_enabled BOOLEAN DEFAULT false,
  loyalty_tiers         JSONB DEFAULT '{
    "bronze":   { "min": 0,    "max": 499,  "multiplier": 1.0 },
    "silver":   { "min": 500,  "max": 1499, "multiplier": 1.2 },
    "gold":     { "min": 1500, "max": 2999, "multiplier": 1.5 },
    "platinum": { "min": 3000, "max": null, "multiplier": 2.0 }
  }'::jsonb,

  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.1 USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  display_name    TEXT NOT NULL,
  phone_number    TEXT,
  photo_url       TEXT,
  role            TEXT CHECK (role IN ('super_admin','admin','manager','cashier','barber','customer')) NOT NULL,
  shop_id         UUID REFERENCES shops(id) ON DELETE SET NULL,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);

-- Add FK for shops.owner_id now that users table exists
ALTER TABLE shops ADD CONSTRAINT fk_shops_owner_id
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================
-- 7.3 PAYMENT_METHODS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT CHECK (type IN ('qr_code','bank_account','e_wallet')) NOT NULL,
  qr_code_url     TEXT,
  account_name    TEXT,
  account_number  TEXT,
  bank_name       TEXT,
  instructions    TEXT,
  is_active       BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.4 SERVICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT CHECK (category IN ('haircut','beard','shave','treatment','package','other')),
  duration_mins   INTEGER NOT NULL,
  price           NUMERIC(10,2) NOT NULL,
  deposit_amount  NUMERIC(10,2) DEFAULT 0,
  image_url       TEXT,
  barber_ids      UUID[],
  is_active       BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.5 BARBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS barbers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  shop_id         UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  bio             TEXT,
  specialties     TEXT[],
  experience_yrs  INTEGER,
  portfolio_urls  TEXT[],
  schedule        JSONB DEFAULT '{}'::jsonb,
  time_off        JSONB DEFAULT '[]'::jsonb,
  rating          NUMERIC(3,2) DEFAULT 0,
  total_reviews   INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  is_available    BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.6 PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  category            TEXT,
  price               NUMERIC(10,2) NOT NULL,
  cost_price          NUMERIC(10,2),
  sku                 TEXT,
  barcode             TEXT,
  image_url           TEXT,
  image_urls          TEXT[],
  stock               INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.7 GALLERY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS gallery (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  url         TEXT NOT NULL,
  thumbnail_url TEXT,
  caption     TEXT,
  category    TEXT,
  tags        TEXT[],
  barber_id   UUID REFERENCES barbers(id) ON DELETE SET NULL,
  service_id  UUID REFERENCES services(id) ON DELETE SET NULL,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.8 BOOKINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref         TEXT UNIQUE NOT NULL,
  shop_id             UUID REFERENCES shops(id) NOT NULL,
  customer_id         UUID REFERENCES users(id),
  barber_id           UUID REFERENCES barbers(id),
  service_id          UUID REFERENCES services(id),

  service_name        TEXT NOT NULL,
  service_price       NUMERIC(10,2) NOT NULL,
  service_duration    INTEGER NOT NULL,

  date                DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,

  status              TEXT DEFAULT 'pending' CHECK (status IN (
    'pending','pending_payment','confirmed','in_progress','completed','cancelled','no_show'
  )),

  payment_method      TEXT CHECK (payment_method IN (
    'gcash_manual','maya_manual','bank_transfer',
    'gcash_paymongo','maya_paymongo','instapay','qrph'
  )),
  payment_type        TEXT CHECK (payment_type IN ('manual','paymongo')),
  payment_status      TEXT DEFAULT 'pending' CHECK (payment_status IN (
    'pending','pending_verification','paid','verified','rejected','refunded','failed'
  )),
  payment_amount      NUMERIC(10,2),
  payment_method_id   UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  proof_image_url     TEXT,
  reference_number    TEXT,
  paymongo_payment_id TEXT,
  verified_by         UUID REFERENCES users(id) NULL,
  verified_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  paid_at             TIMESTAMPTZ,

  points_earned       INTEGER DEFAULT 0,
  points_redeemed     INTEGER DEFAULT 0,
  reward_id           UUID NULL,
  discount_applied    NUMERIC(10,2) DEFAULT 0,

  customer_notes      TEXT,
  internal_notes      TEXT,
  reminder_sent       BOOLEAN DEFAULT false,
  confirmation_sent   BOOLEAN DEFAULT false,
  cancellation_reason TEXT,
  cancelled_by        UUID REFERENCES users(id) NULL,
  cancelled_at        TIMESTAMPTZ,

  rating              INTEGER CHECK (rating BETWEEN 1 AND 5) NULL,
  review              TEXT,
  reviewed_at         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.9 PAYMENT_VERIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payment_verifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID REFERENCES shops(id) NOT NULL,
  booking_id          UUID REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
  customer_id         UUID REFERENCES users(id) NOT NULL,
  payment_method_id   UUID REFERENCES payment_methods(id) NOT NULL,
  amount              NUMERIC(10,2),
  proof_image_url     TEXT NOT NULL,
  reference_number    TEXT,

  status              TEXT DEFAULT 'pending' CHECK (status IN (
    'pending','verified','rejected','more_info'
  )),

  reviewed_by         UUID REFERENCES users(id) NULL,
  reviewed_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  info_request_msg    TEXT,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.10 LOYALTY_REWARDS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  type                TEXT CHECK (type IN ('discount_fixed','discount_percent','free_service','free_product')) NOT NULL,
  points_required     INTEGER NOT NULL,
  discount_value      NUMERIC(10,2),
  discount_percent    INTEGER,
  service_id          UUID REFERENCES services(id) ON DELETE SET NULL,
  product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
  max_value           NUMERIC(10,2),
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.11 LOYALTY_POINTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_points (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID REFERENCES shops(id) NOT NULL,
  customer_id     UUID REFERENCES users(id) NOT NULL,
  booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
  reward_id       UUID REFERENCES loyalty_rewards(id) ON DELETE SET NULL,

  type            TEXT CHECK (type IN ('earned','redeemed','adjusted','expired','welcome_bonus')) NOT NULL,
  points          INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  note            TEXT,

  expires_at      TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.12 ACTIVITY_LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID REFERENCES shops(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) NOT NULL,
  user_email      TEXT,
  user_role       TEXT,
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  entity_name     TEXT,
  old_value       JSONB,
  new_value       JSONB,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7.13 REVIEWS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID REFERENCES shops(id) NOT NULL,
  booking_id      UUID REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
  customer_id     UUID REFERENCES users(id) NOT NULL,
  barber_id       UUID REFERENCES barbers(id) NOT NULL,
  service_id      UUID REFERENCES services(id) NOT NULL,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  is_public       BOOLEAN DEFAULT true,
  reply_message   TEXT,
  replied_by      UUID REFERENCES users(id) NULL,
  replied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_shop_id ON users(shop_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug);
CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_plan ON shops(plan);
CREATE INDEX IF NOT EXISTS idx_payment_methods_shop_id ON payment_methods(shop_id);
CREATE INDEX IF NOT EXISTS idx_services_shop_id ON services(shop_id);
CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active);
CREATE INDEX IF NOT EXISTS idx_barbers_shop_id ON barbers(shop_id);
CREATE INDEX IF NOT EXISTS idx_barbers_user_id ON barbers(user_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_gallery_shop_id ON gallery(shop_id);
CREATE INDEX IF NOT EXISTS idx_bookings_shop_id ON bookings(shop_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_barber_id ON bookings(barber_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_ref ON bookings(booking_ref);
CREATE INDEX IF NOT EXISTS idx_payment_verifications_shop_id ON payment_verifications(shop_id);
CREATE INDEX IF NOT EXISTS idx_payment_verifications_status ON payment_verifications(status);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_shop_id ON loyalty_rewards(shop_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_shop_id ON loyalty_points(shop_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_customer_id ON loyalty_points(customer_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_shop_id ON activity_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_shop_id ON reviews(shop_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- USERS policies
CREATE POLICY "Users can read own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Shop staff can read shop users" ON users FOR SELECT USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Super admin reads all users" ON users FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- SHOPS policies
CREATE POLICY "Public reads active shops" ON shops FOR SELECT USING (is_active = true);
CREATE POLICY "Shop staff reads own shop" ON shops FOR SELECT USING (id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Admin updates own shop" ON shops FOR UPDATE USING (owner_id = auth.uid() OR (id IN (SELECT shop_id FROM users WHERE id = auth.uid() AND role IN ('admin','manager'))) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- PAYMENT_METHODS policies
CREATE POLICY "Shop reads payment_methods" ON payment_methods FOR SELECT USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') OR is_active = true);
CREATE POLICY "Shop manages payment_methods" ON payment_methods FOR ALL USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid() AND role IN ('admin','manager')) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- SERVICES policies
CREATE POLICY "Shop reads services" ON services FOR SELECT USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') OR is_active = true);
CREATE POLICY "Shop manages services" ON services FOR ALL USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid() AND role IN ('admin','manager')) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- BARBERS policies
CREATE POLICY "Shop reads barbers" ON barbers FOR SELECT USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') OR is_active = true);
CREATE POLICY "Shop manages barbers" ON barbers FOR ALL USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid() AND role IN ('admin','manager')) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- PRODUCTS policies
CREATE POLICY "Shop reads products" ON products FOR SELECT USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') OR is_active = true);
CREATE POLICY "Shop manages products" ON products FOR ALL USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid() AND role IN ('admin','manager','cashier')) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- GALLERY policies
CREATE POLICY "Shop reads gallery" ON gallery FOR SELECT USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') OR is_active = true);
CREATE POLICY "Shop manages gallery" ON gallery FOR ALL USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid() AND role IN ('admin','manager')) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- BOOKINGS policies
CREATE POLICY "Shop reads bookings" ON bookings FOR SELECT USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR customer_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Shop manages bookings" ON bookings FOR ALL USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid() AND role IN ('admin','manager','cashier','barber')) OR customer_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- PAYMENT_VERIFICATIONS policies
CREATE POLICY "Shop reads verifications" ON payment_verifications FOR SELECT USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR customer_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Shop manages verifications" ON payment_verifications FOR ALL USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid() AND role IN ('admin','manager','cashier')) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- LOYALTY_REWARDS policies
CREATE POLICY "Shop reads loyalty_rewards" ON loyalty_rewards FOR SELECT USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') OR is_active = true);
CREATE POLICY "Shop manages loyalty_rewards" ON loyalty_rewards FOR ALL USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid() AND role = 'admin') OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- LOYALTY_POINTS policies
CREATE POLICY "Users read own loyalty_points" ON loyalty_points FOR SELECT USING (customer_id = auth.uid() OR shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- ACTIVITY_LOGS policies
CREATE POLICY "Shop reads activity_logs" ON activity_logs FOR SELECT USING (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid() AND role IN ('admin','manager')) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Shop inserts activity_logs" ON activity_logs FOR INSERT WITH CHECK (shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- REVIEWS policies
CREATE POLICY "Public reads reviews" ON reviews FOR SELECT USING (is_public = true OR shop_id IN (SELECT shop_id FROM users WHERE id = auth.uid()) OR customer_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Customers create reviews" ON reviews FOR INSERT WITH CHECK (customer_id = auth.uid());

-- ============================================
-- AUTO-UPDATE updated_at TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shops_updated_at BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_barbers_updated_at BEFORE UPDATE ON barbers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_gallery_updated_at BEFORE UPDATE ON gallery FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_verifications_updated_at BEFORE UPDATE ON payment_verifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loyalty_rewards_updated_at BEFORE UPDATE ON loyalty_rewards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- AUTO-GENERATE booking_ref
-- ============================================
CREATE OR REPLACE FUNCTION generate_booking_ref()
RETURNS TEXT AS $$
DECLARE
  ref TEXT;
  year_part TEXT;
  seq_num INTEGER;
BEGIN
  year_part := EXTRACT(YEAR FROM now())::TEXT;
  SELECT COALESCE(MAX(CAST(RIGHT(booking_ref, 6) AS INTEGER)), 0) + 1 INTO seq_num
  FROM bookings WHERE booking_ref LIKE 'BK-' || year_part || '-%';
  ref := 'BK-' || year_part || '-' || LPAD(seq_num::TEXT, 6, '0');
  RETURN ref;
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

CREATE TRIGGER trg_set_booking_ref
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_booking_ref();
