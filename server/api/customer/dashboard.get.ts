import { createClient } from '@supabase/supabase-js'
import { getCustomerBalance } from '~/utils/server/loyaltyEngine'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : ''
  const authUser = await verifyAuth(token)

  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  const today = new Date().toISOString().split('T')[0]

  // Fetch upcoming bookings (next 3)
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, shop_id, service_name, service_price,
      date, start_time, end_time, status, payment_status,
      barber_id
    `)
    .eq('customer_id', authUser.id)
    .in('status', ['pending', 'confirmed', 'pending_payment'])
    .gte('date', today)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(3)

  if (bookingsError) {
    console.error('Error fetching customer bookings:', bookingsError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
  }

  // Batched enrichment: fetch all shop and barber info with 2 queries instead of per-booking
  const enrichedBookings = []
  if (bookings && bookings.length > 0) {
    // Fetch all shops in one query
    const shopIds = [...new Set(bookings.map(b => b.shop_id))]
    const { data: shops } = await supabase
      .from('shops')
      .select('id, name, slug')
      .in('id', shopIds)
    const shopMap = new Map((shops || []).map(s => [s.id, s]))

    // Fetch all barber user_ids in one query
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

  // Loyalty summary — total points across all shops
  const { data: shopPoints } = await supabase
    .from('loyalty_points')
    .select('shop_id')
    .eq('customer_id', authUser.id)

  const uniqueShopIds = [...new Set((shopPoints || []).map(sp => sp.shop_id))]
  let totalPointsAll = 0
  const loyaltyShops = []

  if (uniqueShopIds.length > 0) {
    // Fetch all shops in one batch
    const { data: shops } = await supabase
      .from('shops')
      .select('id, name, slug, loyalty_enabled, plan')
      .in('id', uniqueShopIds)

    for (const shop of (shops || [])) {
      if (!shop.loyalty_enabled || shop.plan !== 'upgraded') continue
      const balance = await getCustomerBalance(shop.id, authUser.id)
      totalPointsAll += balance
      loyaltyShops.push({
        shopId: shop.id,
        shopName: shop.name,
        shopSlug: shop.slug,
        balance,
      })
    }
  }

  return {
    upcomingBookings: enrichedBookings,
    loyalty: {
      totalPoints: totalPointsAll,
      shops: loyaltyShops,
    },
  }
})
