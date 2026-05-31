/**
 * GET /api/admin/loyalty/rewards
 *
 * Returns all loyalty rewards for the current shop.
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

  // Get all rewards
  const { data: rewards, error } = await supabase
    .from('loyalty_rewards')
    .select('*')
    .eq('shop_id', userData.shop_id)
    .order('points_required', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch rewards' })
  }

  return rewards || []
})
