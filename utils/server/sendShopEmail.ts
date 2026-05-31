/**
 * sendShopEmail — Real Resend API email sender for shop notifications.
 *
 * Checks if the shop is on an upgraded plan and has a resend_api_key configured.
 * If not, returns { sent: false, error: 'basic_plan' } or { sent: false, error: 'no_api_key' }.
 *
 * Logic:
 * 1. Fetch shop record (plan, resend_api_key, sender_email, sender_name, email flags, name, logo_url)
 * 2. Guard: plan must be 'upgraded', resend_api_key must exist
 * 3. Decrypt resend_api_key
 * 4. Initialize Resend client with the shop's key
 * 5. Get recipient email from data.customer.email
 * 6. Render the correct HTML template via templateMap
 * 7. Send via resend.emails.send()
 * 8. Return { sent: true } or { sent: false, error }
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { decrypt } from '~/utils/server/encryption'
import { templateMap } from '~/utils/server/emailTemplates'

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

interface EmailData {
  [key: string]: unknown
}

interface SendEmailResult {
  sent: boolean
  error?: string
}

// ─── Templates that require specific email toggles ─────

const CONFIRMATION_TEMPLATES: EmailTemplate[] = ['booking.confirmed']
const REMINDER_TEMPLATES: EmailTemplate[] = ['booking.reminder']

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
    // Step 1: Fetch shop record
    const config = useRuntimeConfig()
    const supabase = createClient(
      config.public.supabaseUrl as string,
      config.supabaseServiceKey as string
    )

    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('plan, resend_api_key, sender_email, sender_name, email_confirmation, email_reminder, name, logo_url, primary_color, address_street, address_city, address_state, address_zip, phone, latitude, longitude, slug')
      .eq('id', shopId)
      .single()

    if (shopError || !shop) {
      console.error('[EMAIL] Shop not found:', shopId, shopError)
      return { sent: false, error: 'shop_not_found' }
    }

    // Step 2: Guard — plan must be upgraded
    if (shop.plan !== 'upgraded') {
      return { sent: false, error: 'basic_plan' }
    }

    // Step 3: Guard — resend_api_key must exist
    if (!shop.resend_api_key) {
      return { sent: false, error: 'no_api_key' }
    }

    // Step 4: Check email toggle flags
    if (CONFIRMATION_TEMPLATES.includes(template) && !shop.email_confirmation) {
      return { sent: false, error: 'confirmation_emails_disabled' }
    }
    if (REMINDER_TEMPLATES.includes(template) && !shop.email_reminder) {
      return { sent: false, error: 'reminder_emails_disabled' }
    }

    // Step 5: Decrypt resend_api_key
    let decryptedApiKey: string
    try {
      decryptedApiKey = decrypt(shop.resend_api_key)
    } catch (e) {
      console.error('[EMAIL] Error decrypting resend_api_key:', e)
      return { sent: false, error: 'decryption_failed' }
    }

    if (!decryptedApiKey) {
      return { sent: false, error: 'no_api_key' }
    }

    // Step 6: Initialize Resend client
    const resend = new Resend(decryptedApiKey)

    // Step 7: Get recipient email from data.customer.email
    const customer = data.customer as { email?: string; name?: string } | undefined
    const recipientEmail = customer?.email || (data.customerEmail as string) || (data.email as string)

    if (!recipientEmail) {
      console.error('[EMAIL] No recipient email in data for template:', template)
      return { sent: false, error: 'no_recipient_email' }
    }

    // Step 8: Render the correct HTML template
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

    const rendered = templateFunc(enrichedData as any)

    // Step 9: Determine sender
    const senderEmail = shop.sender_email || 'onboarding@resend.dev'
    const senderName = shop.sender_name || shop.name
    const from = `"${senderName}" <${senderEmail}>`

    // Step 10: Send via Resend
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

  } catch (error: any) {
    console.error('[EMAIL] Unexpected error in sendShopEmail:', error)
    return { sent: false, error: error.message || 'unknown_error' }
  }
}
