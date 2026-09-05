/**
 * POST /api/webhooks/paymongo/upgrade
 *
 * Handles PayMongo webhooks for plan upgrades.
 * When payment is confirmed, upgrade the shop plan.
 *
 * Signature format: "t=<timestamp>,te=<test_sig>,li=<live_sig>"
 *   Prefers the LIVE signature; uses timingSafeEqual for comparison.
 *
 * Event shape (Checkout Sessions API):
 *   body.data.type = "checkout_session.payment.paid"
 *   body.data.attributes.data.attributes.metadata = { shop_id, type, ... }
 *
 * Public endpoint — protected by HMAC signature + rate limiting.
 */
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'
import { webhookRateLimiter } from '~/utils/server/rateLimiter'
import { activatePaidSubscription } from '~/utils/server/plans'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Rate limiting: 60 requests per minute per IP
  await webhookRateLimiter.check(event)

  // Read RAW body FIRST for signature verification
  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty request body' })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON body' })
  }

  // Verify webhook signature
  const signatureHeader = getHeader(event, 'paymongo-signature')
  const skipVerification = process.env.SKIP_WEBHOOK_VERIFICATION === 'true'

  if (!skipVerification) {
    if (!signatureHeader) {
      console.error('[UPGRADE WEBHOOK] Missing paymongo-signature header')
      throw createError({ statusCode: 401, statusMessage: 'Missing signature' })
    }

    const webhookSecret = config.paymongoWebhookSecret
    if (!webhookSecret) {
      console.error('[UPGRADE WEBHOOK] Platform webhook secret not configured (PAYMONGO_WEBHOOK_SECRET)')
      throw createError({ statusCode: 401, statusMessage: 'Webhook not configured' })
    }

    // Parse "t=<ts>,te=<sig>,li=<sig>" — prefer live sig (last non-empty value)
    const sigParts = signatureHeader.split(',')
    let timestamp = ''
    const signatureCandidates: string[] = []
    for (const part of sigParts) {
      const eqIndex = part.indexOf('=')
      if (eqIndex === -1) continue
      const key = part.substring(0, eqIndex).trim()
      const value = part.substring(eqIndex + 1).trim()
      if (key === 't') timestamp = value
      else if (value) signatureCandidates.push(value)
    }
    const providedSignature = signatureCandidates[signatureCandidates.length - 1]

    if (!providedSignature || !timestamp) {
      console.error('[UPGRADE WEBHOOK] Invalid signature format')
      throw createError({ statusCode: 401, statusMessage: 'Invalid signature format' })
    }

    // Timestamp tolerance — reject if more than 5 minutes old
    const webhookTime = parseInt(timestamp, 10)
    if (!isNaN(webhookTime)) {
      const diffMs = Math.abs(Date.now() - webhookTime * 1000)
      if (diffMs > 5 * 60 * 1000) {
        console.error(`[UPGRADE WEBHOOK] Timestamp too old: ${diffMs}ms difference`)
        throw createError({ statusCode: 401, statusMessage: 'Timestamp too old' })
      }
    }

    const expectedSig = createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest()

    const givenSig = Buffer.from(providedSignature, 'hex')
    if (givenSig.length !== expectedSig.length || !timingSafeEqual(givenSig, expectedSig)) {
      console.error('[UPGRADE WEBHOOK] Invalid signature')
      throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
    }
  }

  // ── Parse event ──
  // PayMongo Checkout Session webhook payload:
  //   body.data.type = "checkout_session.payment.paid"
  //   body.data.attributes = envelope { data: <checkout_session>, payment, ... }
  //   metadata lives at body.data.attributes.data.attributes.metadata
  const eventType = body?.data?.type || body?.data?.attributes?.type || body?.type || ''
  const nestedData = body?.data?.attributes?.data || {}
  const nestedAttrs = nestedData?.attributes || {}
  const metadata = nestedAttrs.metadata || body?.data?.attributes?.metadata || body?.data?.metadata || {}

  console.log(`[UPGRADE WEBHOOK] Event: ${eventType} | shop_id: ${metadata.shop_id || '(none)'}`)

  // Only act on confirmed payments
  const isPaidEvent = eventType === 'checkout_session.payment.paid' || eventType === 'payment.paid'
  if (!isPaidEvent) {
    return { received: true }
  }

  const shopId = metadata.shop_id
  const upgradeType = metadata.type
  if (!metadata.to_plan) {
    console.warn(
      `[UPGRADE WEBHOOK] metadata.to_plan missing — defaulting to 'upgraded'. Full metadata: ${JSON.stringify(metadata).substring(0, 300)}`,
    )
  }
  const toPlan = metadata.to_plan || 'upgraded'
  const billingInterval: 'monthly' | 'yearly' = metadata.billing_interval === 'yearly' ? 'yearly' : 'monthly'

  if (!shopId || upgradeType !== 'plan_upgrade') {
    console.warn('[UPGRADE WEBHOOK] Ignoring — missing shop_id or not a plan_upgrade:', JSON.stringify(metadata).substring(0, 300))
    return { received: true }
  }

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // The checkout session id keys idempotency (webhook + return-flow confirm)
  const sessionId = nestedData?.id || ''
  if (!sessionId) {
    console.warn('[UPGRADE WEBHOOK] Event has no checkout session id — proceeding without the double-apply guard')
  }

  const activation = await activatePaidSubscription({ supabase, shopId, sessionId, toPlan, billingInterval })

  if (activation.shopNotFound) {
    console.error(`[UPGRADE WEBHOOK] Shop ${shopId} not found`)
    return { received: true }
  }
  if (!activation.applied) {
    console.log(`[UPGRADE WEBHOOK] Session ${sessionId || '(none)'} already applied — skipping (idempotent)`)
    return { received: true }
  }

  console.log(`[UPGRADE WEBHOOK] Shop ${shopId} (${activation.shopName}) ${activation.isRenewal ? 'renewed' : 'upgraded to'} ${toPlan} (${billingInterval}) until ${activation.planEndDate}`)

  return { received: true }
})