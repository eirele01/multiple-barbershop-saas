/**
 * POST /api/admin/services
 *
 * Create a new service for the authenticated user's shop.
 * Enforces tier limits (Basic = 10 services max).
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const createServiceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.enum(['haircut', 'beard', 'shave', 'treatment', 'package', 'other'], {
    required_error: 'Category is required',
  }),
  description: z.string().max(500).nullable().optional(),
  duration_mins: z.number().int().min(5, 'Duration must be at least 5 minutes').max(480, 'Duration cannot exceed 8 hours'),
  price: z.number().min(0, 'Price must be non-negative'),
  deposit_amount: z.number().min(0).nullable().optional(),
  barber_ids: z.array(z.string().uuid()).default([]),
  is_active: z.boolean().default(true),
  image_url: z.string().url().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  // Validate request body
  const parsed = createServiceSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  // Authenticate and authorize
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
  const { data: userProfile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (profileError || !userProfile) {
    throw createError({ statusCode: 403, statusMessage: 'User profile not found' })
  }

  if (!['admin', 'manager'].includes(userProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin or manager role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // ─── Tier limit enforcement ─────────────────────
  const { count: currentCount, error: countError } = await supabaseAdmin
    .from('services')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', userProfile.shop_id)

  if (countError) {
    console.error('Error counting services:', countError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to check service count' })
  }

  // Get shop plan for tier check
  const { data: shopData } = await supabaseAdmin
    .from('shops')
    .select('plan')
    .eq('id', userProfile.shop_id)
    .single()

  const plan = shopData?.plan || 'basic'
  const SERVICE_LIMIT = plan === 'upgraded' ? Infinity : 10

  if ((currentCount || 0) >= SERVICE_LIMIT) {
    throw createError({
      statusCode: 403,
      statusMessage: `You've reached the maximum of ${SERVICE_LIMIT} services on the ${plan === 'upgraded' ? 'Upgraded' : 'Basic'} plan. Upgrade for unlimited services.`,
      data: { currentCount, limit: SERVICE_LIMIT, plan },
    })
  }

  // ─── Validate barber_ids belong to this shop ────
  if (parsed.data.barber_ids.length > 0) {
    const { data: validBarbers, error: barberError } = await supabaseAdmin
      .from('barbers')
      .select('id')
      .eq('shop_id', userProfile.shop_id)
      .in('id', parsed.data.barber_ids)

    if (barberError) {
      console.error('Error validating barbers:', barberError)
    }

    const validIds = new Set((validBarbers || []).map((b: any) => b.id))
    const invalidIds = parsed.data.barber_ids.filter(id => !validIds.has(id))
    if (invalidIds.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more barber IDs are invalid or do not belong to your shop',
      })
    }
  }

  // Get current max sort_order for this shop
  const { data: maxSortResult } = await supabaseAdmin
    .from('services')
    .select('sort_order')
    .eq('shop_id', userProfile.shop_id)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSortOrder = (maxSortResult && maxSortResult.length > 0) ? maxSortResult[0].sort_order + 1 : 0

  // Insert the service
  const { data: newService, error: insertError } = await supabaseAdmin
    .from('services')
    .insert({
      shop_id: userProfile.shop_id,
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description || null,
      duration_mins: parsed.data.duration_mins,
      price: parsed.data.price,
      deposit_amount: parsed.data.deposit_amount || null,
      barber_ids: parsed.data.barber_ids,
      is_active: parsed.data.is_active ?? true,
      image_url: parsed.data.image_url || null,
      sort_order: nextSortOrder,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error creating service:', insertError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create service: ' + insertError.message })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'service.created',
    entity_type: 'service',
    entity_id: newService.id,
    entity_name: parsed.data.name,
    new_value: newService,
  })

  return { data: newService }
})
