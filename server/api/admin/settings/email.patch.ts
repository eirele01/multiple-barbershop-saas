/**
 * PATCH /api/admin/settings/email
 *
 * Updates email notification toggles for the authenticated admin's shop.
 * Note: Resend API key, sender email, and sender name are now managed
 * at the platform level (super admin). Shop admins only control toggles.
 *
 * Body fields:
 *   email_confirmation, email_reminder, reminder_hours
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const emailSettingsSchema = z.object({
  email_confirmation: z.boolean().optional(),
  email_reminder: z.boolean().optional(),
  reminder_hours: z.array(z.number().positive()).min(1).optional(),
})

export default defineEventHandler(async (event) => {
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
  const authUser = await verifyAuth(token || '')

  if (authUser.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin role required' })
  }

  if (!authUser.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  const config = useRuntimeConfig()
  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Build update object (toggles only)
  const updateData: Record<string, unknown> = {}

  if (parsed.data.email_confirmation !== undefined) {
    updateData.email_confirmation = parsed.data.email_confirmation
  }
  if (parsed.data.email_reminder !== undefined) {
    updateData.email_reminder = parsed.data.email_reminder
  }
  if (parsed.data.reminder_hours !== undefined) {
    updateData.reminder_hours = parsed.data.reminder_hours
  }

  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  // Update the shop
  const { error: updateError } = await supabaseAdmin
    .from('shops')
    .update(updateData)
    .eq('id', authUser.shop_id)

  if (updateError) {
    console.error('Error updating email settings:', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save email settings: ' + updateError.message })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: authUser.shop_id,
    user_id: authUser.id,
    user_email: authUser.email,
    user_role: authUser.role,
    action: 'settings.email_updated',
    entity_type: 'shop',
    entity_id: authUser.shop_id,
    entity_name: 'Email Settings',
    new_value: updateData,
  })

  return {
    success: true,
    message: 'Email settings saved successfully',
  }
})