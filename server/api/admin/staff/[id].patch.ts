/**
 * PATCH /api/admin/staff/[id]
 *
 * Update staff/barber details.
 * The [id] parameter is the user_id of the staff member.
 *
 * Accessible by: admin, manager
 * Validates: shop ownership, role
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const updateStaffSchema = z.object({
  display_name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).nullable().optional(),
  photo_url: z.string().url().nullable().optional(),
  is_active: z.boolean().optional(),
  // Barber fields
  bio: z.string().max(500).nullable().optional(),
  specialties: z.array(z.string()).optional(),
  experience_yrs: z.number().min(0).max(50).nullable().optional(),
  schedule: z.record(z.any()).optional(),
  time_off: z.array(z.any()).optional(),
  service_ids: z.array(z.string()).optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Staff ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateStaffSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
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

  // Verify the target user belongs to this shop
  const { data: targetUser, error: targetError } = await supabaseAdmin
    .from('users')
    .select('id, email, display_name, role, shop_id, is_active')
    .eq('id', userId)
    .single()

  if (targetError || !targetUser) {
    throw createError({ statusCode: 404, statusMessage: 'Staff member not found' })
  }

  if (targetUser.shop_id !== userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'Staff member does not belong to your shop' })
  }

  // Managers cannot modify admin or other managers
  if (userProfile.role === 'manager' && ['admin', 'manager'].includes(targetUser.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Managers cannot modify admin or manager accounts' })
  }

  const { service_ids, ...updateFields } = parsed.data

  // ─── Update users table ─────────────────────────────
  const userUpdateFields: Record<string, unknown> = {}
  if (updateFields.display_name !== undefined) userUpdateFields.display_name = updateFields.display_name
  if (updateFields.phone !== undefined) userUpdateFields.phone_number = updateFields.phone
  if (updateFields.photo_url !== undefined) userUpdateFields.photo_url = updateFields.photo_url
  if (updateFields.is_active !== undefined) userUpdateFields.is_active = updateFields.is_active

  if (Object.keys(userUpdateFields).length > 0) {
    const { error: userUpdateError } = await supabaseAdmin
      .from('users')
      .update(userUpdateFields)
      .eq('id', userId)

    if (userUpdateError) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to update user profile' })
    }
  }

  // ─── Update barbers table (if barber) ───────────────
  if (targetUser.role === 'barber') {
    const barberUpdateFields: Record<string, unknown> = {}

    if (updateFields.bio !== undefined) barberUpdateFields.bio = updateFields.bio
    if (updateFields.specialties !== undefined) barberUpdateFields.specialties = updateFields.specialties
    if (updateFields.experience_yrs !== undefined) barberUpdateFields.experience_yrs = updateFields.experience_yrs
    if (updateFields.schedule !== undefined) barberUpdateFields.schedule = updateFields.schedule
    if (updateFields.time_off !== undefined) barberUpdateFields.time_off = updateFields.time_off
    if (updateFields.is_active !== undefined) barberUpdateFields.is_active = updateFields.is_active

    if (Object.keys(barberUpdateFields).length > 0) {
      const { error: barberUpdateError } = await supabaseAdmin
        .from('barbers')
        .update(barberUpdateFields)
        .eq('user_id', userId)
        .eq('shop_id', userProfile.shop_id)

      if (barberUpdateError) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to update barber details' })
      }
    }

    // ─── Update service barber_ids if provided ───────
    if (service_ids !== undefined) {
      // Get the barber record id
      const { data: barberRecord } = await supabaseAdmin
        .from('barbers')
        .select('id')
        .eq('user_id', userId)
        .eq('shop_id', userProfile.shop_id)
        .single()

      if (barberRecord) {
        const barberId = barberRecord.id

        // Remove this barber from all services first
        const { data: allServices } = await supabaseAdmin
          .from('services')
          .select('id, barber_ids')
          .eq('shop_id', userProfile.shop_id)

        if (allServices) {
          for (const svc of allServices) {
            if (svc.barber_ids && Array.isArray(svc.barber_ids) && svc.barber_ids.includes(barberId)) {
              const updatedBarberIds = svc.barber_ids.filter((id: string) => id !== barberId)
              await supabaseAdmin
                .from('services')
                .update({ barber_ids: updatedBarberIds })
                .eq('id', svc.id)
            }
          }
        }

        // Add barber to selected services
        if (service_ids.length > 0) {
          for (const serviceId of service_ids) {
            const { data: svc } = await supabaseAdmin
              .from('services')
              .select('barber_ids')
              .eq('id', serviceId)
              .eq('shop_id', userProfile.shop_id)
              .single()

            if (svc) {
              const currentBarberIds = svc.barber_ids || []
              if (!currentBarberIds.includes(barberId)) {
                await supabaseAdmin
                  .from('services')
                  .update({ barber_ids: [...currentBarberIds, barberId] })
                  .eq('id', serviceId)
              }
            }
          }
        }
      }
    }
  }

  // ─── Activity log ───────────────────────────────────
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'staff.updated',
    entity_type: 'staff',
    entity_id: userId,
    entity_name: updateFields.display_name || targetUser.display_name,
    old_value: targetUser,
    new_value: parsed.data,
  })

  return { success: true }
})
