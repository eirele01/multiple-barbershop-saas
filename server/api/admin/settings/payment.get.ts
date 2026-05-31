/**
 * GET /api/admin/settings/payment
 *
 * Returns current payment settings for the authenticated admin's shop.
 * Secret keys are masked before being sent to the frontend.
 *
 * Accessible by: admin only
 */
import { createClient } from '@supabase/supabase-js'
import { encrypt } from '~/utils/server/encryption'

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

  // Admin only for payment settings
  if (userProfile.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Fetch shop payment settings
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select(`
      plan,
      paymongo_enabled,
      manual_payment_enabled,
      paymongo_public_key,
      paymongo_secret_key,
      gcash_enabled,
      maya_enabled,
      instapay_enabled,
      qr_ph_enabled,
      paymongo_test_mode,
      paymongo_webhook_secret,
      paymongo_webhook_url,
      slug
    `)
    .eq('id', userProfile.shop_id)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  // Mask secret values before sending to frontend
  const maskedSecretKey = shop.paymongo_secret_key
    ? 'sk_***...***'
    : null

  const maskedWebhookSecret = shop.paymongo_webhook_secret
    ? 'whsec_***'
    : null

  // Check if encryption key is properly configured
  let encryptionConfigured = true
  try {
    // Try a test encrypt to verify NUXT_ENCRYPTION_KEY is set
    encrypt('test')
  } catch {
    encryptionConfigured = false
  }

  // Build webhook URL if not already stored
  const host = process.env.NUXT_PUBLIC_SITE_URL || getRequestURL(event).origin
  const webhookUrl = shop.paymongo_webhook_url || `${host}/api/webhooks/paymongo/${shop.slug}`

  return {
    plan: shop.plan,
    paymongo_enabled: shop.paymongo_enabled,
    manual_payment_enabled: shop.manual_payment_enabled,
    paymongo_public_key: shop.paymongo_public_key,
    paymongo_secret_key: maskedSecretKey,
    gcash_enabled: shop.gcash_enabled,
    maya_enabled: shop.maya_enabled,
    instapay_enabled: shop.instapay_enabled,
    qr_ph_enabled: shop.qr_ph_enabled,
    paymongo_test_mode: shop.paymongo_test_mode,
    paymongo_webhook_secret: maskedWebhookSecret,
    paymongo_webhook_url: webhookUrl,
    slug: shop.slug,
    encryption_configured: encryptionConfigured,
  }
})
