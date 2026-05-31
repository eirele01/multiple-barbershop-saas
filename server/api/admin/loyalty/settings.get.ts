/**
 * GET /api/admin/loyalty/settings
 *
 * Returns the loyalty configuration for the current shop.
 * Admin-only access.
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Get the authenticated user
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const token = authHeader.substring(7)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid token' })
  }

  // Get user's shop_id
  const { data: userData } = await supabase
    .from('users')
    .select('shop_id, role')
    .eq('id', user.id)
    .single()

  if (!userData?.shop_id || userData.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  // Get loyalty settings
  const { data: shop, error } = await supabase
    .from('shops')
    .select(`
      plan,
      loyalty_enabled,
      loyalty_earn_rate,
      loyalty_earn_base,
      loyalty_welcome_bonus,
      loyalty_expiry_months,
      loyalty_tiers_enabled,
      loyalty_tiers
    `)
    .eq('id', userData.shop_id)
    .single()

  if (error || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  return shop
})
