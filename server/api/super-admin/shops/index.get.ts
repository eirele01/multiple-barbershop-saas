/**
 * GET /api/super-admin/shops
 *
 * List all shops with search, filters, and pagination.
 * Query params: search, plan, status, dateFrom, dateTo, page, limit
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const supabase = useSupabaseAdmin()

  // ── Auth: verify super_admin ──
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, statusMessage: 'Invalid token' })

  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || userProfile.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Super admin access required' })
  }

  // ── Parse query params ──
  const query = getQuery(event) as Record<string, string | undefined>
  const search = query.search?.trim() || ''
  const plan = query.plan || ''
  const status = query.status || ''
  const dateFrom = query.dateFrom || ''
  const dateTo = query.dateTo || ''
  const page = Math.max(1, parseInt(query.page || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)))
  const offset = (page - 1) * limit

  try {
    // ── Build base query ──
    let shopsQuery = supabase
      .from('shops')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Apply plan filter
    if (plan && ['basic', 'upgraded'].includes(plan)) {
      shopsQuery = shopsQuery.eq('plan', plan)
    }

    // Apply status filter (is_active)
    if (status === 'active') {
      shopsQuery = shopsQuery.eq('is_active', true)
    } else if (status === 'suspended') {
      shopsQuery = shopsQuery.eq('is_active', false)
    }

    // Apply date filters
    if (dateFrom) {
      shopsQuery = shopsQuery.gte('created_at', dateFrom)
    }
    if (dateTo) {
      shopsQuery = shopsQuery.lte('created_at', dateTo + 'T23:59:59.999Z')
    }

    // Apply search (on name and slug)
    if (search) {
      shopsQuery = shopsQuery.or(`name.ilike.%${search}%,slug.ilike.%${search}%`)
    }

    // ── Pagination ──
    shopsQuery = shopsQuery.range(offset, offset + limit - 1)

    const { data: shops, count: total, error: shopsError } = await shopsQuery

    if (shopsError) {
      console.error('[SUPER-ADMIN SHOPS] Query error:', shopsError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch shops' })
    }

    // ── Enrich with owner info and booking counts ──
    const enrichedShops: Array<Record<string, unknown>> = []

    if (shops && shops.length > 0) {
      // Get owner info
      const ownerIds = shops.map(s => s.owner_id).filter(Boolean) as string[]
      const { data: owners } = await supabase
        .from('users')
        .select('id, email, display_name')
        .in('id', ownerIds)

      const ownerMap = new Map(owners?.map(o => [o.id, o]) || [])

      // If search includes email terms, also search by owner email
      let additionalShopsFromEmail: string[] = []
      if (search && owners) {
        const matchingOwnerIds = owners
          .filter(o => o.email.toLowerCase().includes(search.toLowerCase()))
          .map(o => o.id)
        if (matchingOwnerIds.length > 0) {
          const { data: emailShops } = await supabase
            .from('shops')
            .select('id')
            .in('owner_id', matchingOwnerIds)
          additionalShopsFromEmail = emailShops?.map(s => s.id) || []
        }
      }

      // Get booking counts per shop
      const shopIds = shops.map(s => s.id)
      const { data: bookingCounts } = await supabase
        .from('bookings')
        .select('shop_id')
        .in('shop_id', shopIds)

      const bookingCountMap = new Map<string, number>()
      if (bookingCounts) {
        for (const b of bookingCounts) {
          bookingCountMap.set(b.shop_id, (bookingCountMap.get(b.shop_id) || 0) + 1)
        }
      }

      for (const shop of shops) {
        const owner = shop.owner_id ? ownerMap.get(shop.owner_id) : null
        enrichedShops.push({
          ...shop,
          ownerEmail: owner?.email || null,
          ownerDisplayName: owner?.display_name || null,
          totalBookings: bookingCountMap.get(shop.id) || 0,
          matchedByEmail: additionalShopsFromEmail.includes(shop.id),
        })
      }
    }

    return {
      shops: enrichedShops,
      total: total || 0,
      page,
      limit,
    }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN SHOPS] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch shops' })
  }
})
