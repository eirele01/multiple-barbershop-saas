/**
 * PATCH /api/admin/loyalty/settings
 *
 * Update loyalty settings for the current shop.
 * Admin-only access. Upgraded plan required.
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const loyaltySettingsSchema = z.object({
  loyalty_enabled: z.boolean().optional(),
  loyalty_earn_rate: z.number().int().min(1).max(100).optional(),
  loyalty_earn_base: z.number().int().min(1).max(100000).optional(),
  loyalty_welcome_bonus: z.number().int().min(0).max(10000).optional(),
  loyalty_expiry_months: z.number().int().min(0).max(120).optional(),
  loyalty_tiers_enabled: z.boolean().optional(),
  loyalty_tiers: z.object({
    bronze: z.object({ min: z.number(), max: z.number(), multiplier: z.number() }),
    silver: z.object({ min: z.number(), max: z.number(), multiplier: z.number() }),
    gold: z.object({ min: z.number(), max: z.number(), multiplier: z.number() }),
    platinum: z.object({ min: z.number(), max: z.number().nullable(), multiplier: z.number() }),
  }).optional(),
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

  // Get user's shop_id and role
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
  const parsed = loyaltySettingsSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  // Update shop loyalty settings
  const { error: updateError } = await supabase
    .from('shops')
    .update(parsed.data)
    .eq('id', userData.shop_id)

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to update loyalty settings: ' + updateError.message })
  }

  // Log to activity_logs
  await supabase.from('activity_logs').insert({
    shop_id: userData.shop_id,
    user_id: user.id,
    user_email: user.email,
    user_role: 'admin',
    action: 'loyalty.settings_updated',
    entity_type: 'shop',
    entity_id: userData.shop_id,
    new_value: parsed.data,
  })

  return { success: true }
})
