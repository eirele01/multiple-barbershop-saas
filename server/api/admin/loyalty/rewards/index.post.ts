/**
 * POST /api/admin/loyalty/rewards
 *
 * Create a new loyalty reward.
 * Admin-only access. Upgraded plan required.
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const createRewardSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(['discount_fixed', 'discount_percent', 'free_service', 'free_product']),
  points_required: z.number().int().min(1),
  discount_value: z.number().min(0).optional().nullable(),
  discount_percent: z.number().int().min(1).max(100).optional().nullable(),
  service_id: z.string().uuid().optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  max_value: z.number().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
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

  // Check plan
  const { data: shop } = await supabase
    .from('shops')
    .select('plan')
    .eq('id', userData.shop_id)
    .single()

  if (!shop || shop.plan !== 'upgraded') {
    throw createError({ statusCode: 403, statusMessage: 'Loyalty features require the Upgraded plan' })
  }

  // Validate body
  const body = await readBody(event)
  const parsed = createRewardSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  // Create reward
  const { data: reward, error } = await supabase
    .from('loyalty_rewards')
    .insert({
      shop_id: userData.shop_id,
      ...parsed.data,
    })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create reward: ' + error.message })
  }

  // Log
  await supabase.from('activity_logs').insert({
    shop_id: userData.shop_id,
    user_id: user.id,
    user_email: user.email,
    user_role: 'admin',
    action: 'loyalty.reward_created',
    entity_type: 'loyalty_reward',
    entity_id: reward.id,
    entity_name: reward.name,
    new_value: parsed.data,
  })

  return reward
})
