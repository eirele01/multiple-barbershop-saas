/**
 * Shared plan/limits resolvers.
 *
 * Plans are stored in the DB (`plans` table) and can be edited by the
 * super-admin via the Plan/Tier Maker. This module resolves plan data
 * and resource limits DB-first, with a graceful fallback to the static
 * `TIER_LIMITS` constant so existing code keeps working even if the
 * `plans` table migration hasn't been applied in a deployed environment.
 *
 * Convention: DB `limits` use -1 to mean "unlimited" (JSON cannot store
 * Infinity). Resolvers convert -1 → Infinity.
 */
import { TIER_LIMITS } from '~/constants/tierLimits'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SubscriptionPlan } from '~/types/database'

export interface PlanLimits {
  services: number
  gallery: number
  products: number
  staff: number
}

export interface SubscriptionPlanConfig {
  id: string
  code: string
  name: string
  description: string | null
  price_monthly: number // centavos; 0 = free
  price_yearly: number  // centavos; 0 = free
  limits: PlanLimits
  features: string[]
  is_active: boolean
  is_default: boolean
  sort_order: number
}

const RAW_LIMIT_SHAPE = ['services', 'gallery', 'products', 'staff'] as const

/** Convert a raw DB limit value (-1 = unlimited) into a number usable for checks. */
export function normalizeLimit(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (value === -1) return Infinity
  return Math.max(0, value)
}

/** Type guard: is this a valid raw limits object from the DB? */
function isRawLimits(raw: unknown): raw is Record<string, number> {
  if (!raw || typeof raw !== 'object') return false
  const obj = raw as Record<string, number>
  return RAW_LIMIT_SHAPE.every(k => typeof obj[k] === 'number')
}
/** Map a DB row to a normalized SubscriptionPlanConfig. */
export function mapPlanRow(row: Record<string, unknown>): SubscriptionPlanConfig {
  const rawLimits = row.limits
  const limits: PlanLimits = {
    services: normalizeLimit((row.limits as Record<string, number> | undefined)?.services),
    gallery: normalizeLimit((row.limits as Record<string, number> | undefined)?.gallery),
    products: normalizeLimit((row.limits as Record<string, number> | undefined)?.products),
    staff: normalizeLimit((row.limits as Record<string, number> | undefined)?.staff),
  }
  if (!isRawLimits(rawLimits)) {
    // Fallback to static limits for this code
    const code = String(row.code || 'basic') as SubscriptionPlan
    const staticLimits = TIER_LIMITS[code] || TIER_LIMITS.basic
    limits.services = staticLimits.services
    limits.gallery = staticLimits.gallery
    limits.products = staticLimits.products
    limits.staff = staticLimits.staff
  }

  return {
    id: String(row.id || ''),
    code: String(row.code || 'basic'),
    name: String(row.name || row.code || 'Plan'),
    description: row.description ? String(row.description) : null,
    price_monthly: Number(row.price_monthly ?? 0),
    price_yearly: Number(row.price_yearly ?? 0),
    limits,
    features: Array.isArray(row.features) ? (row.features as unknown as string[]) : [],
    is_active: Boolean(row.is_active ?? true),
    is_default: Boolean(row.is_default ?? false),
    sort_order: Number(row.sort_order ?? 0),
  }
}

export interface PlanQueryOptions {
  /** If true, only return active plans. */
  activeOnly?: boolean
}

/**
 * Fetch plans from the DB.
 * @param supabase - Supabase client (service-role or anon)
 * @param opts
 * @returns list of normalized plans, sorted by sort_order
 */
export async function fetchPlans(
  supabase: { from: (t: string) => any },
  opts: PlanQueryOptions = {},
): Promise<SubscriptionPlanConfig[]> {
  let query = supabase
    .from('plans')
    .select('*')
    .order('sort_order', { ascending: true })

  if (opts.activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    // Table may not exist (migration not applied) — fall back to static.
    console.warn('[plans] fetchPlans DB error, falling back to static limits:', error.message)
    return staticPlansFromTierLimits()
  }

  if (!data || data.length === 0) {
    return staticPlansFromTierLimits()
  }

  return (data as unknown as Record<string, unknown>[]).map(mapPlanRow)
}

/** Build a minimal static list from TIER_LIMITS as a final fallback. */
export function staticPlansFromTierLimits(): SubscriptionPlanConfig[] {
  const fallbackPrices: Record<string, { monthly: number; yearly: number }> = {
    basic: { monthly: 0, yearly: 0 },
    upgraded: { monthly: 199000, yearly: 1990000 }, // ₱1,990 / ₱19,900
    pro: { monthly: 299000, yearly: 2990000 }, // ₱2,990 / ₱29,900 (fallback only)
  }
  return (Object.keys(TIER_LIMITS) as SubscriptionPlan[]).map((code, idx) => {
    const name = code.charAt(0).toUpperCase() + code.slice(1)
    const price = fallbackPrices[code] || { monthly: 199000, yearly: 1990000 }
    return {
      id: `static-${code}`,
      code,
      name,
      description: null,
      price_monthly: price.monthly,
      price_yearly: price.yearly,
      limits: { ...TIER_LIMITS[code] },
      features: [],
      is_active: true,
      is_default: code === 'basic',
      sort_order: idx + 1,
    }
  })
}

/**
 * Get resource limits for a plan code.
 * DB-first with static fallback — safe to call anywhere server-side.
 */
export async function getPlanLimits(
  supabase: { from: (t: string) => any },
  planCode: string,
): Promise<PlanLimits> {
  const code = planCode && planCode !== 'null' ? planCode.toLowerCase() : 'basic'
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('limits')
      .eq('code', code)
      .single()

    if (!error && data) {
      const limits = (data as Record<string, unknown>).limits
      if (isRawLimits(limits)) {
        return {
          services: normalizeLimit(limits.services),
          gallery: normalizeLimit(limits.gallery),
          products: normalizeLimit(limits.products),
          staff: normalizeLimit(limits.staff),
        }
      }
    }
  } catch (e) {
    console.warn(`[plans] getPlanLimits DB error for ${code}, falling back to static:`, e)
  }

  const staticLimits = TIER_LIMITS[code as SubscriptionPlan] || TIER_LIMITS.basic
  return { ...staticLimits }
}

/** Format centavos → readable PHP price. */
export function formatPlanPrice(centavos: number): string {
  if (!centavos || centavos <= 0) return 'Free'
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Billing cycle / expiry resolution ─────────────────────────────

/** Grace period (days) an expired subscription keeps premium features. */
export const PLAN_GRACE_PERIOD_DAYS = 7

export interface EffectivePlanResolution {
  planCode: string
  isExpired: boolean
  isInGrace: boolean
  daysRemaining: number | null
}

/**
 * Resolve the plan actually enforced for a shop, honoring expiry + grace.
 *   plan_end_date null      → no expiry (free plan or manual grant)
 *   plan_end_date >= now    → active
 *   expired <= grace days   → grace: keep the paid plan, show renewal prompt
 *   expired beyond grace    → fall back to fallbackCode (default 'basic')
 */
export function resolveEffectivePlan(
  plan: string | null | undefined,
  planEndDate: string | null | undefined,
  fallbackCode = 'basic',
): EffectivePlanResolution {
  const code = plan && plan !== 'null' ? plan.toLowerCase() : fallbackCode
  if (!planEndDate) {
    return { planCode: code || fallbackCode, isExpired: false, isInGrace: false, daysRemaining: null }
  }

  const endMs = new Date(planEndDate).getTime()
  if (isNaN(endMs)) {
    return { planCode: code || fallbackCode, isExpired: false, isInGrace: false, daysRemaining: null }
  }

  const daysRemaining = Math.ceil((endMs - Date.now()) / 86_400_000)
  const isExpired = daysRemaining < 0
  const isInGrace = isExpired && daysRemaining >= -PLAN_GRACE_PERIOD_DAYS

  return {
    planCode: isExpired && !isInGrace ? fallbackCode : (code || fallbackCode),
    isExpired,
    isInGrace,
    daysRemaining,
  }
}

/**
 * Fetch a shop's row and resolve the plan code that should be ENFORCED for it
 * (honors expiry + grace). Returns the effective code plus the expiry state so
 * callers can block/allow premium features consistently server-side — without
 * this, an expired-paid shop would keep paid-plan limits forever.
 */
export interface ShopPlanResolution {
  plan: string
  effectivePlan: string
  isExpired: boolean
  isInGrace: boolean
  daysRemaining: number | null
}

export async function resolveShopPlan(
  supabase: { from: (t: string) => any },
  shopId: string,
): Promise<ShopPlanResolution | null> {
  const { data, error } = await supabase
    .from('shops')
    .select('id, plan, plan_end_date')
    .eq('id', shopId)
    .single()
  if (error || !data) return null
  const plan = (data.plan || 'basic') as string
  const res = resolveEffectivePlan(plan, data.plan_end_date)
  return {
    plan,
    effectivePlan: res.planCode,
    isExpired: res.isExpired,
    isInGrace: res.isInGrace,
    daysRemaining: res.daysRemaining,
  }
}

/**
 * Compute the next plan_end_date from a billing interval.
 * Monthly adds 1 month, yearly adds 1 year — calendar-aware and CLAMPED:
 * Jan 31 + 1 month → Feb 28/29 (not Mar 2/3, which naive Date.setMonth
 * overflows to), so renewal dates stay on the correct month.
 */
export function computePlanEndDate(
  from: Date,
  interval: 'monthly' | 'yearly',
): Date {
  const d = new Date(from)
  const day = d.getDate()
  if (interval === 'yearly') {
    d.setFullYear(d.getFullYear() + 1, d.getMonth() + 1, 0) // land on last day of target month
    const targetDay = d.getDate()
    d.setFullYear(d.getFullYear(), d.getMonth(), day > targetDay ? targetDay : day)
    return d
  }
  d.setDate(1) // avoid overflow before setting the month
  d.setMonth(d.getMonth() + 1)
  const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, daysInTargetMonth))
  return d
}

// ─── Paid subscription activation (webhook + return-flow confirm) ──

export interface ActivateSubscriptionArgs {
  supabase: SupabaseClient
  shopId: string
  sessionId: string
  toPlan: string
  billingInterval: 'monthly' | 'yearly'
}

export interface ActivateSubscriptionResult {
  applied: boolean
  alreadyApplied: boolean
  shopNotFound: boolean
  isRenewal: boolean
  planEndDate: string | null
  shopName: string | null
}

const ACTIVATION_SKIPPED: ActivateSubscriptionResult = {
  applied: false,
  alreadyApplied: false,
  shopNotFound: false,
  isRenewal: false,
  planEndDate: null,
  shopName: null,
}

/**
 * Activate a paid plan upgrade/renewal. Shared by the PayMongo webhook and
 * the return-flow confirmation endpoint so both paths behave identically.
 *
 * Idempotency: the first caller atomically claims the session row in
 * `upgrade_sessions` (pending → paid). The second caller sees the claimed
 * row and skips — this prevents a webhook + confirm double-extension of the
 * expiry date when both fire for the same payment.
 */
export async function activatePaidSubscription(
  args: ActivateSubscriptionArgs,
): Promise<ActivateSubscriptionResult> {
  const { supabase, shopId, sessionId, toPlan, billingInterval } = args

  // ── Claim the session row (atomic guard against concurrent activation) ──
  let sessionRowMissing = false
  if (sessionId) {
    try {
      const { data: claimed, error: claimError } = await supabase
        .from('upgrade_sessions')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('paymongo_session_id', sessionId)
        .neq('status', 'paid')
        .select('id')

      if (claimError) {
        console.warn('[ACTIVATE-SUBSCRIPTION] upgrade_sessions claim update error:', claimError)
      }

      if (!claimed || claimed.length === 0) {
        // 0 rows updated — either already paid, or the row doesn't exist
        const { data: existing } = await supabase
          .from('upgrade_sessions')
          .select('id')
          .eq('paymongo_session_id', sessionId)
          .maybeSingle()

        if (existing) {
          // Session already settled. This is a genuine double-apply ONLY when
          // the shop actually has the target plan. If the plan differs, a
          // previous activation failed after claiming (e.g. a DB CHECK
          // constraint rejected the plan code) — recover by applying it now.
          const { data: shopCheck } = await supabase
            .from('shops')
            .select('plan')
            .eq('id', shopId)
            .single()
          if (shopCheck && shopCheck.plan === toPlan) {
            return { ...ACTIVATION_SKIPPED, alreadyApplied: true }
          }
          console.warn(
            `[ACTIVATE-SUBSCRIPTION] Session ${sessionId} was paid but shop plan is '${shopCheck?.plan ?? 'unknown'}' ≠ '${toPlan}' — recovering stuck activation`,
          )
        } else {
          sessionRowMissing = true // never persisted at checkout — activate, then record
        }
      }
    } catch (e) {
      // Table missing (migration not applied) — activate without the guard
      console.warn('[ACTIVATE-SUBSCRIPTION] upgrade_sessions guard skipped:', e)
      sessionRowMissing = true
    }
  }

  // ── Load shop (plan + expiry drive renewal vs upgrade semantics) ──
  const { data: shop } = await supabase
    .from('shops')
    .select('id, plan, name, plan_end_date')
    .eq('id', shopId)
    .single()
  if (!shop) return { ...ACTIVATION_SKIPPED, shopNotFound: true }

  // Renewal (same plan): extend from the LATER of now / current expiry so
  // early renewals keep their remaining days. Upgrade: start fresh from now.
  const isRenewal = shop.plan === toPlan
  const currentEnd = shop.plan_end_date ? new Date(shop.plan_end_date) : null
  const expiryBase = isRenewal && currentEnd && currentEnd.getTime() > Date.now()
    ? currentEnd
    : new Date()
  const planEndDate = computePlanEndDate(expiryBase, billingInterval).toISOString()

  const { error: updateError } = await supabase
    .from('shops')
    .update({
      plan: toPlan,
      plan_status: 'active',
      ...(isRenewal ? {} : { plan_start_date: new Date().toISOString() }),
      billing_interval: billingInterval,
      plan_end_date: planEndDate,
    })
    .eq('id', shopId)

  if (updateError) {
    console.error('[ACTIVATE-SUBSCRIPTION] Failed to update shop subscription:', updateError)
    // Release the claim so a retry (confirm flow or webhook) can apply the
    // payment — otherwise the session stays 'paid' forever and the plan is
    // never activated (deadlock after a transient DB failure).
    if (sessionId && !sessionRowMissing) {
      try {
        await supabase
          .from('upgrade_sessions')
          .update({ status: 'pending', paid_at: null })
          .eq('paymongo_session_id', sessionId)
      } catch {
        // best-effort — table may be missing
      }
    }
    return { ...ACTIVATION_SKIPPED }
  }

  // Record the session if it was never persisted at checkout (best-effort).
  // Idempotency is keyed on the PayMongo session id (append-only history).
  if (sessionRowMissing && sessionId) {
    try {
      const { error: sessionWriteError } = await supabase.from('upgrade_sessions').upsert({
        shop_id: shopId,
        paymongo_session_id: sessionId,
        status: 'paid',
        paid_at: new Date().toISOString(),
        from_plan: shop.plan || 'basic',
        to_plan: toPlan,
        billing_interval: billingInterval,
      }, { on_conflict: 'paymongo_session_id' })
      if (sessionWriteError) {
        console.error('[ACTIVATE-SUBSCRIPTION] upgrade_sessions save failed:', sessionWriteError)
      }
    } catch (e) {
      console.warn('[ACTIVATE-SUBSCRIPTION] upgrade_sessions insert skipped:', e)
    }
  }

  // Audit trail (non-fatal)
  try {
    await supabase.from('activity_logs').insert({
      shop_id: shopId,
      user_id: shopId,
      user_role: 'system',
      action: isRenewal ? 'shop.renewed' : 'shop.upgraded',
      entity_type: 'shop',
      entity_id: shopId,
      old_value: isRenewal
        ? { plan: toPlan, plan_end_date: shop.plan_end_date || null }
        : { plan: shop.plan || 'basic' },
      new_value: { plan: toPlan, billing_interval: billingInterval, plan_end_date: planEndDate },
    })
  } catch (e) {
    console.warn('[ACTIVATE-SUBSCRIPTION] activity log skipped:', e)
  }

  return {
    applied: true,
    alreadyApplied: false,
    shopNotFound: false,
    isRenewal,
    planEndDate,
    shopName: shop.name || null,
  }
}