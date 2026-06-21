/**
 * POST /api/bookings/create
 *
 * Creates a new booking with full validation and race-condition protection.
 *
 * Steps:
 * 1. Validate all required fields with Zod
 * 1b. If guest: create Supabase Auth user (or find existing by email)
 * 2. Re-check availability (race condition protection)
 * 3. If "Any Available Barber": assign a random available barber
 * 4. Create bookings record
 * 5. If manual payment: create payment_verifications record (status='pending')
 * 6. If loyalty reward applied: record reward_id, discount_applied, points_redeemed
 *    (INTENT only — points are NOT deducted yet; actual deduction happens on completion)
 * 7. Log to activity_logs: action='booking.created'
 * 8. Return: { bookingId, bookingRef, status, paymentType, guestAccountCreated }
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { JS_DAY_TO_NAME } from '~/utils/dayMapping'

const createBookingSchema = z.object({
  shopId: z.string().uuid(),
  serviceId: z.string().uuid(),
  barberId: z.string(), // UUID or 'any'
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  customerFirstName: z.string().min(2).max(100),
  customerLastName: z.string().min(2).max(100),
  customerPhone: z.string().min(7).max(20),
  customerEmail: z.string().email(),
  customerNotes: z.string().max(300).optional(),
  customerId: z.string().uuid().nullable().optional(),

  paymentMethodId: z.string().uuid().nullable().optional(),
  paymongoMethod: z.string().nullable().optional(),

  rewardId: z.string().uuid().nullable().optional(),
  pointsRedeemed: z.number().int().min(0).default(0),
  discountApplied: z.number().min(0).default(0),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  // Step 1: Validate
  const parsed = createBookingSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const {
    shopId, serviceId, barberId, date, startTime,
    customerFirstName, customerLastName, customerPhone, customerEmail,
    customerNotes, customerId,
    paymentMethodId, paymongoMethod,
    rewardId, pointsRedeemed, discountApplied,
  } = parsed.data

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  )

  // Get shop and service details in parallel
  const [shopResult, serviceResult] = await Promise.all([
    supabase
      .from('shops')
      .select('id, working_hours, booking_settings, timezone, plan, paymongo_enabled, manual_payment_enabled, loyalty_enabled, loyalty_earn_rate, loyalty_earn_base, loyalty_welcome_bonus, loyalty_expiry_months, loyalty_tiers_enabled, loyalty_tiers')
      .eq('id', shopId)
      .single(),
    supabase
      .from('services')
      .select('id, name, price, duration_mins, barber_ids')
      .eq('id', serviceId)
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .single(),
  ])

  const shop = shopResult.data
  const shopError = shopResult.error
  const service = serviceResult.data
  const serviceError = serviceResult.error

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  if (serviceError || !service) {
    throw createError({ statusCode: 404, statusMessage: 'Service not found' })
  }

  // Compute end time
  const [startH, startM] = startTime.split(':').map(Number)
  const totalMinutes = startH * 60 + startM + service.duration_mins
  const endH = Math.floor(totalMinutes / 60)
  const endM = totalMinutes % 60
  const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`

  // Step 1b: Guest account creation — ensure every booking has a customer_id
  let resolvedCustomerId = customerId || null
  let guestAccountCreated = false

  if (!resolvedCustomerId) {
    // Check if user with this email already exists in users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', customerEmail)
      .maybeSingle()

    if (existingUser) {
      // Returning guest — use their existing user_id (no duplicate)
      resolvedCustomerId = existingUser.id
    } else {
      // Create a new Supabase Auth user with email_confirm=false
      const tempPassword = crypto.randomUUID() + crypto.randomUUID() // 72-char random password
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: customerEmail,
        password: tempPassword,
        options: {
          emailRedirectTo: undefined, // No redirect — they'll set password via email link
          data: {
            display_name: `${customerFirstName} ${customerLastName}`,
            phone: customerPhone,
          },
        },
      })

      if (authError) {
        // If email already registered in Auth but not in users table, try to look up by email again
        console.error('Auth signup error for guest:', authError.message)
        const { data: retryUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', customerEmail)
          .maybeSingle()
        if (retryUser) {
          resolvedCustomerId = retryUser.id
        } else {
          // Cannot create account — proceed without customer_id (booking still created)
          console.error('Could not resolve customer_id for guest email:', customerEmail)
        }
      } else if (authData?.user) {
        // Create users table record with role='customer'
        const { error: userInsertError } = await supabase.from('users').insert({
          id: authData.user.id,
          email: customerEmail,
          display_name: `${customerFirstName} ${customerLastName}`,
          phone_number: customerPhone,
          role: 'customer',
          is_active: true,
        })

        if (userInsertError) {
          console.error('Failed to insert guest user record:', userInsertError.message)
        } else {
          resolvedCustomerId = authData.user.id
          guestAccountCreated = true
        }
      }
    }
  }

  // Step 2: Re-check availability (race condition protection)
  const dateObj = new Date(date + 'T00:00:00')
  const dayOfWeek = JS_DAY_TO_NAME[dateObj.getDay()]
  const workingHours = shop.working_hours as Array<{
    day: string; open: string; close: string; is_open: boolean
  }>
  const dayHours = workingHours.find((wh) => wh.day === dayOfWeek)

  if (!dayHours || !dayHours.is_open) {
    throw createError({ statusCode: 409, statusMessage: 'Shop is closed on the selected date' })
  }

  // Resolve barber: if 'any', pick a random available barber
  let assignedBarberId = barberId
  if (barberId === 'any') {
    // If service has barber_ids, use those; otherwise fall back to ALL active barbers in the shop
    // (consistent with frontend getEligibleBarbers logic)
    const eligibleIds = service.barber_ids || []

    let barbersQuery = supabase
      .from('barbers')
      .select('id, schedule, time_off')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .eq('is_available', true)

    if (eligibleIds.length > 0) {
      barbersQuery = barbersQuery.in('id', eligibleIds)
    }

    const { data: availableBarbers } = await barbersQuery

    if (!availableBarbers || availableBarbers.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No barbers available for this service' })
    }

    // Filter barbers who are actually free at this time
    const freeBarbers = []
    for (const barber of availableBarbers) {
      // Check time_off
      let isOnTimeOff = false
      if (barber.time_off && barber.time_off.length > 0) {
        for (const off of barber.time_off) {
          if (date >= off.start_date && date <= off.end_date) {
            isOnTimeOff = true
            break
          }
        }
      }
      if (isOnTimeOff) continue

      // Check existing bookings at this time
      const { data: conflictingBookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('barber_id', barber.id)
        .eq('date', date)
        .not('status', 'in', '(cancelled,no_show)')
        .lt('start_time', endTime)
        .gt('end_time', startTime)

      if (!conflictingBookings || conflictingBookings.length === 0) {
        freeBarbers.push(barber)
      }
    }

    if (freeBarbers.length === 0) {
      throw createError({ statusCode: 409, statusMessage: 'No barbers available at the selected time. Please choose another time.' })
    }

    // Randomly assign a barber
    const randomIndex = Math.floor(Math.random() * freeBarbers.length)
    assignedBarberId = freeBarbers[randomIndex].id
  } else {
    // Specific barber — verify no double booking
    const { data: conflictingBookings } = await supabase
      .from('bookings')
      .select('id')
      .eq('barber_id', barberId)
      .eq('date', date)
      .not('status', 'in', '(cancelled,no_show)')
      .lt('start_time', endTime)
      .gt('end_time', startTime)

    if (conflictingBookings && conflictingBookings.length > 0) {
      throw createError({ statusCode: 409, statusMessage: 'This time slot was just booked. Please choose another time.' })
    }
  }

  // Determine payment type
  let paymentType: 'manual' | 'paymongo' = 'manual'
  let paymentMethod: string | null = null
  let paymongoPaymentMethod: string | null = null

  if (paymongoMethod) {
    paymentType = 'paymongo'
    paymongoPaymentMethod = paymongoMethod
    paymentMethod = paymongoMethod
  } else if (paymentMethodId) {
    paymentType = 'manual'
    paymentMethod = paymentMethodId
  }

  // Calculate amount
  const subtotal = Number(service.price)
  const finalAmount = Math.max(0, subtotal - discountApplied)

  // Determine initial booking status
  let bookingStatus = 'pending'
  let paymentStatus = 'pending'

  if (paymentType === 'manual') {
    bookingStatus = 'pending_payment'
    paymentStatus = 'pending_verification'
  }

  // Step 4: Create the booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      shop_id: shopId,
      customer_id: resolvedCustomerId,
      barber_id: assignedBarberId,
      service_id: serviceId,
      service_name: service.name,
      service_price: service.price,
      service_duration: service.duration_mins,
      date,
      start_time: startTime,
      end_time: endTime,
      status: bookingStatus,
      payment_method: paymongoPaymentMethod || null,
      payment_type: paymentType,
      payment_status: paymentStatus,
      payment_amount: finalAmount,
      payment_method_id: paymentMethodId || null,
      customer_notes: customerNotes || null,
      reward_id: rewardId || null,
      discount_applied: discountApplied,
      points_redeemed: pointsRedeemed,
      points_earned: 0,
    })
    .select('id, booking_ref, status')
    .single()

  if (bookingError) {
    console.error('Booking creation error:', bookingError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create booking: ' + bookingError.message })
  }

  // Step 5: If manual payment, create payment_verifications record
  if (paymentType === 'manual' && paymentMethodId) {
  const { error: verificationError } = await supabase
    .from('payment_verifications')
    .insert({
      shop_id: shopId,
      booking_id: booking.id,
      customer_id: resolvedCustomerId || null,
      payment_method_id: paymentMethodId,
      amount: finalAmount,
      proof_image_url: '',
      status: 'pending',
    })

  if (verificationError) {
    // Log but don't fail the booking
    // The booking was created successfully
    // Staff can still manually verify from the bookings table
    console.error(
      '[BOOKING-CREATE] Failed to create payment_verification record:',
      verificationError.message
    )
  }
}

  // Step 5b: If PayMongo payment, create payment_verifications record (pending until webhook confirms)
  if (paymentType === 'paymongo') {
    // PayMongo payments start as 'pending' — the webhook or verify-paymongo-payment
    // endpoint will update them to 'verified' once payment is confirmed
    const paymongoMethodName = paymongoPaymentMethod
      ? `PayMongo (${paymongoPaymentMethod.charAt(0).toUpperCase() + paymongoPaymentMethod.slice(1)})`
      : 'PayMongo'

    // PayMongo is an API-based payment — it does NOT need a manual payment_methods row.
    // The payment channel identity is captured in reference_number (e.g., "PayMongo (Gcash_paymongo)").
    // We set payment_method_id = NULL to avoid incorrectly linking to a manual "PayMongo%" method,
    // which would cause 409 delete errors and confuse manual vs online payments.
    const { error: verificationError } = await supabase
      .from('payment_verifications')
      .insert({
        shop_id: shopId,
        booking_id: booking.id,
        customer_id: resolvedCustomerId || null,
        payment_method_id: null,
        amount: finalAmount,
        proof_image_url: '',
        reference_number: paymongoMethodName,
        status: 'pending',
      })

    if (verificationError) {
      console.error(
        '[BOOKING-CREATE] Failed to create PayMongo payment_verification record:',
        verificationError.message
      )
    }
  }

  // Step 6: Loyalty — record redemption INTENT only
  // The reward_id, points_redeemed, discount_applied are already recorded on the booking.
  // Points are NOT deducted at creation — they are deducted at COMPLETION (complete.patch.ts).
  // This prevents points loss if the booking is cancelled or the customer no-shows.
  //
  // The booking record carries these fields as INTENT:
  //   points_redeemed = number of points to deduct on completion
  //   reward_id = which reward was selected
  //   discount_applied = discount amount applied to the booking
  //
  // No redeemPoints() call here — that happens in complete.patch.ts AFTER awarding earned points.

  // Step 6b: Award welcome bonus for first-time customers (upgraded shops only)
  if (resolvedCustomerId && shop.plan === 'upgraded' && shop.loyalty_enabled) {
    try {
      const { awardWelcomeBonus } = await import('~/utils/server/loyaltyEngine')
      await awardWelcomeBonus(shopId, resolvedCustomerId, {
        loyalty_enabled: shop.loyalty_enabled,
        loyalty_earn_rate: shop.loyalty_earn_rate,
        loyalty_earn_base: shop.loyalty_earn_base,
        loyalty_welcome_bonus: shop.loyalty_welcome_bonus,
        loyalty_expiry_months: shop.loyalty_expiry_months,
        loyalty_tiers_enabled: shop.loyalty_tiers_enabled,
        loyalty_tiers: shop.loyalty_tiers,
        plan: shop.plan,
      })
    } catch (welcomeErr) {
      console.error('[BOOKING-CREATE] Error awarding welcome bonus:', welcomeErr)
      // Don't fail booking creation
    }
  }

  // Step 7: Log to activity_logs
  await supabase.from('activity_logs').insert({
    shop_id: shopId,
    user_id: resolvedCustomerId || null,
    user_email: customerEmail,
    user_role: resolvedCustomerId ? 'customer' : null,
    action: 'booking.created',
    entity_type: 'booking',
    entity_id: booking.id,
    entity_name: booking.booking_ref,
    new_value: {
      service: service.name,
      barberId: assignedBarberId,
      date,
      startTime,
      endTime,
      paymentType,
      amount: finalAmount,
    },
  })

  // Step 7b: Send email notifications
  try {
    // For bookings that are already confirmed (e.g., PayMongo instant payment)
    // This typically won't fire at creation time since PayMongo bookings start as 'pending'
    // But if the flow changes, this ensures the email is sent.
    if (booking.status === 'confirmed') {
      const { sendShopEmail } = await import('~/utils/server/sendShopEmail')
      await sendShopEmail(shopId, 'booking.confirmed', {
        bookingRef: booking.booking_ref,
        bookingId: booking.id,
        serviceName: service.name,
        customer: {
          email: customerEmail,
          name: `${customerFirstName} ${customerLastName}`,
        },
      })
    }
  } catch (emailError) {
    console.error('[BOOKING-CREATE] Error sending confirmation email:', emailError)
    // Don't fail booking creation if email fails
  }

  // Step 8: Return result
  return {
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    status: booking.status,
    paymentType,
    amount: finalAmount,
    guestAccountCreated,
    guestEmail: guestAccountCreated ? customerEmail : null,
  }
})
