/**
 * PATCH /api/admin/settings/payment
 *
 * Updates payment settings for the authenticated admin's shop.
 * - Encrypts secret keys before saving
 * - Enforces at-least-one-method rule for Upgraded plan
 * - Admin-only access
 *
 * Body fields:
 *   paymongo_enabled, manual_payment_enabled,
 *   paymongo_public_key, paymongo_secret_key,
 *   gcash_enabled, maya_enabled, instapay_enabled, qr_ph_enabled,
 *   paymongo_test_mode, paymongo_webhook_secret
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { encrypt } from '~/utils/server/encryption'

const MASKED_SECRET_KEY = 'sk_***...***'
const MASKED_WEBHOOK_SECRET = 'whsec_***'

const paymentSettingsSchema = z.object({
  paymongo_enabled: z.boolean().optional(),
  manual_payment_enabled: z.boolean().optional(),
  paymongo_public_key: z.string().nullable().optional(),
  paymongo_secret_key: z.string().nullable().optional(),
  gcash_enabled: z.boolean().optional(),
  maya_enabled: z.boolean().optional(),
  instapay_enabled: z.boolean().optional(),
  qr_ph_enabled: z.boolean().optional(),
  paymongo_test_mode: z.boolean().optional(),
  paymongo_webhook_secret: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const parsed = paymentSettingsSchema.safeParse(body)
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

  // Fetch current shop state for enforcement rules
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('plan, paymongo_enabled, manual_payment_enabled, slug, paymongo_secret_key, paymongo_webhook_secret')
    .eq('id', userProfile.shop_id)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  // Merge incoming values with current state for rule checking
  const effectivePaymongoEnabled = parsed.data.paymongo_enabled ?? shop.paymongo_enabled
  const effectiveManualEnabled = parsed.data.manual_payment_enabled ?? shop.manual_payment_enabled

  // ENFORCEMENT: At least one payment method must be enabled for Upgraded plan
  if (shop.plan === 'upgraded' && !effectivePaymongoEnabled && !effectiveManualEnabled) {
    throw createError({
      statusCode: 422,
      statusMessage: 'At least one payment method must be enabled.',
    })
  }

  // If PayMongo is enabled, at least one method checkbox must be checked
  if (effectivePaymongoEnabled) {
    const effectiveGcash = parsed.data.gcash_enabled ?? (await supabaseAdmin
      .from('shops')
      .select('gcash_enabled')
      .eq('id', userProfile.shop_id)
      .single()).data?.gcash_enabled ?? true
    const effectiveMaya = parsed.data.maya_enabled ?? (await supabaseAdmin
      .from('shops')
      .select('maya_enabled')
      .eq('id', userProfile.shop_id)
      .single()).data?.maya_enabled ?? true
    const effectiveInstapay = parsed.data.instapay_enabled ?? (await supabaseAdmin
      .from('shops')
      .select('instapay_enabled')
      .eq('id', userProfile.shop_id)
      .single()).data?.instapay_enabled ?? true
    const effectiveQrPh = parsed.data.qr_ph_enabled ?? (await supabaseAdmin
      .from('shops')
      .select('qr_ph_enabled')
      .eq('id', userProfile.shop_id)
      .single()).data?.qr_ph_enabled ?? true

    if (!effectiveGcash && !effectiveMaya && !effectiveInstapay && !effectiveQrPh) {
      throw createError({
        statusCode: 422,
        statusMessage: 'At least one PayMongo payment method must be enabled when PayMongo is active.',
      })
    }
  }

  // Build update object
  const updateData: Record<string, unknown> = {}

  // Simple boolean fields
  if (parsed.data.paymongo_enabled !== undefined) updateData.paymongo_enabled = parsed.data.paymongo_enabled
  if (parsed.data.manual_payment_enabled !== undefined) updateData.manual_payment_enabled = parsed.data.manual_payment_enabled
  if (parsed.data.gcash_enabled !== undefined) updateData.gcash_enabled = parsed.data.gcash_enabled
  if (parsed.data.maya_enabled !== undefined) updateData.maya_enabled = parsed.data.maya_enabled
  if (parsed.data.instapay_enabled !== undefined) updateData.instapay_enabled = parsed.data.instapay_enabled
  if (parsed.data.qr_ph_enabled !== undefined) updateData.qr_ph_enabled = parsed.data.qr_ph_enabled
  if (parsed.data.paymongo_test_mode !== undefined) updateData.paymongo_test_mode = parsed.data.paymongo_test_mode

  // Public key (not encrypted — used on frontend for PayMongo.js if needed)
  if (parsed.data.paymongo_public_key !== undefined) {
    updateData.paymongo_public_key = parsed.data.paymongo_public_key || null
  }

  // Secret key — encrypt before saving, but only if it's a NEW value (not the masked placeholder)
  if (parsed.data.paymongo_secret_key !== undefined) {
    const newKey = parsed.data.paymongo_secret_key
    if (newKey && newKey !== MASKED_SECRET_KEY && newKey.trim() !== '') {
      try {
        updateData.paymongo_secret_key = encrypt(newKey.trim())
      } catch (e: any) {
        console.error('Encryption error for paymongo_secret_key:', e.message)
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to encrypt secret key — NUXT_ENCRYPTION_KEY may not be configured. Add it to your .env file and restart the server.',
        })
      }
    }
    // If the masked value is sent back, we don't update — keep the existing encrypted value
  }

  // Webhook secret — encrypt before saving, same dirty-flag pattern
  if (parsed.data.paymongo_webhook_secret !== undefined) {
    const newSecret = parsed.data.paymongo_webhook_secret
    if (newSecret && newSecret !== MASKED_WEBHOOK_SECRET && newSecret.trim() !== '') {
      try {
        updateData.paymongo_webhook_secret = encrypt(newSecret.trim())
      } catch (e: any) {
        console.error('Encryption error for paymongo_webhook_secret:', e.message)
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to encrypt webhook secret — NUXT_ENCRYPTION_KEY may not be configured. Add it to your .env file and restart the server.',
        })
      }
    }
  }

  // Build and store webhook URL
  const host = process.env.NUXT_PUBLIC_SITE_URL || getRequestURL(event).origin
  const webhookUrl = `${host}/api/webhooks/paymongo/${shop.slug}`
  updateData.paymongo_webhook_url = webhookUrl

  // Update the shop
  const { error: updateError } = await supabaseAdmin
    .from('shops')
    .update(updateData)
    .eq('id', userProfile.shop_id)

  if (updateError) {
    console.error('Error updating payment settings:', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save payment settings: ' + updateError.message })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'settings.payment_updated',
    entity_type: 'shop',
    entity_id: userProfile.shop_id,
    entity_name: 'Payment Settings',
    new_value: {
      ...Object.fromEntries(Object.entries(updateData).map(([k, v]) => {
        // Don't log encrypted values
        if (k === 'paymongo_secret_key' || k === 'paymongo_webhook_secret') return [k, '[ENCRYPTED]']
        return [k, v]
      })),
    },
  })

  // Return updated settings with secrets masked
  return {
    success: true,
    paymongo_enabled: effectivePaymongoEnabled,
    manual_payment_enabled: effectiveManualEnabled,
    paymongo_public_key: parsed.data.paymongo_public_key ?? (await supabaseAdmin
      .from('shops')
      .select('paymongo_public_key')
      .eq('id', userProfile.shop_id)
      .single()).data?.paymongo_public_key,
    paymongo_secret_key: updateData.paymongo_secret_key ? MASKED_SECRET_KEY : MASKED_SECRET_KEY,
    gcash_enabled: parsed.data.gcash_enabled,
    maya_enabled: parsed.data.maya_enabled,
    instapay_enabled: parsed.data.instapay_enabled,
    qr_ph_enabled: parsed.data.qr_ph_enabled,
    paymongo_test_mode: parsed.data.paymongo_test_mode,
    paymongo_webhook_secret: updateData.paymongo_webhook_secret ? MASKED_WEBHOOK_SECRET : MASKED_WEBHOOK_SECRET,
    paymongo_webhook_url: webhookUrl,
  }
})
