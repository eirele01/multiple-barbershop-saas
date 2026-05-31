/**
 * PATCH /api/admin/services/[id]
 *
 * Update a service.
 * Admin + Manager only.
 * Validates: shop ownership, role
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const updateServiceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(['haircut', 'beard', 'shave', 'treatment', 'package', 'other']).optional(),
  description: z.string().max(500).nullable().optional(),
  duration_mins: z.number().int().min(5).max(480).optional(),
  price: z.number().min(0).optional(),
  deposit_amount: z.number().min(0).nullable().optional(),
  barber_ids: z.array(z.string().uuid()).optional(),
  is_active: z.boolean().optional(),
  image_url: z.string().url().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const serviceId = getRouterParam(event, 'id')
  if (!serviceId) {
    throw createError({ statusCode: 400, statusMessage: 'Service ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateServiceSchema.safeParse(body)
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
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin or manager role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Verify the service belongs to this shop
  const { data: existingService, error: fetchError } = await supabaseAdmin
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .eq('shop_id', userProfile.shop_id)
    .single()

  if (fetchError || !existingService) {
    throw createError({ statusCode: 404, statusMessage: 'Service not found or does not belong to your shop' })
  }

  // Build update object — only include fields that are provided
  const updateFields: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updateFields.name = parsed.data.name
  if (parsed.data.category !== undefined) updateFields.category = parsed.data.category
  if (parsed.data.description !== undefined) updateFields.description = parsed.data.description
  if (parsed.data.duration_mins !== undefined) updateFields.duration_mins = parsed.data.duration_mins
  if (parsed.data.price !== undefined) updateFields.price = parsed.data.price
  if (parsed.data.deposit_amount !== undefined) updateFields.deposit_amount = parsed.data.deposit_amount
  if (parsed.data.barber_ids !== undefined) updateFields.barber_ids = parsed.data.barber_ids
  if (parsed.data.is_active !== undefined) updateFields.is_active = parsed.data.is_active
  if (parsed.data.image_url !== undefined) updateFields.image_url = parsed.data.image_url

  if (Object.keys(updateFields).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  // ─── Validate barber_ids belong to this shop ────
  if (parsed.data.barber_ids && parsed.data.barber_ids.length > 0) {
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

  // Update the service
  const { data: updatedService, error: updateError } = await supabaseAdmin
    .from('services')
    .update(updateFields)
    .eq('id', serviceId)
    .select()
    .single()

  if (updateError) {
    console.error('Error updating service:', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update service' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'service.updated',
    entity_type: 'service',
    entity_id: serviceId,
    entity_name: updatedService.name,
    old_value: existingService,
    new_value: updatedService,
  })

  return { data: updatedService }
})
