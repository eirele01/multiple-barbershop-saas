/**
 * GET /api/admin/settings/email
 *
 * Returns email settings for the authenticated admin's shop.
 * resend_api_key is masked before being sent to the frontend.
 *
 * Accessible by: admin only
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

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

  // Admin only for email settings
  if (userProfile.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Fetch shop email settings
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select(`
      plan,
      resend_api_key,
      sender_email,
      sender_name,
      email_confirmation,
      email_reminder,
      reminder_hours,
      name,
      email
    `)
    .eq('id', userProfile.shop_id)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  // Mask the API key before sending to frontend
  const maskedApiKey = shop.resend_api_key
    ? 're_***...***'
    : null

  return {
    plan: shop.plan,
    resend_api_key: maskedApiKey,
    sender_email: shop.sender_email,
    sender_name: shop.sender_name,
    email_confirmation: shop.email_confirmation,
    email_reminder: shop.email_reminder,
    reminder_hours: shop.reminder_hours || [24, 2],
    shop_owner_email: shop.email,
    shop_name: shop.name,
  }
})
