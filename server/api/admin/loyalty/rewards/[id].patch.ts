/**
 * PATCH /api/admin/loyalty/rewards/[id]
 *
 * Update a loyalty reward.
 * Admin-only access.
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const updateRewardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(['discount_fixed', 'discount_percent', 'free_service', 'free_product']).optional(),
  points_required: z.number().int().min(1).optional(),
  discount_value: z.number().min(0).optional().nullable(),
  discount_percent: z.number().int().min(1).max(100).optional().nullable(),
  service_id: z.string().uuid().optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  max_value: z.number().min(0).optional().nullable(),
  is_active: z.boolean().optional(),
})

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

  // Validate body
  const body = await readBody(event)
  const parsed = updateRewardSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
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

  // Update
  const { data: reward, error } = await supabase
    .from('loyalty_rewards')
    .update(parsed.data)
    .eq('id', rewardId)
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to update reward: ' + error.message })
  }

  // Log
  await supabase.from('activity_logs').insert({
    shop_id: userData.shop_id,
    user_id: user.id,
    user_email: user.email,
    user_role: 'admin',
    action: 'loyalty.reward_updated',
    entity_type: 'loyalty_reward',
    entity_id: rewardId,
    entity_name: existing.name,
    new_value: parsed.data,
  })

  return reward
})
