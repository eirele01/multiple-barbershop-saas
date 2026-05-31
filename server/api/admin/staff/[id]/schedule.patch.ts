/**
 * PATCH /api/admin/staff/[id]/schedule
 *
 * Update a barber's weekly schedule and time off.
 * The [id] parameter is the user_id of the barber.
 *
 * Body: { schedule: Record<string, BarberSchedule>, time_off: BarberTimeOff[] }
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const breakSchema = z.object({
  start: z.string(),
  end: z.string(),
})

const dayScheduleSchema = z.object({
  start: z.string(),
  end: z.string(),
  is_working: z.boolean(),
  breaks: z.array(breakSchema),
})

const timeOffSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  reason: z.string(),
})

const updateScheduleSchema = z.object({
  schedule: z.record(dayScheduleSchema).optional(),
  time_off: z.array(timeOffSchema).optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'Staff ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateScheduleSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { schedule, time_off } = parsed.data

  if (!schedule && time_off === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Provide schedule or time_off to update' })
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

  // Verify target user is a barber in this shop
  const { data: targetUser } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id, display_name')
    .eq('id', userId)
    .single()

  if (!targetUser || targetUser.shop_id !== userProfile.shop_id) {
    throw createError({ statusCode: 404, statusMessage: 'Staff member not found in your shop' })
  }

  if (targetUser.role !== 'barber') {
    throw createError({ statusCode: 400, statusMessage: 'Schedule updates are only available for barbers' })
  }

  // Get the barber record
  const { data: barberRecord, error: barberError } = await supabaseAdmin
    .from('barbers')
    .select('id, schedule, time_off')
    .eq('user_id', userId)
    .eq('shop_id', userProfile.shop_id)
    .single()

  if (barberError || !barberRecord) {
    throw createError({ statusCode: 404, statusMessage: 'Barber record not found' })
  }

  // Build update object
  const barberUpdateFields: Record<string, unknown> = {}
  if (schedule) barberUpdateFields.schedule = schedule
  if (time_off !== undefined) barberUpdateFields.time_off = time_off

  const { data: updatedBarber, error: updateError } = await supabaseAdmin
    .from('barbers')
    .update(barberUpdateFields)
    .eq('id', barberRecord.id)
    .select()
    .single()

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to update schedule' })
  }

  // ─── Activity log ───────────────────────────────────
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'staff.schedule_updated',
    entity_type: 'barber',
    entity_id: barberRecord.id,
    entity_name: targetUser.display_name,
    old_value: { schedule: barberRecord.schedule, time_off: barberRecord.time_off },
    new_value: { schedule: updatedBarber.schedule, time_off: updatedBarber.time_off },
  })

  return {
    data: {
      schedule: updatedBarber.schedule,
      time_off: updatedBarber.time_off,
    },
  }
})
