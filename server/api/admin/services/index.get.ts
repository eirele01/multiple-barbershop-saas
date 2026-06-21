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
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  const authUser = await verifyAuth(token || '')

  if (!['admin', 'manager', 'cashier', 'barber'].includes(authUser.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }
  if (!authUser.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Fetch services for this shop (explicit columns, no select(*))
  const { data: services, error: fetchError } = await supabase
    .from('services')
    .select('id, shop_id, name, description, category, duration_mins, price, deposit_amount, image_url, barber_ids, is_active, sort_order, created_at, updated_at')
    .eq('shop_id', authUser.shop_id)
    .order('sort_order', { ascending: true })

  if (fetchError) {
    console.error('Error fetching services:', fetchError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch services' })
  }

  return { data: services }
})