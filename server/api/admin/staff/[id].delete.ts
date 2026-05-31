/**
 * DELETE /api/admin/staff/[id]
 *
 * Remove a staff member from the shop.
 * - Deletes the barber record (if exists)
 * - Removes the user from the shop (sets shop_id = null, is_active = false)
 * - Removes barber from all service barber_ids
 * - Does NOT delete the Supabase auth user (they may still have an account)
 *
 * Accessible by: admin only
 * Cannot remove self or other admins
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Staff ID is required' })
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
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin role required to remove staff' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Cannot remove self
  if (userId === user.id) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot remove yourself from the team' })
  }

  // Verify the target user belongs to this shop
  const { data: targetUser, error: targetError } = await supabaseAdmin
    .from('users')
    .select('id, email, display_name, role, shop_id')
    .eq('id', userId)
    .single()

  if (targetError || !targetUser) {
    throw createError({ statusCode: 404, statusMessage: 'Staff member not found' })
  }

  if (targetUser.shop_id !== userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'Staff member does not belong to your shop' })
  }

  // Cannot remove other admins
  if (targetUser.role === 'admin') {
    throw createError({ statusCode: 400, statusMessage: 'Cannot remove admin accounts. Transfer ownership first.' })
  }

  // Check for active bookings assigned to this barber
  if (targetUser.role === 'barber') {
    const { data: barberRecord } = await supabaseAdmin
      .from('barbers')
      .select('id')
      .eq('user_id', userId)
      .eq('shop_id', userProfile.shop_id)
      .single()

    if (barberRecord) {
      const { count: activeBookings } = await supabaseAdmin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('barber_id', barberRecord.id)
        .in('status', ['pending', 'pending_payment', 'confirmed', 'in_progress'])

      if (activeBookings && activeBookings > 0) {
        throw createError({
          statusCode: 409,
          statusMessage: `This barber has ${activeBookings} active booking(s). Please reassign or complete them before removing.`,
        })
      }

      // Remove barber from all services' barber_ids
      const { data: shopServices } = await supabaseAdmin
        .from('services')
        .select('id, barber_ids')
        .eq('shop_id', userProfile.shop_id)

      if (shopServices) {
        for (const svc of shopServices) {
          if (svc.barber_ids && Array.isArray(svc.barber_ids) && svc.barber_ids.includes(barberRecord.id)) {
            const updatedBarberIds = svc.barber_ids.filter((id: string) => id !== barberRecord.id)
            await supabaseAdmin
              .from('services')
              .update({ barber_ids: updatedBarberIds })
              .eq('id', svc.id)
          }
        }
      }

      // Delete the barber record
      const { error: barberDeleteError } = await supabaseAdmin
        .from('barbers')
        .delete()
        .eq('id', barberRecord.id)

      if (barberDeleteError) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to remove barber record' })
      }
    }
  }

  // Unlink user from shop and deactivate
  const { error: userUpdateError } = await supabaseAdmin
    .from('users')
    .update({
      shop_id: null,
      is_active: false,
      role: 'customer', // Demote to customer role
    })
    .eq('id', userId)

  if (userUpdateError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove staff member' })
  }

  // ─── Activity log ───────────────────────────────────
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'staff.removed',
    entity_type: 'staff',
    entity_id: userId,
    entity_name: targetUser.display_name,
    old_value: targetUser,
  })

  return { success: true, message: 'Staff member removed' }
})
