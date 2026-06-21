/**
 * GET /api/admin/settings/email
 *
 * Returns email settings for the authenticated admin's shop.
 * Note: Resend API key, sender email, and sender name are now managed
 * at the platform level (super admin). Shop admins only control toggles.
 *
 * Accessible by: admin only
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

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

  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Fetch shop email settings (toggles only — Resend config is platform-level)
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('plan, email_confirmation, email_reminder, reminder_hours, name, email')
    .eq('id', authUser.shop_id)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  return {
    plan: shop.plan,
    email_confirmation: shop.email_confirmation,
    email_reminder: shop.email_reminder,
    reminder_hours: shop.reminder_hours || [24, 2],
    shop_owner_email: shop.email,
    shop_name: shop.name,
  }
})