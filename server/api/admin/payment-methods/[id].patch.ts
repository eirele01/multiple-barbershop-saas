/**
 * PATCH /api/admin/payment-methods/[id]
 *
 * Update a payment method.
 *
 * Accessible by: admin, manager
 * Validates: shop ownership, role
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const updatePaymentMethodSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['qr_code', 'bank_account', 'e_wallet']).optional(),
  qr_code_url: z.string().url().nullable().optional(),
  account_name: z.string().max(200).nullable().optional(),
  account_number: z.string().max(100).nullable().optional(),
  bank_name: z.string().max(200).nullable().optional(),
  instructions: z.string().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const methodId = getRouterParam(event, 'id')
  if (!methodId) {
    throw createError({ statusCode: 400, statusMessage: 'Payment method ID is required' })
  }

  const body = await readBody(event)
  const parsed = updatePaymentMethodSchema.safeParse(body)
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

  // Verify the payment method belongs to this shop
  const { data: existingMethod, error: fetchError } = await supabaseAdmin
    .from('payment_methods')
    .select('*')
    .eq('id', methodId)
    .eq('shop_id', userProfile.shop_id)
    .single()

  if (fetchError || !existingMethod) {
    throw createError({ statusCode: 404, statusMessage: 'Payment method not found or does not belong to your shop' })
  }

  // Build update object — only include fields that are provided
  const updateFields: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updateFields.name = parsed.data.name
  if (parsed.data.type !== undefined) updateFields.type = parsed.data.type
  if (parsed.data.qr_code_url !== undefined) updateFields.qr_code_url = parsed.data.qr_code_url
  if (parsed.data.account_name !== undefined) updateFields.account_name = parsed.data.account_name
  if (parsed.data.account_number !== undefined) updateFields.account_number = parsed.data.account_number
  if (parsed.data.bank_name !== undefined) updateFields.bank_name = parsed.data.bank_name
  if (parsed.data.instructions !== undefined) updateFields.instructions = parsed.data.instructions
  if (parsed.data.is_active !== undefined) updateFields.is_active = parsed.data.is_active

  if (Object.keys(updateFields).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  // If type changed, clean up irrelevant fields
  const effectiveType = parsed.data.type || existingMethod.type
  if (effectiveType === 'bank_account') {
    updateFields.qr_code_url = null
  } else {
    updateFields.bank_name = (parsed.data.type === 'bank_account') ? (parsed.data.bank_name || existingMethod.bank_name) : null
  }

  // Update the payment method
  const { data: updatedMethod, error: updateError } = await supabaseAdmin
    .from('payment_methods')
    .update(updateFields)
    .eq('id', methodId)
    .select()
    .single()

  if (updateError) {
    console.error('Error updating payment method:', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update payment method' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'payment_method.updated',
    entity_type: 'payment_method',
    entity_id: methodId,
    entity_name: updatedMethod.name,
    old_value: existingMethod,
    new_value: updatedMethod,
  })

  return { data: updatedMethod }
})
