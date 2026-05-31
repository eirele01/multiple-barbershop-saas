/**
 * PATCH /api/super-admin/shops/[id]/subscription
 *
 * Change shop subscription plan.
 * Body: { plan: 'basic' | 'upgraded', plan_status?: string, plan_end_date?: string }
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { z } from 'zod'

const subscriptionSchema = z.object({
  plan: z.enum(['basic', 'upgraded']),
  plan_status: z.enum(['active', 'inactive', 'trial']).optional(),
  plan_end_date: z.string().optional(),
})

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

  // ── Validate body ──
  const body = await readBody(event)
  const parsed = subscriptionSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { plan: newPlan, plan_status, plan_end_date } = parsed.data

  try {
    // ── Get current shop data ──
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('id, name, plan, plan_status, plan_end_date')
      .eq('id', shopId)
      .single()

    if (shopError || !shop) {
      throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
    }

    const oldPlan = shop.plan

    // ── Build update payload ──
    const updatePayload: Record<string, unknown> = { plan: newPlan }
    if (plan_status) updatePayload.plan_status = plan_status
    if (plan_end_date) updatePayload.plan_end_date = plan_end_date

    // ── Update shop subscription ──
    const { error: updateError } = await supabase
      .from('shops')
      .update(updatePayload)
      .eq('id', shopId)

    if (updateError) {
      console.error('[SUPER-ADMIN SUBSCRIPTION] Update error:', updateError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update subscription' })
    }

    // ── Log to activity_logs ──
    const action = newPlan === 'upgraded' ? 'shop.upgraded' : 'shop.downgraded'
    await supabase.from('activity_logs').insert({
      shop_id: shopId,
      user_id: user.id,
      user_email: user.email,
      user_role: 'super_admin',
      action,
      entity_type: 'shop',
      entity_id: shopId,
      entity_name: shop.name,
      old_value: { plan: oldPlan },
      new_value: { plan: newPlan },
    })

    return { success: true }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN SUBSCRIPTION] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update subscription' })
  }
})
