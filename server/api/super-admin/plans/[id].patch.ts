/**
 * PATCH /api/super-admin/plans/[id]
 *
 * Update a subscription plan (tier).
 * Body: partial fields of the plan.
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { z } from 'zod'

const patchPlanSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[a-z0-9_]+$/, 'code must be lowercase, letters/numbers/underscore').optional(),
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  price_monthly: z.number().int().min(0).optional(),
  price_yearly: z.number().int().min(0).optional(),
  limits: z.object({
    services: z.number().int().min(-1),
    gallery: z.number().int().min(-1),
    products: z.number().int().min(-1),
    staff: z.number().int().min(-1),
  }).optional(),
  features: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  sort_order: z.number().int().optional(),
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

  const planId = getRouterParam(event, 'id')
  if (!planId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan ID is required' })
  }

  // ── Validate body ──
  const body = await readBody(event)
  const parsed = patchPlanSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const payload = { ...parsed.data }

  // ── Fetch current plan ──
  const { data: current, error: fetchError } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single()

  if (fetchError || !current) {
    throw createError({ statusCode: 404, statusMessage: 'Plan not found' })
  }

  // ── Guard: basic plan cannot be un-defaulted accidentally without a replacement ──
  if (current.code === 'basic' && payload.is_default === false && current.is_default) {
    // Keep default on basic unless another plan is set default simultaneously
    payload.is_default = true
  }

  // ── Duplicate code check (if changing code) ──
  if (payload.code && payload.code !== current.code) {
    const { data: dup } = await supabase
      .from('plans')
      .select('id')
      .eq('code', payload.code)
      .maybeSingle()
    if (dup) {
      throw createError({ statusCode: 409, statusMessage: `A plan with code '${payload.code}' already exists` })
    }
  }

  // ── If setting default, clear others ──
  if (payload.is_default === true) {
    await supabase.from('plans').update({ is_default: false }).neq('id', planId)
  }

  const { data, error } = await supabase
    .from('plans')
    .update(payload)
    .eq('id', planId)
    .select()
    .single()

  if (error) {
    console.error('[SUPER-ADMIN PLANS] Update error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update plan' })
  }

  // ── Log to activity_logs ──
  await supabase.from('activity_logs').insert({
    shop_id: null,
    user_id: user.id,
    user_email: user.email,
    user_role: 'super_admin',
    action: 'plan.updated',
    entity_type: 'plan',
    entity_id: planId,
    entity_name: current.name,
    old_value: { code: current.code, limits: current.limits, price_monthly: current.price_monthly },
    new_value: { code: payload.code || current.code, limits: payload.limits || current.limits, price_monthly: payload.price_monthly ?? current.price_monthly },
  })

  return { success: true, plan: data }
})