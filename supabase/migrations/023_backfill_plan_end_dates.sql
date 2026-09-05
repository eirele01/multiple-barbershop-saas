-- Migration 022: Backfill plan_end_date for paid plans missing an expiry
--
-- Earlier code paths (super-admin subscription patch before Migration 022-era
-- fix) could leave a PAID plan with plan_end_date = NULL, which silently means
-- "never expires" — no renewal prompt, no feature lock, no downgrade. This
-- backfills those rows to now + billing_interval so expiry enforcement works.
--
-- Safe: only touches non-basic plans with a NULL end date and leaves
-- explicitly-granted perpetual plans alone IF the super-admin intentionally
-- set plan_status = 'trial'... no — we treat a paid plan without an end date
-- as an accidental omission (the shop owner expects it to expire).

DO $$
DECLARE
  r RECORD;
  interval_val TEXT;
BEGIN
  FOR r IN
    SELECT id, billing_interval
    FROM shops
    WHERE plan IS DISTINCT FROM 'basic'
      AND plan_end_date IS NULL
  LOOP
    interval_val := COALESCE(r.billing_interval, 'monthly');
    IF interval_val = 'yearly' THEN
      UPDATE shops
      SET plan_end_date = now() + interval '1 year'
      WHERE id = r.id;
    ELSE
      UPDATE shops
      SET plan_end_date = now() + interval '1 month'
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;