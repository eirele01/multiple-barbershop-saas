/**
 * Booking Status Change Utility
 *
 * Provides a centralized function for updating booking status
 * and triggering appropriate email notifications.
 *
 * Used by booking management routes to ensure consistent
 * status transitions and email triggers.
 */

import { createClient } from '@supabase/supabase-js'
import { sendShopEmail } from '~/utils/server/sendShopEmail'

type BookingStatus = 'pending' | 'pending_payment' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

interface StatusChangeResult {
  success: boolean
  error?: string
}

/**
 * Update a booking's status and trigger email notifications.
 *
 * @param shopId - The shop's UUID
 * @param bookingId - The booking's UUID
 * @param newStatus - The new booking status
 * @param changedBy - The user ID who changed the status
 * @param options - Additional options (cancellation reason, etc.)
 */
export async function changeBookingStatus(
  shopId: string,
  bookingId: string,
  newStatus: BookingStatus,
  changedBy: string,
  options: {
    cancellationReason?: string
    userRole?: string
    userEmail?: string
  } = {}
): Promise<StatusChangeResult> {
  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Fetch the current booking with related data
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, shop_id, customer_id, service_name, service_price,
      date, start_time, end_time, status, payment_status, payment_amount,
      payment_method, cancellation_reason
    `)
    .eq('id', bookingId)
    .eq('shop_id', shopId)
    .single()

  if (fetchError || !booking) {
    return { success: false, error: 'Booking not found' }
  }

  const oldStatus = booking.status

  // Build update payload
  const updateData: Record<string, unknown> = {
    status: newStatus,
  }

  if (newStatus === 'cancelled') {
    updateData.cancelled_by = changedBy
    updateData.cancelled_at = new Date().toISOString()
    if (options.cancellationReason) {
      updateData.cancellation_reason = options.cancellationReason
    }
  }

  // Update the booking
  const { error: updateError } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', bookingId)

  if (updateError) {
    console.error('[BOOKING-STATUS] Error updating booking:', updateError)
    return { success: false, error: updateError.message }
  }

  // Log to activity_logs
  await supabase.from('activity_logs').insert({
    shop_id: shopId,
    user_id: changedBy,
    user_email: options.userEmail || '',
    user_role: options.userRole || 'unknown',
    action: `booking.status_changed`,
    entity_type: 'booking',
    entity_id: bookingId,
    entity_name: booking.booking_ref,
    old_value: { status: oldStatus },
    new_value: { status: newStatus, ...updateData },
  })

  // Send email notification for cancellation
  if (newStatus === 'cancelled') {
    try {
      // Fetch customer email
      const { data: customer } = await supabase
        .from('users')
        .select('email, display_name')
        .eq('id', booking.customer_id)
        .single()

      // Fetch shop slug for links
      const { data: shop } = await supabase
        .from('shops')
        .select('slug')
        .eq('id', shopId)
        .single()

      await sendShopEmail(shopId, 'booking.cancelled', {
        bookingRef: booking.booking_ref,
        cancellationReason: options.cancellationReason || null,
        shopSlug: shop?.slug || '',
        customer: {
          email: customer?.email || '',
          name: customer?.display_name || 'Customer',
        },
      })
    } catch (emailError) {
      console.error('[BOOKING-STATUS] Error sending cancellation email:', emailError)
      // Don't fail the status change if email fails
    }
  }

  // Send booking confirmation email when status changes to confirmed
  // (for manual verification flow — PayMongo flow already sends in webhook)
  if (newStatus === 'confirmed' && oldStatus !== 'confirmed') {
    // Only send if confirmation_sent is false (prevent duplicates from webhook)
    const { data: updatedBooking } = await supabase
      .from('bookings')
      .select('confirmation_sent')
      .eq('id', bookingId)
      .single()

    if (updatedBooking && !updatedBooking.confirmation_sent) {
      try {
        const { data: customer } = await supabase
          .from('users')
          .select('email, display_name')
          .eq('id', booking.customer_id)
          .single()

        await sendShopEmail(shopId, 'booking.confirmed', {
          bookingRef: booking.booking_ref,
          bookingId: booking.id,
          serviceName: booking.service_name,
          customer: {
            email: customer?.email || '',
            name: customer?.display_name || 'Customer',
          },
        })

        // Mark confirmation as sent
        await supabase
          .from('bookings')
          .update({ confirmation_sent: true })
          .eq('id', bookingId)
      } catch (emailError) {
        console.error('[BOOKING-STATUS] Error sending confirmation email:', emailError)
      }
    }
  }

  return { success: true }
}
