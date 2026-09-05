/**
 * GET /api/super-admin/plans
 *
 * List all subscription plans (for the Plan/Tier Maker).
 * Returns normalized plans sorted by sort_order.
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { fetchPlans, toWireLimits } from '~/utils/server/plans'

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

  const { activeOnly } = getQuery(event)
  const plans = await fetchPlans(supabase, { activeOnly: activeOnly === '1' || activeOnly === 'true' })

  // Wire format: -1 = unlimited (Infinity must never be JSON-serialized —
  // it becomes null and the Tier Maker form would show blank/invalid values).
  return { plans: plans.map(p => ({ ...p, limits: toWireLimits(p.limits) })) }
})