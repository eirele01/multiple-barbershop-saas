/**
 * GET /api/admin/bookings/[id]
 *
 * Fetch a single booking (belonging to the authenticated user's shop) with
 * server-side enrichment: customer info and barber name.
 *
 * Accessible by: admin, manager, cashier, barber
 */
import { createClient } from '@supabase/supabase-js'
import { SHOP_STAFF_ROLES } from '~/constants/roles'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const bookingId = getRouterParam(event, 'id')
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: 'Booking ID is required' })
  }

  // Authenticate
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }
  const token = authHeader.substring(7)
  const supabase = createClient(config.public.supabaseUrl as string, config.supabaseServiceKey as string)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }

  const { data: userData } = await supabase
    .from('users')
    .select('shop_id, role')
    .eq('id', user.id)
    .single()

  if (!userData?.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop assigned' })
  }
  if (!SHOP_STAFF_ROLES.includes(userData.role || '')) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  // Fetch booking (scoped to this shop)
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('shop_id', userData.shop_id)
    .single()

  if (bookingError || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  const result: Record<string, any> = { ...booking }

  // Customer info
  if (booking.customer_id) {
    const { data: customer } = await supabase
      .from('users')
      .select('id, display_name, email, phone_number')
      .eq('id', booking.customer_id)
      .single()
    result.customer = customer || null
  } else {
    result.customer = null
  }

  // Barber name
  if (booking.barber_id) {
    const { data: barber } = await supabase
      .from('barbers')
      .select('id, user_id')
      .eq('id', booking.barber_id)
      .single()
    if (barber?.user_id) {
      const { data: barberUser } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', barber.user_id)
        .single()
      result.barberName = barberUser?.display_name || 'Unknown'
    } else {
      result.barberName = 'Unknown'
    }
  } else {
    result.barberName = 'Unknown'
  }

  return result
})
