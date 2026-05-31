/**
 * GET /api/admin/settings/test-resend
 *
 * Tests the shop's Resend API connection by sending a test email
 * to the shop owner's email address.
 *
 * Accessible by: admin only
 */
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { decrypt } from '~/utils/server/encryption'

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

  // Admin only
  if (userProfile.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Fetch shop's email settings
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('name, resend_api_key, sender_email, sender_name, email')
    .eq('id', userProfile.shop_id)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  if (!shop.resend_api_key) {
    return { sent: false, error: 'No Resend API key configured' }
  }

  // Decrypt API key
  let decryptedApiKey: string
  try {
    decryptedApiKey = decrypt(shop.resend_api_key)
  } catch (e) {
    console.error('[TEST-RESEND] Error decrypting API key:', e)
    return { sent: false, error: 'Failed to decrypt API key' }
  }

  if (!decryptedApiKey) {
    return { sent: false, error: 'No Resend API key configured' }
  }

  // Determine recipient — shop owner's email
  const recipientEmail = shop.email || user.email
  if (!recipientEmail) {
    return { sent: false, error: 'No email address found for the shop' }
  }

  // Initialize Resend and send test email
  const resend = new Resend(decryptedApiKey)
  const senderEmail = shop.sender_email || 'onboarding@resend.dev'
  const senderName = shop.sender_name || shop.name

  const { error: sendError } = await resend.emails.send({
    from: `"${senderName}" <${senderEmail}>`,
    to: recipientEmail,
    subject: `Test Email from ${shop.name} — Resend Connected`,
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
            <h1 style="margin:0 0 8px 0;font-size:20px;color:#1f2937;">Resend is Connected!</h1>
            <p style="margin:0 0 16px 0;font-size:14px;color:#6b7280;">This is a test email from <strong>${shop.name}</strong>.</p>
            <p style="margin:0;font-size:14px;color:#22c55e;font-weight:600;">Your email system is working correctly.</p>
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
