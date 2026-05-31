/**
 * POST /api/payments/create-paymongo-link
 *
 * Creates a PayMongo Checkout Session for a booking.
 * Server-side only — uses the shop's decrypted paymongo_secret_key
 * (never exposed to frontend).
 *
 * Uses PayMongo's Checkout Sessions API (/v1/checkout_sessions) which
 * auto-redirects the customer back to the shop after payment.
 * The older Payment Links API (/v1/links) only shows a "Return to merchant"
 * button and does NOT auto-redirect.
 *
 * - Decrypts secret key before API call
 * - Calculates final amount from payment_amount - discount_applied
 * - Builds payment_method_types from enabled flags
 * - Stores PayMongo session ID on booking BEFORE returning checkout URL
 *
 * Body: { bookingId, bookingRef, shopId, slug }
 * Returns: { checkoutUrl }
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { decrypt } from '~/utils/server/encryption'

const PAYMONGO_TIMEOUT_MS = 15_000

const createLinkSchema = z.object({
  bookingId: z.string().uuid(),
  bookingRef: z.string().min(1),
  shopId: z.string().uuid(),
  slug: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const parsed = createLinkSchema.safeParse(body)
  if (!parsed.success) {
    console.error('[create-paymongo-link] Validation failed:', parsed.error.flatten().fieldErrors)
    console.error('[create-paymongo-link] Received body:', JSON.stringify(body))
    throw createError({
      statusCode: 400,
      statusMessage: `Validation failed: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { bookingId, bookingRef, shopId, slug } = parsed.data

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // ── Step 1: Fetch shop with decrypted secret key ──
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, name, paymongo_secret_key, paymongo_enabled, plan, paymongo_test_mode, gcash_enabled, maya_enabled, instapay_enabled, qr_ph_enabled')
    .eq('id', shopId)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  // Verify PayMongo is enabled and on upgraded plan
  if (shop.plan !== 'upgraded' || !shop.paymongo_enabled || !shop.paymongo_secret_key) {
    throw createError({ statusCode: 403, statusMessage: 'PayMongo is not enabled for this shop' })
  }

  // Decrypt the secret key
  let secretKey: string
  try {
    secretKey = decrypt(shop.paymongo_secret_key)
  } catch (e) {
    console.error('Error decrypting PayMongo secret key:', e)
    throw createError({ statusCode: 500, statusMessage: 'Failed to decrypt PayMongo secret key. Please re-enter it in settings.' })
  }

  // ── Step 2: Fetch booking with payment details ──
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_ref, service_name, payment_amount, discount_applied')
    .eq('id', bookingId)
    .single()

  if (bookingError || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  // ── Step 3: Calculate final amount ──
  const paymentAmount = booking.payment_amount || 0
  const discountApplied = booking.discount_applied || 0
  const finalAmount = paymentAmount - discountApplied
  const amountInCentavos = Math.round(finalAmount * 100)

  if (amountInCentavos <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Payment amount must be greater than zero' })
  }

  // ── Step 4: Build payment_method_allowed from enabled flags ──
  const paymentMethodAllowed = [
    shop.gcash_enabled ? 'gcash' : null,
    shop.maya_enabled ? 'paymaya' : null,
    shop.instapay_enabled ? 'instapay' : null,
    shop.qr_ph_enabled ? 'qrph' : null,
  ].filter(Boolean) as string[]

  if (paymentMethodAllowed.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'No PayMongo payment methods are enabled. Please configure payment settings.',
    })
  }

  // ── Step 5: Build return URL (Checkout Sessions uses a single return_url) ──
  const baseUrl = getRequestURL(event).origin
  const returnUrl = `${baseUrl}/shop/${slug}/book/payment-success?bookingRef=${encodeURIComponent(bookingRef)}&bookingId=${encodeURIComponent(bookingId)}`

  // ── Step 6: POST to PayMongo /v1/checkout_sessions ──
  //
  // Checkout Sessions API auto-redirects the customer after payment,
  // unlike the older /v1/links API which only shows a "Return to merchant" button.
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PAYMONGO_TIMEOUT_MS)

    const paymongoResponse = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                currency: 'PHP',
                amount: amountInCentavos,
                name: booking.service_name || 'Service',
                quantity: 1,
              },
            ],
            payment_method_types: paymentMethodAllowed,
            return_url: returnUrl,
            reference_number: bookingRef,
            metadata: {
              booking_id: bookingId,
              booking_ref: bookingRef,
              shop_id: shopId,
            },
            description: `${booking.service_name} at ${shop.name}`,
            send_email_receipt: false,
            show_line_items: true,
            show_description: true,
          },
        },
      }),
    })

    clearTimeout(timeoutId)

    if (!paymongoResponse.ok) {
      const errorData = await paymongoResponse.json().catch(() => ({}))
      console.error('PayMongo API error:', JSON.stringify(errorData))
      const paymongoMsg = errorData?.errors?.[0]?.detail || errorData?.errors?.[0]?.code || 'Unknown PayMongo error'
      throw createError({
        statusCode: 502,
        statusMessage: `PayMongo API error: ${paymongoMsg}`,
      })
    }

    const result = await paymongoResponse.json()
    const checkoutUrl = result.data?.attributes?.checkout_url
    const paymongoLinkId = result.data?.id

    if (!checkoutUrl) {
      throw createError({
        statusCode: 502,
        statusMessage: 'PayMongo did not return a checkout URL',
      })
    }

    // ── Step 7: Store PayMongo link ID on booking BEFORE returning ──
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        paymongo_payment_id: paymongoLinkId || null,
      })
      .eq('id', bookingId)

    if (updateError) {
      console.error('Error updating booking with PayMongo payment ID:', updateError)
      // Don't fail the request — the link was created, just log the error
    }

    // ── Step 8: Return checkout URL ──
    return { checkoutUrl }
  } catch (error: any) {
    if (error.statusCode) throw error

    if (error.name === 'AbortError') {
      console.error('PayMongo link creation timed out')
      throw createError({
        statusCode: 504,
        statusMessage: 'PayMongo API timed out. Please try again.',
      })
    }

    console.error('PayMongo link creation error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create payment link',
    })
  }
})
