/**
 * GET /api/super-admin/analytics
 *
 * Platform-wide analytics data.
 * Query params: dateFrom, dateTo (default: last 30 days)
 * Returns: bookingsOverTime, revenueOverTime, topShopsByBookings,
 *          topShopsByRevenue, planGrowthOverTime, keyMetrics
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
export default defineEventHandler(async (event) => {
  const supabase = useSupabaseAdmin()

  // ── Auth: verify super_admin ──
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, statusMessage: 'Invalid token' })

  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || userProfile.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Super admin access required' })
  }

  // ── Parse query params ──
  const query = getQuery(event) as Record<string, string | undefined>
  const dateFrom = query.dateFrom || ''
  const dateTo = query.dateTo || ''

  // Default to last 30 days
  const now = new Date()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const fromDate = dateFrom || thirtyDaysAgo.toISOString().slice(0, 10)
  const toDate = dateTo || now.toISOString().slice(0, 10)

  try {
    // ── Fetch all bookings in date range ──
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, shop_id, payment_status, payment_amount, created_at')
      .gte('created_at', fromDate + 'T00:00:00.000Z')
      .lte('created_at', toDate + 'T23:59:59.999Z')

    if (bookingsError) {
      console.error('[SUPER-ADMIN ANALYTICS] Bookings error:', bookingsError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
    }

    // ── Fetch all shops for name lookups and plan info ──
    const { data: allShops } = await supabase
      .from('shops')
      .select('id, name, plan, created_at')

    const shopMap = new Map(allShops?.map(s => [s.id, s]) || [])

    // ── bookingsOverTime: bookings grouped by date ──
    const bookingsByDate = new Map<string, number>()
    if (bookings) {
      for (const b of bookings) {
        const date = b.created_at.slice(0, 10)
        bookingsByDate.set(date, (bookingsByDate.get(date) || 0) + 1)
      }
    }

    // Fill in missing dates
    const bookingsOverTime: Array<{ date: string; count: number }> = []
    const startDate = new Date(fromDate)
    const endDate = new Date(toDate)
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10)
      bookingsOverTime.push({
        date: dateStr,
        count: bookingsByDate.get(dateStr) || 0,
      })
    }

    // ── revenueOverTime: sum of verified payments grouped by date ──
    const revenueByDate = new Map<string, number>()
    if (bookings) {
      for (const b of bookings) {
        if (b.payment_status === 'verified') {
          const date = b.created_at.slice(0, 10)
          revenueByDate.set(date, (revenueByDate.get(date) || 0) + (Number(b.payment_amount) || 0))
        }
      }
    }

    const revenueOverTime: Array<{ date: string; total: number }> = []
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10)
      revenueOverTime.push({
        date: dateStr,
        total: revenueByDate.get(dateStr) || 0,
      })
    }

    // ── topShopsByBookings: top 10 shops by booking count ──
    const shopBookingCounts = new Map<string, number>()
    if (bookings) {
      for (const b of bookings) {
        if (b.shop_id) {
          shopBookingCounts.set(b.shop_id, (shopBookingCounts.get(b.shop_id) || 0) + 1)
        }
      }
    }

    const topShopsByBookings = Array.from(shopBookingCounts.entries())
      .map(([shopId, bookingCount]) => ({
        shopId,
        shopName: shopMap.get(shopId)?.name || 'Unknown Shop',
        bookingCount,
      }))
      .sort((a, b) => b.bookingCount - a.bookingCount)
      .slice(0, 10)

    // ── topShopsByRevenue: top 10 shops by verified payment sum ──
    const shopRevenue = new Map<string, number>()
    if (bookings) {
      for (const b of bookings) {
        if (b.shop_id && b.payment_status === 'verified') {
          shopRevenue.set(b.shop_id, (shopRevenue.get(b.shop_id) || 0) + (Number(b.payment_amount) || 0))
        }
      }
    }

    const topShopsByRevenue = Array.from(shopRevenue.entries())
      .map(([shopId, revenue]) => ({
        shopId,
        shopName: shopMap.get(shopId)?.name || 'Unknown Shop',
        revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    // ── planGrowthOverTime: for each month in range, count shops by plan ──
    const planGrowthOverTime: Array<{ month: string; basicCount: number; upgradedCount: number }> = []
    const startMonth = new Date(fromDate.slice(0, 7) + '-01')
    const endMonth = new Date(toDate.slice(0, 7) + '-01')

    if (allShops) {
      for (let m = new Date(startMonth); m <= endMonth; m.setMonth(m.getMonth() + 1)) {
        const monthStr = m.toISOString().slice(0, 7) // YYYY-MM
        const monthEnd = new Date(m)
        monthEnd.setMonth(monthEnd.getMonth() + 1)

        let basicCount = 0
        let upgradedCount = 0

        for (const shop of allShops) {
          // Count shops created before the end of this month
          const shopCreated = new Date(shop.created_at)
          if (shopCreated < monthEnd) {
            if (shop.plan === 'upgraded') {
              upgradedCount++
            } else {
              basicCount++
            }
          }
        }

        planGrowthOverTime.push({ month: monthStr, basicCount, upgradedCount })
      }
    }

    // ── keyMetrics ──
    const totalBookings = bookings?.length || 0
    const totalRevenue = bookings
      ?.filter(b => b.payment_status === 'verified')
      .reduce((sum, b) => sum + (Number(b.payment_amount) || 0), 0) || 0

    const totalShops = allShops?.length || 0
    const upgradedShops = allShops?.filter(s => s.plan === 'upgraded').length || 0

    const avgBookingsPerShop = totalShops > 0 ? Math.round((totalBookings / totalShops) * 100) / 100 : 0
    const conversionRate = totalShops > 0 ? Math.round((upgradedShops / totalShops) * 10000) / 100 : 0

    return {
      bookingsOverTime,
      revenueOverTime,
      topShopsByBookings,
      topShopsByRevenue,
      planGrowthOverTime,
      keyMetrics: {
        totalBookings,
        totalRevenue,
        avgBookingsPerShop,
        conversionRate,
      },
    }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN ANALYTICS] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load analytics data' })
  }
})
