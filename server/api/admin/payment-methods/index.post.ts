/**
 * POST /api/admin/payment-methods
 *
 * Create a new payment method for the authenticated user's shop.
 *
 * Accessible by: admin, manager
 *
 * Validates:
 * - Required fields based on type (qr_code, bank_account, e_wallet)
 * - Shop ownership
 * - Role-based access
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const createPaymentMethodSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['qr_code', 'bank_account', 'e_wallet'], { required_error: 'Type is required' }),
  qr_code_url: z.string().url().nullable().optional(),
  account_name: z.string().max(200).nullable().optional(),
  account_number: z.string().max(100).nullable().optional(),
  bank_name: z.string().max(200).nullable().optional(),
  instructions: z.string().max(200, 'Instructions must be 200 characters or less').nullable().optional(),
  is_active: z.boolean().default(true),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  // Validate request body
  const parsed = createPaymentMethodSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { name, type, qr_code_url, account_name, account_number, bank_name, instructions, is_active } = parsed.data

  // Validate type-specific required fields
  if (type === 'qr_code' || type === 'e_wallet') {
    if (!account_name || account_name.trim() === '') {
      throw createError({ statusCode: 400, statusMessage: 'Account name is required for QR code and e-wallet types' })
    }
    if (!account_number || account_number.trim() === '') {
      throw createError({ statusCode: 400, statusMessage: 'Account number is required for QR code and e-wallet types' })
    }
  }

  if (type === 'bank_account') {
    if (!bank_name || bank_name.trim() === '') {
      throw createError({ statusCode: 400, statusMessage: 'Bank name is required for bank account type' })
    }
    if (!account_name || account_name.trim() === '') {
      throw createError({ statusCode: 400, statusMessage: 'Account name is required for bank account type' })
    }
    if (!account_number || account_number.trim() === '') {
      throw createError({ statusCode: 400, statusMessage: 'Account number is required for bank account type' })
    }
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

  // Get current max sort_order for this shop
  const { data: maxSortResult } = await supabaseAdmin
    .from('payment_methods')
    .select('sort_order')
    .eq('shop_id', userProfile.shop_id)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSortOrder = (maxSortResult && maxSortResult.length > 0) ? maxSortResult[0].sort_order + 1 : 0

  // Insert the payment method
  const { data: newMethod, error: insertError } = await supabaseAdmin
    .from('payment_methods')
    .insert({
      shop_id: userProfile.shop_id,
      name,
      type,
      qr_code_url: type === 'qr_code' ? (qr_code_url || null) : null,
      account_name: account_name || null,
      account_number: account_number || null,
      bank_name: type === 'bank_account' ? (bank_name || null) : null,
      instructions: instructions || null,
      is_active: is_active ?? true,
      sort_order: nextSortOrder,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error creating payment method:', insertError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create payment method: ' + insertError.message })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'payment_method.created',
    entity_type: 'payment_method',
    entity_id: newMethod.id,
    entity_name: name,
    new_value: newMethod,
  })

  return { data: newMethod }
})
