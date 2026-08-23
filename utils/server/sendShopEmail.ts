
  /**
 * sendShopEmail — Real Resend API email sender for shop notifications.
 *
 * Reads Resend credentials from platform_settings (managed by super admin)
 * so that shop owners don't need their own Resend API key or domain.
 *
 * Logic:
 * 1. Fetch platform settings (resend_api_key, sender_email, sender_name)
 * 2. If platform settings exist, use those
 * 3. Fallback: fetch shop record for per-shop config (legacy backward compat)
 * 4. Guard: plan must be 'upgraded', resend_api_key must exist
 * 5. Initialize Resend client with the key
 * 6. Get recipient email from data
 * 7. Render the correct HTML template via templateMap
 * 8. Send via resend.emails.send()
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { templateMap, type ShopBranding } from '~/utils/server/emailTemplates'

// ─── Email Template Types ─────────────────────────────

export type EmailTemplate =
  | 'booking.confirmed'
  | 'booking.reminder'
  | 'payment.verified'
  | 'payment.rejected'
  | 'payment.info_requested'
  | 'booking.cancelled'
  | 'loyalty.earned'
  | 'loyalty.tier_upgraded'
  | 'loyalty.expiring'
  | 'welcome'
  | 'account.created'

interface EmailCustomer {
  email?: string
  name?: string
}

/**
 * Input data for sendShopEmail.
 *
 * Known keys are used by sendShopEmail itself (recipient resolution,
 * branding injection, customer-name normalization). All other keys are
 * template-specific fields consumed by the individual template functions
 * in emailTemplates.ts.
 */
interface EmailData {
  [key: string]: unknown
  /** Recipient info — `customer.email` is required for delivery */
  customer?: EmailCustomer
  /** Optional flat customer name; derived from `customer.name` if omitted */
  customerName?: string
  /** Optional pre-built branding; auto-injected from the shop row otherwise */
  branding?: ShopBranding
}

interface SendEmailResult {
  sent: boolean
  error?: string
}

// ─── Templates that require specific email toggles ─────

const CONFIRMATION_TEMPLATES: EmailTemplate[] = ['booking.confirmed']
const REMINDER_TEMPLATES: EmailTemplate[] = ['booking.reminder']

/**
 * Get platform-level email settings from platform_settings table.
 */
async function getPlatformEmailSettings(supabase: any) {
  const keys = ['platform_resend_api_key', 'platform_sender_email', 'platform_sender_name']
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', keys)

  if (!settings) return null

  const map = new Map(settings.map((s: { key: string; value: string | null }) => [s.key, s.value]))
  const apiKey = map.get('platform_resend_api_key')
  if (!apiKey) return null

  return {
    resendApiKey: apiKey,
    senderEmail: map.get('platform_sender_email') || 'notifications@reservationph.com',
    senderName: map.get('platform_sender_name') || 'BarberShop SaaS',
  }
}

/**
 * Send an email notification on behalf of a shop.
 *
 * @param shopId - The shop's UUID
 * @param template - The email template name (e.g., 'booking.confirmed')
 * @param data - Template-specific data (must include customer.email)
 * @returns Result indicating whether email was sent
 */
export async function sendShopEmail(
  shopId: string,
  template: EmailTemplate,
  data: EmailData
): Promise<SendEmailResult> {
  try {
    const config = useRuntimeConfig()
    const supabase = createClient(
      config.public.supabaseUrl as string,
      config.supabaseServiceKey as string
    )

    // Step 1: Fetch shop record (for plan check + toggles + branding)
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('plan, email_confirmation, email_reminder, name, logo_url, primary_color, address_street, address_city, address_state, address_zip, phone, latitude, longitude, slug')
      .eq('id', shopId)
      .single()

    if (shopError || !shop) {
      console.error('[EMAIL] Shop not found:', shopId, shopError)
      return { sent: false, error: 'shop_not_found' }
    }

            // Step 2: Guard — plan must be upgraded
    // EXCEPTION: 'account.created' is a platform-generated account-security
    // email (auto-created guest accounts), not a shop-purchased notification —
    // every customer needs it to access their booking, regardless of plan.
    const PLAN_EXEMPT_TEMPLATES: EmailTemplate[] = ['account.created']
    if (shop.plan !== 'upgraded' && !PLAN_EXEMPT_TEMPLATES.includes(template)) {
      console.warn(`[EMAIL] Skipped '${template}' — shop plan is '${shop.plan}' (requires 'upgraded') | shop: ${shop.name}`)
      return { sent: false, error: 'basic_plan' }
    }

    // Step 3: Check email toggle flags
    if (CONFIRMATION_TEMPLATES.includes(template) && !shop.email_confirmation) {
      console.warn(`[EMAIL] Skipped '${template}' — shop has email_confirmation disabled | shop: ${shop.name}`)
      return { sent: false, error: 'confirmation_emails_disabled' }
    }
    if (REMINDER_TEMPLATES.includes(template) && !shop.email_reminder) {
      console.warn(`[EMAIL] Skipped '${template}' — shop has email_reminder disabled | shop: ${shop.name}`)
      return { sent: false, error: 'reminder_emails_disabled' }
    }

        // Step 4: Get Resend credentials — priority chain:
    //   1. platform_settings table (super-admin managed)
    //   2. RESEND_API_KEY from server env (runtimeConfig)
    //   3. legacy shop-level encrypted key
    const platform = await getPlatformEmailSettings(supabase)

        let resendApiKey: string
    let senderEmail: string
    let senderName: string
    let credentialSource: string

    if (platform) {
      resendApiKey = platform.resendApiKey
      senderEmail = platform.senderEmail
      senderName = platform.senderName
      credentialSource = 'platform_settings'
    } else if (config.resendApiKey) {
                  // Fallback: platform-level key from .env (RESEND_API_KEY)
      resendApiKey = config.resendApiKey
      // Resend only allows verified domains — default to the sandbox sender
      // until a domain is verified. Override with RESEND_SENDER_EMAIL in .env.
      senderEmail = config.resendSenderEmail || 'onboarding@resend.dev'
      senderName = 'Reservation PH'
      credentialSource = '.env (RESEND_API_KEY)'
    } else {
      // Fallback: use shop-level config (legacy)
      const { data: shopConfig } = await supabase
        .from('shops')
        .select('resend_api_key, sender_email, sender_name')
        .eq('id', shopId)
        .single()

      if (!shopConfig?.resend_api_key) {
        console.error('[EMAIL] No Resend API key found (platform_settings, env, or shop-level) for shop:', shopId)
        return { sent: false, error: 'no_api_key' }
      }

      // Decrypt legacy per-shop key
      try {
        const { decrypt } = await import('~/utils/server/encryption')
        resendApiKey = decrypt(shopConfig.resend_api_key)
      } catch (e) {
        console.error('[EMAIL] Error decrypting legacy resend_api_key:', e)
        return { sent: false, error: 'decryption_failed' }
      }

      senderEmail = shopConfig.sender_email || 'onboarding@resend.dev'
      senderName = shopConfig.sender_name || shop.name
    }

    // Step 5: Initialize Resend client
    const resend = new Resend(resendApiKey)

    // Step 6: Get recipient email from data.customer
    const customer = data.customer as { email?: string; name?: string } | undefined
    const recipientEmail = customer?.email || (data.customerEmail as string) || (data.email as string)

    if (!recipientEmail) {
      console.error('[EMAIL] No recipient email in data for template:', template)
      return { sent: false, error: 'no_recipient_email' }
    }

    // Step 7: Render the correct HTML template
    const templateFunc = templateMap[template]
    if (!templateFunc) {
      console.error('[EMAIL] No template found for:', template)
      return { sent: false, error: 'template_not_found' }
    }

    // Inject shop branding into data if not already present
    const branding = {
      shopName: shop.name,
      logoUrl: shop.logo_url,
      primaryColor: shop.primary_color || '#8A8A8F',
      shopAddress: [shop.address_street, shop.address_city, shop.address_state, shop.address_zip].filter(Boolean).join(', ') || undefined,
      shopPhone: shop.phone || undefined,
      shopLatitude: shop.latitude,
      shopLongitude: shop.longitude,
      shopSlug: shop.slug,
    }

            const enrichedData = {
      ...data,
      branding: data.branding || branding,
    }

    // Normalize: template functions expect a flat `customerName`, but callers
    // pass `customer: { email, name }`. Derive one from the other so greeting
    // lines never render "Hi undefined". Falls back to 'Customer'.
    const providedName =
      typeof enrichedData.customerName === 'string'
        ? enrichedData.customerName.trim()
        : ''
    const normalizedData = {
      ...enrichedData,
      customerName:
        providedName ||
        enrichedData.customer?.name?.trim() ||
        'Customer',
    }

    // Single type boundary: the union of 10 per-template signatures cannot
    // accept one common input type, so this cast is isolated here on purpose.
    const rendered = templateFunc(normalizedData as any)

        // Step 8: Determine sender
    const from = `"${senderName}" <${senderEmail}>`

    // Diagnostic: shows exactly which key source + sender is used per send,
    // so delivery failures can be traced to a config problem immediately.
    console.log(`[EMAIL] Sending '${template}' | key source: ${credentialSource} | from: ${from} | to: ${recipientEmail}`)

    // Step 9: Send via Resend
    const { error: sendError } = await resend.emails.send({
      from,
      to: recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
    })

    if (sendError) {
      console.error('[EMAIL] Resend send error:', sendError)
      return { sent: false, error: sendError.message || 'send_failed' }
    }

    console.log(`[EMAIL] Sent "${template}" to ${recipientEmail} for shop ${shopId}`)
    return { sent: true }

  } catch (error: unknown) {
    console.error('[EMAIL] Unexpected error in sendShopEmail:', error)
    return { sent: false, error: error.message || 'unknown_error' }
  }
}