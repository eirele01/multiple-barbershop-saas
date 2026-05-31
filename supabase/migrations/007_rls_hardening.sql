-- ============================================
-- 007: RLS HARDENING MIGRATION
-- Security audit findings and fixes
-- ============================================
--
-- This migration addresses security issues identified during
-- the RLS policy audit (Task 3). Key changes:
--
-- 1. BOOKINGS: Replace overly permissive FOR ALL policy with
--    granular INSERT/UPDATE policies. Customers can no longer
--    UPDATE or DELETE bookings -- only staff can change status.
--
-- 2. PAYMENT_VERIFICATIONS: Remove customer access to SELECT.
--    Customers should see payment status via the bookings table,
--    not directly through verification records. Replace FOR ALL
--    with separate INSERT and UPDATE policies.
--
-- 3. LOYALTY_POINTS: No changes needed. Current policies are
--    correct (SELECT only, no INSERT/UPDATE/DELETE for authenticated
--    users; service_role bypasses RLS for server-side operations).
--
-- 4. SHOPS: No changes needed. Current policies are correct.
--    No DELETE policy exists (only service_role can delete).
--
-- 5. USERS: No changes needed. Current policies are correct.
-- ============================================


-- ============================================
-- 1. BOOKINGS TABLE
-- ============================================

-- ---------------------------------------------------------------------------
-- ISSUE: "Shop manages bookings" is a FOR ALL policy that includes
--   customer_id = auth.uid(), which means customers can INSERT, UPDATE,
--   and DELETE their own bookings. The requirement states that ONLY staff
--   should be able to UPDATE booking status. Customers should only INSERT.
-- ---------------------------------------------------------------------------
-- FIX: Drop the FOR ALL policy and replace with granular INSERT/UPDATE.
-- ---------------------------------------------------------------------------

-- Drop the overly permissive FOR ALL policy
DROP POLICY IF EXISTS "Shop manages bookings" ON bookings;

-- Customers can INSERT bookings only for themselves.
-- This enforces customer_id = auth.uid() so a customer cannot
-- create a booking under another user's identity.
CREATE POLICY "Customers insert own bookings" ON bookings
  FOR INSERT
  WITH CHECK (customer_id = auth.uid());

-- Shop staff (admin, manager, cashier, barber) can INSERT bookings
-- for their shop. This covers walk-in bookings created by staff
-- where customer_id may differ from the staff member's ID.
CREATE POLICY "Shop staff insert bookings" ON bookings
  FOR INSERT
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'cashier', 'barber')
    )
  );

-- Only shop staff can UPDATE bookings (change status, verify payment, etc.)
-- Customers cannot update bookings -- if they need to cancel, they must
-- contact staff or use a server-side API that runs as service_role.
CREATE POLICY "Shop staff update bookings" ON bookings
  FOR UPDATE
  USING (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'cashier', 'barber')
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'cashier', 'barber')
    )
  );

-- Super admin has full access to all bookings (INSERT, UPDATE, DELETE)
CREATE POLICY "Super admin manages bookings" ON bookings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- NOTE: No DELETE policy for regular authenticated users.
-- Bookings should be cancelled (status change), not deleted.
-- Only service_role can hard-delete bookings.


-- ============================================
-- 2. PAYMENT_VERIFICATIONS TABLE
-- ============================================

-- ---------------------------------------------------------------------------
-- ISSUE 1: "Shop reads verifications" SELECT policy includes
--   customer_id = auth.uid(), allowing customers to see their own
--   verification records. The requirement states customers should NOT
--   see verification records directly -- they can check payment status
--   through the bookings table (payment_status, verified_by, etc.).
--
-- ISSUE 2: "Shop manages verifications" is a FOR ALL policy that
--   allows DELETE. Verification records should never be hard-deleted
--   by users; only service_role should be able to delete if needed.
-- ---------------------------------------------------------------------------
-- FIX: Drop both policies. Recreate SELECT without customer access.
--   Replace FOR ALL with separate INSERT and UPDATE policies.
-- ---------------------------------------------------------------------------

-- Drop the existing SELECT policy that allows customer access
DROP POLICY IF EXISTS "Shop reads verifications" ON payment_verifications;

-- Only shop staff and super admin can SELECT verification records.
-- Customers can see their payment status through the bookings table
-- (payment_status, verified_by, rejection_reason fields).
CREATE POLICY "Shop staff reads verifications" ON payment_verifications
  FOR SELECT
  USING (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'cashier')
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Drop the existing FOR ALL policy (too broad, includes DELETE)
DROP POLICY IF EXISTS "Shop manages verifications" ON payment_verifications;

-- Only shop staff can INSERT verification records.
-- Typically done by the system when processing payment proof uploads,
-- or by staff when manually recording a verification.
CREATE POLICY "Shop staff inserts verifications" ON payment_verifications
  FOR INSERT
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'cashier')
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Only shop staff can UPDATE verification records (verify/reject/more_info).
-- This is the core security control for the payment verification workflow.
CREATE POLICY "Shop staff updates verifications" ON payment_verifications
  FOR UPDATE
  USING (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'cashier')
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'cashier')
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- NOTE: No DELETE policy for authenticated users.
-- Verification records should never be hard-deleted by users.
-- Only service_role can delete if absolutely necessary.


-- ============================================
-- 3. LOYALTY_POINTS TABLE -- No changes needed
-- ============================================
-- Current state (from 001_initial_schema.sql):
--   SELECT: "Users read own loyalty_points"
--     customer_id = auth.uid()        -- customers see own records  OK
--     OR shop_id IN (subquery)        -- shop staff see their shop  OK
--     OR EXISTS (super_admin)          -- super admin sees all       OK
--   INSERT: No policy                  -- only service_role          OK
--   UPDATE: No policy                  -- blocked for all users      OK
--   DELETE: No policy                  -- blocked for all users      OK
--
-- This correctly enforces that loyalty points are managed
-- server-side only, preventing client-side fraud.


-- ============================================
-- 4. SHOPS TABLE -- No changes needed
-- ============================================
-- Current state (from 001_initial_schema.sql):
--   SELECT: "Public reads active shops"
--     is_active = true                 -- public/unauthenticated     OK
--   SELECT: "Shop staff reads own shop"
--     id = user's shop_id OR super_admin                          OK
--   UPDATE: "Admin updates own shop"
--     owner_id = auth.uid()           -- shop owner                 OK
--     OR admin/manager in shop         -- delegated staff            OK
--     OR super_admin                    -- platform admin             OK
--   DELETE: No policy                  -- only service_role          OK
--   INSERT: No policy                  -- handled by service_role    OK
--
-- Note: The "Public reads active shops" policy allows unauthenticated
-- access, which is more permissive than the requirement ("any authenticated
-- user can SELECT"). This is intentionally kept for public shop pages
-- (customers browsing shops without logging in).


-- ============================================
-- 5. USERS TABLE -- No changes needed
-- ============================================
-- Current state (from 001_initial_schema.sql):
--   SELECT: "Users can read own profile"
--     auth.uid() = id                  -- own record                 OK
--   SELECT: "Shop staff can read shop users"
--     shop_id matches user's shop      -- same-shop staff            OK
--   SELECT: "Super admin reads all users"
--     role = 'super_admin'             -- all users                  OK
--   UPDATE: "Users update own profile"
--     auth.uid() = id                  -- own record only            OK
--   INSERT: No policy                  -- handled by auth system     OK
--   DELETE: No policy                  -- handled by service_role    OK
