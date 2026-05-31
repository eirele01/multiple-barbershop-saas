/**
 * GET /api/customer/bookings
 *
 * Returns the customer's bookings with tabs:
 *   - upcoming: future date, status in (pending, confirmed, pending_payment, in_progress)
 *   - past: past date, or status = completed
 *   - cancelled: status = cancelled or no_show
 *
 * Query params: tab, page, limit
 * Each booking includes shop name, barber name.
 *
 * Customer-only access.
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Auth check
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const token = authHeader.substring(7)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid token' })
  }

  // Parse query params
  const query = getQuery(event)
  const tab = (query.tab as string) || 'upcoming'
  const page = Math.max(1, parseInt(query.page as string) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(query.limit as string) || 20))

  const today = new Date().toISOString().split('T')[0]

  // Build query
  let dbQuery = supabase
    .from('bookings')
    .select(`
      id, booking_ref, shop_id, service_name, service_price,
      date, start_time, end_time, status, payment_status, payment_type, payment_amount,
      payment_method, barber_id, points_earned, points_redeemed,
      discount_applied, created_at
    `, { count: 'exact' })
    .eq('customer_id', user.id)

  // Apply tab filters
  if (tab === 'upcoming') {
    dbQuery = dbQuery
      .in('status', ['pending', 'confirmed', 'pending_payment', 'in_progress'])
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
  } else if (tab === 'past') {
    dbQuery = dbQuery
      .or(`status.eq.completed,date.lt.${today}`)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
  } else if (tab === 'cancelled') {
    dbQuery = dbQuery
      .in('status', ['cancelled', 'no_show'])
      .order('date', { ascending: false })
  }

  // Pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  dbQuery = dbQuery.range(from, to)

  const { data: bookings, count, error: bookingsError } = await dbQuery

  if (bookingsError) {
    console.error('Error fetching customer bookings:', bookingsError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
  }

  // Enrich with shop name and barber name
  const enrichedBookings = []
  for (const booking of (bookings || [])) {
    const entry: any = { ...booking }

    // Shop name
    const { data: shop } = await supabase
      .from('shops')
      .select('name, slug')
      .eq('id', booking.shop_id)
      .single()
    entry.shopName = shop?.name || 'Unknown Shop'
    entry.shopSlug = shop?.slug

    // Barber name
    if (booking.barber_id) {
      const { data: barber } = await supabase
        .from('barbers')
        .select('user_id')
        .eq('id', booking.barber_id)
        .single()

      if (barber?.user_id) {
        const { data: barberUser } = await supabase
          .from('users')
          .select('display_name')
          .eq('id', barber.user_id)
          .single()
        entry.barberName = barberUser?.display_name || 'TBD'
      }
    } else {
      entry.barberName = 'TBD'
    }

    enrichedBookings.push(entry)
  }

  return {
    bookings: enrichedBookings,
    total: count || 0,
    page,
    limit,
    tab,
  }
})
