-- ============================================
-- 013: Platform-Level Email Settings
--
-- Moves Resend API key, sender email, and sender
-- name from per-shop configuration to platform-level
-- settings managed by the super admin.
--
-- This allows all shops to send emails using a single
-- verified domain (notifications@reservationph.com)
-- without each shop needing their own Resend account.
--
-- After running this migration:
--   1. The old per-shop resend_api_key, sender_email,
--      sender_name columns remain untouched (backward compat)
--   2. sendShopEmail.ts now checks platform_settings FIRST
--   3. Shop admins only see email toggles, not API config
--
-- USAGE: Run this in Supabase SQL Editor
-- ============================================

-- Insert platform-level email settings (ignore if already exist)
INSERT INTO platform_settings (key, value) VALUES
  ('platform_resend_api_key', ''),
  ('platform_sender_email', 'notifications@reservationph.com'),
  ('platform_sender_name', 'BarberShop SaaS')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- AFTER MIGRATION — INSTRUCTIONS
-- ============================================
-- 
-- 1. Set your Resend API key (replace with your real key):
--    UPDATE platform_settings
--    SET value = 're_YOUR_ACTUAL_RESEND_API_KEY'
--    WHERE key = 'platform_resend_api_key';
--
-- 2. Verify it's set:
--    SELECT * FROM platform_settings WHERE key LIKE 'platform_%';
--
-- 3. In Resend dashboard:
--    - Go to https://resend.com/domains
--    - Add domain: reservationph.com
--    - Follow DNS verification steps
--    - Create an API key and use it in step 1