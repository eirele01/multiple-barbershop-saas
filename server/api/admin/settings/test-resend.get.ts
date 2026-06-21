/**
 * GET /api/admin/settings/test-resend
 *
 * Tests the platform's Resend API connection by sending a test email
 * to the shop owner's email address. Uses platform-level Resend config.
 *
 * Accessible by: admin only
 */
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

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

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Fetch platform Resend settings
  const { data: platformSettings } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['platform_resend_api_key', 'platform_sender_email', 'platform_sender_name'])

  if (!platformSettings) {
    return { sent: false, error: 'Platform email settings not found' }
  }

  const settingsMap = new Map(platformSettings.map((s: any) => [s.key, s.value]))
  const apiKey = settingsMap.get('platform_resend_api_key')

  if (!apiKey) {
    return { sent: false, error: 'No platform Resend API key configured. Ask the super admin to set it up.' }
  }

  const senderEmail = settingsMap.get('platform_sender_email') || 'notifications@reservationph.com'
  const senderName = settingsMap.get('platform_sender_name') || 'BarberShop SaaS'

  // Get shop info for recipient and branding
  const { data: shop } = await supabase
    .from('shops')
    .select('name, email')
    .eq('id', authUser.shop_id)
    .single()

  const recipientEmail = shop?.email || authUser.email
  if (!recipientEmail) {
    return { sent: false, error: 'No email address found for the shop' }
  }

  // Initialize Resend and send test email
  const resend = new Resend(apiKey)

  const { error: sendError } = await resend.emails.send({
    from: `"${senderName}" <${senderEmail}>`,
    to: recipientEmail,
    subject: `Test Email from ${shop?.name || 'BarberShop SaaS'} — Email System Connected`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:32px 24px;text-align:center;" align="center">
            <h1 style="margin:0 0 8px 0;font-size:20px;color:#1f2937;">Email System is Connected!</h1>
            <p style="margin:0 0 16px 0;font-size:14px;color:#6b7280;">This is a test email sent using the platform's email configuration.</p>
            <p style="margin:0;font-size:14px;color:#22c55e;font-weight:600;">Your shop's email notifications are working correctly.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;border-top:1px solid #e5e7eb;background-color:#fafafa;" bgcolor="#fafafa">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Powered by BarberShop SaaS</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`,
  })

  if (sendError) {
    console.error('[TEST-RESEND] Send error:', sendError)
    return { sent: false, error: sendError.message || 'Failed to send test email' }
  }

  return { sent: true, email: recipientEmail }
})