/**
 * PATCH /api/admin/payment-verifications/[id]/request-info
 *
 * Request more information from the customer:
 *  - Set payment_verifications.status = 'more_info'
 *  - Set info_request_msg
 *  - Log to activity_logs
 *  - If shop is upgraded: trigger email notification (placeholder)
 *
 * Accessible by: admin, manager, cashier
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sendShopEmail } from '~/utils/server/sendShopEmail'

const requestInfoSchema = z.object({
  info_request_msg: z.string().min(1, 'Message is required').max(500),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const verificationId = getRouterParam(event, 'id')
  if (!verificationId) {
    throw createError({ statusCode: 400, statusMessage: 'Verification ID is required' })
  }

  const body = await readBody(event)
  const parsed = requestInfoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { info_request_msg } = parsed.data

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
    throw createError({ statusCode: 409, statusMessage: `Cannot request info for a payment with status '${verification.status}'` })
  }

  const booking = verification.bookings as any

  // Update payment_verifications
  const { error: updateError } = await supabaseAdmin
    .from('payment_verifications')
    .update({
      status: 'more_info',
      info_request_msg,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', verificationId)

  if (updateError) {
    console.error('Error requesting info:', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update verification' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'payment.info_requested',
    entity_type: 'payment_verification',
    entity_id: verificationId,
    entity_name: booking?.booking_ref || verification.booking_id,
    old_value: { status: verification.status },
    new_value: { status: 'more_info', info_request_msg },
  })

  // Trigger email notification — fetch customer email first
  try {
    const { data: customer } = await supabaseAdmin
      .from('users')
      .select('email, display_name')
      .eq('id', verification.customer_id)
      .single()

    // Note: 'payment.info_requested' doesn't have a dedicated template yet.
    // When a template is added, call sendShopEmail here.
  } catch (emailError) {
    console.error('[REQUEST-INFO] Error preparing email:', emailError)
  }

  return { success: true, message: 'Info request sent to customer' }
})
