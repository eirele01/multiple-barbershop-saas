/**
 * GET /api/billing/plans
 *
 * Returns active subscription plans for the upgrade/pricing page.
 * Public-safe: only marketing data (name, price, features, limits) — no secrets.
 * Auth is OPTIONAL: guests get the same public pricing list.
 */
import { createClient } from '@supabase/supabase-js'
import { fetchPlans, formatPlanPrice, toWireLimits } from '~/utils/server/plans'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  const plans = await fetchPlans(supabase, { activeOnly: true })

  return {
    plans: plans.map(p => ({
      code: p.code,
      name: p.name,
      description: p.description,
      priceMonthly: p.price_monthly,
      priceYearly: p.price_yearly,
      priceMonthlyLabel: formatPlanPrice(p.price_monthly),
      priceYearlyLabel: formatPlanPrice(p.price_yearly),
      // Wire format: -1 = unlimited. Sending the in-memory Infinity here
      // would serialize as null over JSON and break the UI.
      limits: toWireLimits(p.limits),
      features: p.features,
      is_default: p.is_default,
      sort_order: p.sort_order,
    })),
  }
})