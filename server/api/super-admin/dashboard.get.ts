/**
 * GET /api/super-admin/dashboard
 *
 * Returns dashboard stats for the super admin panel.
 * Includes total shops, active shops, plan breakdowns, MRR,
 * registration trends, and recent activity.
 */
import type { PlatformSettings } from '~/types/database'
import { useSupabaseAdmin } from '../../utils/supabase'

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

  try {
    // ── Shop counts ──
    const { count: totalShops } = await supabase
      .from('shops')
      .select('*', { count: 'exact', head: true })

    const { count: activeShops } = await supabase
      .from('shops')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    const { count: basicCount } = await supabase
      .from('shops')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'basic')

    const { count: upgradedCount } = await supabase
      .from('shops')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'upgraded')

    // ── MRR: upgradedCount * monthly price from platform_settings ──
    const { data: priceSetting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'upgraded_monthly_price')
      .single<PlatformSettings>()

    const monthlyPrice = priceSetting?.value ? parseFloat(priceSetting.value) : 499
    const mrr = (upgradedCount || 0) * monthlyPrice

    // ── Registrations by day (last 30 days) ──
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

    const { data: recentShops } = await supabase
      .from('shops')
      .select('created_at')
      .gte('created_at', thirtyDaysAgoStr)
      .order('created_at', { ascending: true })

    // Group by date
    const registrationsByDay: Array<{ date: string; count: number }> = []
    const regMap = new Map<string, number>()
    if (recentShops) {
      for (const shop of recentShops) {
        const date = shop.created_at.slice(0, 10) // YYYY-MM-DD
        regMap.set(date, (regMap.get(date) || 0) + 1)
      }
      // Fill in missing dates with 0
      for (let i = 0; i < 30; i++) {
        const d = new Date()
        d.setDate(d.getDate() - (29 - i))
        const dateStr = d.toISOString().slice(0, 10)
        registrationsByDay.push({
          date: dateStr,
          count: regMap.get(dateStr) || 0,
        })
      }
    }

    // ── Recent registrations (last 10 shops with owner info) ──
    const { data: recentShopsList } = await supabase
      .from('shops')
      .select('id, name, slug, plan, is_active, created_at, owner_id, logo_url')
      .order('created_at', { ascending: false })
      .limit(10)

    const recentRegistrations: Array<Record<string, unknown>> = []
    if (recentShopsList && recentShopsList.length > 0) {
      // Fetch owner details for these shops
      const ownerIds = recentShopsList.map(s => s.owner_id).filter(Boolean) as string[]

      let owners: any[] | null = null
      if (ownerIds.length > 0) {
        const { data } = await supabase
          .from('users')
          .select('id, email, display_name')
          .in('id', ownerIds)
        owners = data
      }

      const ownerMap = new Map(owners?.map(o => [o.id, o]) || [])

      for (const shop of recentShopsList) {
        const owner = shop.owner_id ? ownerMap.get(shop.owner_id) : null
        recentRegistrations.push({
          id: shop.id,
          name: shop.name,
          slug: shop.slug,
          plan: shop.plan,
          isActive: shop.is_active,
          createdAt: shop.created_at,
          logoUrl: shop.logo_url,
          ownerEmail: owner?.email || null,
          ownerName: owner?.display_name || null,
        })
      }
    }

    // ── Recent upgrades (last 10 activity_logs where action='shop.upgraded') ──
    const { data: upgradeLogs } = await supabase
      .from('activity_logs')
      .select('id, shop_id, old_value, new_value, created_at')
      .eq('action', 'shop.upgraded')
      .order('created_at', { ascending: false })
      .limit(10)

    const recentUpgrades: Array<Record<string, unknown>> = []
    if (upgradeLogs && upgradeLogs.length > 0) {
      const shopIds = upgradeLogs.map(l => l.shop_id).filter(Boolean) as string[]

      let upgradeShops: any[] | null = null
      if (shopIds.length > 0) {
        const { data } = await supabase
          .from('shops')
          .select('id, name')
          .in('id', shopIds)
        upgradeShops = data
      }

      const shopMap = new Map(upgradeShops?.map(s => [s.id, s]) || [])

      for (const log of upgradeLogs) {
        const shop = log.shop_id ? shopMap.get(log.shop_id) : null
        recentUpgrades.push({
          id: log.id,
          shopName: shop?.name || 'Unknown Shop',
          oldPlan: (log.old_value as Record<string, unknown>)?.plan || 'basic',
          newPlan: (log.new_value as Record<string, unknown>)?.plan || 'upgraded',
          createdAt: log.created_at,
        })
      }
    }

    return {
      totalShops: totalShops || 0,
      activeShops: activeShops || 0,
      basicCount: basicCount || 0,
      upgradedCount: upgradedCount || 0,
      mrr,
      registrationsByDay,
      recentRegistrations,
      recentUpgrades,
    }
  } catch (error) {
    console.error('[SUPER-ADMIN DASHBOARD] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load dashboard data' })
  }
})
