/**
 * GET /api/admin/services
 *
 * List all services for the authenticated user's shop.
 * Ordered by sort_order ascending.
 *
 * Accessible by: admin, manager, cashier, barber
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Get the authenticated user from the request
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }

  const supabase = createClient(config.public.supabaseUrl as string, config.public.supabaseKey as string, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  // Verify the user session
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }

  // Get the user's profile and shop
  const supabaseAdmin = createClient(config.public.supabaseUrl as string, config.supabaseServiceKey as string)
  const { data: userProfile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (profileError || !userProfile) {
    throw createError({ statusCode: 403, statusMessage: 'User profile not found' })
  }

  // Role check: admin, manager, cashier, barber can view services
  if (!['admin', 'manager', 'cashier', 'barber'].includes(userProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Fetch services for this shop
  const { data: services, error: fetchError } = await supabaseAdmin
    .from('services')
    .select('*')
    .eq('shop_id', userProfile.shop_id)
    .order('sort_order', { ascending: true })

  if (fetchError) {
    console.error('Error fetching services:', fetchError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch services' })
  }

  return { data: services }
})
