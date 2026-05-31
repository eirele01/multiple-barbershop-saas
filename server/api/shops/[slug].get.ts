/**
 * GET /api/shops/[slug]
 * Returns all public data for a shop's landing page.
 * Includes: shop info, services, barbers, gallery, products, reviews,
 * plus computed fields: lowestServicePrice, nextAvailableSlot, popularServices, totalSlotsToday.
 *
 * Query params:
 * - reviewOffset: offset for review pagination (default 0)
 * - reviewLimit: number of reviews per page (default 10)
 */
import { createClient } from '@supabase/supabase-js'
import { JS_DAY_TO_NAME } from '~/utils/dayMapping'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const slug = getRouterParam(event, 'slug')
  const query = getQuery(event)

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Shop slug is required',
    })
  }

  const reviewOffset = parseInt(query.reviewOffset as string) || 0
  const reviewLimit = Math.min(parseInt(query.reviewLimit as string) || 10, 50)

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // 1. Fetch shop details
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (shopError || !shop) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Shop not found',
    })
  }

  const shopId = shop.id

  // 2. Fetch all public data in parallel
  const [servicesRes, barbersRes, galleryRes, productsRes, reviewsRes, reviewCountRes] = await Promise.all([
    // Active services, sorted
    supabase
      .from('services')
      .select('id, name, description, category, duration_mins, price, image_url, barber_ids, sort_order')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),

    // Active barbers with user info
    supabase
      .from('barbers')
      .select('id, user_id, bio, specialties, experience_yrs, portfolio_urls, rating, total_reviews, is_available')
      .eq('shop_id', shopId)
      .eq('is_active', true),

    // Active gallery images
    supabase
      .from('gallery')
      .select('id, url, thumbnail_url, caption, category, tags, barber_id, service_id, sort_order')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),

    // Active products (display only)
    supabase
      .from('products')
      .select('id, name, description, category, price, image_url, image_urls')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .order('name', { ascending: true }),

    // Public reviews with offset pagination
    supabase
      .from('reviews')
      .select('id, rating, comment, created_at, barber_id, service_id, booking_id, reply_message, replied_at')
      .eq('shop_id', shopId)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(reviewOffset, reviewOffset + reviewLimit - 1),

    // Total review count (for pagination)
    supabase
      .from('reviews')
      .select('id, rating', { count: 'exact', head: false })
      .eq('shop_id', shopId)
      .eq('is_public', true),
  ])

  // 3. Fetch barber user profiles (for names + photos)
  let barberProfiles: Record<string, { name: string; photo: string | null }> = {}
  if (barbersRes.data && barbersRes.data.length > 0) {
    const barberUserIds = barbersRes.data.map((b: any) => b.user_id)
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name, photo_url')
      .in('id', barberUserIds)

    if (users) {
      barberProfiles = users.reduce((acc: any, u: any) => {
        acc[u.id] = { name: u.display_name, photo: u.photo_url }
        return acc
      }, {})
    }
  }

  // 4. Fetch service names for reviews
  let serviceNames: Record<string, string> = {}
  if (servicesRes.data && servicesRes.data.length > 0) {
    serviceNames = servicesRes.data.reduce((acc: any, s: any) => {
      acc[s.id] = s.name
      return acc
    }, {})
  }

  // 5. Fetch barber names for reviews
  let barberNames: Record<string, string> = {}
  if (barbersRes.data && barbersRes.data.length > 0) {
    barberNames = barbersRes.data.reduce((acc: any, b: any) => {
      acc[b.id] = barberProfiles[b.user_id]?.name || 'Barber'
      return acc
    }, {})
  }

  // 6. Compute review statistics from ALL reviews (not just the page)
  const allReviews = reviewCountRes.data || []
  const totalReviews = reviewCountRes.count || 0
  const averageRating = totalReviews > 0
    ? allReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / totalReviews
    : 0
  const ratingBreakdown = [5, 4, 3, 2, 1].reduce((acc: Record<number, number>, star: number) => {
    acc[star] = allReviews.filter((r: any) => r.rating === star).length
    return acc
  }, {} as Record<number, number>)

  const reviews = reviewsRes.data || []
  const hasMoreReviews = (reviewOffset + reviews.length) < totalReviews

  // ══════════════════════════════════════════
  // 7. COMPUTED: lowestServicePrice
  // ══════════════════════════════════════════
  const services = servicesRes.data || []
  const lowestServicePrice = services.length > 0
    ? Math.min(...services.map((s: any) => s.price))
    : 0

  // ══════════════════════════════════════════
  // 8. COMPUTED: popularServices (booked >5 times in last 7 days)
  // ══════════════════════════════════════════
  let popularServices: string[] = []
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

    const { data: recentBookings } = await supabase
      .from('bookings')
      .select('service_id')
      .eq('shop_id', shopId)
      .gte('date', sevenDaysAgoStr)
      .not('status', 'in', '(cancelled,no_show)')

    if (recentBookings && recentBookings.length > 0) {
      const serviceBookingCount: Record<string, number> = {}
      for (const b of recentBookings) {
        serviceBookingCount[b.service_id] = (serviceBookingCount[b.service_id] || 0) + 1
      }
      popularServices = Object.entries(serviceBookingCount)
        .filter(([, count]) => count >= 5)
        .map(([id]) => id)
    }
  } catch (err) {
    // Non-critical — just skip
  }

  // ══════════════════════════════════════════
  // 9. COMPUTED: nextAvailableSlot & totalSlotsToday
  // ══════════════════════════════════════════
  let nextAvailableSlot: string | null = null
  let totalSlotsToday: number = 0

  try {
    const workingHours = shop.working_hours as Array<{
      day: string
      open: string
      close: string
      is_open: boolean
    }> || []
    const bookingSettings = shop.booking_settings as {
      slot_duration: number
      buffer_time: number
    } || { slot_duration: 30, buffer_time: 0 }
    const timezone = shop.timezone || 'Asia/Manila'

    // Get current date in shop's timezone
    const now = new Date()
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })
    const tzParts = tzFormatter.formatToParts(now)
    const todayStr = `${tzParts.find(p => p.type === 'year')?.value}-${tzParts.find(p => p.type === 'month')?.value}-${tzParts.find(p => p.type === 'day')?.value}`
    const currentHour = parseInt(tzParts.find(p => p.type === 'hour')?.value || '0', 10)
    const currentMinute = parseInt(tzParts.find(p => p.type === 'minute')?.value || '0', 10)
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`

    const dateObj = new Date(todayStr + 'T00:00:00')
    const dayOfWeek = JS_DAY_TO_NAME[dateObj.getDay()]
    const todayHours = workingHours.find(wh => wh.day === dayOfWeek)

    if (todayHours && todayHours.is_open && services.length > 0 && barbersRes.data && barbersRes.data.length > 0) {
      // Check if we're before closing time
      if (currentTimeStr < todayHours.close) {
        const firstService = services[0]
        const slotDuration = bookingSettings.slot_duration || 30
        const bufferTime = bookingSettings.buffer_time || 0
        const interval = slotDuration + bufferTime

        // Get all active barbers
        const activeBarbers = (barbersRes.data || []).filter((b: any) => b.is_available)

        if (activeBarbers.length > 0) {
          // Get existing bookings for today
          const { data: todayBookings } = await supabase
            .from('bookings')
            .select('barber_id, start_time, end_time')
            .eq('shop_id', shopId)
            .eq('date', todayStr)
            .not('status', 'in', '(cancelled,no_show)')

          // Compute available slots for each barber
          const allAvailableSlots = new Set<string>()
          for (const barber of activeBarbers) {
            const barberBookings = (todayBookings || []).filter((b: any) => b.barber_id === barber.id)
            const bookedSlots = new Set<string>()

            for (const booking of barberBookings) {
              const bStart = timeToMinutes(booking.start_time)
              const bEnd = timeToMinutes(booking.end_time)
              let t = timeToMinutes(todayHours.open)
              while (t < timeToMinutes(todayHours.close)) {
                const slotEnd = t + (firstService.duration_mins || 30)
                if (t < bEnd && slotEnd > bStart) {
                  bookedSlots.add(minutesToTime(t))
                }
                t += interval
              }
            }

            let t = timeToMinutes(todayHours.open)
            while (t < timeToMinutes(todayHours.close)) {
              const timeStr = minutesToTime(t)
              if (timeStr >= currentTimeStr && !bookedSlots.has(timeStr)) {
                allAvailableSlots.add(timeStr)
              }
              t += interval
            }
          }

          const sortedSlots = Array.from(allAvailableSlots).sort()
          totalSlotsToday = sortedSlots.length

          if (sortedSlots.length > 0) {
            const [h, m] = sortedSlots[0].split(':').map(Number)
            const period = h >= 12 ? 'PM' : 'AM'
            const displayH = h % 12 || 12
            nextAvailableSlot = `Today ${displayH}:${m.toString().padStart(2, '0')} ${period}`
          }
        }
      }

      // If no slots today, check tomorrow
      if (!nextAvailableSlot) {
        const tomorrow = new Date(todayStr + 'T00:00:00')
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowStr = tomorrow.toISOString().split('T')[0]
        const tomorrowDayOfWeek = JS_DAY_TO_NAME[tomorrow.getDay()]
        const tomorrowHours = workingHours.find(wh => wh.day === tomorrowDayOfWeek)

        if (tomorrowHours && tomorrowHours.is_open) {
          const [h, m] = tomorrowHours.open.split(':').map(Number)
          const period = h >= 12 ? 'PM' : 'AM'
          const displayH = h % 12 || 12
          nextAvailableSlot = `Tomorrow ${displayH}:${m.toString().padStart(2, '0')} ${period}`
        }
      }
    }
  } catch (err) {
    // Non-critical — just skip
  }

  return {
    shop,
    services,
    barbers: (barbersRes.data || []).map((b: any) => ({
      ...b,
      display_name: barberProfiles[b.user_id]?.name || 'Barber',
      photo_url: barberProfiles[b.user_id]?.photo || null,
    })),
    gallery: galleryRes.data || [],
    products: productsRes.data || [],
    reviews: reviews.map((r: any) => ({
      ...r,
      barber_name: barberNames[r.barber_id] || null,
      service_name: serviceNames[r.service_id] || null,
    })),
    reviewStats: {
      total: totalReviews,
      average: Math.round(averageRating * 10) / 10,
      breakdown: ratingBreakdown,
    },
    reviewPagination: {
      offset: reviewOffset,
      limit: reviewLimit,
      hasMore: hasMoreReviews,
    },
    // Computed fields for shop landing page
    lowestServicePrice,
    nextAvailableSlot,
    popularServices,
    totalSlotsToday,
  }
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
