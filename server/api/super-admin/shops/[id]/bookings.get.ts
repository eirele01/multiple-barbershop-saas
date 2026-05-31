/**
 * GET /api/super-admin/shops/[id]/bookings
 *
 * Get bookings for a specific shop (last 50).
 * Read-only list used by the super admin shop detail page.
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

  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    // Fetch bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, booking_ref, customer_id, service_name, service_price, date, start_time, status, payment_status, payment_amount, created_at')
      .eq('shop_id', shopId)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(limit)

    if (bookingsError) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
    }

    // Enrich with customer names
    const enrichedBookings: any[] = []

    if (bookings && bookings.length > 0) {
      const customerIds = [...new Set(bookings.map(b => b.customer_id).filter(Boolean))]

      let customerMap = new Map<string, string>()
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from('users')
          .select('id, display_name')
          .in('id', customerIds)

        customerMap = new Map(customers?.map(c => [c.id, c.display_name]) || [])
      }

      for (const booking of bookings) {
        enrichedBookings.push({
          ...booking,
          customer_name: booking.customer_id ? (customerMap.get(booking.customer_id) || 'Guest') : 'Guest',
        })
      }
    }

    return { bookings: enrichedBookings }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN SHOP BOOKINGS] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch bookings' })
  }
})
