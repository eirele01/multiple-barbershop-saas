/**
 * GET /api/customer/dashboard
 *
 * Returns the customer's dashboard data:
 *   - Upcoming bookings (next 3, future date, pending/confirmed status)
 *   - Loyalty summary (total points across all shops)
 *
 * Customer-only access.
 */
import { createClient } from '@supabase/supabase-js'
import { getCustomerBalance } from '~/utils/server/loyaltyEngine'

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

  const today = new Date().toISOString().split('T')[0]

  // Fetch upcoming bookings (next 3)
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, shop_id, service_name, service_price,
      date, start_time, end_time, status, payment_status,
      barber_id
    `)
    .eq('customer_id', user.id)
    .in('status', ['pending', 'confirmed', 'pending_payment'])
    .gte('date', today)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(3)

  if (bookingsError) {
    console.error('Error fetching customer bookings:', bookingsError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
  }

  // Enrich bookings with shop name and barber name
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

  // Loyalty summary — total points across all shops
  const { data: shopPoints } = await supabase
    .from('loyalty_points')
    .select('shop_id')
    .eq('customer_id', user.id)

  const uniqueShopIds = [...new Set((shopPoints || []).map(sp => sp.shop_id))]
  const loyaltyShops = []
  let totalPointsAll = 0

  for (const sid of uniqueShopIds) {
    const { data: shop } = await supabase
      .from('shops')
      .select('id, name, slug, loyalty_enabled, plan')
      .eq('id', sid)
      .single()

    if (!shop || !shop.loyalty_enabled || shop.plan !== 'upgraded') continue

    const balance = await getCustomerBalance(sid, user.id)
    totalPointsAll += balance
    loyaltyShops.push({
      shopId: sid,
      shopName: shop.name,
      shopSlug: shop.slug,
      balance,
    })
  }

  return {
    upcomingBookings: enrichedBookings,
    loyalty: {
      totalPoints: totalPointsAll,
      shops: loyaltyShops,
    },
  }
})
