/**
 * POST /api/payments/verify-paymongo-payment
 *
 * Manually verifies a PayMongo payment by checking the payment session/link
 * status directly with the PayMongo API.
 *
 * Supports both:
 *   - Checkout Sessions (cs_*) — uses /v1/checkout_sessions/{id} — status: 'completed'
 *   - Payment Links (link_*) — uses /v1/links/{id} — status: 'paid' (backward compat)
 *
 * Used when:
 *   1. The webhook hasn't fired yet (dev/local environment)
 *   2. The user returns from PayMongo checkout and we need to confirm
 *
 * If the payment is paid, updates the booking status to 'confirmed'
 * and payment_status to 'paid'.
 *
 * Body: { bookingId: string }
 * Returns: { paid: boolean, status: string }
 */
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '~/utils/server/encryption'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  let body: { bookingId?: string } = {}
  try {
    body = await readBody(event) || {}
  } catch {
    body = {}
  }

  if (!body.bookingId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing bookingId' })
  }

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Fetch the booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_ref, shop_id, paymongo_payment_id, payment_status, status, payment_type')
    .eq('id', body.bookingId)
    .single()

  if (bookingError || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  // Already paid?
  if (booking.payment_status === 'paid') {
    return { paid: true, status: booking.status }
  }

  // Not a PayMongo payment?
  if (booking.payment_type !== 'paymongo') {
    return { paid: false, status: booking.status, message: 'Not a PayMongo payment' }
  }

  // No PayMongo link ID?
  if (!booking.paymongo_payment_id) {
    return { paid: false, status: booking.status, message: 'No PayMongo payment link ID on booking' }
  }

  // Fetch shop to get secret key
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, paymongo_secret_key, paymongo_enabled')
    .eq('id', booking.shop_id)
    .single()

  if (shopError || !shop || !shop.paymongo_secret_key) {
    throw createError({ statusCode: 403, statusMessage: 'Shop PayMongo not configured' })
  }

  // Decrypt secret key
  let secretKey: string
  try {
    secretKey = decrypt(shop.paymongo_secret_key)
  } catch (e: any) {
    console.error('[verify-paymongo-payment] Decryption error:', e.message)
    throw createError({ statusCode: 500, statusMessage: 'Failed to decrypt PayMongo secret key' })
  }

  // Check the payment status with PayMongo API
  // Support both Checkout Sessions (cs_*) and Payment Links (link_*)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    const isCheckoutSession = booking.paymongo_payment_id.startsWith('cs_')

    let response: Response
    if (isCheckoutSession) {
      // Checkout Sessions API — the session ID starts with "cs_"
      response = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${booking.paymongo_payment_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
    } else {
      // Payment Links API — backward compatibility for old link IDs
      response = await fetch(`https://api.paymongo.com/v1/links/${booking.paymongo_payment_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
    }

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[verify-paymongo-payment] PayMongo API error:', response.status, errorData)
      return { paid: false, status: booking.status, message: 'Could not check PayMongo payment status' }
    }

    const result = await response.json()
    const attributes = result.data?.attributes || {}

    // Determine if payment is completed:
    // - Checkout Sessions: status === 'completed'
    // - Payment Links: status === 'paid'
    const isPaid = isCheckoutSession
      ? attributes.status === 'completed'
      : attributes.status === 'paid'

    if (isPaid) {
      // Update booking — payment confirmed!
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          payment_status: 'paid',
          status: 'confirmed',
          paid_at: new Date().toISOString(),
        })
        .eq('id', booking.id)

      if (updateError) {
        console.error('[verify-paymongo-payment] Error updating booking:', updateError)
      }

      // Also update the payment_verifications record to 'verified'
      const { error: verifyUpdateError } = await supabase
        .from('payment_verifications')
        .update({
          status: 'verified',
          reviewed_at: new Date().toISOString(),
        })
        .eq('booking_id', booking.id)
        .eq('shop_id', booking.shop_id)

      if (verifyUpdateError) {
        console.error('[verify-paymongo-payment] Error updating payment_verification:', verifyUpdateError)
      }

      // Log to activity_logs
      await supabase.from('activity_logs').insert({
        shop_id: booking.shop_id,
        user_id: null,
        user_email: '',
        user_role: 'system',
        action: 'payment.paymongo_paid_verified',
        entity_type: 'booking',
        entity_id: booking.id,
        entity_name: booking.booking_ref,
        new_value: {
          payment_status: 'paid',
          status: 'confirmed',
          verified_via: 'manual_api_check',
        },
      })

      console.log(`[verify-paymongo-payment] Booking ${booking.booking_ref} confirmed as PAID`)
      return { paid: true, status: 'confirmed' }
    } else {
      // Payment not yet completed
      return { paid: false, status: booking.status, paymongoStatus: attributes.status }
    }
  } catch (error: any) {
    console.error('[verify-paymongo-payment] Error:', error.name, error.message)
    if (error.name === 'AbortError') {
      return { paid: false, status: booking.status, message: 'PayMongo API timed out' }
    }
    return { paid: false, status: booking.status, message: 'Failed to check payment status' }
  }
})
