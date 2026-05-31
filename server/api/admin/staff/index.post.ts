/**
 * POST /api/admin/staff
 *
 * Create a new staff member for the authenticated user's shop.
 * - Creates Supabase auth user
 * - Creates users table record
 * - Creates barbers table record (if role = barber)
 * - Checks tier limit (Basic = 5 staff)
 * - Updates service barber_ids if service_ids provided
 *
 * Accessible by: admin only
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { TIER_LIMITS } from '~/types/database'

const createStaffSchema = z.object({
  display_name: z.string().min(1, 'Full name is required').max(200),
  email: z.string().email('Valid email is required'),
  phone: z.string().max(50).nullable().optional(),
  role: z.enum(['manager', 'cashier', 'barber'], { required_error: 'Role is required' }),
  photo_url: z.string().url().nullable().optional(),
  is_active: z.boolean().default(true),
  // Barber fields
  bio: z.string().max(500).nullable().optional(),
  specialties: z.array(z.string()).default([]),
  experience_yrs: z.number().min(0).max(50).nullable().optional(),
  schedule: z.record(z.any()).nullable().optional(),
  time_off: z.array(z.any()).default([]),
  service_ids: z.array(z.string()).default([]),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const parsed = createStaffSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { display_name, email, phone, role, photo_url, is_active, bio, specialties, experience_yrs, schedule, time_off, service_ids } = parsed.data

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
  const { data: userProfile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (profileError || !userProfile) {
    throw createError({ statusCode: 403, statusMessage: 'User profile not found' })
  }

  // Only admin can create staff
  if (userProfile.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin role required to add staff' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  const shopId = userProfile.shop_id

  // ─── Tier limit check ───────────────────────────────
  const { count: currentStaffCount, error: countError } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .in('role', ['admin', 'manager', 'cashier', 'barber'])

  if (countError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to check staff count' })
  }

  // Get shop plan
  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('plan')
    .eq('id', shopId)
    .single()

  const plan = shop?.plan || 'basic'
  const staffLimit = TIER_LIMITS[plan as keyof typeof TIER_LIMITS].staff

  if (staffLimit !== Infinity && (currentStaffCount || 0) >= staffLimit) {
    throw createError({
      statusCode: 403,
      statusMessage: `You've reached the maximum of ${staffLimit} staff members on the ${plan === 'basic' ? 'Basic' : 'Upgraded'} plan. Upgrade for unlimited staff.`,
    })
  }

  // ─── Check email uniqueness ─────────────────────────
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingUser) {
    throw createError({ statusCode: 409, statusMessage: 'A user with this email already exists' })
  }

  // ─── Create auth user ───────────────────────────────
  // Generate a temporary password — the user can reset it later
  const tempPassword = `Staff${Date.now()}!${Math.random().toString(36).slice(2, 8)}`

  const { data: authData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })

  if (authCreateError || !authData.user) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create user account: ' + (authCreateError?.message || 'Unknown error') })
  }

  const newUserId = authData.user.id

  // ─── Create users table record ──────────────────────
  const { error: userInsertError } = await supabaseAdmin
    .from('users')
    .insert({
      id: newUserId,
      email,
      display_name,
      phone_number: phone || null,
      photo_url: photo_url || null,
      role,
      shop_id: shopId,
      is_active: is_active ?? true,
    })

  if (userInsertError) {
    // Clean up auth user if users table insert fails
    await supabaseAdmin.auth.admin.deleteUser(newUserId)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create user profile: ' + userInsertError.message })
  }

  // ─── Create barber record (if role = barber) ────────
  let barberRecord: any = null
  if (role === 'barber') {
    const defaultSchedule = schedule || {
      monday: { start: '09:00', end: '17:00', is_working: true, breaks: [] },
      tuesday: { start: '09:00', end: '17:00', is_working: true, breaks: [] },
      wednesday: { start: '09:00', end: '17:00', is_working: true, breaks: [] },
      thursday: { start: '09:00', end: '17:00', is_working: true, breaks: [] },
      friday: { start: '09:00', end: '17:00', is_working: true, breaks: [] },
      saturday: { start: '09:00', end: '17:00', is_working: true, breaks: [] },
      sunday: { start: '09:00', end: '17:00', is_working: false, breaks: [] },
    }

    const { data: newBarber, error: barberInsertError } = await supabaseAdmin
      .from('barbers')
      .insert({
        user_id: newUserId,
        shop_id: shopId,
        bio: bio || null,
        specialties: specialties || [],
        experience_yrs: experience_yrs || null,
        schedule: defaultSchedule,
        time_off: time_off || [],
        is_active: is_active ?? true,
        is_available: true,
        portfolio_urls: [],
        rating: 0,
        total_reviews: 0,
      })
      .select()
      .single()

    if (barberInsertError) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to create barber record: ' + barberInsertError.message })
    }

    barberRecord = newBarber

    // ─── Update services barber_ids if provided ───────
    if (service_ids && service_ids.length > 0 && barberRecord) {
      for (const serviceId of service_ids) {
        // Get current barber_ids for this service
        const { data: svc } = await supabaseAdmin
          .from('services')
          .select('barber_ids')
          .eq('id', serviceId)
          .eq('shop_id', shopId)
          .single()

        if (svc) {
          const currentBarberIds = svc.barber_ids || []
          if (!currentBarberIds.includes(barberRecord.id)) {
            await supabaseAdmin
              .from('services')
              .update({ barber_ids: [...currentBarberIds, barberRecord.id] })
              .eq('id', serviceId)
          }
        }
      }
    }
  }

  // ─── Activity log ───────────────────────────────────
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: shopId,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'staff.created',
    entity_type: 'staff',
    entity_id: newUserId,
    entity_name: display_name,
    new_value: {
      id: newUserId,
      display_name,
      email,
      role,
      barber_id: barberRecord?.id || null,
    },
  })

  return {
    data: {
      id: barberRecord?.id || newUserId,
      user_id: newUserId,
      display_name,
      email,
      role,
      is_active: is_active ?? true,
      barber_id: barberRecord?.id || null,
    },
  }
})
