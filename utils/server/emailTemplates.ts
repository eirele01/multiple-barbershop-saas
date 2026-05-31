/**
 * Email Templates — 9 HTML email templates for the Barbershop SaaS platform.
 *
 * All templates use:
 *   - Inline CSS only (no <style> tags — Gmail strips them)
 *   - Table-based layout (not divs + flexbox — Outlook breaks)
 *   - Web-safe fonts with fallbacks
 *   - Maximum width 600px
 *   - Shop branding: logo, primary_color, name
 *
 * Each template function accepts data and returns { subject, html }
 */

// ─── Shared Types ─────────────────────────────────────

interface ShopBranding {
  shopName: string
  logoUrl: string | null
  primaryColor: string
  shopAddress?: string
  shopPhone?: string
  shopLatitude?: number | null
  shopLongitude?: number | null
  shopSlug?: string
}

interface EmailResult {
  subject: string
  html: string
}

// ─── Base Layout ──────────────────────────────────────

function baseLayout(branding: ShopBranding, contentHtml: string): string {
  const logoHtml = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.shopName}" width="120" height="120" style="display:block;margin:0 auto 16px auto;border-radius:8px;" />`
    : ''

  const mapsLink = (branding.shopLatitude && branding.shopLongitude)
    ? `<a href="https://www.google.com/maps?q=${branding.shopLatitude},${branding.shopLongitude}" style="color:${branding.primaryColor};text-decoration:underline;" target="_blank">View on Google Maps</a>`
    : ''

  const addressLine = branding.shopAddress
    ? `<p style="margin:4px 0 0 0;font-size:13px;color:#666666;">${branding.shopAddress}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">

        <!-- Header with shop logo and name -->
        <tr>
          <td align="center" style="padding:32px 24px 16px 24px;background-color:${branding.primaryColor};">
            ${logoHtml}
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">${branding.shopName}</h1>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding:32px 24px;" bgcolor="#ffffff">
            ${contentHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 24px;border-top:1px solid #e5e7eb;background-color:#fafafa;" bgcolor="#fafafa">
            <p style="margin:0 0 4px 0;font-size:12px;color:#9ca3af;text-align:center;">Powered by BarberShop SaaS</p>
            ${addressLine}
            ${mapsLink ? `<p style="margin:4px 0 0 0;font-size:12px;text-align:center;">${mapsLink}</p>` : ''}
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

// ─── Button Helper ────────────────────────────────────

function button(text: string, url: string, color: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto;"><tr>
    <td style="border-radius:6px;background-color:${color};">
      <a href="${url}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">${text}</a>
    </td>
  </tr></table>`
}

// ─── Detail Row Helper ────────────────────────────────

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px;font-size:14px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;" width="140" valign="top">${label}</td>
    <td style="padding:8px 12px;font-size:14px;color:#1f2937;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${value}</td>
  </tr>`
}

// ═══════════════════════════════════════════════════════
// TEMPLATE 1 — Booking Confirmation
// ═══════════════════════════════════════════════════════

export interface BookingConfirmationData {
  customerName: string
  serviceName: string
  barberName: string
  date: string
  time: string
  amount: string
  bookingRef: string
  bookingId: string
  shopSlug: string
  branding: ShopBranding
}

export function bookingConfirmation(data: BookingConfirmationData): EmailResult {
  const calDate = data.date.replace(/-/g, '')
  const calStart = data.time.replace(':', '') + '00'
  // Estimate end time +1 hour for calendar
  const [h, m] = data.time.split(':').map(Number)
  const endH = h + 1
  const calEnd = `${endH.toString().padStart(2, '0')}${m.toString().padStart(2, '0')}00`
  const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(data.serviceName + ' at ' + data.branding.shopName)}&dates=${calDate}T${calStart}/${calDate}T${calEnd}&details=${encodeURIComponent('Booking ref: ' + data.bookingRef)}`

  const content = `
    <p style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;">Your booking is confirmed!</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
      ${detailRow('Service', data.serviceName)}
      ${detailRow('Barber', data.barberName)}
      ${detailRow('Date', data.date)}
      ${detailRow('Time', data.time)}
      ${detailRow('Amount', data.amount)}
    </table>

    <p style="margin:0 0 4px 0;font-size:14px;color:#6b7280;">
      <a href="${calUrl}" target="_blank" style="color:${data.branding.primaryColor};text-decoration:underline;font-weight:600;">Add to Google Calendar</a>
    </p>

    ${button('View Booking', `${process.env.NUXT_PUBLIC_SITE_URL || ''}/customer/bookings/${data.bookingId}`, data.branding.primaryColor)}
  `

  return {
    subject: `Booking Confirmed — ${data.serviceName} at ${data.branding.shopName}`,
    html: baseLayout(data.branding, content),
  }
}

// ═══════════════════════════════════════════════════════
// TEMPLATE 2 — Appointment Reminder
// ═══════════════════════════════════════════════════════

export interface AppointmentReminderData {
  customerName: string
  serviceName: string
  barberName: string
  date: string
  time: string
  hoursBefore: number
  bookingId: string
  bookingRef: string
  shopSlug: string
  branding: ShopBranding
}

export function appointmentReminder(data: AppointmentReminderData): EmailResult {
  const cancelUrl = `${process.env.NUXT_PUBLIC_SITE_URL || ''}/customer/bookings/${data.bookingId}`

  const content = `
    <p style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;">Your appointment is coming up in <strong>${data.hoursBefore} hour${data.hoursBefore !== 1 ? 's' : ''}</strong>!</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
      ${detailRow('Service', data.serviceName)}
      ${detailRow('Barber', data.barberName)}
      ${detailRow('Date', data.date)}
      ${detailRow('Time', data.time)}
    </table>

    ${button('Cancel Appointment', cancelUrl, '#ef4444')}

    ${data.branding.shopPhone ? `<p style="margin:12px 0 0 0;font-size:13px;color:#6b7280;">Need to reach us? Call <strong>${data.branding.shopPhone}</strong></p>` : ''}
  `

  return {
    subject: `Reminder: ${data.serviceName} in ${data.hoursBefore} hour${data.hoursBefore !== 1 ? 's' : ''} at ${data.branding.shopName}`,
    html: baseLayout(data.branding, content),
  }
}

// ═══════════════════════════════════════════════════════
// TEMPLATE 3 — Payment Verified
// ═══════════════════════════════════════════════════════

export interface PaymentVerifiedData {
  customerName: string
  bookingRef: string
  amount: string
  paymentMethod: string
  serviceName: string
  barberName: string
  date: string
  time: string
  bookingId: string
  branding: ShopBranding
}

export function paymentVerified(data: PaymentVerifiedData): EmailResult {
  const content = `
    <p style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;">Your payment has been verified!</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:16px;">
      ${detailRow('Amount Paid', data.amount)}
      ${detailRow('Payment Method', data.paymentMethod)}
    </table>

    <p style="margin:12px 0 8px 0;font-size:14px;font-weight:600;color:#374151;">Booking Details</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
      ${detailRow('Service', data.serviceName)}
      ${detailRow('Barber', data.barberName)}
      ${detailRow('Date', data.date)}
      ${detailRow('Time', data.time)}
    </table>

    ${button('View Booking', `${process.env.NUXT_PUBLIC_SITE_URL || ''}/customer/bookings/${data.bookingId}`, data.branding.primaryColor)}
  `

  return {
    subject: `Payment Confirmed — Booking #${data.bookingRef} at ${data.branding.shopName}`,
    html: baseLayout(data.branding, content),
  }
}

// ═══════════════════════════════════════════════════════
// TEMPLATE 4 — Payment Rejected
// ═══════════════════════════════════════════════════════

export interface PaymentRejectedData {
  customerName: string
  bookingRef: string
  rejectionReason: string
  shopSlug: string
  branding: ShopBranding
}

export function paymentRejected(data: PaymentRejectedData): EmailResult {
  const reuploadUrl = `${process.env.NUXT_PUBLIC_SITE_URL || ''}/shop/${data.shopSlug}/book`

  const content = `
    <p style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px 0;font-size:16px;color:#ef4444;font-weight:600;">We could not verify your payment.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fecaca;border-radius:6px;overflow:hidden;margin-bottom:20px;background-color:#fef2f2;" bgcolor="#fef2f2">
      <tr>
        <td style="padding:12px 16px;font-size:14px;color:#991b1b;font-family:Arial,Helvetica,sans-serif;">
          <strong>Reason:</strong> ${data.rejectionReason}
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">Please re-upload your payment proof or contact us for assistance.</p>

    ${button('Re-upload Payment Proof', reuploadUrl, data.branding.primaryColor)}

    ${data.branding.shopPhone ? `<p style="margin:12px 0 0 0;font-size:13px;color:#6b7280;">Need help? Call <strong>${data.branding.shopPhone}</strong></p>` : ''}
  `

  return {
    subject: `Payment Issue — Booking #${data.bookingRef} at ${data.branding.shopName}`,
    html: baseLayout(data.branding, content),
  }
}

// ═══════════════════════════════════════════════════════
// TEMPLATE 5 — Booking Cancelled
// ═══════════════════════════════════════════════════════

export interface BookingCancelledData {
  customerName: string
  bookingRef: string
  cancellationReason: string | null
  shopSlug: string
  branding: ShopBranding
}

export function bookingCancelled(data: BookingCancelledData): EmailResult {
  const bookAgainUrl = `${process.env.NUXT_PUBLIC_SITE_URL || ''}/shop/${data.shopSlug}/book`

  const reasonHtml = data.cancellationReason
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fecaca;border-radius:6px;overflow:hidden;margin-bottom:20px;background-color:#fef2f2;" bgcolor="#fef2f2">
        <tr>
          <td style="padding:12px 16px;font-size:14px;color:#991b1b;font-family:Arial,Helvetica,sans-serif;">
            <strong>Reason:</strong> ${data.cancellationReason}
          </td>
        </tr>
      </table>`
    : ''

  const content = `
    <p style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;">Your booking has been cancelled.</p>

    ${reasonHtml}

    ${button('Book Again', bookAgainUrl, data.branding.primaryColor)}
  `

  return {
    subject: `Booking Cancelled — #${data.bookingRef} at ${data.branding.shopName}`,
    html: baseLayout(data.branding, content),
  }
}

// ═══════════════════════════════════════════════════════
// TEMPLATE 6 — Loyalty Points Earned
// ═══════════════════════════════════════════════════════

export interface LoyaltyPointsEarnedData {
  customerName: string
  pointsEarned: number
  newBalance: number
  currentTier: string
  nextTier: string | null
  pointsToNextTier: number | null
  branding: ShopBranding
}

export function loyaltyPointsEarned(data: LoyaltyPointsEarnedData): EmailResult {
  // Progress bar toward next tier (HTML table-based)
  let progressHtml = ''
  if (data.nextTier && data.pointsToNextTier !== null) {
    const currentPointsInTier = data.newBalance
    const totalForNext = currentPointsInTier + data.pointsToNextTier
    const progressPercent = totalForNext > 0 ? Math.min(100, Math.round((currentPointsInTier / totalForNext) * 100)) : 0

    progressHtml = `
      <p style="margin:16px 0 6px 0;font-size:13px;color:#6b7280;">Progress toward <strong>${data.nextTier}</strong> tier:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;height:16px;">
        <tr>
          <td width="${progressPercent}" style="background-color:${data.branding.primaryColor};font-size:1px;line-height:16px;" bgcolor="${data.branding.primaryColor}">&nbsp;</td>
          <td width="${100 - progressPercent}" style="background-color:#f3f4f6;font-size:1px;line-height:16px;" bgcolor="#f3f4f6">&nbsp;</td>
        </tr>
      </table>
      <p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">${data.pointsToNextTier} points to go</p>
    `
  }

  const tierBadgeMap: Record<string, string> = {
    bronze: '&#x1F9C9;',
    silver: '&#x1F948;',
    gold: '&#x1F947;',
    platinum: '&#x1F48E;',
  }
  const badge = tierBadgeMap[data.currentTier.toLowerCase()] || ''

  const content = `
    <p style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;">You earned <strong style="color:${data.branding.primaryColor};">${data.pointsEarned} points</strong> this visit!</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:16px;">
      ${detailRow('Points Earned', `${data.pointsEarned}`)}
      ${detailRow('New Balance', `${data.newBalance}`)}
      ${detailRow('Current Tier', `${badge} ${data.currentTier.charAt(0).toUpperCase() + data.currentTier.slice(1)}`)}
    </table>

    ${progressHtml}

    ${button('View Rewards', `${process.env.NUXT_PUBLIC_SITE_URL || ''}/customer/loyalty`, data.branding.primaryColor)}
  `

  return {
    subject: `You earned ${data.pointsEarned} points at ${data.branding.shopName}!`,
    html: baseLayout(data.branding, content),
  }
}

// ═══════════════════════════════════════════════════════
// TEMPLATE 7 — Loyalty Tier Upgraded
// ═══════════════════════════════════════════════════════

export interface LoyaltyTierUpgradedData {
  customerName: string
  newTier: string
  earnRate: string
  currentBalance: number
  branding: ShopBranding
}

export function loyaltyTierUpgraded(data: LoyaltyTierUpgradedData): EmailResult {
  const tierBadgeMap: Record<string, string> = {
    bronze: '&#x1F9C9;',
    silver: '&#x1F948;',
    gold: '&#x1F947;',
    platinum: '&#x1F48E;',
  }
  const badge = tierBadgeMap[data.newTier.toLowerCase()] || ''
  const tierName = data.newTier.charAt(0).toUpperCase() + data.newTier.slice(1)

  const content = `
    <p style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px 0;font-size:20px;color:${data.branding.primaryColor};font-weight:700;">You've reached ${tierName} tier!</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${data.branding.primaryColor};border-radius:8px;overflow:hidden;margin-bottom:16px;">
      <tr>
        <td style="padding:20px;text-align:center;" align="center">
          <p style="margin:0 0 4px 0;font-size:32px;">${badge}</p>
          <p style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:${data.branding.primaryColor};">${tierName}</p>
          <p style="margin:0;font-size:14px;color:#6b7280;">Now earning ${data.earnRate}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
      ${detailRow('Current Points', `${data.currentBalance}`)}
    </table>

    ${button('View Benefits', `${process.env.NUXT_PUBLIC_SITE_URL || ''}/customer/loyalty`, data.branding.primaryColor)}
  `

  return {
    subject: `You've reached ${tierName} tier at ${data.branding.shopName}!`,
    html: baseLayout(data.branding, content),
  }
}

// ═══════════════════════════════════════════════════════
// TEMPLATE 8 — Points Expiring Soon
// ═══════════════════════════════════════════════════════

export interface PointsExpiringSoonData {
  customerName: string
  pointsExpiring: number
  expiryDate: string
  topRewards: Array<{ name: string; points: number }>
  branding: ShopBranding
}

export function pointsExpiringSoon(data: PointsExpiringSoonData): EmailResult {
  let rewardsHtml = ''
  if (data.topRewards && data.topRewards.length > 0) {
    const rewardRows = data.topRewards.map(r => `<tr>
      <td style="padding:8px 12px;font-size:14px;color:#1f2937;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${r.name}</td>
      <td style="padding:8px 12px;font-size:14px;color:${data.branding.primaryColor};font-weight:600;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;text-align:right;" align="right">${r.points} pts</td>
    </tr>`).join('')

    rewardsHtml = `
      <p style="margin:16px 0 8px 0;font-size:14px;font-weight:600;color:#374151;">Redeem your points before they expire:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:16px;">
        <tr>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Reward</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:right;" align="right">Points</td>
        </tr>
        ${rewardRows}
      </table>
    `
  }

  const content = `
    <p style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px 0;font-size:16px;color:#d97706;font-weight:600;">${data.pointsExpiring} points are expiring soon!</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fde68a;border-radius:6px;overflow:hidden;margin-bottom:16px;background-color:#fffbeb;" bgcolor="#fffbeb">
      <tr>
        <td style="padding:12px 16px;font-size:14px;color:#92400e;font-family:Arial,Helvetica,sans-serif;">
          <strong>Points Expiring:</strong> ${data.pointsExpiring}<br />
          <strong>Expiry Date:</strong> ${data.expiryDate}
        </td>
      </tr>
    </table>

    ${rewardsHtml}

    ${button('Redeem Now', `${process.env.NUXT_PUBLIC_SITE_URL || ''}/customer/loyalty`, data.branding.primaryColor)}
  `

  return {
    subject: `${data.pointsExpiring} points expiring soon at ${data.branding.shopName}`,
    html: baseLayout(data.branding, content),
  }
}

// ═══════════════════════════════════════════════════════
// TEMPLATE 9 — Welcome Email
// ═══════════════════════════════════════════════════════

export interface WelcomeEmailData {
  customerName: string
  shopSlug: string
  loyaltyEnabled: boolean
  welcomeBonusPoints: number
  topServices: Array<{ name: string; price: string }>
  branding: ShopBranding
}

export function welcomeEmail(data: WelcomeEmailData): EmailResult {
  const bookUrl = `${process.env.NUXT_PUBLIC_SITE_URL || ''}/shop/${data.shopSlug}/book`

  const loyaltyHtml = data.loyaltyEnabled && data.welcomeBonusPoints > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${data.branding.primaryColor};border-radius:8px;overflow:hidden;margin-bottom:16px;">
        <tr>
          <td style="padding:16px;text-align:center;" align="center">
            <p style="margin:0 0 4px 0;font-size:15px;color:#374151;">You've received</p>
            <p style="margin:0 0 4px 0;font-size:28px;font-weight:700;color:${data.branding.primaryColor};">${data.welcomeBonusPoints} welcome bonus points!</p>
          </td>
        </tr>
      </table>`
    : ''

  let servicesHtml = ''
  if (data.topServices && data.topServices.length > 0) {
    const serviceRows = data.topServices.map(s => `<tr>
      <td style="padding:8px 12px;font-size:14px;color:#1f2937;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;">${s.name}</td>
      <td style="padding:8px 12px;font-size:14px;color:#374151;font-weight:600;font-family:Arial,Helvetica,sans-serif;border-bottom:1px solid #f3f4f6;text-align:right;" align="right">${s.price}</td>
    </tr>`).join('')

    servicesHtml = `
      <p style="margin:16px 0 8px 0;font-size:14px;font-weight:600;color:#374151;">Our Popular Services:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:16px;">
        ${serviceRows}
      </table>
    `
  }

  const content = `
    <p style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">Hi ${data.customerName},</p>
    <p style="margin:0 0 20px 0;font-size:20px;font-weight:700;color:${data.branding.primaryColor};">Welcome to ${data.branding.shopName}!</p>

    <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">We're excited to have you. Book your first appointment and experience the best grooming in town.</p>

    ${loyaltyHtml}
    ${servicesHtml}

    ${button('Book Your First Appointment', bookUrl, data.branding.primaryColor)}
  `

  return {
    subject: `Welcome to ${data.branding.shopName}!`,
    html: baseLayout(data.branding, content),
  }
}

// ═══════════════════════════════════════════════════════
// TEMPLATE LOOKUP — Map template name to function
// ═══════════════════════════════════════════════════════

export type EmailTemplateFunc =
  | typeof bookingConfirmation
  | typeof appointmentReminder
  | typeof paymentVerified
  | typeof paymentRejected
  | typeof bookingCancelled
  | typeof loyaltyPointsEarned
  | typeof loyaltyTierUpgraded
  | typeof pointsExpiringSoon
  | typeof welcomeEmail

/**
 * Map of template names to their render functions.
 * Used by sendShopEmail() to select the correct template.
 */
export const templateMap: Record<string, EmailTemplateFunc> = {
  'booking.confirmed': bookingConfirmation,
  'booking.reminder': appointmentReminder,
  'payment.verified': paymentVerified,
  'payment.rejected': paymentRejected,
  'booking.cancelled': bookingCancelled,
  'loyalty.earned': loyaltyPointsEarned,
  'loyalty.tier_upgraded': loyaltyTierUpgraded,
  'loyalty.expiring': pointsExpiringSoon,
  'welcome': welcomeEmail,
}
