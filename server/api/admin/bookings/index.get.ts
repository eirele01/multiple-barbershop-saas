/**
 * GET /api/admin/bookings
 *
 * List bookings for the authenticated user's shop with filters and
 * server-side enrichment (customer name/email, barber name, payment method).
 *
 * Query params:
 *   status    — filter by booking status (optional)
 *   barberId  — filter by barber ID (optional)
 *   dateFrom  — filter date >= (YYYY-MM-DD, optional)
 *   dateTo    — filter date <= (YYYY-MM-DD, optional)
 *   page      — page number (default 1)
 *   limit     — page size (default 20)
 *
 * Returns: { data: [...], total }
 * Accessible by: admin, manager, cashier, barber
 */
import { createClient } from '@supabase/supabase-js'
import { SHOP_STAFF_ROLES } from '~/constants/roles'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)

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

  // Pagination / filters
  const page = Math.max(1, parseInt((query.page as string) || '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt((query.limit as string) || '20', 10) || 20))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let dbQuery = supabase
    .from('bookings')
    .select(`
      id, booking_ref, shop_id, customer_id, service_name, service_price,
      date, start_time, end_time, status, payment_status, payment_type, payment_method, payment_amount,
      barber_id, points_earned, points_redeemed, reward_id, discount_applied, payment_method_id,
      created_at
    `, { count: 'exact' })
    .eq('shop_id', userData.shop_id)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })
    .range(from, to)

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
  } else if (query.barberId) {
    dbQuery = dbQuery.eq('barber_id', query.barberId as string)
  }

  if (query.status) dbQuery = dbQuery.eq('status', query.status as string)
  if (query.dateFrom) dbQuery = dbQuery.gte('date', query.dateFrom as string)
  if (query.dateTo) dbQuery = dbQuery.lte('date', query.dateTo as string)

  const { data: bookings, count, error: bookingsError } = await dbQuery
  if (bookingsError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
  }

  const result = bookings || []

  // ── Enrichment ──
  const customerIds = [...new Set(result.map(b => b.customer_id).filter(Boolean))] as string[]
  const barberIds = [...new Set(result.map(b => b.barber_id).filter(Boolean))] as string[]
  const methodIds = [...new Set(result.map(b => b.payment_method_id).filter(Boolean))] as string[]

  const customerMap: Record<string, { display_name: string; email: string }> = {}
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('users')
      .select('id, display_name, email')
      .in('id', customerIds)
    for (const c of customers || []) customerMap[c.id] = { display_name: c.display_name, email: c.email }
  }

  const barberIdToNameMap: Record<string, string> = {}
  if (barberIds.length > 0) {
    const { data: barberData } = await supabase
      .from('barbers')
      .select('id, user_id')
      .in('id', barberIds)
    const barberUserIds = (barberData || []).map(b => b.user_id).filter(Boolean) as string[]
    let barberUserMap: Record<string, string> = {}
    if (barberUserIds.length > 0) {
      const { data: barberUsers } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', barberUserIds)
      barberUserMap = Object.fromEntries((barberUsers || []).map(u => [u.id, u.display_name]))
    }
    for (const b of barberData || []) barberIdToNameMap[b.id] = barberUserMap[b.user_id] || 'Unknown'
  }

  const methodNameMap: Record<string, string> = {}
  if (methodIds.length > 0) {
    const { data: methods } = await supabase
      .from('payment_methods')
      .select('id, name')
      .in('id', methodIds)
    for (const m of methods || []) methodNameMap[m.id] = m.name
  }

  const paymongoLabelMap: Record<string, string> = {
    gcash_paymongo: 'GCash', maya_paymongo: 'Maya', instapay: 'InstaPay', qrph: 'QR PH',
  }

  const enriched = result.map((b: any) => {
    let paymentMethodName = ''
    if (b.payment_type === 'paymongo' && b.payment_method) {
      paymentMethodName = paymongoLabelMap[b.payment_method] || b.payment_method
    } else if (b.payment_method_id && methodNameMap[b.payment_method_id]) {
      paymentMethodName = methodNameMap[b.payment_method_id]
    } else {
      paymentMethodName = b.payment_type === 'paymongo' ? 'PayMongo' : 'Manual QR'
    }
    return {
      ...b,
      customerName: b.customer_id ? customerMap[b.customer_id]?.display_name : undefined,
      customerEmail: b.customer_id ? customerMap[b.customer_id]?.email : undefined,
      barberName: b.barber_id ? barberIdToNameMap[b.barber_id] : 'Unknown',
      paymentMethodName,
    }
  })

  return { data: enriched, total: count || 0 }
})
