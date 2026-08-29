/**
 * GET /api/admin/dashboard
 *
 * Admin dashboard stats: today's bookings, pending payments, today's revenue,
 * active staff count.
 *
 * Auth: shop staff (admin/manager/cashier/barber)
 * Query params: none
 * Returns: { todayBookings, pendingPayments, todayRevenue, activeStaff,
 *            servicesCount, paymentsConfigured, brandingCustomized }
 */
import { createClient } from '@supabase/supabase-js'
import { SHOP_STAFF_ROLES } from '~/constants/roles'
import { getShopStats } from '~/utils/server/dashboard'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }
  const token = authHeader.substring(7)
  const supabase = createClient(config.public.supabaseUrl as string, config.supabaseServiceKey as string)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }
  const { data: userData } = await supabase.from('users').select('shop_id, role').eq('id', user.id).single()
  if (!userData?.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop assigned' })
  }
  if (!SHOP_STAFF_ROLES.includes(userData.role || '')) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  // If barber role, fetch their barber ID for filtered stats
  let barberId: string | undefined
  if (userData.role === 'barber') {
    const { data: barberData } = await supabase
      .from('barbers')
      .select('id')
      .eq('user_id', user.id)
      .eq('shop_id', userData.shop_id)
      .single()
    barberId = barberData?.id
  }

  const stats = await getShopStats(supabase, userData.shop_id, barberId)
  return { ...stats, role: userData.role }
})
