/**
 * PATCH /api/admin/payment-verifications/[id]/verify
 *
 * Verify a payment:
 *  - Set payment_verifications.status = 'verified'
 *  - Set bookings.payment_status = 'verified'
 *  - Set bookings.status = 'confirmed'
 *  - Set reviewed_by, reviewed_at
 *  - Log to activity_logs
 *  - If shop is upgraded: trigger email notification (placeholder)
 *
 * Accessible by: admin, manager, cashier
 */
import { createClient } from '@supabase/supabase-js'
import { sendShopEmail } from '~/utils/server/sendShopEmail'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const verificationId = getRouterParam(event, 'id')
  if (!verificationId) {
    throw createError({ statusCode: 400, statusMessage: 'Verification ID is required' })
  }

  // Authenticate
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }

  const supabase = createClient(config.public.supabaseUrl as string, config.public.supabaseKey as string, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }

  const supabaseAdmin = createClient(config.public.supabaseUrl as string, config.supabaseServiceKey as string)
  const { data: userProfile } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['admin', 'manager', 'cashier'].includes(userProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Get the verification record and verify ownership
  const { data: verification, error: fetchError } = await supabaseAdmin
    .from('payment_verifications')
    .select('*, bookings(booking_ref, customer_id)')
    .eq('id', verificationId)
    .eq('shop_id', userProfile.shop_id)
    .single()

  if (fetchError || !verification) {
    throw createError({ statusCode: 404, statusMessage: 'Verification not found or does not belong to your shop' })
  }

  if (verification.status !== 'pending' && verification.status !== 'more_info') {
    throw createError({ statusCode: 409, statusMessage: `Cannot verify a payment with status '${verification.status}'. Only pending or more_info verifications can be verified.` })
  }

  const now = new Date().toISOString()

  // Update payment_verifications
  const { error: updateVerificationError } = await supabaseAdmin
    .from('payment_verifications')
    .update({
      status: 'verified',
      reviewed_by: user.id,
      reviewed_at: now,
    })
    .eq('id', verificationId)

  if (updateVerificationError) {
    console.error('Error updating verification:', updateVerificationError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update verification status' })
  }

  // Update booking
  const booking = verification.bookings as any
  const { error: updateBookingError } = await supabaseAdmin
    .from('bookings')
    .update({
      payment_status: 'verified',
      status: 'confirmed',
      verified_by: user.id,
      verified_at: now,
    })
    .eq('id', verification.booking_id)

  if (updateBookingError) {
    console.error('Error updating booking status:', updateBookingError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update booking status' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'payment.verified',
    entity_type: 'payment_verification',
    entity_id: verificationId,
    entity_name: booking?.booking_ref || verification.booking_id,
    old_value: { status: verification.status },
    new_value: { status: 'verified', reviewed_by: user.id, reviewed_at: now },
  })

  // Trigger email notification — fetch customer email first
  try {
    const { data: customer } = await supabaseAdmin
      .from('users')
      .select('email, display_name')
      .eq('id', verification.customer_id)
      .single()

    // Fetch booking details for the email template
    const { data: bookingDetails } = await supabaseAdmin
      .from('bookings')
      .select('service_name, date, start_time, barber_id')
      .eq('id', verification.booking_id)
      .single()

    // Fetch barber name
    let barberName = 'Your Barber'
    if (bookingDetails?.barber_id) {
      const { data: barberUser } = await supabaseAdmin
        .from('barbers')
        .select('user_id')
        .eq('id', bookingDetails.barber_id)
        .single()
      if (barberUser?.user_id) {
        const { data: barberProfile } = await supabaseAdmin
          .from('users')
          .select('display_name')
          .eq('id', barberUser.user_id)
          .single()
        barberName = barberProfile?.display_name || 'Your Barber'
      }
    }

    await sendShopEmail(userProfile.shop_id, 'payment.verified', {
      bookingRef: booking?.booking_ref,
      bookingId: verification.booking_id,
      amount: `PHP ${Number(verification.amount).toFixed(2)}`,
      paymentMethod: verification.payment_method_id || 'Manual',
      serviceName: bookingDetails?.service_name || 'Service',
      barberName,
      date: bookingDetails?.date || '',
      time: bookingDetails?.start_time || '',
      customer: {
        email: customer?.email || '',
        name: customer?.display_name || 'Customer',
      },
    })
  } catch (emailError) {
    console.error('[VERIFY] Error sending payment verified email:', emailError)
  }

  return { success: true, message: 'Payment verified successfully' }
})
