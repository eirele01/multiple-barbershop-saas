/**
 * POST /api/super-admin/plans
 *
 * Create a new subscription plan (tier).
 * Body:
 *   {
 *     code, name, description?,
 *     price_monthly, price_yearly,
 *     limits: { services, gallery, products, staff },  // -1 = unlimited
 *     features: string[],
 *     is_active?, is_default?, sort_order?
 *   }
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { z } from 'zod'

const limitSchema = z.object({
  services: z.number().int().min(-1),
  gallery: z.number().int().min(-1),
  products: z.number().int().min(-1),
  staff: z.number().int().min(-1),
}).default({ services: 0, gallery: 0, products: 0, staff: 0 })

const createPlanSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[a-z0-9_]+$/, 'code must be lowercase, letters/numbers/underscore'),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().default(''),
  price_monthly: z.number().int().min(0).default(0),
  price_yearly: z.number().int().min(0).default(0),
  limits: limitSchema,
  features: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  sort_order: z.number().int().default(0),
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

  // ── Validate body ──
  const body = await readBody(event)
  const parsed = createPlanSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { code, name, description, price_monthly, price_yearly, limits, features, is_active, is_default, sort_order } = parsed.data

  // ── Check duplicate code ──
  const { data: existing } = await supabase
    .from('plans')
    .select('id')
    .eq('code', code)
    .maybeSingle()

  if (existing) {
    throw createError({ statusCode: 409, statusMessage: `A plan with code '${code}' already exists` })
  }

  // ── If default, clear other defaults first ──
  if (is_default) {
    await supabase.from('plans').update({ is_default: false }).neq('is_default', true)
  }

  const { data, error } = await supabase
    .from('plans')
    .insert({
      code,
      name,
      description: description || null,
      price_monthly,
      price_yearly,
      limits,
      features,
      is_active,
      is_default,
      sort_order,
    })
    .select()
    .single()

  if (error) {
    console.error('[SUPER-ADMIN PLANS] Create error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create plan' })
  }

  // ── Log to activity_logs ──
  await supabase.from('activity_logs').insert({
    shop_id: null,
    user_id: user.id,
    user_email: user.email,
    user_role: 'super_admin',
    action: 'plan.created',
    entity_type: 'plan',
    entity_id: data.id,
    entity_name: name,
    new_value: { code, limits, price_monthly },
  })

  return { success: true, plan: data }
})