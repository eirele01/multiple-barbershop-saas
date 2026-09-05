/**
 * POST /api/billing/confirm-upgrade
 *
 * Return-flow payment confirmation. PayMongo webhooks cannot reach localhost
 * (and can be delayed in production), so when the owner is redirected back
 * from checkout we ask PayMongo directly whether their checkout session was
 * paid — and activate the plan immediately. Idempotent: if the webhook
 * already applied this session, this returns applied=false without
 * double-extending the expiry.
 *
 * Body: { shopId, sessionId? } — sessionId optional; falls back to the
 *   shop's most recent stored checkout session.
 * Returns: { paid, applied?, isRenewal?, plan?, planEndDate?, message? }
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { activatePaidSubscription } from '~/utils/server/plans'

const PAYMONGO_TIMEOUT_MS = 15_000

const confirmSchema = z.object({
  shopId: z.string().uuid(),
  sessionId: z.string().min(6).max(80).regex(/^[a-zA-Z0-9_-]+$/).optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { shopId, sessionId: requestedSessionId } = parsed.data

  // Authenticate — same rules as create-upgrade-session
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

  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (!userProfile || userProfile.role !== 'admin' || userProfile.shop_id !== shopId) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Admin access required' })
  }

  // ── Resolve the checkout session to verify ──
  let sessionId = requestedSessionId || ''
  let sessionRow: { to_plan?: string; billing_interval?: string } | null = null
  if (!sessionId) {
    // Latest checkout attempt for this shop (append-only history). If the
    // upgrade_sessions table is missing we fall through to the cookie that
    // create-upgrade-session writes at checkout creation time.
    try {
      const { data } = await supabase
        .from('upgrade_sessions')
        .select('paymongo_session_id, status, to_plan, billing_interval')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      sessionRow = data
      sessionId = data?.paymongo_session_id || ''
    } catch (e) {
      console.warn('[CONFIRM-UPGRADE] upgrade_sessions lookup skipped:', e)
    }
    if (!sessionId) {
      sessionId = getCookie(event, 'upgrade_session_id') || ''
      if (sessionId) console.log('[CONFIRM-UPGRADE] using cookie fallback for session lookup')
    }
  }

  if (!sessionId) {
    throw createError({ statusCode: 404, statusMessage: 'No checkout session found — please start the upgrade again' })
  }

  // Paid detection — verify candidate sessions in order and stop at the first
  // paid one. Candidates: explicitly requested id → latest stored session →
  // checkout cookie. This handles the common "user clicked Upgrade twice"
  // case where the abandoned first checkout's row shadows the paid second
  // one (e.g. the second row upsert failed).
  const candidateIds: string[] = []
  for (const id of [requestedSessionId, sessionId, getCookie(event, 'upgrade_session_id') || '']) {
    if (id && !candidateIds.includes(id)) candidateIds.push(id)
  }

  const platformKey = config.paymongoSecretKey as string
  if (!platformKey) {
    throw createError({ statusCode: 500, statusMessage: 'Payment platform is not configured' })
  }

  const settled = ['paid', 'succeeded', 'completed']
  let attrs: any = null
  let paidSessionId = ''
  for (const candidateId of candidateIds) {
    let candidateAttrs: any
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), PAYMONGO_TIMEOUT_MS)
      const res = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${candidateId}`, {
        headers: { 'Authorization': `Basic ${Buffer.from(platformKey + ':').toString('base64')}` },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        throw createError({ statusCode: 502, statusMessage: 'Could not verify the payment with PayMongo' })
      }
      const payload = await res.json()
      candidateAttrs = payload?.data?.attributes || {}
    } catch (e: unknown) {
      const err = e as { statusCode?: number; name?: string }
      if (err.statusCode) throw e
      if (err.name === 'AbortError') {
        throw createError({ statusCode: 504, statusMessage: 'PayMongo verification timed out' })
      }
      throw createError({ statusCode: 502, statusMessage: 'Could not verify the payment with PayMongo' })
    }

    // Security — the session must belong to this shop and be a plan payment
    const meta = candidateAttrs.metadata || {}
    if (meta.shop_id && meta.shop_id !== shopId) {
      throw createError({ statusCode: 403, statusMessage: 'Checkout session does not belong to this shop' })
    }
    if (meta.type && meta.type !== 'plan_upgrade') {
      throw createError({ statusCode: 400, statusMessage: 'Not a plan payment' })
    }

    // Paid detection — robust to PayMongo's status vocabulary across the
    // session itself, its attached payments, and the underlying payment_intent
    const payments = Array.isArray(candidateAttrs.payments) ? candidateAttrs.payments : []
    const isPaid = settled.includes(String(candidateAttrs.status || '').toLowerCase())
      || payments.some((p: any) => {
        const paymentStatus = String(p?.attributes?.status || '').toLowerCase()
        const intentStatus = String(p?.attributes?.payment_intent?.attributes?.status || '').toLowerCase()
        return settled.includes(paymentStatus) || intentStatus === 'succeeded'
      })

    // Diagnostics — makes PayMongo's verdict visible in server logs so a
    // "still pending" report can be triaged without guessing
    console.log(
      `[CONFIRM-UPGRADE] session=${candidateId} status=${candidateAttrs.status || 'n/a'} payments=${payments.length}` +
      (payments.length
        ? ` paymentStatuses=[${payments.map((p: any) => p?.attributes?.status).join(',')}]` +
          ` intentStatuses=[${payments.map((p: any) => p?.attributes?.payment_intent?.attributes?.status).join(',')}]`
        : '') +
      ` → paid=${isPaid}`,
    )

    if (isPaid) {
      attrs = candidateAttrs
      paidSessionId = candidateId
      break
    }
  }

  if (!attrs) {
    return { paid: false, message: 'Payment is still processing. Refresh in a moment.' }
  }

  // ── Activate (shared with the webhook; idempotent) ──
  const meta = attrs.metadata || {}
  const toPlan = meta.to_plan || sessionRow?.to_plan || 'upgraded'
  const billingInterval: 'monthly' | 'yearly' =
    (meta.billing_interval === 'yearly' || sessionRow?.billing_interval === 'yearly')
      ? 'yearly'
      : 'monthly'

  const activation = await activatePaidSubscription({ supabase, shopId, sessionId: paidSessionId, toPlan, billingInterval })

  if (activation.shopNotFound) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  // The payment is settled — clear the pending-session cookie we set at checkout.
  deleteCookie(event, 'upgrade_session_id')

  return {
    paid: true,
    applied: activation.applied,
    // True when the webhook already activated this payment — the plan IS
    // applied, so the client must treat this as success, not an error.
    alreadyApplied: activation.alreadyApplied,
    isRenewal: activation.isRenewal,
    plan: toPlan,
    billingInterval,
    planEndDate: activation.planEndDate,
  }
})