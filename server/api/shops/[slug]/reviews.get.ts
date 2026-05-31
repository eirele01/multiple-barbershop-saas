/**
 * GET /api/shops/[slug]/reviews
 * Returns paginated reviews for a shop's landing page.
 *
 * Query params:
 * - offset: offset for pagination (default 0)
 * - limit: number of reviews per page (default 10, max 50)
 */
import { createClient } from '@supabase/supabase-js'

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

  const offset = parseInt(query.offset as string) || 0
  const limit = Math.min(parseInt(query.limit as string) || 10, 50)

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // 1. Get shop ID from slug
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id')
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

  // 2. Fetch paginated reviews + total count
  const [reviewsRes, countRes] = await Promise.all([
    supabase
      .from('reviews')
      .select('id, rating, comment, created_at, barber_id, service_id, reply_message, replied_at')
      .eq('shop_id', shopId)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),

    supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('is_public', true),
  ])

  const reviews = reviewsRes.data || []
  const totalReviews = countRes.count || 0
  const hasMore = (offset + reviews.length) < totalReviews

  // 3. Resolve barber and service names for the reviews
  // Get unique barber_ids and service_ids
  const barberIds = [...new Set(reviews.map((r: any) => r.barber_id).filter(Boolean))]
  const serviceIds = [...new Set(reviews.map((r: any) => r.service_id).filter(Boolean))]

  let barberNames: Record<string, string> = {}
  let serviceNames: Record<string, string> = {}

  if (barberIds.length > 0) {
    // First get barber records to find user_ids
    const { data: barbers } = await supabase
      .from('barbers')
      .select('id, user_id')
      .in('id', barberIds)

    if (barbers && barbers.length > 0) {
      const userIds = barbers.map((b: any) => b.user_id)
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', userIds)

      const userMap: Record<string, string> = {}
      if (users) {
        users.forEach((u: any) => { userMap[u.id] = u.display_name })
      }

      barbers.forEach((b: any) => {
        barberNames[b.id] = userMap[b.user_id] || 'Barber'
      })
    }
  }

  if (serviceIds.length > 0) {
    const { data: services } = await supabase
      .from('services')
      .select('id, name')
      .in('id', serviceIds)

    if (services) {
      services.forEach((s: any) => {
        serviceNames[s.id] = s.name
      })
    }
  }

  return {
    reviews: reviews.map((r: any) => ({
      ...r,
      barber_name: barberNames[r.barber_id] || null,
      service_name: serviceNames[r.service_id] || null,
    })),
    pagination: {
      offset,
      limit,
      total: totalReviews,
      hasMore,
    },
  }
})
