/**
 * DELETE /api/admin/payment-methods/[id]
 *
 * Delete a payment method.
 * If the method has been used in any manual booking, refuse deletion and
 * offer deactivation instead.
 *
 * Special handling: If the only references are from PayMongo payment_verifications
 * (which were incorrectly linked in previous versions), we auto-clean them by
 * setting payment_method_id = NULL, then allow deletion.
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const methodId = getRouterParam(event, 'id')
  if (!methodId) {
    throw createError({ statusCode: 400, statusMessage: 'Payment method ID is required' })
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

  if (!userProfile || !['admin', 'manager'].includes(userProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Verify the payment method belongs to this shop
  const { data: existingMethod, error: fetchError } = await supabaseAdmin
    .from('payment_methods')
    .select('id, name, shop_id')
    .eq('id', methodId)
    .eq('shop_id', userProfile.shop_id)
    .single()

  if (fetchError || !existingMethod) {
    throw createError({ statusCode: 404, statusMessage: 'Payment method not found or does not belong to your shop' })
  }

  // Check if this payment method has been used in any booking
  const { count: bookingCount, error: countError } = await supabaseAdmin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('payment_method_id', methodId)

  if (countError) {
    console.error('Error checking booking references:', countError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to check booking references' })
  }

  if (bookingCount && bookingCount > 0) {
    // Refuse deletion — method has been used in actual manual bookings
    throw createError({
      statusCode: 409,
      statusMessage: 'This payment method has been used in existing bookings. You can deactivate it instead.',
      data: { usedInBookings: bookingCount, canDeactivate: true },
    })
  }

  // Check payment_verifications — auto-clean PayMongo references
  const { count: verificationCount } = await supabaseAdmin
    .from('payment_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('payment_method_id', methodId)

  if (verificationCount && verificationCount > 0) {
    // Check if ALL the verification references are from PayMongo bookings
    // (reference_number starting with "PayMongo")
    const { data: paymongoVerifications } = await supabaseAdmin
      .from('payment_verifications')
      .select('id')
      .eq('payment_method_id', methodId)
      .ilike('reference_number', 'PayMongo%')

    if (paymongoVerifications && paymongoVerifications.length === verificationCount) {
      // All references are from PayMongo verifications — these were incorrectly linked.
      // Auto-clean them by setting payment_method_id = NULL.
      const { error: cleanError } = await supabaseAdmin
        .from('payment_verifications')
        .update({ payment_method_id: null })
        .eq('payment_method_id', methodId)
        .ilike('reference_number', 'PayMongo%')

      if (cleanError) {
        // Column might still be NOT NULL — can't auto-clean
        console.error('[PAYMENT-METHODS-DELETE] Failed to auto-clean PayMongo verification references:', cleanError.message)
        throw createError({
          statusCode: 409,
          statusMessage: 'This payment method has been used in existing verifications. You can deactivate it instead.',
          data: { usedInVerifications: verificationCount, canDeactivate: true },
        })
      }

      console.log(`[PAYMENT-METHODS-DELETE] Auto-cleaned ${verificationCount} PayMongo verification references for method ${methodId}`)
      // Fall through to allow deletion
    } else {
      // Has manual verification references — refuse deletion
      throw createError({
        statusCode: 409,
        statusMessage: 'This payment method has been used in existing verifications. You can deactivate it instead.',
        data: { usedInVerifications: verificationCount, canDeactivate: true },
      })
    }
  }

  // Safe to delete
  const { error: deleteError } = await supabaseAdmin
    .from('payment_methods')
    .delete()
    .eq('id', methodId)

  if (deleteError) {
    console.error('Error deleting payment method:', deleteError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete payment method' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'payment_method.deleted',
    entity_type: 'payment_method',
    entity_id: methodId,
    entity_name: existingMethod.name,
    old_value: existingMethod,
  })

  return { success: true, message: 'Payment method deleted' }
})
