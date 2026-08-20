/**
 * POST /api/webhooks/paymongo/[shopSlug]
 *
 * PayMongo webhook handler — receives payment.paid and payment.failed events.
 *
 * CRITICAL:
 * - Reads RAW request body for HMAC signature verification BEFORE parsing JSON
 * - Uses timingSafeEqual (NOT ===) for signature comparison
 * - Public endpoint — no auth, protected by HMAC signature only
 * - Signature bypass only allowed via explicit SKIP_WEBHOOK_VERIFICATION env flag
 *
 * Booking lookup strategy (most reliable first):
 * 1. metadata.booking_id from the PayMongo link (set during link creation)
 * 2. metadata.booking_ref from the PayMongo link
 * 3. paymongo_payment_id match on the booking record
 * 4. Fallback: regex extract booking_ref from description/remarks
 *
 * Signature format: "t=timestamp,te=sig1,li=sig2"
 *   Parse 't' (timestamp) and 'te' (signature), compute HMAC-SHA256 over "{timestamp}.{rawBody}"
 */
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'
import { decrypt } from '~/utils/server/encryption'
import { sendShopEmail } from '~/utils/server/sendShopEmail'
import { webhookRateLimiter } from '~/utils/server/rateLimiter'

/**
 * Find a booking using multiple fallback strategies.
 * Returns the booking or null if not found.
 */
async function findBooking(
  supabase: any,
  shopId: string,
  eventData: any,
  paymentLinkId: string | null
) {
  // Strategy 1: metadata.booking_id (most reliable — set during link creation)
  const metadata =
    eventData?.attributes?.metadata ||
    eventData?.data?.attributes?.metadata ||
    eventData?.attributes?.data?.attributes?.metadata ||
    {}

  if (metadata.booking_id) {
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_ref, shop_id, customer_id, service_name, paymongo_payment_id')
      .eq('id', metadata.booking_id)
      .eq('shop_id', shopId)
      .single()
    if (data) return data
  }

  // Strategy 2: metadata.booking_ref
  if (metadata.booking_ref) {
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_ref, shop_id, customer_id, service_name, paymongo_payment_id')
      .eq('booking_ref', metadata.booking_ref)
      .eq('shop_id', shopId)
      .single()
    if (data) return data
  }

  // Strategy 3: paymongo_payment_id match
  if (paymentLinkId) {
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_ref, shop_id, customer_id, service_name, paymongo_payment_id')
      .eq('paymongo_payment_id', paymentLinkId)
      .eq('shop_id', shopId)
      .single()
    if (data) return data
  }

  // Strategy 4: regex extract booking_ref from description/remarks
  const description = eventData?.attributes?.description || eventData?.data?.attributes?.description || ''
  const remarks = eventData?.attributes?.remarks || eventData?.data?.attributes?.remarks || ''
  const refMatch = (remarks || description).match(/BK-\d{4}-\d{6}/)
  if (refMatch) {
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_ref, shop_id, customer_id, service_name, paymongo_payment_id')
      .eq('booking_ref', refMatch[0])
      .eq('shop_id', shopId)
      .single()
    if (data) return data
  }

  return null
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Rate limiting: 60 requests per minute per IP
  await webhookRateLimiter.check(event)

  // ── Read raw body FIRST for signature verification ──
  const rawBody = await readRawBody(event)

  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty request body' })
  }

  // Parse the body
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON body' })
  }

  // ── Get the shop slug from the route parameter ──
  const shopSlug = getRouterParam(event, 'shopSlug')

  if (!shopSlug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing shop slug' })
  }

  // ── Look up the shop by slug ──
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, name, paymongo_webhook_secret')
    .eq('slug', shopSlug)
    .single()

  if (shopError || !shop) {
    console.error(`[WEBHOOK] Shop not found for slug: ${shopSlug}`)
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  // ── Verify webhook signature ──
  const signatureHeader = getHeader(event, 'paymongo-signature')

  // Use explicit env flag instead of NODE_ENV to avoid accidental dev bypass in prod
  const skipVerification = process.env.SKIP_WEBHOOK_VERIFICATION === 'true'

  if (!skipVerification) {
    if (!signatureHeader) {
      console.error('[WEBHOOK] Missing paymongo-signature header')
      throw createError({ statusCode: 401, statusMessage: 'Missing signature' })
    }

    if (!shop.paymongo_webhook_secret) {
      console.error(`[WEBHOOK] Shop ${shopSlug} has no webhook secret configured`)
      throw createError({ statusCode: 401, statusMessage: 'Webhook secret not configured' })
    }

    // Decrypt the webhook secret
    let webhookSecret: string
    try {
      webhookSecret = decrypt(shop.paymongo_webhook_secret)
    } catch (e) {
      console.error('[WEBHOOK] Error decrypting webhook secret:', e)
      throw createError({ statusCode: 500, statusMessage: 'Failed to decrypt webhook secret' })
    }

    // Parse the Paymongo-Signature header.
    // Official format (per paymongo-node SDK): "t=<timestamp>,te=<test_sig>,li=<live_sig>"
    //   part[0] = "t=<timestamp>"   (Unix epoch seconds)
    //   part[1] = test-environment signature
    //   part[2] = live-environment signature
    // PayMongo always sends BOTH signatures. For a LIVE webhook the test signature
    // (`te`) is empty and ONLY the live signature (`li`) is populated, so selecting
    // the test signature alone makes every production webhook fail verification (401)
    // and bookings never reach `paid`. The official SDK prefers the live signature
    // when present, so we do the same. Parsing is positional (key-agnostic) so it
    // also tolerates a Stripe-style "t=<ts>,v1=<sig>" 2-part header.
    const sigParts = signatureHeader.split(',')
    let timestamp = ''
    const signatureCandidates: string[] = []
    for (const part of sigParts) {
      const eqIndex = part.indexOf('=')
      if (eqIndex === -1) continue
      const key = part.substring(0, eqIndex).trim()
      const value = part.substring(eqIndex + 1).trim()
      if (key === 't') {
        timestamp = value
      } else if (value) {
        signatureCandidates.push(value)
      }
    }

    // Prefer the live signature (last non-empty); fall back to the test signature.
    const providedSignature = signatureCandidates[signatureCandidates.length - 1]

    if (!providedSignature) {
      console.error('[WEBHOOK] No signature found in Paymongo-Signature header')
      throw createError({ statusCode: 401, statusMessage: 'Invalid signature format' })
    }

    if (!timestamp) {
      console.error('[WEBHOOK] Missing timestamp in Paymongo-Signature header')
      throw createError({ statusCode: 401, statusMessage: 'Invalid signature format' })
    }

    // Timestamp tolerance check — reject if > 5 minutes from server clock
    if (timestamp) {
      const webhookTime = parseInt(timestamp, 10)
      if (!isNaN(webhookTime)) {
        // PayMongo sends seconds; convert to ms for comparison
        const diffMs = Math.abs(Date.now() - webhookTime * 1000)
        if (diffMs > 5 * 60 * 1000) {
          console.error(`[WEBHOOK] Timestamp too old: ${diffMs}ms difference`)
          throw createError({ statusCode: 401, statusMessage: 'Timestamp expired' })
        }
      }
    }

    // Ensure rawBody is a string (readRawBody may return Buffer)
    const rawBodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')

    // Compute HMAC-SHA256 over "{timestamp}.{rawBody}" per PayMongo spec
    const message = `${timestamp}.${rawBodyStr}`
    const computedSig = createHmac('sha256', webhookSecret)
      .update(message)
      .digest('hex')

    // Use timingSafeEqual to prevent timing attacks
    try {
      const computedBuf = Buffer.from(computedSig, 'hex')
      const sigBuf = Buffer.from(providedSignature, 'hex')

      if (computedBuf.length !== sigBuf.length || !timingSafeEqual(computedBuf, sigBuf)) {
        console.error('[WEBHOOK] Signature verification failed')
        throw createError({ statusCode: 401, statusMessage: 'Signature verification failed' })
      }
    } catch (e: unknown) {
      if (e.statusCode) throw e
      console.error('[WEBHOOK] Signature comparison error:', e)
      throw createError({ statusCode: 401, statusMessage: 'Signature verification failed' })
    }
  } else {
    console.warn('[WEBHOOK] ⚠️ Signature verification BYPASSED (SKIP_WEBHOOK_VERIFICATION=true)')
  }

  // ── Determine event type ──
  const eventType = body?.data?.attributes?.type

  if (!eventType) {
    // No event type — acknowledge but ignore
    return { received: true }
  }

  // ── Extract event data ──
  // PayMongo sends the payment object (not the link object) in webhook events.
  // The data structure varies, so we check multiple nested paths.
  const eventData = body?.data?.attributes || body?.data || {}

  // The payment link ID may be in different locations depending on the event
  const paymentLinkId =
    eventData?.data?.id ||
    eventData?.data?.attributes?.payment_intent_id ||
    body?.data?.id ||
    null

  // ── Handle payment.paid ──
  if (eventType === 'payment.paid') {
    const booking = await findBooking(supabase, shop.id, eventData, paymentLinkId)

    if (!booking) {
      console.error(`[WEBHOOK] payment.paid — Booking not found for shop ${shopSlug}. Event data:`, JSON.stringify({ paymentLinkId, metadata: eventData?.data?.attributes?.metadata || eventData?.metadata }).substring(0, 500))
      return { received: true }
    }

    // Update booking: paid and confirmed
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        payment_status: 'paid',
        status: 'confirmed',
        paid_at: new Date().toISOString(),
      })
      .eq('id', booking.id)

    if (updateError) {
      console.error('[WEBHOOK] Error updating booking:', updateError)
    }

    // Also update the payment_verifications record to 'verified'
    const { error: verifyUpdateError } = await supabase
      .from('payment_verifications')
      .update({
        status: 'verified',
        reviewed_at: new Date().toISOString(),
      })
      .eq('booking_id', booking.id)
      .eq('shop_id', shop.id)

    if (verifyUpdateError) {
      console.error('[WEBHOOK] Error updating payment_verification:', verifyUpdateError)
    }

    // Log to activity_logs
    await supabase.from('activity_logs').insert({
      shop_id: shop.id,
      user_id: booking.customer_id,
      user_email: '',
      user_role: 'system',
      action: 'payment.paymongo_paid',
      entity_type: 'booking',
      entity_id: booking.id,
      entity_name: booking.booking_ref,
      new_value: {
        payment_status: 'paid',
        status: 'confirmed',
        paymongo_payment_id: paymentLinkId,
      },
    })

    // Send email notification — fetch customer email first
    try {
      const { data: customer } = await supabase
        .from('users')
        .select('email, display_name')
        .eq('id', booking.customer_id)
        .single()

      await sendShopEmail(shop.id, 'booking.confirmed', {
        bookingRef: booking.booking_ref,
        bookingId: booking.id,
        serviceName: booking.service_name,
        customer: {
          email: customer?.email || '',
          name: customer?.display_name || 'Customer',
        },
      })

      // Mark confirmation as sent
      await supabase
        .from('bookings')
        .update({ confirmation_sent: true })
        .eq('id', booking.id)
    } catch (emailError) {
      console.error('[WEBHOOK] Error sending confirmation email:', emailError)
    }

    return { received: true }
  }

  // ── Handle payment.failed ──
  if (eventType === 'payment.failed') {
    const booking = await findBooking(supabase, shop.id, eventData, paymentLinkId)

    if (!booking) {
      console.error(`[WEBHOOK] payment.failed — Booking not found for shop ${shopSlug}. Event data:`, JSON.stringify({ paymentLinkId, metadata: eventData?.data?.attributes?.metadata || eventData?.metadata }).substring(0, 500))
      return { received: true }
    }

    // Update booking: payment failed, revert to pending_payment
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        payment_status: 'failed',
        status: 'pending_payment',
      })
      .eq('id', booking.id)

    if (updateError) {
      console.error('[WEBHOOK] Error updating booking on payment failure:', updateError)
    }

    // Log to activity_logs
    await supabase.from('activity_logs').insert({
      shop_id: shop.id,
      user_id: booking.customer_id || '',
      user_email: '',
      user_role: 'system',
      action: 'payment.paymongo_failed',
      entity_type: 'booking',
      entity_id: booking.id,
      entity_name: booking.booking_ref,
      new_value: {
        payment_status: 'failed',
        status: 'pending_payment',
        paymongo_payment_id: paymentLinkId,
      },
    })

    console.error(`[WEBHOOK] Booking ${booking.booking_ref} payment failed via PayMongo`)
    return { received: true }
  }

  // ── All other events: acknowledge, ignore ──
  return { received: true }
})
