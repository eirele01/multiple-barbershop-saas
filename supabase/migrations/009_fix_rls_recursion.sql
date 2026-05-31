-- ============================================
-- 009: FIX RLS INFINITE RECURSION ON users TABLE
-- ============================================
--
-- PROBLEM:
--   Two RLS policies on the `users` table contain subqueries
--   that SELECT from the `users` table itself. This triggers
--   recursive RLS evaluation → PostgreSQL error code 42P17:
--   "infinite recursion detected in policy for relation 'users'"
--
-- AFFECTED POLICIES:
--   1. "Shop staff can read shop users"
--      → subquery: SELECT shop_id FROM users WHERE id = auth.uid()
--   2. "Super admin reads all users"
--      → subquery: SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'
--
-- FIX:
--   Replace the recursive subqueries with SECURITY DEFINER functions
--   that run with the table owner's privileges (bypassing RLS).
-- ============================================

-- Step 1: Drop the broken recursive policies
DROP POLICY IF EXISTS "Shop staff can read shop users" ON users;
DROP POLICY IF EXISTS "Super admin reads all users" ON users;

-- Step 2: Create safe helper functions (SECURITY DEFINER bypasses RLS)
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

-- Step 3: Recreate policies using the safe helpers
CREATE POLICY "Shop staff can read shop users"
ON users FOR SELECT
USING (
  auth.uid() = id  -- always see own record
  OR shop_id = public.get_my_shop_id()  -- see teammates (same shop)
);

CREATE POLICY "Super admin reads all users"
ON users FOR SELECT
USING (
  auth.uid() = id  -- always see own record
  OR public.get_my_role() = 'super_admin'  -- super admin sees all
);