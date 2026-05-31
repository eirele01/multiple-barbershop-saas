/**
 * GET /api/admin/staff
 *
 * List all staff members for the authenticated user's shop.
 * Joins barbers table data with user profiles.
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

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

  if (!['admin', 'manager'].includes(userProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin or manager role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  const shopId = userProfile.shop_id

  // Fetch all users belonging to this shop (staff roles only)
  const { data: shopUsers, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, email, display_name, phone_number, photo_url, role, is_active, created_at')
    .eq('shop_id', shopId)
    .in('role', ['admin', 'manager', 'cashier', 'barber'])
    .order('created_at', { ascending: true })

  if (usersError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch staff' })
  }

  if (!shopUsers || shopUsers.length === 0) {
    return { data: [] }
  }

  // Fetch all barber records for this shop
  const { data: barberRecords, error: barbersError } = await supabaseAdmin
    .from('barbers')
    .select('id, user_id, bio, specialties, experience_yrs, schedule, time_off, is_active, is_available, portfolio_urls')
    .eq('shop_id', shopId)

  if (barbersError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch barber details' })
  }

  // Build a map of user_id → barber record
  const barberMap = new Map((barberRecords || []).map(b => [b.user_id, b]))

  // Fetch services to determine which barbers can perform which services
  const { data: shopServices } = await supabaseAdmin
    .from('services')
    .select('id, barber_ids')
    .eq('shop_id', shopId)
    .eq('is_active', true)

  // Build a map of barber_id → service_ids
  const barberServiceMap = new Map<string, string[]>()
  if (shopServices) {
    for (const svc of shopServices) {
      if (svc.barber_ids && Array.isArray(svc.barber_ids)) {
        for (const barberId of svc.barber_ids) {
          if (!barberServiceMap.has(barberId)) {
            barberServiceMap.set(barberId, [])
          }
          barberServiceMap.get(barberId)!.push(svc.id)
        }
      }
    }
  }

  // Merge user + barber data
  const staffData = shopUsers.map(u => {
    const barber = barberMap.get(u.id)
    const serviceIds = barber ? (barberServiceMap.get(barber.id) || []) : []

    return {
      id: barber?.id || u.id,
      user_id: u.id,
      display_name: u.display_name,
      email: u.email,
      phone_number: u.phone_number,
      photo_url: u.photo_url,
      role: u.role,
      is_active: u.is_active,
      // Barber-specific fields
      barber_id: barber?.id || null,
      bio: barber?.bio || null,
      specialties: barber?.specialties || [],
      experience_yrs: barber?.experience_yrs || null,
      schedule: barber?.schedule || null,
      time_off: barber?.time_off || [],
      is_available: barber?.is_available ?? true,
      service_ids: serviceIds,
    }
  })

  return { data: staffData }
})
