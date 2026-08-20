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
import { getToday } from '~/utils/server/dateUtils'

const cancelSchema = z.object({
  cancellation_reason: z.string().min(1, 'Cancellation reason is required').max(500),
})

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : ''
  const authUser = await verifyAuth(token)

  // Customer-only access
  if (authUser.role !== 'customer') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Customer access required' })
  }

  const config = useRuntimeConfig()
  const supabase = useSupabaseAdmin()

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

  // Fetch the booking + shop booking_settings
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, booking_ref, status, date, start_time, customer_id, shop_id, service_name')
    .eq('id', bookingId)
    .single()

  if (fetchError || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  // Verify ownership
  if (booking.customer_id !== authUser.id) {
    throw createError({ statusCode: 403, statusMessage: 'You can only cancel your own bookings' })
  }

  // Verify status
  if (!['pending', 'confirmed', 'pending_payment'].includes(booking.status)) {
    throw createError({ statusCode: 409, statusMessage: `Cannot cancel a booking with status '${booking.status}'` })
  }

  // Verify date is in the future (using Asia/Manila timezone)
  const today = getToday('Asia/Manila')
  const bookingDate = booking.date
  if (bookingDate < today) {
    throw createError({ statusCode: 409, statusMessage: 'Cannot cancel a past booking' })
  }

  // Enforce shop's cancellation policy (cancellation_hours)
  const { data: shopSettings } = await supabase
    .from('shops')
    .select('booking_settings, timezone')
    .eq('id', booking.shop_id)
    .single()

  const cancellationHours = shopSettings?.booking_settings?.cancellation_hours ?? 0
  if (cancellationHours > 0) {
    const appointmentDateTime = new Date(`${booking.date}T${booking.start_time}`)
    const cutoffTime = new Date(appointmentDateTime.getTime() - cancellationHours * 60 * 60 * 1000)
    if (new Date() > cutoffTime) {
      throw createError({
        statusCode: 409,
        statusMessage: `This booking can only be cancelled at least ${cancellationHours} hour${cancellationHours > 1 ? 's' : ''} before the appointment.`,
      })
    }
  }

  // Cancel the booking using service_role
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_reason,
      cancelled_by: authUser.id,
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
    user_id: authUser.id,
    user_email: authUser.email || '',
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
      customer: { email: authUser.email || '', name: '' },
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
