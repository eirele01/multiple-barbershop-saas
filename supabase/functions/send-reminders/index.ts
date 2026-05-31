/**
 * Supabase Edge Function: send-reminders
 *
 * Sends appointment reminder emails to customers with upcoming bookings.
 * Designed to be scheduled as a cron job every 30 minutes.
 *
 * Logic:
 * 1. Fetch all Upgraded shops where email_reminder=true AND resend_api_key IS NOT NULL
 * 2. For each shop, get reminder_hours array (e.g., [24, 2])
 * 3. For each reminder_hours value (e.g., 24):
 *    Find bookings where:
 *      shop_id = shop.id
 *      status = 'confirmed'
 *      reminder_sent = false
 *      date + start_time is between
 *        NOW() + (hours - 0.5) AND NOW() + (hours + 0.5)
 *        (30 min window to catch it on each cron run)
 * 4. For each matching booking:
 *    Send appointmentReminder email
 *    Set booking.reminder_sent = true
 * 5. Log results
 *
 * Deploy:
 *   supabase functions deploy send-reminders
 *
 * Schedule (every 30 minutes):
 *   supabase functions schedule send-reminders --cron "*/30 * * * *"
 *
 * Test locally:
 *   supabase functions serve send-reminders --env-file .env.local
 *   curl -i --location --request POST 'http://localhost:54321/functions/v1/send-reminders' \
 *     --header 'Authorization: Bearer YOUR_ANON_KEY' \
 *     --header 'Content-Type: application/json'
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'

// ─── AES-256-CBC Decryption (matching the Node.js encryption utility) ─────

async function decrypt(ciphertext: string, encryptionKey: string): Promise<string> {
  if (!ciphertext) return ''

  const keyData = new TextEncoder().encode(encryptionKey)
  const keyHash = await crypto.subtle.digest('SHA-256', keyData)
  const key = await crypto.subtle.importKey('raw', keyHash, { name: 'AES-CBC' }, false, ['decrypt'])

  const parts = ciphertext.split(':')
  if (parts.length !== 2) {
    throw new Error('Invalid ciphertext format — expected "ivHex:encryptedHex"')
  }

  const iv = new Uint8Array(parts[0].match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)))
  const encrypted = new Uint8Array(parts[1].match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)))

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, encrypted)
  return new TextDecoder().decode(decrypted)
}

// ─── Email Template: Appointment Reminder ────────────────────────────────

function appointmentReminderHtml(data: {
  customerName: string
  serviceName: string
  barberName: string
  date: string
  time: string
  hoursBefore: number
  shopName: string
  primaryColor: string
  logoUrl: string | null
  shopPhone: string | null
  siteUrl: string
  bookingId: string
}): { subject: string; html: string } {
  const logoHtml = data.logoUrl
    ? `<img src="${data.logoUrl}" alt="${data.shopName}" width="120" height="120" style="display:block;margin:0 auto 16px auto;border-radius:8px;" />`
    : ''

  const subject = `Reminder: ${data.serviceName} in ${data.hoursBefore} hour${data.hoursBefore !== 1 ? 's' : ''} at ${data.shopName}`

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td align="center" style="padding:32px 24px 16px 24px;background-color:${data.primaryColor};">
            ${logoHtml}
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">${data.shopName}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 24px;" bgcolor="#ffffff">
            <p style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">Hi ${data.customerName},</p>
            <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;">Your appointment is coming up in <strong>${data.hoursBefore} hour${data.hoursBefore !== 1 ? 's' : ''}</strong>!</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
              <tr><td style="padding:8px 12px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;" width="140">Service</td><td style="padding:8px 12px;font-size:14px;color:#1f2937;border-bottom:1px solid #f3f4f6;">${data.serviceName}</td></tr>
              <tr><td style="padding:8px 12px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Barber</td><td style="padding:8px 12px;font-size:14px;color:#1f2937;border-bottom:1px solid #f3f4f6;">${data.barberName}</td></tr>
              <tr><td style="padding:8px 12px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Date</td><td style="padding:8px 12px;font-size:14px;color:#1f2937;border-bottom:1px solid #f3f4f6;">${data.date}</td></tr>
              <tr><td style="padding:8px 12px;font-size:14px;color:#6b7280;">Time</td><td style="padding:8px 12px;font-size:14px;color:#1f2937;">${data.time}</td></tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto;"><tr>
              <td style="border-radius:6px;background-color:#ef4444;">
                <a href="${data.siteUrl}/customer/bookings/${data.bookingId}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Cancel Appointment</a>
              </td>
            </tr></table>
            ${data.shopPhone ? `<p style="margin:12px 0 0 0;font-size:13px;color:#6b7280;">Need to reach us? Call <strong>${data.shopPhone}</strong></p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;border-top:1px solid #e5e7eb;background-color:#fafafa;" bgcolor="#fafafa">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Powered by BarberShop SaaS</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  return { subject, html }
}

// ─── Main Handler ────────────────────────────────────────────────────────

serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const encryptionKey = Deno.env.get('NUXT_ENCRYPTION_KEY')!
    const siteUrl = Deno.env.get('NUXT_PUBLIC_SITE_URL') || ''

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Step 1: Fetch all Upgraded shops where email_reminder=true AND resend_api_key IS NOT NULL
    const { data: shops, error: shopsError } = await supabase
      .from('shops')
      .select('id, name, slug, resend_api_key, sender_email, sender_name, primary_color, logo_url, phone, reminder_hours')
      .eq('plan', 'upgraded')
      .eq('email_reminder', true)
      .not('resend_api_key', 'is', null)

    if (shopsError) {
      console.error('[REMINDER] Error fetching shops:', shopsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch shops' }), { status: 500 })
    }

    if (!shops || shops.length === 0) {
      return new Response(JSON.stringify({ message: 'No shops with email reminders enabled', sent: 0 }))
    }

    let totalSent = 0
    let totalErrors = 0

    // Step 2: For each shop
    for (const shop of shops) {
      try {
        // Decrypt the Resend API key
        const decryptedApiKey = await decrypt(shop.resend_api_key, encryptionKey)
        if (!decryptedApiKey) {
          console.error(`[REMINDER] Empty decrypted API key for shop ${shop.id}`)
          continue
        }

        const resend = new Resend(decryptedApiKey)
        const senderEmail = shop.sender_email || 'onboarding@resend.dev'
        const senderName = shop.sender_name || shop.name
        const from = `"${senderName}" <${senderEmail}>`

        const reminderHours: number[] = shop.reminder_hours || [24, 2]

        // Step 3: For each reminder_hours value
        for (const hours of reminderHours) {
          if (hours <= 0) continue

          // Calculate the time window:
          // Find bookings where date + start_time is between
          //   NOW() + (hours - 0.5) AND NOW() + (hours + 0.5)
          // The 30-minute window ensures we catch the booking on each cron run
          const now = new Date()
          const windowStart = new Date(now.getTime() + (hours - 0.5) * 60 * 60 * 1000)
          const windowEnd = new Date(now.getTime() + (hours + 0.5) * 60 * 60 * 1000)

          const startDate = windowStart.toISOString().split('T')[0]
          const endDate = windowEnd.toISOString().split('T')[0]
          const startTimeStr = windowStart.toTimeString().substring(0, 5)
          const endTimeStr = windowEnd.toTimeString().substring(0, 5)

          // Find matching bookings
          // We need to query for bookings where the appointment falls within the window.
          // Since date and start_time are separate columns, we handle same-day and cross-day scenarios.
          const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('id, booking_ref, customer_id, service_name, date, start_time, barber_id')
            .eq('shop_id', shop.id)
            .eq('status', 'confirmed')
            .eq('reminder_sent', false)
            .gte('date', startDate)
            .lte('date', endDate)

          if (bookingsError) {
            console.error(`[REMINDER] Error fetching bookings for shop ${shop.id}:`, bookingsError)
            continue
          }

          if (!bookings || bookings.length === 0) continue

          // Filter bookings that are actually in the time window
          for (const booking of bookings) {
            // Construct the appointment datetime
            const appointmentTime = new Date(`${booking.date}T${booking.start_time}:00`)

            // Check if appointment is within the window
            if (appointmentTime >= windowStart && appointmentTime <= windowEnd) {
              try {
                // Fetch customer email
                const { data: customer } = await supabase
                  .from('users')
                  .select('email, display_name')
                  .eq('id', booking.customer_id)
                  .single()

                if (!customer?.email) {
                  console.error(`[REMINDER] No email for customer ${booking.customer_id}`)
                  continue
                }

                // Fetch barber name
                let barberName = 'Your Barber'
                if (booking.barber_id) {
                  const { data: barberUser } = await supabase
                    .from('barbers')
                    .select('user_id')
                    .eq('id', booking.barber_id)
                    .single()
                  if (barberUser?.user_id) {
                    const { data: barberProfile } = await supabase
                      .from('users')
                      .select('display_name')
                      .eq('id', barberUser.user_id)
                      .single()
                    barberName = barberProfile?.display_name || 'Your Barber'
                  }
                }

                // Render email
                const rendered = appointmentReminderHtml({
                  customerName: customer.display_name || 'Customer',
                  serviceName: booking.service_name,
                  barberName,
                  date: booking.date,
                  time: booking.start_time,
                  hoursBefore: hours,
                  shopName: shop.name,
                  primaryColor: shop.primary_color || '#8A8A8F',
                  logoUrl: shop.logo_url,
                  shopPhone: shop.phone,
                  siteUrl,
                  bookingId: booking.id,
                })

                // Send email
                const { error: sendError } = await resend.emails.send({
                  from,
                  to: customer.email,
                  subject: rendered.subject,
                  html: rendered.html,
                })

                if (sendError) {
                  console.error(`[REMINDER] Error sending reminder to ${customer.email}:`, sendError)
                  totalErrors++
                } else {
                  // Step 4: Set reminder_sent = true to prevent re-sending
                  await supabase
                    .from('bookings')
                    .update({ reminder_sent: true })
                    .eq('id', booking.id)

                  totalSent++
                  console.log(`[REMINDER] Sent ${hours}h reminder for booking ${booking.booking_ref} to ${customer.email}`)
                }
              } catch (bookingError) {
                console.error(`[REMINDER] Error processing booking ${booking.id}:`, bookingError)
                totalErrors++
              }
            }
          }
        }
      } catch (shopError) {
        console.error(`[REMINDER] Error processing shop ${shop.id}:`, shopError)
        totalErrors++
      }
    }

    // Step 5: Log results
    console.log(`[REMINDER] Complete: ${totalSent} sent, ${totalErrors} errors`)

    return new Response(JSON.stringify({
      message: 'Reminder processing complete',
      sent: totalSent,
      errors: totalErrors,
      shopsProcessed: shops.length,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[REMINDER] Fatal error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})
