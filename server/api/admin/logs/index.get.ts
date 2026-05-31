/**
 * GET /api/admin/logs
 *
 * Get activity logs for the shop.
 *
 * Query params:
 *   dateFrom  — filter from date (YYYY-MM-DD, optional)
 *   dateTo    — filter to date (YYYY-MM-DD, optional)
 *   userId    — filter by user ID (optional)
 *   action    — filter by action type prefix (optional)
 *   page      — page number (default 1)
 *   limit     — items per page (default 20, max 100)
 *
 * Retention enforcement:
 *   Basic plan: max 7 days lookback
 *   Upgraded plan: max 90 days lookback
 *
 * Accessible by: admin, manager only
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)

  // Authenticate
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }

  const token = authHeader.substring(7)
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }

  const { data: userData } = await supabase
    .from('users')
    .select('shop_id, role')
    .eq('id', user.id)
    .single()

  if (!userData?.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop assigned' })
  }

  if (!['admin', 'manager'].includes(userData.role || '')) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin or manager role required' })
  }

  const shopId = userData.shop_id

  // ── Check shop plan for retention ──
  const { data: shopData } = await supabase
    .from('shops')
    .select('plan')
    .eq('id', shopId)
    .single()

  const isUpgraded = shopData?.plan === 'upgraded'
  const maxLookbackDays = isUpgraded ? 90 : 7

  // ── Parse query params ──
  const page = Math.max(1, parseInt(query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20))
  const offset = (page - 1) * limit
  const userIdFilter = query.userId as string | undefined
  const actionFilter = query.action as string | undefined

  // ── Enforce retention on date range ──
  const retentionCutoff = new Date()
  retentionCutoff.setDate(retentionCutoff.getDate() - maxLookbackDays)
  const cutoffStr = retentionCutoff.toISOString().slice(0, 10)

  let dateFrom = (query.dateFrom as string) || cutoffStr
  let dateTo = (query.dateTo as string) || new Date().toISOString().slice(0, 10)

  // Enforce: don't allow lookback beyond retention
  if (dateFrom < cutoffStr) {
    dateFrom = cutoffStr
  }

  // ── Build query ──
  let dbQuery = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .eq('shop_id', shopId)
    .gte('created_at', dateFrom + 'T00:00:00')
    .lte('created_at', dateTo + 'T23:59:59')

  if (userIdFilter) {
    dbQuery = dbQuery.eq('user_id', userIdFilter)
  }
  if (actionFilter) {
    dbQuery = dbQuery.like('action', `${actionFilter}%`)
  }

  // Get total count
  const { count: totalCount } = await dbQuery

  // Fetch paginated results
  const { data: logs, error: fetchError } = await dbQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch activity logs' })
  }

  return {
    logs: logs || [],
    retention: {
      maxLookbackDays,
      plan: shopData?.plan || 'basic',
      cutoffDate: cutoffStr,
      enforcedDateFrom: dateFrom,
    },
    pagination: {
      page,
      limit,
      total: totalCount || 0,
      totalPages: Math.ceil((totalCount || 0) / limit),
    },
  }
})
