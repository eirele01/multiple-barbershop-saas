/**
 * GET /api/bookings/availability
 *
 * Computes available time slots for a given (barberId, date, serviceId, shopId).
 *
 * Implements the EXACT algorithm from Section 8.3 of the Blueprint:
 *
 * 1. Get barber's schedule for that day of week from barbers.schedule
 * 2. Check barbers.time_off array — if date is within any range, return [] for that barber
 * 3. Get shop's working_hours for that day — if is_open=false, return []
 * 4. Get all bookings for (barberId, date) where status NOT IN ('cancelled', 'no_show')
 * 5. Generate all slots within working hours using booking_settings.slot_duration + buffer_time
 * 6. Remove slots that overlap with existing bookings
 * 7. If barberId='any': run steps 1–6 for ALL eligible barbers, return union of available slots (deduplicated by time)
 * 8. Return: { slots: ['09:00','09:30',...], timezone }
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { JS_DAY_TO_NAME } from '~/utils/dayMapping'

const availabilitySchema = z.object({
  shopId: z.string().uuid('Invalid shop ID'),
  barberId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  serviceId: z.string().uuid('Invalid service ID'),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)

  const parsed = availabilitySchema.safeParse({
    shopId: query.shopId,
    barberId: query.barberId,
    date: query.date,
    serviceId: query.serviceId,
  })

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { shopId, barberId, date, serviceId } = parsed.data

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Get shop with booking settings and working hours
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, working_hours, booking_settings, timezone')
    .eq('id', shopId)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  const bookingSettings = shop.booking_settings as {
    slot_duration: number
    buffer_time: number
    max_advance_days: number
  }
  const workingHours = shop.working_hours as Array<{
    day: string
    open: string
    close: string
    is_open: boolean
  }>
  const timezone = shop.timezone || 'Asia/Manila'

  // Determine day of week from the date — use shared dayMapping utility
  const dateObj = new Date(date + 'T00:00:00')
  const dayOfWeek = JS_DAY_TO_NAME[dateObj.getDay()]

  // Step 3: Check if shop is open on this day
  const dayHours = workingHours.find((wh) => wh.day === dayOfWeek)
  if (!dayHours || !dayHours.is_open) {
    return { slots: [], timezone }
  }

  // Get the service for duration info
  const { data: service } = await supabase
    .from('services')
    .select('id, duration_mins, barber_ids')
    .eq('id', serviceId)
    .single()

  if (!service) {
    throw createError({ statusCode: 404, statusMessage: 'Service not found' })
  }

  const serviceDuration = service.duration_mins || 30
  const slotDuration = bookingSettings.slot_duration || 30
  const bufferTime = bookingSettings.buffer_time || 0

  /**
   * Compute available slots for a single barber
   */
  async function computeBarberSlots(barberRecord: {
    id: string
    schedule: Record<string, any>
    time_off: Array<{ start_date: string; end_date: string; reason: string }>
  }): Promise<string[]> {
    // Step 2: Check time_off
    if (barberRecord.time_off && barberRecord.time_off.length > 0) {
      const dateStr = date
      for (const off of barberRecord.time_off) {
        if (dateStr >= off.start_date && dateStr <= off.end_date) {
          return []
        }
      }
    }

    // Step 1: Get barber's schedule for this day
    const barberDaySchedule = barberRecord.schedule?.[dayOfWeek]
    let barberStart: string
    let barberEnd: string

    if (barberDaySchedule && barberDaySchedule.is_working !== false) {
      barberStart = barberDaySchedule.start || dayHours.open
      barberEnd = barberDaySchedule.end || dayHours.close

      // Account for breaks
      const breaks: Array<{ start: string; end: string }> = barberDaySchedule.breaks || []
      // We'll handle breaks by removing slots that fall within break times
      const breakSlots = new Set<string>()
      for (const brk of breaks) {
        let t = timeToMinutes(brk.start)
        const brkEnd = timeToMinutes(brk.end)
        while (t < brkEnd) {
          breakSlots.add(minutesToTime(t))
          t += slotDuration
        }
      }

      // Use the intersection of shop hours and barber hours
      const effectiveStart = barberStart > dayHours.open ? barberStart : dayHours.open
      const effectiveEnd = barberEnd < dayHours.close ? barberEnd : dayHours.close

      // Step 5: Generate all possible slots within working hours
      const allSlots = generateSlots(effectiveStart, effectiveEnd, slotDuration, bufferTime)

      // Remove break slots
      const slotsWithoutBreaks = allSlots.filter((s) => !breakSlots.has(s))

      // Step 4: Get existing bookings for this barber on this date
      const { data: existingBookings } = await supabase
        .from('bookings')
        .select('start_time, end_time')
        .eq('barber_id', barberRecord.id)
        .eq('date', date)
        .not('status', 'in', '(cancelled,no_show)')

      // Step 6: Remove slots that overlap with existing bookings
      const bookedSlots = new Set<string>()
      if (existingBookings && existingBookings.length > 0) {
        for (const booking of existingBookings) {
          const bookingStart = timeToMinutes(booking.start_time)
          const bookingEnd = timeToMinutes(booking.end_time)
          // A slot overlaps if the service would span into an existing booking
          for (const slot of slotsWithoutBreaks) {
            const slotStart = timeToMinutes(slot)
            const slotEnd = slotStart + serviceDuration
            if (slotStart < bookingEnd && slotEnd > bookingStart) {
              bookedSlots.add(slot)
            }
          }
        }
      }

      return slotsWithoutBreaks.filter((s) => !bookedSlots.has(s))
    }

    // Barber doesn't work this day according to their own schedule
    if (barberDaySchedule && barberDaySchedule.is_working === false) {
      return []
    }

    // No barber-specific schedule — fall back to shop hours
    const effectiveStart = dayHours.open
    const effectiveEnd = dayHours.close

    const allSlots = generateSlots(effectiveStart, effectiveEnd, slotDuration, bufferTime)

    // Step 4: Get existing bookings
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('start_time, end_time')
      .eq('barber_id', barberRecord.id)
      .eq('date', date)
      .not('status', 'in', '(cancelled,no_show)')

    const bookedSlots = new Set<string>()
    if (existingBookings && existingBookings.length > 0) {
      for (const booking of existingBookings) {
        const bookingStart = timeToMinutes(booking.start_time)
        const bookingEnd = timeToMinutes(booking.end_time)
        for (const slot of allSlots) {
          const slotStart = timeToMinutes(slot)
          const slotEnd = slotStart + serviceDuration
          if (slotStart < bookingEnd && slotEnd > bookingStart) {
            bookedSlots.add(slot)
          }
        }
      }
    }

    return allSlots.filter((s) => !bookedSlots.has(s))
  }

  // Step 7: If barberId is 'any', compute for ALL eligible barbers
  if (barberId === 'any') {
    // Get all barbers who can perform this service
    // If service has barber_ids, use those; otherwise fall back to ALL active barbers in the shop
    // (consistent with frontend getEligibleBarbers logic)
    const eligibleBarberIds = service.barber_ids || []

    let barbersQuery = supabase
      .from('barbers')
      .select('id, schedule, time_off, is_active, is_available')
      .eq('shop_id', shopId)
      .eq('is_active', true)

    if (eligibleBarberIds.length > 0) {
      barbersQuery = barbersQuery.in('id', eligibleBarberIds)
    }

    const { data: barbers } = await barbersQuery

    if (!barbers || barbers.length === 0) {
      return { slots: [], timezone }
    }

    // Compute slots for each barber in parallel
    const slotSets = await Promise.all(
      barbers.map(async (barber) => {
        if (!barber.is_available) return []
        return computeBarberSlots(barber)
      })
    )

    // Union of all available slots (deduplicated)
    const slotUnion = new Set<string>()
    for (const slots of slotSets) {
      for (const slot of slots) {
        slotUnion.add(slot)
      }
    }

    // Sort slots chronologically
    const sortedSlots = Array.from(slotUnion).sort()

    return { slots: sortedSlots, timezone }
  }

  // Specific barber requested
  const { data: barber, error: barberError } = await supabase
    .from('barbers')
    .select('id, schedule, time_off, is_active, is_available')
    .eq('id', barberId)
    .eq('shop_id', shopId)
    .single()

  if (barberError || !barber || !barber.is_active || !barber.is_available) {
    return { slots: [], timezone }
  }

  const slots = await computeBarberSlots(barber)
  return { slots, timezone }
})

// Helper: Convert "HH:MM" to minutes since midnight
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// Helper: Convert minutes since midnight to "HH:MM"
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// Helper: Generate all time slots within a range
function generateSlots(
  startTime: string,
  endTime: string,
  slotDuration: number,
  bufferTime: number
): string[] {
  const slots: string[] = []
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  const interval = slotDuration + bufferTime

  let current = start
  while (current < end) {
    slots.push(minutesToTime(current))
    current += interval
  }

  return slots
}
