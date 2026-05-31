/**
 * GET /api/super-admin/shops/[id]/staff
 *
 * Get all staff members for a specific shop.
 * Read-only list used by the super admin shop detail page.
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
    // Fetch all barbers (staff) for this shop
    const { data: barbers, error: barbersError } = await supabase
      .from('barbers')
      .select('id, user_id, is_active, created_at')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: true })

    if (barbersError) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch staff' })
    }

    const staff: any[] = []

    if (barbers && barbers.length > 0) {
      // Fetch user details for each barber
      const userIds = barbers.map(b => b.user_id).filter(Boolean)
      const { data: users } = await supabase
        .from('users')
        .select('id, email, display_name, role, is_active, created_at')
        .in('id', userIds)

      const userMap = new Map(users?.map(u => [u.id, u]) || [])

      for (const barber of barbers) {
        const userData = barber.user_id ? userMap.get(barber.user_id) : null
        staff.push({
          id: barber.id,
          user_id: barber.user_id,
          display_name: userData?.display_name || 'Unknown',
          email: userData?.email || '',
          role: userData?.role || 'barber',
          is_active: barber.is_active,
          created_at: barber.created_at,
        })
      }
    }

    // Also include any admin/manager/cashier users linked to this shop
    const { data: shopUsers } = await supabase
      .from('users')
      .select('id, email, display_name, role, is_active, created_at')
      .eq('shop_id', shopId)
      .in('role', ['admin', 'manager', 'cashier'])

    if (shopUsers) {
      for (const u of shopUsers) {
        // Avoid duplicates (admin is usually also an owner, not a barber)
        if (!staff.some(s => s.user_id === u.id)) {
          staff.push({
            id: u.id,
            user_id: u.id,
            display_name: u.display_name || 'Unknown',
            email: u.email,
            role: u.role,
            is_active: u.is_active,
            created_at: u.created_at,
          })
        }
      }
    }

    return { staff }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN SHOP STAFF] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch staff' })
  }
})
