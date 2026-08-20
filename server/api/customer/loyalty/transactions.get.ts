/**
 * GET /api/customer/loyalty/transactions
 *
 * Returns the current customer's loyalty point transactions.
 * Query params: shopId (required), page, limit
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : ''
  const authUser = await verifyAuth(token)

  // Customer-only access
  if (authUser.role !== 'customer') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Customer access required' })
  }

  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  const query = getQuery(event)
  const shopId = query.shopId as string
  const page = Math.max(1, parseInt(query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20))
  const offset = (page - 1) * limit

  if (!shopId) {
    throw createError({ statusCode: 400, statusMessage: 'shopId query parameter is required' })
  }

  // Get transactions
  const { data: transactions, error, count } = await supabase
    .from('loyalty_points')
    .select('id, type, points, balance_after, note, expires_at, created_at, booking_id, reward_id', { count: 'exact' })
    .eq('shop_id', shopId)
    .eq('customer_id', authUser.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch transactions' })
  }

  return {
    transactions: transactions || [],
    total: count || 0,
    page,
    limit,
  }
})
