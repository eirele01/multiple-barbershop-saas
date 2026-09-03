-- Migration 019: Dynamic plan codes
-- Plans are now managed dynamically via the Tier Maker (`plans` table).
-- The original schema hard-coded a CHECK constraint on shops.plan that only
-- allowed ('basic','upgraded'), which silently rejected activations for any
-- new plan (e.g. 'pro'). Drop it — validity is now enforced by the app
-- against the `plans` table.

-- Find and drop the CHECK constraint on shops.plan regardless of its name.
DO $$
DECLARE
  conname TEXT;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE t.relname = 'shops'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%plan%'
    AND pg_get_constraintdef(c.oid) ILIKE '%basic%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.shops DROP CONSTRAINT %I', conname);
  END IF;
END $$;

-- Same treatment for the default: keep 'basic' as the fallback default,
-- but re-set it defensively in case tooling renamed things.
ALTER TABLE public.shops ALTER COLUMN plan SET DEFAULT 'basic';
