/**
 * PATCH /api/admin/settings/email
 *
 * Updates email settings for the authenticated admin's shop.
 * - Encrypts resend_api_key before saving
 * - Admin-only access
 *
 * Body fields:
 *   resend_api_key, sender_email, sender_name,
 *   email_confirmation, email_reminder, reminder_hours
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { encrypt } from '~/utils/server/encryption'

const MASKED_API_KEY = 're_***...***'

const emailSettingsSchema = z.object({
  resend_api_key: z.string().nullable().optional(),
  sender_email: z.string().nullable().optional(),
  sender_name: z.string().nullable().optional(),
  email_confirmation: z.boolean().optional(),
  email_reminder: z.boolean().optional(),
  reminder_hours: z.array(z.number().positive()).min(1).optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const parsed = emailSettingsSchema.safeParse(body)
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
  const { data: userProfile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (profileError || !userProfile) {
    throw createError({ statusCode: 403, statusMessage: 'User profile not found' })
  }

  // Admin only
  if (userProfile.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Build update object
  const updateData: Record<string, unknown> = {}

  // Simple fields
  if (parsed.data.sender_email !== undefined) {
    updateData.sender_email = parsed.data.sender_email || null
  }
  if (parsed.data.sender_name !== undefined) {
    updateData.sender_name = parsed.data.sender_name || null
  }
  if (parsed.data.email_confirmation !== undefined) {
    updateData.email_confirmation = parsed.data.email_confirmation
  }
  if (parsed.data.email_reminder !== undefined) {
    updateData.email_reminder = parsed.data.email_reminder
  }
  if (parsed.data.reminder_hours !== undefined) {
    updateData.reminder_hours = parsed.data.reminder_hours
  }

  // API key — encrypt before saving, but only if it's a NEW value (not the masked placeholder)
  if (parsed.data.resend_api_key !== undefined) {
    const newKey = parsed.data.resend_api_key
    if (newKey && newKey !== MASKED_API_KEY && newKey.trim() !== '') {
      updateData.resend_api_key = encrypt(newKey.trim())
    }
    // If the masked value is sent back, we don't update — keep the existing encrypted value
  }

  // Update the shop
  const { error: updateError } = await supabaseAdmin
    .from('shops')
    .update(updateData)
    .eq('id', userProfile.shop_id)

  if (updateError) {
    console.error('Error updating email settings:', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save email settings: ' + updateError.message })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'settings.email_updated',
    entity_type: 'shop',
    entity_id: userProfile.shop_id,
    entity_name: 'Email Settings',
    new_value: {
      ...Object.fromEntries(Object.entries(updateData).map(([k, v]) => {
        // Don't log encrypted values
        if (k === 'resend_api_key') return [k, '[ENCRYPTED]']
        return [k, v]
      })),
    },
  })

  return {
    success: true,
    message: 'Email settings saved successfully',
  }
})
