/**
 * GET /api/super-admin/plans
 *
 * List all subscription plans (for the Plan/Tier Maker).
 * Returns normalized plans sorted by sort_order.
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { fetchPlans } from '~/utils/server/plans'

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

  return { plans }
})