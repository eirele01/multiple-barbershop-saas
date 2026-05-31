/**
 * GET /api/super-admin/shops/[id]/export-csv
 *
 * Export shop bookings as CSV file.
 * Returns CSV with Content-Disposition header for download.
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

  const shopId = getRouterParam(event, 'id')
  if (!shopId) {
    throw createError({ statusCode: 400, statusMessage: 'Shop ID is required' })
  }

  try {
    // ── Verify shop exists ──
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('id, name')
      .eq('id', shopId)
      .single()

    if (shopError || !shop) {
      throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
    }

    // ── Fetch bookings (max 10000) ──
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, booking_ref, customer_id, service_name, date, start_time, status, payment_status, payment_amount')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(10000)

    if (bookingsError) {
      console.error('[SUPER-ADMIN EXPORT CSV] Bookings error:', bookingsError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
    }

    if (!bookings || bookings.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'No bookings found for this shop' })
    }

    // ── Fetch customer names ──
    const customerIds = [...new Set(bookings.map(b => b.customer_id).filter(Boolean))] as string[]
    const { data: customers } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', customerIds)

    const customerMap = new Map(customers?.map(c => [c.id, c.display_name]) || [])

    // ── Fetch barber names for enrichment ──
    const barberIds = bookings.map(b => (b as Record<string, unknown>).barber_id).filter(Boolean) as string[]
    let barberMap = new Map<string, string>()
    if (barberIds.length > 0) {
      const { data: barbers } = await supabase
        .from('barbers')
        .select('id, user_id')
        .in('id', barberIds)
      if (barbers && barbers.length > 0) {
        const barberUserIds = barbers.map(b => b.user_id)
        const { data: barberUsers } = await supabase
          .from('users')
          .select('id, display_name')
          .in('id', barberUserIds)
        const userMap = new Map(barberUsers?.map(u => [u.id, u.display_name]) || [])
        barberMap = new Map(
          barbers.map(b => [b.id, userMap.get(b.user_id) || 'Unknown'])
        )
      }
    }

    // ── Build CSV ──
    const csvHeaders = [
      'Booking Ref',
      'Customer',
      'Service',
      'Barber',
      'Date',
      'Time',
      'Status',
      'Payment Status',
      'Amount',
    ]

    const csvRows = bookings.map(b => [
      escapeCsv(b.booking_ref),
      escapeCsv(customerMap.get(b.customer_id || '') || 'Walk-in'),
      escapeCsv(b.service_name),
      escapeCsv(barberMap.get((b as Record<string, unknown>).barber_id as string) || 'N/A'),
      escapeCsv(b.date),
      escapeCsv(b.start_time),
      escapeCsv(b.status),
      escapeCsv(b.payment_status),
      b.payment_amount ? String(b.payment_amount) : '0',
    ].join(','))

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n')

    // ── Set response headers ──
    setResponseHeader(event, 'Content-Type', 'text/csv')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${shop.name.replace(/[^a-zA-Z0-9]/g, '-')}-bookings.csv"`)

    return csvContent
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN EXPORT CSV] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to export bookings' })
  }
})

/**
 * Escape a value for CSV output.
 * Wraps in double-quotes if it contains commas, quotes, or newlines.
 */
function escapeCsv(value: string): string {
  if (!value) return '""'
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
