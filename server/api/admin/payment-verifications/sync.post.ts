/**
 * POST /api/admin/payment-verifications/sync
 *
 * Creates payment_verifications records for bookings that have proof images
 * but no matching verification record yet. This keeps the verifications table
 * in sync with bookings that were uploaded via the proof upload flow.
 *
 * Accessible by: admin, manager, cashier
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Authenticate
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  const authUser = await verifyAuth(token || '')

  // Role check
  if (!['admin', 'manager', 'cashier'].includes(authUser.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }
  if (!authUser.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  )

  // Find bookings with proof but no verification record
  const { data: bookings, error: bookingsError } = await supabaseAdmin
    .from('bookings')
    .select('id, shop_id, customer_id, payment_method_id, payment_amount, proof_image_url, reference_number')
    .eq('shop_id', authUser.shop_id)
    .eq('payment_type', 'manual')
    .eq('payment_status', 'pending_verification')
    .not('proof_image_url', 'is', null)
    .neq('proof_image_url', '')

  if (bookingsError) {
    console.error('[PAYMENT-SYNC] Error fetching bookings:', bookingsError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
  }

  let created = 0

  for (const booking of bookings || []) {
    const { data: existing } = await supabaseAdmin
      .from('payment_verifications')
      .select('id')
      .eq('booking_id', booking.id)
      .maybeSingle()

    if (!existing && booking.payment_method_id) {
      const { error: insertError } = await supabaseAdmin
        .from('payment_verifications')
        .insert({
          shop_id: booking.shop_id,
          booking_id: booking.id,
          customer_id: booking.customer_id || null,
          payment_method_id: booking.payment_method_id,
          amount: booking.payment_amount || 0,
          proof_image_url: booking.proof_image_url || '',
          reference_number: booking.reference_number || null,
          status: 'pending',
        })

      if (insertError) {
        console.error(`[PAYMENT-SYNC] Failed to create verification for booking ${booking.id}:`, insertError)
      } else {
        created++
      }
    }
  }

  return { created }
})
