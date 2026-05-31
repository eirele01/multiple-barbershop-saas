/**
 * GET /api/super-admin/shops/[id]
 *
 * Get single shop detail with owner info, stats, and subscription history.
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

  const shopId = getRouterParam(event, 'id')
  if (!shopId) {
    throw createError({ statusCode: 400, statusMessage: 'Shop ID is required' })
  }

  try {
    // ── Fetch shop ──
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single()

    if (shopError || !shop) {
      throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
    }

    // ── Fetch owner ──
    let owner = null
    if (shop.owner_id) {
      const { data: ownerData } = await supabase
        .from('users')
        .select('id, email, display_name, phone_number, is_active, last_login_at, created_at')
        .eq('id', shop.owner_id)
        .single()
      owner = ownerData
    }

    // ── Stats ──
    // Total bookings
    const { count: totalBookings } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)

    // Revenue (sum of verified payments)
    const { data: revenueData } = await supabase
      .from('bookings')
      .select('payment_amount')
      .eq('shop_id', shopId)
      .eq('payment_status', 'verified')

    const revenue = revenueData?.reduce((sum, b) => sum + (Number(b.payment_amount) || 0), 0) || 0

    // Staff count (active barbers)
    const { count: staffCount } = await supabase
      .from('barbers')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('is_active', true)

    // Services count (active services)
    const { count: servicesCount } = await supabase
      .from('services')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('is_active', true)

    // ── Subscription history ──
    const { data: subscriptionHistory } = await supabase
      .from('activity_logs')
      .select('id, action, old_value, new_value, created_at, user_email')
      .eq('shop_id', shopId)
      .in('action', ['shop.upgraded', 'shop.downgraded'])
      .order('created_at', { ascending: false })
      .limit(20)

    return {
      shop,
      owner,
      stats: {
        totalBookings: totalBookings || 0,
        revenue,
        staffCount: staffCount || 0,
        servicesCount: servicesCount || 0,
      },
      subscriptionHistory: subscriptionHistory || [],
    }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN SHOP DETAIL] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch shop details' })
  }
})
