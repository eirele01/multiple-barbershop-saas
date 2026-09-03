/**
 * GET /api/customer/loyalty/status
 *
 * Returns the current customer's loyalty status across all shops they've interacted with,
 * or for a specific shop if shopId query param is provided.
 *
 * Returns: balance, tier, totalEarned, recentTransactions summary
 */
import { createClient } from '@supabase/supabase-js'
import { getCustomerBalance, getCustomerTotalEarned, getCustomerTier } from '~/utils/server/loyaltyEngine'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : ''
  const authUser = await verifyAuth(token)

  // Customer-only access
  if (authUser.role !== 'customer') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Customer access required' })
  }

  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Get query params
  const query = getQuery(event)
  const shopId = query.shopId as string | undefined

  if (shopId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid shopId format' })
  }

  if (shopId) {
    // Return loyalty status for a specific shop
    const { data: shop } = await supabase
      .from('shops')
      .select('id, name, slug, loyalty_enabled, loyalty_tiers_enabled, loyalty_tiers, plan')
      .eq('id', shopId)
      .single()

    if (!shop || !shop.loyalty_enabled || shop.plan === 'basic') {
      return {
        shopId,
        shopName: shop?.name,
        enabled: false,
        balance: 0,
        tier: 'bronze',
        totalEarned: 0,
      }
    }

    const balance = await getCustomerBalance(shopId, authUser.id)
    const totalEarned = await getCustomerTotalEarned(shopId, authUser.id)
    const tier = getCustomerTier(shop, totalEarned)

    // Get available rewards
    const { data: rewards } = await supabase
      .from('loyalty_rewards')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true)

    return {
      shopId,
      shopName: shop.name,
      shopSlug: shop.slug,
      enabled: true,
      balance,
      tier,
      totalEarned,
      tiersEnabled: shop.loyalty_tiers_enabled,
      tiers: shop.loyalty_tiers,
      rewards: rewards || [],
    }
  } else {
    // Return loyalty status across all shops
    const { data: shopPoints } = await supabase
      .from('loyalty_points')
      .select('shop_id')
      .eq('customer_id', authUser.id)

    const uniqueShopIds = [...new Set((shopPoints || []).map(sp => sp.shop_id))]

    // Batch fetch all shops in one query
    const { data: shopsBatch } = await supabase
      .from('shops')
      .select('id, name, slug, loyalty_enabled, loyalty_tiers_enabled, loyalty_tiers, plan')
      .in('id', uniqueShopIds)

    const results = []
    const eligibleShops = (shopsBatch || []).filter(s => s && s.loyalty_enabled && s.plan !== 'basic')

    // Parallelize balance/earned queries instead of sequential (N+1 fix)
    const balanceResults = await Promise.all(
      eligibleShops.map(s => Promise.all([
        getCustomerBalance(s.id, authUser.id),
        getCustomerTotalEarned(s.id, authUser.id),
      ]))
    )

    for (const [i, shop] of eligibleShops.entries()) {
      const [balance, totalEarned] = balanceResults[i]
      const tier = getCustomerTier(shop, totalEarned)

      results.push({
        shopId: shop.id,
        shopName: shop.name,
        shopSlug: shop.slug,
        balance,
        tier,
        totalEarned,
      })
    }

    return { shops: results }
  }
})
