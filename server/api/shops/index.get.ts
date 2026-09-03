/**
 * GET /api/shops
 * Returns a list of active shops for the homepage search combobox.
 *
 * Query params:
 * - q: optional search string (filters by name, slug, or city)
 *
 * Returns: array of { slug, name, city, logo_url, total_bookings }
 * Sorted alphabetically by name ascending — consumers (e.g. the homepage)
 * can re-sort by total_bookings for popularity-ordered displays.
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)
  const searchQuery = (query.q as string || '').trim().toLowerCase()

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  let supabaseQuery = supabase
    .from('shops')
    .select('id, slug, name, address_city, logo_url')
    .eq('is_active', true)
    .order('name', { ascending: true })

  // If a search query is provided, filter server-side
  if (searchQuery) {
    // Escape %, _, ), (, = to prevent PostgREST filter injection
    const safe = searchQuery.replace(/[%_)(=]/g, (c) => `\\${c}`).substring(0, 100)
    supabaseQuery = supabaseQuery.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%,address_city.ilike.%${safe}%`)
  }

  const { data: shops, error } = await supabaseQuery

  if (error) {
    console.error('[GET /api/shops] Supabase error:', JSON.stringify({ message: error.message, code: error.code, details: error.details, hint: error.hint }))
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch shops' })
  }

  const activeShops = shops || []

  if (activeShops.length === 0) {
    return { data: [] }
  }

  // ── Booking counts per shop (popularity signal) ──
  // Same technique as server/api/super-admin/shops/index.get.ts.
  // Single lightweight query (shop_id column only).
  // Cancelled & no-show bookings are excluded so the count
  // reflects genuine activity.
  const shopIds = activeShops.map(s => s.id)
  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('shop_id')
    .in('shop_id', shopIds)
    .not('status', 'in', '(cancelled,no_show)')

  const bookingCountMap = new Map<string, number>()
  if (bookingRows) {
    for (const row of bookingRows) {
      bookingCountMap.set(row.shop_id, (bookingCountMap.get(row.shop_id) || 0) + 1)
    }
  }

  // Alphabetical order preserved — consumers re-sort by total_bookings if needed
  return {
    data: activeShops.map((s: any) => ({
      slug: s.slug,
      name: s.name,
      city: s.address_city || null,
      logo_url: s.logo_url || null,
      total_bookings: bookingCountMap.get(s.id) || 0,
    })),
  }
})
