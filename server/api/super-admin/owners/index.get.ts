/**
 * GET /api/super-admin/owners
 *
 * List all shop owners (users with role='admin').
 * Query params: search, status, page, limit
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
  const status = query.status || ''
  const page = Math.max(1, parseInt(query.page || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)))
  const offset = (page - 1) * limit

  try {
    // ── Build query for owners (role='admin') ──
    let ownersQuery = supabase
      .from('users')
      .select('id, email, display_name, phone_number, photo_url, role, shop_id, is_active, last_login_at, created_at', { count: 'exact' })
      .eq('role', 'admin')
      .order('created_at', { ascending: false })

    // Apply search filter
    if (search) {
      ownersQuery = ownersQuery.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    // Apply status filter
    if (status === 'active') {
      ownersQuery = ownersQuery.eq('is_active', true)
    } else if (status === 'suspended') {
      ownersQuery = ownersQuery.eq('is_active', false)
    }

    // ── Pagination ──
    ownersQuery = ownersQuery.range(offset, offset + limit - 1)

    const { data: owners, count: total, error: ownersError } = await ownersQuery

    if (ownersError) {
      console.error('[SUPER-ADMIN OWNERS] Query error:', ownersError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch owners' })
    }

    // ── Enrich with shop info ──
    const enrichedOwners: Array<Record<string, unknown>> = []

    if (owners && owners.length > 0) {
      // Get shop info for each owner
      const shopIds = owners.map(o => o.shop_id).filter(Boolean) as string[]
      const { data: shops } = await supabase
        .from('shops')
        .select('id, name, plan, owner_id')
        .in('id', shopIds)

      const shopMap = new Map(shops?.map(s => [s.id, s]) || [])

      // Also get shops by owner_id for owners whose shop_id might not be set
      const ownerIds = owners.map(o => o.id)
      const { data: ownerShops } = await supabase
        .from('shops')
        .select('id, name, plan, owner_id')
        .in('owner_id', ownerIds)

      const ownerShopMap = new Map<string, { id: string; name: string; plan: string }>()
      if (ownerShops) {
        for (const shop of ownerShops) {
          if (shop.owner_id) {
            ownerShopMap.set(shop.owner_id, { id: shop.id, name: shop.name, plan: shop.plan })
          }
        }
      }

      for (const owner of owners) {
        // Try shop_id first, then fall back to ownerShopMap
        const shop = owner.shop_id ? shopMap.get(owner.shop_id) : null
        const ownerShop = ownerShopMap.get(owner.id)

        enrichedOwners.push({
          id: owner.id,
          email: owner.email,
          displayName: owner.display_name,
          phoneNumber: owner.phone_number,
          photoUrl: owner.photo_url,
          isActive: owner.is_active,
          lastLoginAt: owner.last_login_at,
          createdAt: owner.created_at,
          shop: shop ? {
            id: shop.id,
            name: shop.name,
            plan: shop.plan,
          } : ownerShop ? {
            id: ownerShop.id,
            name: ownerShop.name,
            plan: ownerShop.plan,
          } : null,
        })
      }
    }

    return {
      owners: enrichedOwners,
      total: total || 0,
      page,
      limit,
    }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN OWNERS] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch owners' })
  }
})
