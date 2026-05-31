/**
 * POST /api/admin/loyalty/members/[id]/adjust
 *
 * Admin manual adjustment of a customer's loyalty points.
 * Admin-only access. Creates an 'adjusted' ledger entry.
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { adjustPoints } from '~/utils/server/loyaltyEngine'

const adjustSchema = z.object({
  points: z.number().int().min(-10000).max(10000),
  note: z.string().min(3).max(300),
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

  const { data: userData } = await supabase
    .from('users')
    .select('shop_id, role')
    .eq('id', user.id)
    .single()

  if (!userData?.shop_id || userData.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const customerId = getRouterParam(event, 'id')
  if (!customerId) {
    throw createError({ statusCode: 400, statusMessage: 'Customer ID is required' })
  }

  // Verify this customer has points at this shop
  const { data: existingPoints } = await supabase
    .from('loyalty_points')
    .select('id')
    .eq('shop_id', userData.shop_id)
    .eq('customer_id', customerId)
    .limit(1)

  if (!existingPoints || existingPoints.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Customer is not a loyalty member at this shop' })
  }

  // Validate body
  const body = await readBody(event)
  const parsed = adjustSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { points, note } = parsed.data

  if (points === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Points adjustment cannot be zero' })
  }

  // Execute adjustment
  const result = await adjustPoints(userData.shop_id, customerId, points, `Admin adjustment by ${user.email}: ${note}`)

  if (!result.success) {
    throw createError({ statusCode: 500, statusMessage: result.error || 'Failed to adjust points' })
  }

  // Log to activity_logs
  await supabase.from('activity_logs').insert({
    shop_id: userData.shop_id,
    user_id: user.id,
    user_email: user.email,
    user_role: 'admin',
    action: 'loyalty.points_adjusted',
    entity_type: 'customer',
    entity_id: customerId,
    new_value: { points, note, balanceAfter: result.balanceAfter },
  })

  return {
    success: true,
    points: result.points,
    balanceAfter: result.balanceAfter,
  }
})
