/**
 * DELETE /api/admin/services/[id]
 *
 * Delete a service.
 * If the service has been used in any booking, refuse deletion and
 * offer deactivation instead.
 *
 * Accessible by: admin only
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const serviceId = getRouterParam(event, 'id')
  if (!serviceId) {
    throw createError({ statusCode: 400, statusMessage: 'Service ID is required' })
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

  if (!userProfile || userProfile.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Verify the service belongs to this shop
  const { data: existingService, error: fetchError } = await supabaseAdmin
    .from('services')
    .select('id, name, shop_id')
    .eq('id', serviceId)
    .eq('shop_id', userProfile.shop_id)
    .single()

  if (fetchError || !existingService) {
    throw createError({ statusCode: 404, statusMessage: 'Service not found or does not belong to your shop' })
  }

  // Check if this service has been used in any booking
  const { count: bookingCount, error: countError } = await supabaseAdmin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', serviceId)

  if (countError) {
    console.error('Error checking booking references:', countError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to check booking references' })
  }

  if (bookingCount && bookingCount > 0) {
    // Refuse deletion — service has been used in bookings
    throw createError({
      statusCode: 409,
      statusMessage: 'This service has been used in existing bookings. You can deactivate it instead.',
      data: { usedInBookings: bookingCount, canDeactivate: true },
    })
  }

  // Safe to delete
  const { error: deleteError } = await supabaseAdmin
    .from('services')
    .delete()
    .eq('id', serviceId)

  if (deleteError) {
    console.error('Error deleting service:', deleteError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete service' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'service.deleted',
    entity_type: 'service',
    entity_id: serviceId,
    entity_name: existingService.name,
    old_value: existingService,
  })

  return { success: true, message: 'Service deleted' }
})
