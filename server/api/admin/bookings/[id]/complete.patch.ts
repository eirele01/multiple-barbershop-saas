/**
 * PATCH /api/admin/bookings/[id]/complete
 *
 * Mark a booking as completed and process loyalty points.
 * This is the ONLY place where loyalty points are awarded AND redeemed.
 *
 * Steps:
 * 1. Verify booking belongs to this shop and is in a completable state
 * 2. Update booking status to 'completed'
 * 3. If shop has loyalty enabled AND booking hasn't already earned points:
 *    a. Calculate points earned based on payment amount, earn rate, and tier
 *    b. Call awardPoints() to create 'earned' ledger entry
 *    c. Update booking.points_earned
 * 4. If booking had points_redeemed > 0 (redemption INTENT from creation):
 *    a. Call redeemPoints() to create 'redeemed' ledger entry
 *    b. This happens AFTER awarding earned points so the balance doesn't go negative
 * 5. Log to activity_logs
 *
 * IMPORTANT: points_redeemed on the booking record is an INTENT field.
 * The actual deduction happens HERE, not at booking creation.
 */
import { createClient } from '@supabase/supabase-js'
import { awardPoints, redeemPoints, calculatePointsToEarn, getCustomerTotalEarned } from '~/utils/server/loyaltyEngine'

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

  // Get the booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, shop_id, customer_id, service_name, service_price,
      status, payment_status, payment_amount, points_earned, points_redeemed,
      reward_id, discount_applied
    `)
    .eq('id', bookingId)
    .eq('shop_id', userData.shop_id)
    .single()

  if (bookingError || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  // Only allow completion from confirmed or in_progress status
  if (!['confirmed', 'in_progress'].includes(booking.status)) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot complete booking with status '${booking.status}'. Must be 'confirmed' or 'in_progress'.`
    })
  }

  // Prevent double-completion
  if (booking.points_earned > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Booking already completed — points already awarded.'
    })
  }

  // Update booking status to completed
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'completed',
      payment_status: booking.payment_status === 'verified' ? 'verified' : 'paid',
      paid_at: new Date().toISOString(),
    })
    .eq('id', bookingId)

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to complete booking: ' + updateError.message })
  }

  // ── LOYALTY PROCESSING ──
  // Order matters: award earned points FIRST, THEN deduct redeemed points.
  // This prevents the balance from temporarily going negative.
  let pointsAwarded = 0
  let pointsRedeemedActual = 0
  let loyaltyResult = null

  if (booking.customer_id) {
    const { data: shop } = await supabase
      .from('shops')
      .select('loyalty_enabled, loyalty_earn_rate, loyalty_earn_base, loyalty_welcome_bonus, loyalty_expiry_months, loyalty_tiers_enabled, loyalty_tiers, plan')
      .eq('id', userData.shop_id)
      .single()

    if (shop && shop.loyalty_enabled && shop.plan === 'upgraded') {
      try {
        // ── Step A: Award earned points ──
        const customerTotalPoints = await getCustomerTotalEarned(userData.shop_id, booking.customer_id)
        const amountForPoints = Number(booking.payment_amount) || Number(booking.service_price) - Number(booking.discount_applied)
        const calculatedPoints = calculatePointsToEarn(
          Math.max(0, amountForPoints),
          shop,
          customerTotalPoints
        )

        if (calculatedPoints > 0) {
          // Award points — this creates the 'earned' ledger entry
          const result = await awardPoints(
            userData.shop_id,
            booking.customer_id,
            bookingId,
            calculatedPoints,
            shop
          )

          if (result.success && result.points) {
            pointsAwarded = result.points
            loyaltyResult = result

            // Update booking.points_earned
            await supabase
              .from('bookings')
              .update({ points_earned: pointsAwarded })
              .eq('id', bookingId)
          }
        }

        // ── Step B: Deduct redeemed points (INTENT from booking creation) ──
        // This happens AFTER awarding earned points so the balance doesn't go negative.
        // The points_redeemed field on the booking is an INTENT — we now execute it.
        if (booking.points_redeemed > 0 && booking.reward_id) {
          const redeemResult = await redeemPoints(
            userData.shop_id,
            booking.customer_id,
            bookingId,
            booking.points_redeemed,
            booking.reward_id
          )

          if (redeemResult.success) {
            pointsRedeemedActual = booking.points_redeemed
            // Update loyaltyResult balance to the latest
            loyaltyResult = redeemResult
          } else {
            console.error('[BOOKING-COMPLETE] Failed to redeem points:', redeemResult.error)
            // Points were already earned — don't fail the completion
          }
        }
      } catch (loyaltyErr) {
        console.error('[BOOKING-COMPLETE] Error processing loyalty:', loyaltyErr)
        // Don't fail the completion if points fail
      }
    }
  }

  // Log to activity_logs
  await supabase.from('activity_logs').insert({
    shop_id: userData.shop_id,
    user_id: user.id,
    user_email: user.email,
    user_role: userData.role,
    action: 'booking.completed',
    entity_type: 'booking',
    entity_id: bookingId,
    entity_name: booking.booking_ref,
    new_value: { status: 'completed', points_earned: pointsAwarded },
  })

  return {
    success: true,
    bookingId,
    status: 'completed',
    pointsAwarded,
    pointsRedeemed: pointsRedeemedActual,
    loyaltyBalance: loyaltyResult?.balanceAfter,
  }
})
