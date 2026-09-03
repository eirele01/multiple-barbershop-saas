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
import { randomBytes } from 'node:crypto'
import { getDayOfWeekName, getToday, getNowMinutesInTimezone } from '~/utils/server/dateUtils'
import { bookingRateLimiter } from '~/utils/server/rateLimiter'

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

// Generate a unique booking_ref in the format BK-YYYY-XXXXXX.
// The suffix is cryptographically random so concurrent creations cannot
// produce the same reference (the DB's count-based trigger is race-prone).
function generateBookingRef(): string {
  const year = new Date().getFullYear()
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const bytes = randomBytes(6)
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[bytes[i] % alphabet.length]
  }
  return `BK-${year}-${suffix}`
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Rate limiting: 5 requests per 5 minutes per IP
  await bookingRateLimiter.check(event)

  // Verify caller identity if Authorization header present
  const authHeader = getHeader(event, 'authorization')
  let tokenUserId: string | null = null
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    const supabasePublic = createClient(
      config.public.supabaseUrl as string,
      config.public.supabaseKey as string
    )
    const { data: { user: authUser } } = await supabasePublic.auth.getUser(token)
    if (authUser) {
      tokenUserId = authUser.id
    }
  }

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

  // Verify customerId matches the authenticated user's token
  if (customerId && tokenUserId && customerId !== tokenUserId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'customerId does not match authenticated user',
    })
  }

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

  // ── Reject bookings in the past (defense-in-depth: never trust the client) ──
  // Compared in the shop's timezone so it matches local business time.
    const shopTimezone = shop.timezone || 'Asia/Manila'
  const todayStr = getToday(shopTimezone)
  if (date < todayStr) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot book a date in the past' })
  }
  if (date === todayStr) {
    const [reqH, reqM] = startTime.split(':').map(Number)
    const requestedMinutes = reqH * 60 + reqM
    if (requestedMinutes <= getNowMinutesInTimezone(shopTimezone)) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot book a time in the past. Please select a later slot.' })
    }
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
  // Deferred: the "set your password" email is sent AFTER the booking row
  // exists (Step 7c) so the email can include the booking reference & details.
  let pendingGuestEmail: { email: string; name: string } | null = null

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
      // Create a new Supabase Auth user (service role).
      // email_confirm=true: ownership is proven by the one-time "set your
      // password" recovery link sent below — this guarantees exactly ONE
      // email per guest booking regardless of the project's global
      // "Confirm email" setting.
      const tempPassword = crypto.randomUUID() + crypto.randomUUID() // 72-char random password
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: customerEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          display_name: `${customerFirstName} ${customerLastName}`,
          phone: customerPhone,
        },
      })

      if (authError) {
        // If email already registered in Auth but not in users table, recover by looking up the auth user
        console.error('Auth signup error for guest:', authError.message)
        const { data: retryUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', customerEmail)
          .maybeSingle()
        if (retryUser) {
          resolvedCustomerId = retryUser.id
        } else if (authError.message?.includes('already registered')) {
          // Orphan case: email exists in Auth but has no users table record.
          // Look up the auth user ID and create the missing profile.
          const { data: authUsers } = await supabase.auth.admin.listUsers(10, { filter: { email: customerEmail } })
          const authUser = authUsers?.users?.[0]
          if (authUser?.id) {
            const { error: userInsertError } = await supabase.from('users').insert({
              id: authUser.id,
              email: customerEmail,
              display_name: `${customerFirstName} ${customerLastName}`,
              phone_number: customerPhone,
              role: 'customer',
              is_active: true,
            })
            if (userInsertError) {
              console.error('Failed to insert orphan guest user record:', userInsertError.message)
            } else {
              resolvedCustomerId = authUser.id
              guestAccountCreated = true
            }
          }
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
          // Defer the "set your password" email to Step 7c (after booking exists)
          pendingGuestEmail = {
            email: customerEmail,
            name: `${customerFirstName} ${customerLastName}`,
          }
        }
      }
    }

    // If we still couldn't resolve a customer_id, fail the booking.
    // Orphaned bookings (customer_id = null) cannot be managed by the customer
    // (dashboard queries by customer_id), leaving them permanently locked out.
    if (!resolvedCustomerId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Could not create or locate your account. Please try again or contact support.',
      })
    }
  }

  // Step 2: Re-check availability (race condition protection)
  const timezone = shop.timezone || 'Asia/Manila'
  const dayOfWeek = getDayOfWeekName(date, timezone)
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
      booking_ref: generateBookingRef(),
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
  if (resolvedCustomerId && shop.plan !== 'basic' && shop.loyalty_enabled) {
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

      // Step 7c: Guest "set your password" email
  // Deferred from Step 1b so the email can include the booking reference.
  // Unified for ALL plans: 'account.created' is a platform-generated
  // account-security email (exempt from the upgrade guard in sendShopEmail).
  // Flow: generateLink (one-time recovery link, no Supabase email) →
  //       branded Resend email → fallback to Supabase built-in email if
  //       Resend fails (best-effort; may hit recovery quota — guest can
  //       always recover via "Forgot password?" on /login).
  if (pendingGuestEmail) {
    try {
      const siteUrl = config.public.siteUrl || 'http://localhost:3000'
      const redirectTo = `${siteUrl}/auth/reset-password`
      const shopPlan = shop.plan

      console.log(`[BOOKING-CREATE] Step 7c: sending guest set-password email to ${pendingGuestEmail.email} (plan: ${shopPlan})`)

      const { sendShopEmail } = await import('~/utils/server/sendShopEmail')

      // Generate the one-time recovery link WITHOUT Supabase sending its own email
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: pendingGuestEmail.email,
        options: { redirectTo },
      })
      if (linkError) {
        console.error('[BOOKING-CREATE] generateLink FAILED:', linkError.message)
      }

            // supabase-js v2 returns the link as `action_link` (snake_case);
      // support the camelCase variant defensively for other API versions.
      const linkProps = (linkData?.properties ?? {}) as {
        action_link?: string
        actionLink?: string
      }
      const actionLink: string | undefined = linkProps.action_link ?? linkProps.actionLink

      let brandedSent = false
      if (!linkError && actionLink) {
        const result = await sendShopEmail(shopId, 'account.created', {
          setPasswordUrl: actionLink,
          customerName: pendingGuestEmail.name,
          customer: {
            email: pendingGuestEmail.email,
            name: pendingGuestEmail.name,
          },
          bookingRef: booking.booking_ref,
          serviceName: service.name,
          bookingDate: date,
          bookingTime: startTime,
        })
        brandedSent = result.sent === true
        if (brandedSent) {
          console.log('[BOOKING-CREATE] Branded set-password email SENT ✓')
        } else {
          console.error('[BOOKING-CREATE] Branded set-password email FAILED — reason:', result.error)
        }
      } else if (!linkError && !actionLink) {
        // Defensive: dump the response shape if the API ever changes.
        console.error(
          '[BOOKING-CREATE] generateLink returned no action link. Properties:',
          JSON.stringify(linkData?.properties ?? linkData ?? null)
        )
      }

      // Fallback (best-effort): Supabase built-in email when Resend failed.
      // May be rate-limited since generateLink consumed the recovery quota;
      // the guest can always recover via "Forgot password?" on /login.
      if (!brandedSent) {
        console.log('[BOOKING-CREATE] Branded send failed — using Supabase built-in set-password email')
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          pendingGuestEmail.email,
          { redirectTo }
        )
        if (resetError) {
          console.error(
            `[BOOKING-CREATE] Set-password email failed for ${pendingGuestEmail.email}:`,
            resetError.message.includes('security purposes')
              ? 'rate-limited (guest can use "Forgot password?" on /login)'
              : resetError.message
          )
        }
      }
    } catch (guestEmailErr) {
      console.error('[BOOKING-CREATE] Guest set-password email error:', guestEmailErr)
    }
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
