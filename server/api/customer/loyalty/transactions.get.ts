/**
 * GET /api/customer/loyalty/transactions
 *
 * Returns the current customer's loyalty point transactions.
 * Query params: shopId (required), page, limit
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

  const query = getQuery(event)
  const shopId = query.shopId as string
  const page = parseInt(query.page as string) || 1
  const limit = Math.min(parseInt(query.limit as string) || 20, 100)
  const offset = (page - 1) * limit

  if (!shopId) {
    throw createError({ statusCode: 400, statusMessage: 'shopId query parameter is required' })
  }

  // Get transactions
  const { data: transactions, error, count } = await supabase
    .from('loyalty_points')
    .select('id, type, points, balance_after, note, expires_at, created_at, booking_id, reward_id', { count: 'exact' })
    .eq('shop_id', shopId)
    .eq('customer_id', user.id)
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
