/**
 * POST /api/billing/create-upgrade-session
 *
 * Creates a PayMongo Checkout Session for plan upgrade.
 * Shop owners pay to upgrade from one plan to another.
 *
 * IMPORTANT: The payment is collected by the PLATFORM's own PayMongo
 * account (runtime config `paymongoSecretKey`), NOT the shop's account.
 * This ensures subscription revenue goes to the SaaS platform.
 *
 * Body: { shopId, planCode?, billingInterval? } — planCode optional (defaults
 *   to 'upgraded'); billingInterval 'monthly' | 'yearly' (default 'monthly').
 *   Paying for the plan the shop is already on = renewal (extends expiry).
 * Returns: { checkoutUrl }
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const PAYMONGO_TIMEOUT_MS = 15_000

const FALLBACK_PLAN_CODE = 'upgraded'
const FALLBACK_PRICE_CENTAVOS = 199000 // ₱1,990.00

const createUpgradeSchema = z.object({
  shopId: z.string().uuid(),
  planCode: z.string().min(2).max(40).regex(/^[a-z0-9_]+$/).optional(),
  billingInterval: z.enum(['monthly', 'yearly']).default('monthly'),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const parsed = createUpgradeSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { shopId, planCode: requestedPlanCode, billingInterval } = parsed.data
  const planCode = requestedPlanCode || FALLBACK_PLAN_CODE

  // Authenticate
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : ''
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid token' })
  }

  // Verify user is admin of this shop
  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (!userProfile || userProfile.role !== 'admin' || userProfile.shop_id !== shopId) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Admin access required' })
  }

  // Fetch shop (only for verification + display name)
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, name, plan')
    .eq('id', shopId)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  // Same plan + payment = renewal (extends plan_end_date) — allowed below.
  // Free plans can't be paid for (enforced after the price lookup).
  const isRenewal = shop.plan === planCode

  // ── Resolve the target plan's price ──
  // An explicit planCode MUST exist in the plans table (Tier Maker is the
  // source of truth). The default flow (no planCode → 'upgraded') keeps a
  // static fallback so checkout still works even before migrations run.
  // NOTE: a ₱0 price is legitimate (free plan) — never replace it with a
  // fallback price, or downgrades get charged.
  let targetPrice: number
  let targetName: string

  if (requestedPlanCode) {
    const { data: planRow } = await supabase
      .from('plans')
      .select('name, price_monthly, price_yearly, is_active')
      .eq('code', planCode)
      .maybeSingle()

    if (!planRow) {
      throw createError({ statusCode: 404, statusMessage: `Plan '${planCode}' not found` })
    }
    if (!planRow.is_active) {
      throw createError({ statusCode: 400, statusMessage: `The ${planRow.name} plan is not available right now` })
    }
    targetPrice = Number(
      billingInterval === 'yearly' ? planRow.price_yearly : planRow.price_monthly
    ) || 0
    targetName = planRow.name
  } else {
    targetPrice = FALLBACK_PRICE_CENTAVOS
    targetName = 'Upgraded'
    try {
      const { data: planRow } = await supabase
        .from('plans')
        .select('name, price_monthly, price_yearly, is_active')
        .eq('code', planCode)
        .maybeSingle()
      if (planRow && planRow.is_active) {
        targetPrice = Number(
          billingInterval === 'yearly' ? planRow.price_yearly : planRow.price_monthly
        ) || 0
        targetName = planRow.name
      }
    } catch (e) {
      console.warn('[CREATE-UPGRADE-SESSION] plans lookup failed, using fallback:', e)
    }
  }

  // ── Free plan (e.g. downgrade to Basic): no payment needed ──
  // Apply the plan change directly — never send the owner to PayMongo for ₱0.
  if (targetPrice <= 0) {
    const { error: freeError } = await supabase
      .from('shops')
      .update({
        plan: planCode,
        plan_status: 'active',
        plan_start_date: new Date().toISOString(),
        billing_interval: 'monthly',
        plan_end_date: null, // free plan — no expiry
      })
      .eq('id', shopId)

    if (freeError) {
      console.error('[CREATE-UPGRADE-SESSION] Free plan change failed:', freeError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to change plan' })
    }

    // Audit trail (non-fatal)
    try {
      await supabase.from('activity_logs').insert({
        shop_id: shopId,
        user_id: user.id,
        user_role: 'admin',
        action: 'shop.plan_changed',
        entity_type: 'shop',
        entity_id: shopId,
        old_value: { plan: shop.plan || 'basic' },
        new_value: { plan: planCode, reason: 'free plan — no payment required' },
      })
    } catch (e) {
      console.warn('[CREATE-UPGRADE-SESSION] activity log skipped:', e)
    }

    // Append a history row so the billing page reflects the free-plan change.
    // (Previously only paid checkouts wrote to upgrade_sessions, so a downgrade
    // left the table looking frozen.)
    try {
      const { error: historyWriteError } = await supabase.from('upgrade_sessions').insert({
        shop_id: shopId,
        paymongo_session_id: null,
        status: 'applied',
        amount: 0,
        currency: 'PHP',
        from_plan: shop.plan || 'basic',
        to_plan: planCode,
        billing_interval: 'monthly',
        paid_at: new Date().toISOString(),
      })
      if (historyWriteError) {
        console.error('[CREATE-UPGRADE-SESSION] free-plan history write failed:', historyWriteError)
      }
    } catch (e) {
      console.warn('[CREATE-UPGRADE-SESSION] free-plan history write skipped:', e)
    }

    console.log(`[CREATE-UPGRADE-SESSION] Shop ${shopId} switched to free plan '${planCode}' (no payment)`)
    // Clear any pending checkout cookie from a previous paid attempt — this
    // plan change never went through PayMongo, so a stale session id must not
    // be picked up by a later confirm-upgrade call.
    deleteCookie(event, 'upgrade_session_id', { path: '/' })
    return { freePlan: true, planCode, planName: targetName }
  }

  // ── Platform PayMongo key ──
  // The upgrade fee is collected by the SaaS platform's own PayMongo
  // account — NOT the shop's. The key lives in server-only runtime config.
  const platformKey = config.paymongoSecretKey
  if (!platformKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Platform PayMongo is not configured. Please contact support.',
    })
  }

  // Build payment method types
  const paymentMethodTypes: string[] = ['gcash', 'paymaya', 'card', 'qrph']

  // Build URLs
  const baseUrl = getRequestURL(event).origin
  const returnUrl = `${baseUrl}/admin/billing?success=true`

  // Create checkout session
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PAYMONGO_TIMEOUT_MS)

    const paymongoResponse = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(platformKey + ':').toString('base64')}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                currency: 'PHP',
                amount: targetPrice,
                name: isRenewal ? `Plan Renewal - ${targetName}` : `Plan Upgrade - ${targetName}`,
                quantity: 1,
                description: isRenewal
                  ? `Renew ${targetName} plan (${billingInterval})`
                  : `Upgrade from ${shop.plan} to ${targetName} plan (${billingInterval})`,
              },
            ],
            payment_method_types: paymentMethodTypes,
            return_url: returnUrl,
            reference_number: `${isRenewal ? 'RENEW' : 'UPGRADE'}-${shopId.slice(0, 8)}-${Date.now()}`,
            metadata: {
              shop_id: shopId,
              type: 'plan_upgrade',
              from_plan: shop.plan || 'basic',
              to_plan: planCode,
              billing_interval: billingInterval,
            },
            description: `Upgrade to ${targetName} Plan at ${shop.name}`,
            send_email_receipt: true,
            show_line_items: true,
            show_description: true,
          },
        },
      }),
    })

    clearTimeout(timeoutId)

    if (!paymongoResponse.ok) {
      const errorData = await paymongoResponse.json().catch(() => ({}))
      const paymongoMsg = errorData?.errors?.[0]?.detail || 'Unknown PayMongo error'
      throw createError({ statusCode: 502, statusMessage: `PayMongo error: ${paymongoMsg}` })
    }

    const result = await paymongoResponse.json()
    const checkoutUrl = result.data?.attributes?.checkout_url
    const sessionId = result.data?.id

    if (!checkoutUrl) {
      throw createError({ statusCode: 502, statusMessage: 'PayMongo did not return a checkout URL' })
    }

    console.log(
      `[CREATE-UPGRADE-SESSION] Shop ${shopId} checkout ${sessionId} created: ${shop.plan || 'basic'} -> ${planCode} (${billingInterval}) amount=${targetPrice}`,
    )

    // Store upgrade session (append-only history — each checkout gets its own
    // row; idempotency for re-processing is keyed on the PayMongo session id,
    // not on shop_id). IMPORTANT: PostgREST returns errors in the result
    // object, it does NOT throw — we must check `.error` or a failed write
    // slips through silently (the bug that left stale rows forever).
    try {
      const { error: sessionWriteError } = await supabase
        .from('upgrade_sessions')
        .upsert(
          {
            shop_id: shopId,
            paymongo_session_id: sessionId,
            status: 'pending',
            amount: targetPrice,
            from_plan: shop.plan || 'basic',
            to_plan: planCode,
            billing_interval: billingInterval,
          },
          { on_conflict: 'paymongo_session_id' },
        )
      if (sessionWriteError) {
        console.error('[CREATE-UPGRADE-SESSION] upgrade_sessions save failed:', sessionWriteError)
      }
    } catch (sessionError) {
      console.warn('[CREATE-UPGRADE-SESSION] upgrade_sessions save skipped (possibly table missing):', sessionError)
    }

    // Safety net for the return flow: persist the session id in an httpOnly
    // cookie so payment confirmation works even when the upgrade_sessions row
    // could not be saved (e.g. the migration hasn't been applied). It is
    // cleared by confirm-upgrade once the payment is activated.
    setCookie(event, 'upgrade_session_id', sessionId, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24h
    })

    return { checkoutUrl }
  } catch (error: unknown) {
    const err = error as { statusCode?: number; name?: string }
    if (err.statusCode) throw error
    if (err.name === 'AbortError') {
      throw createError({ statusCode: 504, statusMessage: 'PayMongo API timed out' })
    }
    throw createError({ statusCode: 500, statusMessage: 'Failed to create checkout session' })
  }
})
