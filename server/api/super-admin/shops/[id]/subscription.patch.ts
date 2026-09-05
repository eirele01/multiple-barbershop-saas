/**
 * PATCH /api/super-admin/shops/[id]/subscription
 *
 * Change shop subscription plan.
 * Body: { plan: string (plan code), plan_status?: string, plan_end_date?: string }
 * Supports any plan code defined in the `plans` table (Tier Maker).
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { z } from 'zod'
import { computePlanEndDate } from '~/utils/server/plans'

const subscriptionSchema = z.object({
  plan: z.string().min(2).max(40).regex(/^[a-z0-9_]+$/, 'invalid plan code'),
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
      .select('id, name, plan, plan_status, plan_end_date, billing_interval')
      .eq('id', shopId)
      .single()

    if (shopError || !shop) {
      throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
    }

    const oldPlan = shop.plan

    // ── Build update payload ──
    const updatePayload: Record<string, unknown> = { plan: newPlan }
    if (plan_status) updatePayload.plan_status = plan_status

    // ── End date logic ──
    // A PAID plan without an end date never expires (silent "no-expiry" grant)
    // — surprising for the shop owner AND the platform (paid plan, no renewal).
    // Default a paid grant to now + the shop's billing interval. Explicit
    // plan_end_date always wins. Free plans keep null (no expiry by design).
    const billingInterval = (shop.billing_interval === 'yearly' ? 'yearly' : 'monthly') as 'monthly' | 'yearly'
    if (plan_end_date) {
      updatePayload.plan_end_date = plan_end_date
    } else if (newPlan !== 'basic') {
      updatePayload.plan_end_date = computePlanEndDate(new Date(), billingInterval).toISOString()
    } else {
      updatePayload.plan_end_date = null
    }

    // ── Update shop subscription ──
    const { error: updateError } = await supabase
      .from('shops')
      .update(updatePayload)
      .eq('id', shopId)

    if (updateError) {
      console.error('[SUPER-ADMIN SUBSCRIPTION] Update error:', updateError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update subscription' })
    }

    // ── Append billing history row ──
    // Without this, a super-admin change leaves the shop's newest
    // upgrade_sessions row pointing at a DIFFERENT plan than the shop is on,
    // which makes the billing page's stale-activation banner misfire — and
    // "Retry Activation" would re-apply the old PAID plan without payment.
    try {
      await supabase.from('upgrade_sessions').insert({
        shop_id: shopId,
        paymongo_session_id: null, // admin grant — no checkout session
        status: 'applied',
        amount: 0,
        from_plan: oldPlan || 'basic',
        to_plan: newPlan,
        billing_interval: (updatePayload.plan_end_date && newPlan !== 'basic')
          ? (shop.billing_interval === 'yearly' ? 'yearly' : 'monthly')
          : 'monthly',
      })
    } catch (historyError) {
      console.warn('[SUPER-ADMIN SUBSCRIPTION] history row skipped:', historyError)
    }

    // ── Log to activity_logs ──
    const action = newPlan !== 'basic' ? 'shop.upgraded' : 'shop.downgraded'
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
