/**
 * DELETE /api/super-admin/plans/[id]
 *
 * Delete a subscription plan (tier).
 * Guard: cannot delete a plan that is in use by any shop or is the default.
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

  const planId = getRouterParam(event, 'id')
  if (!planId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan ID is required' })
  }

  // ── Fetch current plan ──
  const { data: current, error: fetchError } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single()

  if (fetchError || !current) {
    throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
  }

  // ── Guards ──
  if (current.is_default) {
    throw createError({ statusCode: 400, statusMessage: `Cannot delete '${current.name}' — it is the default plan` })
  }

  const { count: shopCount } = await supabase
    .from('shops')
    .select('id', { count: 'exact', head: true })
    .eq('plan', current.code)

  if (shopCount && shopCount > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot delete '${current.name}' — ${shopCount} shop(s) are on this plan. Reassign them first.`,
    })
  }

  const { error } = await supabase
    .from('plans')
    .delete()
    .eq('id', planId)

  if (error) {
    console.error('[SUPER-ADMIN PLANS] Delete error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete plan' })
  }

  // ── Log to activity_logs ──
  await supabase.from('activity_logs').insert({
    shop_id: null,
    user_id: user.id,
    user_email: user.email,
    user_role: 'super_admin',
    action: 'plan.deleted',
    entity_type: 'plan',
    entity_id: planId,
    entity_name: current.name,
    old_value: { code: current.code, limits: current.limits, price_monthly: current.price_monthly },
    new_value: null,
  })

  return { success: true }
})