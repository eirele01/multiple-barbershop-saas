/**
 * PATCH /api/admin/payment-methods/reorder
 *
 * Batch update sort_order for multiple payment methods.
 * Expects: { items: [{ id: string, sort_order: number }, ...] }
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    sort_order: z.number().int().min(0),
  })).min(1),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const parsed = reorderSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  // Authenticate
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }

  const supabase = createClient(config.public.supabaseUrl as string, config.public.supabaseKey as string, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }

  const supabaseAdmin = createClient(config.public.supabaseUrl as string, config.supabaseServiceKey as string)
  const { data: userProfile } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['admin', 'manager'].includes(userProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Verify all payment methods belong to this shop
  const methodIds = parsed.data.items.map((item) => item.id)
  const { data: methods, error: fetchError } = await supabaseAdmin
    .from('payment_methods')
    .select('id')
    .eq('shop_id', userProfile.shop_id)
    .in('id', methodIds)

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to verify payment methods' })
  }

  const validIds = new Set((methods || []).map((m) => m.id))
  const invalidIds = methodIds.filter((id) => !validIds.has(id))
  if (invalidIds.length > 0) {
    throw createError({
      statusCode: 403,
      statusMessage: 'One or more payment methods do not belong to your shop',
      data: { invalidIds },
    })
  }

  // Batch update sort_order for each item
  const updatePromises = parsed.data.items.map((item) =>
    supabaseAdmin
      .from('payment_methods')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)
  )

  const results = await Promise.all(updatePromises)
  const errors = results.filter((r) => r.error)
  if (errors.length > 0) {
    console.error('Errors during reorder:', errors)
    throw createError({ statusCode: 500, statusMessage: 'Some updates failed during reorder' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'payment_method.reordered',
    entity_type: 'payment_method',
    entity_name: 'bulk reorder',
    new_value: { items: parsed.data.items },
  })

  return { success: true, updated: parsed.data.items.length }
})
