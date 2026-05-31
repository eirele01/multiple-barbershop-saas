/**
 * PATCH /api/admin/payment-verifications/[id]/reject
 *
 * Reject a payment:
 *  - Set payment_verifications.status = 'rejected'
 *  - Set rejection_reason
 *  - Set bookings.payment_status = 'rejected'
 *  - Set bookings.status = 'pending_payment' (allows re-upload)
 *  - Set reviewed_by, reviewed_at
 *  - Log to activity_logs
 *  - If shop is upgraded: trigger email notification (placeholder)
 *
 * Accessible by: admin, manager, cashier
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sendShopEmail } from '~/utils/server/sendShopEmail'

const rejectSchema = z.object({
  rejection_reason: z.string().min(1, 'Rejection reason is required').max(500),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const verificationId = getRouterParam(event, 'id')
  if (!verificationId) {
    throw createError({ statusCode: 400, statusMessage: 'Verification ID is required' })
  }

  const body = await readBody(event)
  const parsed = rejectSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { rejection_reason } = parsed.data

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
    throw createError({ statusCode: 409, statusMessage: `Cannot reject a payment with status '${verification.status}'` })
  }

  const now = new Date().toISOString()
  const booking = verification.bookings as any

  // Update payment_verifications
  const { error: updateVerificationError } = await supabaseAdmin
    .from('payment_verifications')
    .update({
      status: 'rejected',
      rejection_reason,
      reviewed_by: user.id,
      reviewed_at: now,
    })
    .eq('id', verificationId)

  if (updateVerificationError) {
    console.error('Error rejecting verification:', updateVerificationError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to reject verification' })
  }

  // Update booking — set to pending_payment so customer can re-upload
  const { error: updateBookingError } = await supabaseAdmin
    .from('bookings')
    .update({
      payment_status: 'rejected',
      status: 'pending_payment',
      rejection_reason,
    })
    .eq('id', verification.booking_id)

  if (updateBookingError) {
    console.error('Error updating booking:', updateBookingError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update booking status' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'payment.rejected',
    entity_type: 'payment_verification',
    entity_id: verificationId,
    entity_name: booking?.booking_ref || verification.booking_id,
    old_value: { status: verification.status },
    new_value: { status: 'rejected', rejection_reason },
  })

  // Trigger email notification — fetch customer email first
  try {
    const { data: customer } = await supabaseAdmin
      .from('users')
      .select('email, display_name')
      .eq('id', verification.customer_id)
      .single()

    // Fetch shop slug for re-upload link
    const { data: shopData } = await supabaseAdmin
      .from('shops')
      .select('slug')
      .eq('id', userProfile.shop_id)
      .single()

    await sendShopEmail(userProfile.shop_id, 'payment.rejected', {
      bookingRef: booking?.booking_ref,
      rejectionReason: rejection_reason,
      shopSlug: shopData?.slug || '',
      customer: {
        email: customer?.email || '',
        name: customer?.display_name || 'Customer',
      },
    })
  } catch (emailError) {
    console.error('[REJECT] Error sending payment rejected email:', emailError)
  }

  return { success: true, message: 'Payment rejected' }
})
