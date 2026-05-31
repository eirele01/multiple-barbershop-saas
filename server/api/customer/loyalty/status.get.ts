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

  // Get query params
  const query = getQuery(event)
  const shopId = query.shopId as string | undefined

  if (shopId) {
    // Return loyalty status for a specific shop
    const { data: shop } = await supabase
      .from('shops')
      .select('id, name, slug, loyalty_enabled, loyalty_tiers_enabled, loyalty_tiers, plan')
      .eq('id', shopId)
      .single()

    if (!shop || !shop.loyalty_enabled || shop.plan !== 'upgraded') {
      return {
        shopId,
        shopName: shop?.name,
        enabled: false,
        balance: 0,
        tier: 'bronze',
        totalEarned: 0,
      }
    }

    const balance = await getCustomerBalance(shopId, user.id)
    const totalEarned = await getCustomerTotalEarned(shopId, user.id)
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
      .eq('customer_id', user.id)

    const uniqueShopIds = [...new Set((shopPoints || []).map(sp => sp.shop_id))]

    const results = []
    for (const sid of uniqueShopIds) {
      const { data: shop } = await supabase
        .from('shops')
        .select('id, name, slug, loyalty_enabled, loyalty_tiers_enabled, loyalty_tiers, plan')
        .eq('id', sid)
        .single()

      if (!shop || !shop.loyalty_enabled || shop.plan !== 'upgraded') continue

      const balance = await getCustomerBalance(sid, user.id)
      const totalEarned = await getCustomerTotalEarned(sid, user.id)
      const tier = getCustomerTier(shop, totalEarned)

      results.push({
        shopId: sid,
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
