/**
 * GET /api/admin/bookings/calendar
 *
 * Get bookings for calendar view within a date range.
 *
 * Query params:
 *   startDate  — start of date range (YYYY-MM-DD, required)
 *   endDate    — end of date range (YYYY-MM-DD, required)
 *   barberId   — filter by barber ID (optional)
 *   status     — filter by booking status (optional)
 *
 * Returns bookings enriched with customer name, barber name, service name.
 * Accessible by: admin, manager, cashier, barber
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

  if (!['admin', 'manager', 'cashier', 'barber'].includes(userData.role || '')) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  // Validate query params
  const startDate = query.startDate as string
  const endDate = query.endDate as string
  const barberId = query.barberId as string | undefined
  const status = query.status as string | undefined

  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  // Build query
  let dbQuery = supabase
    .from('bookings')
    .select(`
      id, booking_ref, shop_id, customer_id, barber_id, service_id,
      service_name, service_price, service_duration,
      date, start_time, end_time, status, payment_status, payment_amount,
      payment_type, created_at
    `)
    .eq('shop_id', userData.shop_id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  // If barber role, restrict to own bookings
  if (userData.role === 'barber') {
    const { data: barberData } = await supabase
      .from('barbers')
      .select('id')
      .eq('user_id', user.id)
      .eq('shop_id', userData.shop_id)
      .single()

    if (barberData) {
      dbQuery = dbQuery.eq('barber_id', barberData.id)
    }
  } else if (barberId) {
    dbQuery = dbQuery.eq('barber_id', barberId)
  }

  if (status) {
    dbQuery = dbQuery.eq('status', status)
  }

  const { data: bookings, error: fetchError } = await dbQuery

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
  }

  if (!bookings || bookings.length === 0) {
    return { bookings: [] }
  }

  // Enrich with customer names
  const customerIds = [...new Set(bookings.map(b => b.customer_id).filter(Boolean))]
  const customerMap: Record<string, { display_name: string; phone_number: string | null }> = {}

  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('users')
      .select('id, display_name, phone_number')
      .in('id', customerIds)

    if (customers) {
      for (const c of customers) {
        customerMap[c.id] = { display_name: c.display_name, phone_number: c.phone_number }
      }
    }
  }

  // Enrich with barber names
  const barberIds = [...new Set(bookings.map(b => b.barber_id).filter(Boolean))]
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

  // Build enriched response
  const enrichedBookings = bookings.map(b => ({
    id: b.id,
    booking_ref: b.booking_ref,
    date: b.date,
    start_time: b.start_time,
    end_time: b.end_time,
    status: b.status,
    payment_status: b.payment_status,
    payment_amount: b.payment_amount,
    service_name: b.service_name,
    service_price: b.service_price,
    service_duration: b.service_duration,
    barber_id: b.barber_id,
    barber_name: barberNameMap[b.barber_id] || 'Unknown',
    customer_id: b.customer_id,
    customer_name: b.customer_id ? (customerMap[b.customer_id]?.display_name || 'Guest') : 'Guest',
    customer_phone: b.customer_id ? (customerMap[b.customer_id]?.phone_number || null) : null,
  }))

  return { bookings: enrichedBookings }
})
