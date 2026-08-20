/**
 * GET /api/customer/bookings/[id]
 *
 * Returns a single booking enriched with shop and barber details.
 * Customer-only access.
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : ''
  const authUser = await verifyAuth(token)

  // Customer-only access
  if (authUser.role !== 'customer') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Customer access required' })
  }

  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Get booking ID from route
  const bookingId = getRouterParam(event, 'id')
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: 'Booking ID is required' })
  }

  // Fetch the booking (service_role bypasses RLS) — explicit column list, no sensitive fields
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, shop_id, barber_id, service_id,
      service_name, service_price, service_duration,
      date, start_time, end_time, status,
      payment_method, payment_type, payment_status, payment_amount,
      points_earned, points_redeemed,
      discount_applied, cancellation_reason,
      cancelled_at, cancelled_by,
      created_at
    `)
    .eq('id', bookingId)
    .eq('customer_id', authUser.id)
    .single()

  if (fetchError || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  // Enrich with shop name, slug, and booking_settings
  const { data: shop } = await supabase
    .from('shops')
    .select('name, slug, booking_settings, timezone')
    .eq('id', booking.shop_id)
    .single()

  // Enrich with barber name
  let barberName = 'TBD'
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
      barberName = barberUser?.display_name || 'TBD'
    }
  }

  return {
    ...booking,
    shopName: shop?.name || 'Unknown Shop',
    shopSlug: shop?.slug,
    bookingSettings: shop?.booking_settings || null,
    shopTimezone: shop?.timezone || 'Asia/Manila',
    barberName,
  }
})
