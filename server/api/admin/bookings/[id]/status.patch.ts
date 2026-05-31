/**
 * PATCH /api/admin/bookings/[id]/status
 *
 * Change a booking's status with loyalty handling on cancellation.
 *
 * When cancelling a booking:
 * - If points_redeemed > 0: NO refund needed — points were never actually deducted.
 *   (points_redeemed on the booking is just an INTENT; actual deduction only happens
 *   in complete.patch.ts on booking completion)
 * - If points_earned > 0 (already completed booking then cancelled): reverse earned points
 *
 * Other status changes (confirmed, in_progress, no_show) are also handled here.
 * Booking COMPLETION should use the dedicated /complete endpoint.
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getCustomerBalance } from '~/utils/server/loyaltyEngine'
import { changeBookingStatus } from '~/utils/server/bookingStatusChange'

const statusChangeSchema = z.object({
  status: z.enum(['confirmed', 'in_progress', 'cancelled', 'no_show']),
  cancellationReason: z.string().max(300).optional(),
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

  const bookingId = getRouterParam(event, 'id')
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: 'Booking ID is required' })
  }

  // Validate body
  const body = await readBody(event)
  const parsed = statusChangeSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { status: newStatus, cancellationReason } = parsed.data

  // Get the booking with loyalty info
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_ref, shop_id, customer_id, status, points_earned, points_redeemed')
    .eq('id', bookingId)
    .eq('shop_id', userData.shop_id)
    .single()

  if (bookingError || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  // Use the shared bookingStatusChange utility (for cancelled, confirmed, in_progress, no_show)
  // NOTE: Use PATCH /api/admin/bookings/[id]/complete for 'completed' status
  const result = await changeBookingStatus(
    userData.shop_id,
    bookingId,
    newStatus,
    user.id,
    {
      cancellationReason,
      userRole: userData.role || '',
      userEmail: user.email || '',
    }
  )

  if (!result.success) {
    throw createError({ statusCode: 500, statusMessage: result.error || 'Failed to change booking status' })
  }

  // ── CANCELLATION LOYALTY LOGIC ──
  // Since points_redeemed on the booking is only an INTENT (never deducted at creation),
  // there is NOTHING to refund for redemption when cancelling.
  // The customer's points balance was never reduced.
  //
  // However, if the booking was previously COMPLETED (points_earned > 0) and is now
  // being cancelled, we need to reverse the earned points.
  if (newStatus === 'cancelled' && booking.customer_id) {
    try {
      const { data: shop } = await supabase
        .from('shops')
        .select('loyalty_enabled, plan')
        .eq('id', userData.shop_id)
        .single()

      if (shop && shop.loyalty_enabled && shop.plan === 'upgraded') {
        // NO refund for points_redeemed — they were never actually deducted.
        // The points_redeemed field on the booking is just an INTENT that was never executed.

        // Reverse earned points (if the booking was already completed and then cancelled)
        if (booking.points_earned > 0) {
          const currentBalance = await getCustomerBalance(userData.shop_id, booking.customer_id)
          const balanceAfter = Math.max(0, currentBalance - booking.points_earned)
          // Insert a 'redeemed' entry to reverse the earned points
          await supabase.from('loyalty_points').insert({
            shop_id: userData.shop_id,
            customer_id: booking.customer_id,
            booking_id: bookingId,
            type: 'redeemed',
            points: booking.points_earned,
            balance_after: balanceAfter,
            note: `Booking ${booking.booking_ref} cancelled — ${booking.points_earned} earned points reversed`,
          })

          // Update booking to reflect reversed points
          await supabase
            .from('bookings')
            .update({ points_earned: 0 })
            .eq('id', bookingId)
        }
      }
    } catch (loyaltyErr) {
      console.error('[BOOKING-STATUS] Error processing loyalty reversal on cancellation:', loyaltyErr)
      // Don't fail the cancellation if loyalty reversal fails
    }
  }

  // Log loyalty reversal in activity_logs (only for earned points reversal)
  if (newStatus === 'cancelled' && booking.points_earned > 0) {
    await supabase.from('activity_logs').insert({
      shop_id: userData.shop_id,
      user_id: user.id,
      user_email: user.email,
      user_role: userData.role || '',
      action: 'loyalty.earned_reversed_on_cancellation',
      entity_type: 'booking',
      entity_id: bookingId,
      entity_name: booking.booking_ref,
      new_value: {
        pointsEarnedReversed: booking.points_earned,
        note: 'Redeemed points were never deducted (INTENT only), so no refund needed',
      },
    })
  }

  return {
    success: true,
    bookingId,
    newStatus,
    loyaltyReversal: newStatus === 'cancelled' && booking.points_earned > 0 ? {
      earnedReversed: booking.points_earned,
      redeemedRefunded: 0, // Always 0 — points were never deducted at creation
    } : null,
  }
})
