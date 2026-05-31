/**
 * GET /api/admin/loyalty/members
 *
 * Returns all customers who have loyalty points at this shop.
 * Includes their balance, tier, total earned, and last activity.
 * Admin-only access.
 */
import { createClient } from '@supabase/supabase-js'

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

  if (!userData?.shop_id || userData.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const limit = Math.min(parseInt(query.limit as string) || 20, 100)
  const search = (query.search as string) || ''

  // Get shop loyalty config for tier calculation
  const { data: shop } = await supabase
    .from('shops')
    .select('loyalty_tiers_enabled, loyalty_tiers')
    .eq('id', userData.shop_id)
    .single()

  // Get unique customer_ids with their latest balance
  const { data: latestPoints, error } = await supabase
    .from('loyalty_points')
    .select('customer_id, balance_after, created_at')
    .eq('shop_id', userData.shop_id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch members' })
  }

  // Group by customer_id, get latest entry per customer
  const customerMap = new Map<string, { balance: number; lastActivity: string }>()
  for (const lp of latestPoints || []) {
    if (!customerMap.has(lp.customer_id)) {
      customerMap.set(lp.customer_id, {
        balance: lp.balance_after,
        lastActivity: lp.created_at,
      })
    }
  }

  // Get total earned per customer
  const { data: allPoints } = await supabase
    .from('loyalty_points')
    .select('customer_id, type, points')
    .eq('shop_id', userData.shop_id)

  const totalEarnedMap = new Map<string, number>()
  for (const lp of allPoints || []) {
    const current = totalEarnedMap.get(lp.customer_id) || 0
    if (lp.type === 'earned' || lp.type === 'welcome_bonus' || lp.type === 'adjusted') {
      totalEarnedMap.set(lp.customer_id, current + lp.points)
    } else if (lp.type === 'expired') {
      totalEarnedMap.set(lp.customer_id, Math.max(0, current - lp.points))
    }
  }

  // Get customer details
  const customerIds = Array.from(customerMap.keys())
  let customers: any[] = []

  if (customerIds.length > 0) {
    let queryBuilder = supabase
      .from('users')
      .select('id, email, display_name, phone_number')
      .in('id', customerIds)

    if (search) {
      queryBuilder = queryBuilder.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: customerData } = await queryBuilder
    customers = customerData || []
  }

  // Build result
  const members = customers.map((c: any) => {
    const balanceInfo = customerMap.get(c.id)
    const totalEarned = totalEarnedMap.get(c.id) || 0

    // Calculate tier
    let tier = 'bronze'
    if (shop?.loyalty_tiers_enabled && shop?.loyalty_tiers) {
      const tiers = shop.loyalty_tiers
      if (totalEarned >= (tiers.platinum?.min ?? 3000)) tier = 'platinum'
      else if (totalEarned >= (tiers.gold?.min ?? 1500)) tier = 'gold'
      else if (totalEarned >= (tiers.silver?.min ?? 500)) tier = 'silver'
    }

    return {
      id: c.id,
      email: c.email,
      displayName: c.display_name,
      phoneNumber: c.phone_number,
      balance: balanceInfo?.balance || 0,
      totalEarned,
      tier,
      lastActivity: balanceInfo?.lastActivity || null,
    }
  })

  // Sort by balance descending
  members.sort((a, b) => b.balance - a.balance)

  // Paginate
  const total = members.length
  const paginatedMembers = members.slice((page - 1) * limit, page * limit)

  return {
    members: paginatedMembers,
    total,
    page,
    limit,
  }
})
