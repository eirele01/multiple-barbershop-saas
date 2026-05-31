/**
 * GET /api/admin/reports
 *
 * Get reports data for the admin reports page.
 *
 * Query params:
 *   dateFrom  — start date (YYYY-MM-DD, required)
 *   dateTo    — end date (YYYY-MM-DD, required)
 *
 * Returns: {
 *   stats: { totalRevenue, totalBookings, avgBookingValue, completionRate },
 *   revenueOverTime: [{ date, amount }],
 *   bookingsByStatus: [{ status, count }],
 *   topServices: [{ name, count }],
 *   topBarbers: [{ name, revenue }],
 *   transactions: [...]
 * }
 *
 * Accessible by: admin, manager, cashier
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)

  // Authenticate
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }

  const token = authHeader.substring(7)
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

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

  if (!['admin', 'manager', 'cashier'].includes(userData.role || '')) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  // Validate query params
  const dateFrom = query.dateFrom as string
  const dateTo = query.dateTo as string

  if (!dateFrom || !dateTo) {
    throw createError({ statusCode: 400, statusMessage: 'dateFrom and dateTo are required' })
  }

  const shopId = userData.shop_id

  // ── Fetch all bookings in date range ──
  const { data: bookings, error: fetchError } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, shop_id, customer_id, barber_id, service_id,
      service_name, service_price, service_duration,
      date, start_time, end_time, status, payment_status, payment_amount,
      payment_type, payment_method, created_at
    `)
    .eq('shop_id', shopId)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: false })

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
  }

  const allBookings = bookings || []

  // ── Stats ──
  const totalRevenue = allBookings
    .filter(b => b.payment_status === 'paid' || b.payment_status === 'verified')
    .reduce((sum, b) => sum + (b.payment_amount || b.service_price || 0), 0)

  const totalBookings = allBookings.length
  const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0

  const completedBookings = allBookings.filter(b => b.status === 'completed').length
  const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0

  // ── Revenue Over Time (daily) ──
  const revenueByDate: Record<string, number> = {}
  for (const b of allBookings) {
    if (b.payment_status === 'paid' || b.payment_status === 'verified') {
      const amount = b.payment_amount || b.service_price || 0
      revenueByDate[b.date] = (revenueByDate[b.date] || 0) + amount
    }
  }

  // Fill in missing dates
  const revenueOverTime: { date: string; amount: number }[] = []
  const start = new Date(dateFrom + 'T00:00:00')
  const end = new Date(dateTo + 'T00:00:00')
  const current = new Date(start)
  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10)
    revenueOverTime.push({ date: dateStr, amount: revenueByDate[dateStr] || 0 })
    current.setDate(current.getDate() + 1)
  }

  // ── Bookings By Status ──
  const statusCounts: Record<string, number> = {}
  for (const b of allBookings) {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1
  }
  const bookingsByStatus = Object.entries(statusCounts)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)

  // ── Top Services ──
  const serviceCounts: Record<string, number> = {}
  for (const b of allBookings) {
    if (b.service_name) {
      serviceCounts[b.service_name] = (serviceCounts[b.service_name] || 0) + 1
    }
  }
  const topServices = Object.entries(serviceCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // ── Top Barbers ──
  const barberRevenue: Record<string, number> = {}
  const barberIds = [...new Set(allBookings.map(b => b.barber_id).filter(Boolean))]

  // Fetch barber names
  const barberNameMap: Record<string, string> = {}
  if (barberIds.length > 0) {
    const { data: barberData } = await supabase
      .from('barbers')
      .select('id, user_id')
      .in('id', barberIds)

    if (barberData) {
      const barberUserIds = barberData.map(b => b.user_id).filter(Boolean)
      if (barberUserIds.length > 0) {
        const { data: barberUsers } = await supabase
          .from('users')
          .select('id, display_name')
          .in('id', barberUserIds)

        if (barberUsers) {
          const userMap = Object.fromEntries(barberUsers.map(u => [u.id, u.display_name]))
          for (const b of barberData) {
            barberNameMap[b.id] = userMap[b.user_id] || 'Unknown'
          }
        }
      }
    }
  }

  for (const b of allBookings) {
    if (b.barber_id && (b.payment_status === 'paid' || b.payment_status === 'verified')) {
      const amount = b.payment_amount || b.service_price || 0
      barberRevenue[b.barber_id] = (barberRevenue[b.barber_id] || 0) + amount
    }
  }
  const topBarbers = Object.entries(barberRevenue)
    .map(([id, revenue]) => ({ name: barberNameMap[id] || 'Unknown', revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  // ── Transactions (enriched with customer names) ──
  const customerIds = [...new Set(allBookings.map(b => b.customer_id).filter(Boolean))]
  const customerMap: Record<string, string> = {}

  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', customerIds)

    if (customers) {
      for (const c of customers) {
        customerMap[c.id] = c.display_name
      }
    }
  }

  // Fetch payment method names
  const paymentMethodIds = [...new Set(allBookings.map(b => b.payment_method_id).filter(Boolean))]
  const paymentMethodMap: Record<string, string> = {}

  if (paymentMethodIds.length > 0) {
    const { data: methods } = await supabase
      .from('payment_methods')
      .select('id, name')
      .in('id', paymentMethodIds)

    if (methods) {
      for (const m of methods) {
        paymentMethodMap[m.id] = m.name
      }
    }
  }

  const transactions = allBookings.map(b => ({
    id: b.id,
    date: b.date,
    booking_ref: b.booking_ref,
    customer_name: b.customer_id ? (customerMap[b.customer_id] || 'Guest') : 'Guest',
    service_name: b.service_name,
    barber_name: barberNameMap[b.barber_id] || 'Unknown',
    amount: b.payment_amount || b.service_price || 0,
    payment_method: b.payment_method_id ? (paymentMethodMap[b.payment_method_id] || b.payment_type || '—') : (b.payment_type || '—'),
    status: b.payment_status,
  }))

  return {
    stats: {
      totalRevenue,
      totalBookings,
      avgBookingValue: Math.round(avgBookingValue * 100) / 100,
      completionRate: Math.round(completionRate * 10) / 10,
    },
    revenueOverTime,
    bookingsByStatus,
    topServices,
    topBarbers,
    transactions,
  }
})
