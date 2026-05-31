/**
 * GET /api/admin/loyalty/transactions
 *
 * Returns loyalty point transactions for this shop.
 * Admin-only access. Supports filtering by customer_id, type, and pagination.
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

  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const limit = Math.min(parseInt(query.limit as string) || 20, 100)
  const offset = (page - 1) * limit
  const customerId = query.customerId as string | undefined
  const type = query.type as string | undefined

  // Build query
  let queryBuilder = supabase
    .from('loyalty_points')
    .select('id, customer_id, booking_id, reward_id, type, points, balance_after, note, expires_at, created_at', { count: 'exact' })
    .eq('shop_id', userData.shop_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (customerId) {
    queryBuilder = queryBuilder.eq('customer_id', customerId)
  }
  if (type) {
    queryBuilder = queryBuilder.eq('type', type)
  }

  const { data: transactions, error, count } = await queryBuilder

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch transactions' })
  }

  // Enrich with customer names
  const customerIds = [...new Set((transactions || []).map(t => t.customer_id))]
  const { data: customers } = await supabase
    .from('users')
    .select('id, display_name, email')
    .in('id', customerIds)

  const customerMap = new Map((customers || []).map((c: any) => [c.id, c]))

  const enriched = (transactions || []).map(tx => ({
    ...tx,
    customerName: customerMap.get(tx.customer_id)?.display_name || 'Unknown',
    customerEmail: customerMap.get(tx.customer_id)?.email || '',
  }))

  return {
    transactions: enriched,
    total: count || 0,
    page,
    limit,
  }
})
