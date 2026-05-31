/**
 * DELETE /api/admin/loyalty/rewards/[id]
 *
 * Delete a loyalty reward.
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

  const rewardId = getRouterParam(event, 'id')
  if (!rewardId) {
    throw createError({ statusCode: 400, statusMessage: 'Reward ID is required' })
  }

  // Verify reward belongs to this shop
  const { data: existing } = await supabase
    .from('loyalty_rewards')
    .select('id, name')
    .eq('id', rewardId)
    .eq('shop_id', userData.shop_id)
    .single()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Reward not found' })
  }

  // Delete
  const { error } = await supabase
    .from('loyalty_rewards')
    .delete()
    .eq('id', rewardId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete reward: ' + error.message })
  }

  // Log
  await supabase.from('activity_logs').insert({
    shop_id: userData.shop_id,
    user_id: user.id,
    user_email: user.email,
    user_role: 'admin',
    action: 'loyalty.reward_deleted',
    entity_type: 'loyalty_reward',
    entity_id: rewardId,
    entity_name: existing.name,
  })

  return { success: true }
})
