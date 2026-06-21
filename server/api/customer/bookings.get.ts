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
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : ''
  const authUser = await verifyAuth(token)

  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

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
    .eq('customer_id', authUser.id)

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

  // Batched enrichment: fetch all shops and barber names in 2 queries instead of per-booking N+1
  const enrichedBookings = []
  if (bookings && bookings.length > 0) {
    // Fetch all shops in one query
    const shopIds = [...new Set(bookings.map(b => b.shop_id))]
    const { data: shops } = await supabase
      .from('shops')
      .select('id, name, slug')
      .in('id', shopIds)
    const shopMap = new Map((shops || []).map(s => [s.id, s]))

    // Fetch all barber display names in one batch (barbers → users join)
    const barberIds = [...new Set(bookings.filter(b => b.barber_id).map(b => b.barber_id!))]
    let barberNameMap = new Map<string, string>()
    if (barberIds.length > 0) {
      const { data: barbers } = await supabase
        .from('barbers')
        .select('id, user_id')
        .in('id', barberIds)
      if (barbers && barbers.length > 0) {
        const userIds = [...new Set(barbers.map(b => b.user_id))]
        const { data: users } = await supabase
          .from('users')
          .select('id, display_name')
          .in('id', userIds)
        const userMap = new Map((users || []).map(u => [u.id, u.display_name]))
        for (const b of barbers) {
          barberNameMap.set(b.id, userMap.get(b.user_id) || 'TBD')
        }
      }
    }

    for (const booking of bookings) {
      const shop = shopMap.get(booking.shop_id)
      enrichedBookings.push({
        ...booking,
        shopName: shop?.name || 'Unknown Shop',
        shopSlug: shop?.slug,
        barberName: booking.barber_id ? (barberNameMap.get(booking.barber_id) || 'TBD') : 'TBD',
      })
    }
  }

  return {
    bookings: enrichedBookings,
    total: count || 0,
    page,
    limit,
    tab,
  }
})