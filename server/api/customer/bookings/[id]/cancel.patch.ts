/**
 * PATCH /api/customer/bookings/[id]/cancel
 *
 * Cancel a booking as a customer.
 * Requirements:
 *   - Booking must belong to the authenticated customer
 *   - Status must be 'pending' or 'confirmed'
 *   - Date must be in the future
 *   - cancellation_reason is required
 *
 * Uses service_role to bypass RLS (customers cannot UPDATE bookings per 007_rls_hardening).
 *
 * Customer-only access.
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const cancelSchema = z.object({
  cancellation_reason: z.string().min(1, 'Cancellation reason is required').max(500),
})

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

  // Get booking ID from route
  const bookingId = getRouterParam(event, 'id')
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: 'Booking ID is required' })
  }

  // Validate body
  const body = await readBody(event)
  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { cancellation_reason } = parsed.data

  // Fetch the booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, booking_ref, status, date, customer_id, shop_id, service_name')
    .eq('id', bookingId)
    .single()

  if (fetchError || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  // Verify ownership
  if (booking.customer_id !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'You can only cancel your own bookings' })
  }

  // Verify status
  if (!['pending', 'confirmed', 'pending_payment'].includes(booking.status)) {
    throw createError({ statusCode: 409, statusMessage: `Cannot cancel a booking with status '${booking.status}'` })
  }

  // Verify date is in the future
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const bookingDate = new Date(booking.date + 'T00:00:00')
  if (bookingDate < today) {
    throw createError({ statusCode: 409, statusMessage: 'Cannot cancel a past booking' })
  }

  // Cancel the booking using service_role
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_reason,
      cancelled_by: user.id,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', bookingId)

  if (updateError) {
    console.error('Error cancelling booking:', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to cancel booking' })
  }

  // Log to activity_logs
  await supabase.from('activity_logs').insert({
    shop_id: booking.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: 'customer',
    action: 'booking.cancelled_by_customer',
    entity_type: 'booking',
    entity_id: booking.id,
    entity_name: booking.booking_ref,
    old_value: { status: booking.status },
    new_value: { status: 'cancelled', cancellation_reason },
  })

  // Try to send cancellation email (if shop is upgraded with email enabled)
  try {
    const { sendShopEmail } = await import('~/utils/server/sendShopEmail')
    await sendShopEmail(booking.shop_id, 'booking.cancelled', {
      bookingRef: booking.booking_ref,
      bookingId: booking.id,
      serviceName: booking.service_name,
      customer: { email: user.email || '', name: '' },
    })
  } catch {
    // Email is best-effort; don't fail the cancellation
  }

  return {
    success: true,
    message: 'Booking cancelled successfully',
    booking_ref: booking.booking_ref,
  }
})
