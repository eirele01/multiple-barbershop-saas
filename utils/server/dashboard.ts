/**
 * Dashboard stats — shared server-side helper (utils/server/ convention)
 *
 * Returns today's booking count, pending payment count, today's revenue
 * (sum of paid payments), and active staff count for a given shop.
 *
 * Used by: server/api/admin/dashboard.get.ts
 * Imported via: `~/utils/server/dashboard` (same pattern as loyaltyEngine/dateUtils)
 *
 * All queries are scoped to the shopId and use the provided service-role
 * Supabase client (RLS bypass for server-side aggregation).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ShopStats {
  todayBookings: number
  pendingPayments: number
  todayRevenue: number
  activeStaff: number
  /** Active services count — powers the "Add your first service" checklist */
  servicesCount: number
  /** True when a payment method is set up (manual QR/bank method or PayMongo enabled) */
  paymentsConfigured: boolean
  /** True when the shop has customized branding (logo or cover image uploaded) */
  brandingCustomized: boolean
}

/**
 * Fetch aggregated dashboard stats for a shop.
 * @param supabase - Supabase client
 * @param shopId - Shop ID to filter by
 * @param barberId - Optional barber ID to filter stats for barber role
 */
export async function getShopStats(supabase: SupabaseClient, shopId: string, barberId?: string): Promise<ShopStats> {
  // Today's date in the shop's local timezone (avoids UTC conversion)
  const now = new Date()
  const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`

  // Today's bookings count
  let bookingQuery = supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('date', today)
  if (barberId) bookingQuery = bookingQuery.eq('barber_id', barberId)
  const { count: bookingCount } = await bookingQuery

  // Pending payments count — includes PayMongo unpaid ('pending') and
  // manual QR proofs awaiting review ('pending_verification')
  let paymentQuery = supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .in('payment_status', ['pending', 'pending_verification'])
  if (barberId) paymentQuery = paymentQuery.eq('barber_id', barberId)
  const { count: paymentCount } = await paymentQuery

  // Today's revenue (sum of completed payments) — 'paid' is canonical;
  // 'verified' is the legacy value from manual QR/bank verifications
  let revenueQuery = supabase
    .from('bookings')
    .select('payment_amount')
    .eq('shop_id', shopId)
    .eq('date', today)
    .in('payment_status', ['paid', 'verified'])
  if (barberId) revenueQuery = revenueQuery.eq('barber_id', barberId)
  const { data: revenueData } = await revenueQuery

  // Active staff count
  const { count: staffCount } = await supabase
    .from('barbers')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('is_active', true)

  // ── Setup-checklist signals ──
  // Active services count
  const { count: servicesCount } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('is_active', true)

  // Active manual payment methods (QR / bank transfer)
  const { count: methodCount } = await supabase
    .from('payment_methods')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('is_active', true)

  // Shop-level flags: PayMongo enabled? branding customized?
  const { data: shopRow } = await supabase
    .from('shops')
    .select('logo_url, cover_image_url, paymongo_enabled')
    .eq('id', shopId)
    .single()

  return {
    todayBookings: bookingCount || 0,
    pendingPayments: paymentCount || 0,
    todayRevenue: (revenueData || []).reduce((sum, b) => sum + Number(b.payment_amount || 0), 0),
    activeStaff: staffCount || 0,
    servicesCount: servicesCount || 0,
    paymentsConfigured: (methodCount || 0) > 0 || !!shopRow?.paymongo_enabled,
    brandingCustomized: !!(shopRow?.logo_url || shopRow?.cover_image_url),
  }
}
