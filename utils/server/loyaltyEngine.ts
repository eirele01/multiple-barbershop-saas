/**
 * Loyalty Points Engine
 *
 * Core utility for all loyalty point calculations and ledger operations.
 * Used by booking completion, cancellation, welcome bonus, admin adjustments,
 * and the expiry cron job.
 *
 * Key rules:
 * - Points are awarded on booking COMPLETION only (not creation)
 * - Points are redeemed on booking COMPLETION only (not creation)
 *   (points_redeemed on the booking is an INTENT — actual deduction happens in complete.patch.ts)
 * - Cancellation of an uncompleted booking: no loyalty action needed (points never deducted)
 * - Cancellation of a completed booking: reverse the earned points only
 * - Welcome bonus is awarded once per shop-customer pair
 * - Tier multiplier applies only when tiersEnabled=true
 * - Expired points are handled by the expire-points cron job
 */

import { createClient } from '@supabase/supabase-js'
import type { LoyaltyTiers, LoyaltyPointsType } from '~/types/database'

// ============================================
// TYPES
// ============================================

interface ShopLoyaltyConfig {
  loyalty_enabled: boolean
  loyalty_earn_rate: number
  loyalty_earn_base: number
  loyalty_welcome_bonus: number
  loyalty_expiry_months: number
  loyalty_tiers_enabled: boolean
  loyalty_tiers: LoyaltyTiers
  plan: string
}

interface PointsResult {
  success: boolean
  points?: number
  balanceAfter?: number
  error?: string
}

// ============================================
// HELPER: Get Supabase admin client
// ============================================

function getAdminClient() {
  const config = useRuntimeConfig()
  return createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )
}

// ============================================
// POINTS CALCULATION
// ============================================

/**
 * Calculate how many points a customer will earn for a given amount.
 * Formula: floor((amount / earn_base) * earn_rate * tier_multiplier)
 *
 * @param amount - The payment amount (after discount)
 * @param shopConfig - Shop's loyalty configuration
 * @param customerTotalPoints - Customer's current total points at this shop
 * @returns Number of points to be earned
 */
export function calculatePointsToEarn(
  amount: number,
  shopConfig: ShopLoyaltyConfig,
  customerTotalPoints: number
): number {
  if (!shopConfig.loyalty_enabled || shopConfig.plan !== 'upgraded') {
    return 0
  }

  const earnRate = shopConfig.loyalty_earn_rate || 1
  const earnBase = shopConfig.loyalty_earn_base || 100
  const multiplier = getTierMultiplier(shopConfig, customerTotalPoints)

  return Math.floor((amount / earnBase) * earnRate * multiplier)
}

/**
 * Get the tier multiplier for a customer based on their total points.
 * Returns 1.0 when tiersEnabled=false (no tier boost).
 *
 * @param shopConfig - Shop's loyalty configuration
 * @param customerTotalPoints - Customer's current total points at this shop
 * @returns Multiplier value (e.g., 1.0, 1.2, 1.5, 2.0)
 */
export function getTierMultiplier(
  shopConfig: ShopLoyaltyConfig,
  customerTotalPoints: number
): number {
  // Guard: if tiers are disabled, always return 1.0
  if (!shopConfig.loyalty_tiers_enabled) {
    return 1.0
  }

  const tiers = shopConfig.loyalty_tiers
  if (!tiers) return 1.0

  // Check from highest tier down
  if (customerTotalPoints >= (tiers.platinum.min ?? 3000)) {
    return tiers.platinum.multiplier
  }
  if (customerTotalPoints >= (tiers.gold.min ?? 1500)) {
    return tiers.gold.multiplier
  }
  if (customerTotalPoints >= (tiers.silver.min ?? 500)) {
    return tiers.silver.multiplier
  }
  return tiers.bronze.multiplier
}

/**
 * Get the customer's current tier name based on their total points.
 *
 * @param shopConfig - Shop's loyalty configuration
 * @param customerTotalPoints - Customer's current total points at this shop
 * @returns Tier name ('bronze', 'silver', 'gold', 'platinum')
 */
export function getCustomerTier(
  shopConfig: ShopLoyaltyConfig,
  customerTotalPoints: number
): string {
  if (!shopConfig.loyalty_tiers_enabled) {
    return 'bronze'
  }

  const tiers = shopConfig.loyalty_tiers
  if (!tiers) return 'bronze'

  if (customerTotalPoints >= (tiers.platinum.min ?? 3000)) {
    return 'platinum'
  }
  if (customerTotalPoints >= (tiers.gold.min ?? 1500)) {
    return 'gold'
  }
  if (customerTotalPoints >= (tiers.silver.min ?? 500)) {
    return 'silver'
  }
  return 'bronze'
}

// ============================================
// POINTS LEDGER OPERATIONS
// ============================================

/**
 * Get the current balance of a customer at a specific shop.
 * Calculates from SUM of all loyalty_points records — always accurate
 * regardless of insertion order (race conditions, manual adjustments, cron jobs).
 *
 * Positive types (earned, welcome_bonus, adjusted) add to balance.
 * Negative types (redeemed, expired) subtract from balance.
 *
 * @param shopId - The shop's UUID
 * @param customerId - The customer's UUID
 * @returns Current points balance
 */
export async function getCustomerBalance(
  shopId: string,
  customerId: string
): Promise<number> {
  const supabase = getAdminClient()

  // Use SUM(points) with type-aware direction — always correct regardless of insertion order
  // Positive types: earned, welcome_bonus, adjusted → add points
  // Negative types: redeemed, expired → subtract points
  const { data, error } = await supabase
    .rpc('get_customer_loyalty_balance', {
      p_shop_id: shopId,
      p_customer_id: customerId,
    })

  if (error || data === null || data === undefined) {
    // Fallback: calculate in JS if RPC doesn't exist yet
    return getCustomerBalanceFallback(shopId, customerId)
  }

  return data as number
}

/**
 * Fallback balance calculation using JS-side SUM.
 * Used when the Supabase RPC function doesn't exist yet.
 *
 * @param shopId - The shop's UUID
 * @param customerId - The customer's UUID
 * @returns Current points balance
 */
async function getCustomerBalanceFallback(
  shopId: string,
  customerId: string
): Promise<number> {
  const supabase = getAdminClient()

  const { data } = await supabase
    .from('loyalty_points')
    .select('type, points')
    .eq('shop_id', shopId)
    .eq('customer_id', customerId)

  if (!data || data.length === 0) return 0

  let balance = 0
  for (const row of data) {
    if (row.type === 'earned' || row.type === 'welcome_bonus' || row.type === 'adjusted') {
      balance += row.points
    } else if (row.type === 'redeemed' || row.type === 'expired') {
      balance -= row.points
    }
  }

  return Math.max(0, balance)
}

/**
 * Get the total (non-expired) points earned by a customer at a shop.
 * Used for tier calculation (tier is based on total earned, not current balance).
 *
 * @param shopId - The shop's UUID
 * @param customerId - The customer's UUID
 * @returns Total earned points (sum of earned + welcome_bonus + adjusted - expired)
 */
export async function getCustomerTotalEarned(
  shopId: string,
  customerId: string
): Promise<number> {
  const supabase = getAdminClient()

  const { data } = await supabase
    .from('loyalty_points')
    .select('type, points')
    .eq('shop_id', shopId)
    .eq('customer_id', customerId)

  if (!data || data.length === 0) return 0

  let total = 0
  for (const row of data) {
    // Points that increase tier: earned, welcome_bonus, adjusted (positive)
    // Points that decrease tier: expired
    // Redeemed doesn't affect tier (you already "spent" the points)
    if (row.type === 'earned' || row.type === 'welcome_bonus' || row.type === 'adjusted') {
      total += row.points
    } else if (row.type === 'expired') {
      total -= row.points
    }
    // 'redeemed' doesn't affect total earned
  }

  return Math.max(0, total)
}

/**
 * Insert a loyalty_points ledger record.
 *
 * balance_after is calculated from the SUM-based getCustomerBalance() + this transaction,
 * ensuring accuracy regardless of insertion order.
 *
 * @param shopId - The shop's UUID
 * @param customerId - The customer's UUID
 * @param type - The transaction type
 * @param points - Number of points (always positive; type indicates direction)
 * @param currentBalance - The balance BEFORE this transaction (from getCustomerBalance)
 * @param options - Additional fields (booking_id, reward_id, note, expires_at)
 * @returns The new balance_after
 */
async function insertLedgerEntry(
  shopId: string,
  customerId: string,
  type: LoyaltyPointsType,
  points: number,
  currentBalance: number,
  options: {
    bookingId?: string | null
    rewardId?: string | null
    note?: string | null
    expiresAt?: string | null
  } = {}
): Promise<number> {
  const supabase = getAdminClient()

  let balanceAfter: number
  if (type === 'earned' || type === 'welcome_bonus' || type === 'adjusted') {
    balanceAfter = currentBalance + points
  } else {
    // redeemed, expired — deduct
    balanceAfter = Math.max(0, currentBalance - points)
  }

  const { error } = await supabase.from('loyalty_points').insert({
    shop_id: shopId,
    customer_id: customerId,
    booking_id: options.bookingId || null,
    reward_id: options.rewardId || null,
    type,
    points,
    balance_after: balanceAfter,
    note: options.note || null,
    expires_at: options.expiresAt || null,
  })

  if (error) {
    console.error('[LOYALTY-ENGINE] Error inserting ledger entry:', error)
    throw new Error('Failed to insert loyalty_points record: ' + error.message)
  }

  return balanceAfter
}

/**
 * Award points to a customer (called on booking completion).
 * Creates an 'earned' ledger entry with an expiry date based on shop settings.
 *
 * @param shopId - The shop's UUID
 * @param customerId - The customer's UUID
 * @param bookingId - The booking's UUID
 * @param points - Number of points to award
 * @param shopConfig - Shop's loyalty configuration (for expiry_months)
 * @returns PointsResult with success status and new balance
 */
export async function awardPoints(
  shopId: string,
  customerId: string,
  bookingId: string,
  points: number,
  shopConfig: ShopLoyaltyConfig
): Promise<PointsResult> {
  if (points <= 0) {
    return { success: true, points: 0, balanceAfter: await getCustomerBalance(shopId, customerId) }
  }

  try {
    const currentBalance = await getCustomerBalance(shopId, customerId)

    // Calculate expiry date
    let expiresAt: string | null = null
    const expiryMonths = shopConfig.loyalty_expiry_months || 12
    if (expiryMonths > 0) {
      const expiryDate = new Date()
      expiryDate.setMonth(expiryDate.getMonth() + expiryMonths)
      expiresAt = expiryDate.toISOString()
    }

    const balanceAfter = await insertLedgerEntry(
      shopId,
      customerId,
      'earned',
      points,
      currentBalance,
      {
        bookingId,
        note: `Earned ${points} points from booking`,
        expiresAt,
      }
    )

    return { success: true, points, balanceAfter }
  } catch (error: any) {
    console.error('[LOYALTY-ENGINE] Error awarding points:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Redeem points from a customer (called when a reward is applied to a booking).
 * Creates a 'redeemed' ledger entry. Points are deducted immediately.
 *
 * @param shopId - The shop's UUID
 * @param customerId - The customer's UUID
 * @param bookingId - The booking's UUID
 * @param rewardId - The reward's UUID (if applicable)
 * @param points - Number of points to redeem
 * @returns PointsResult with success status and new balance
 */
export async function redeemPoints(
  shopId: string,
  customerId: string,
  bookingId: string,
  points: number,
  rewardId?: string | null
): Promise<PointsResult> {
  if (points <= 0) {
    return { success: true, points: 0, balanceAfter: await getCustomerBalance(shopId, customerId) }
  }

  try {
    const currentBalance = await getCustomerBalance(shopId, customerId)

    if (currentBalance < points) {
      return { success: false, error: 'Insufficient points balance' }
    }

    const balanceAfter = await insertLedgerEntry(
      shopId,
      customerId,
      'redeemed',
      points,
      currentBalance,
      {
        bookingId,
        rewardId,
        note: `Redeemed ${points} points for booking`,
      }
    )

    return { success: true, points, balanceAfter }
  } catch (error: any) {
    console.error('[LOYALTY-ENGINE] Error redeeming points:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Refund redeemed points (called on booking cancellation).
 * Creates an 'adjusted' ledger entry to add back the redeemed points.
 *
 * @param shopId - The shop's UUID
 * @param customerId - The customer's UUID
 * @param bookingId - The booking's UUID
 * @param points - Number of points to refund
 * @param reason - Reason for the refund
 * @returns PointsResult with success status and new balance
 */
export async function refundRedeemedPoints(
  shopId: string,
  customerId: string,
  bookingId: string,
  points: number,
  reason: string = 'Booking cancelled — points refunded'
): Promise<PointsResult> {
  if (points <= 0) {
    return { success: true, points: 0, balanceAfter: await getCustomerBalance(shopId, customerId) }
  }

  try {
    const currentBalance = await getCustomerBalance(shopId, customerId)

    const balanceAfter = await insertLedgerEntry(
      shopId,
      customerId,
      'adjusted',
      points,
      currentBalance,
      {
        bookingId,
        note: reason,
      }
    )

    return { success: true, points, balanceAfter }
  } catch (error: any) {
    console.error('[LOYALTY-ENGINE] Error refunding redeemed points:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Award welcome bonus to a new customer.
 * Checks uniqueness — only one welcome bonus per shop-customer pair.
 *
 * @param shopId - The shop's UUID
 * @param customerId - The customer's UUID
 * @param shopConfig - Shop's loyalty configuration
 * @returns PointsResult with success status and new balance
 */
export async function awardWelcomeBonus(
  shopId: string,
  customerId: string,
  shopConfig: ShopLoyaltyConfig
): Promise<PointsResult> {
  const bonusPoints = shopConfig.loyalty_welcome_bonus || 0

  if (bonusPoints <= 0 || !shopConfig.loyalty_enabled || shopConfig.plan !== 'upgraded') {
    return { success: true, points: 0, balanceAfter: await getCustomerBalance(shopId, customerId) }
  }

  try {
    const supabase = getAdminClient()

    // Uniqueness check: only one welcome_bonus per shop-customer pair
    const { data: existing } = await supabase
      .from('loyalty_points')
      .select('id')
      .eq('shop_id', shopId)
      .eq('customer_id', customerId)
      .eq('type', 'welcome_bonus')
      .limit(1)

    if (existing && existing.length > 0) {
      // Welcome bonus already awarded — skip silently
      return { success: true, points: 0, balanceAfter: await getCustomerBalance(shopId, customerId) }
    }

    const currentBalance = await getCustomerBalance(shopId, customerId)

    // Calculate expiry date for welcome bonus
    let expiresAt: string | null = null
    const expiryMonths = shopConfig.loyalty_expiry_months || 12
    if (expiryMonths > 0) {
      const expiryDate = new Date()
      expiryDate.setMonth(expiryDate.getMonth() + expiryMonths)
      expiresAt = expiryDate.toISOString()
    }

    const balanceAfter = await insertLedgerEntry(
      shopId,
      customerId,
      'welcome_bonus',
      bonusPoints,
      currentBalance,
      {
        note: `Welcome bonus: ${bonusPoints} points`,
        expiresAt,
      }
    )

    return { success: true, points: bonusPoints, balanceAfter }
  } catch (error: any) {
    console.error('[LOYALTY-ENGINE] Error awarding welcome bonus:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Admin manual adjustment of points.
 * Creates an 'adjusted' ledger entry.
 *
 * @param shopId - The shop's UUID
 * @param customerId - The customer's UUID
 * @param points - Number of points (positive to add, but always stored as positive with type)
 * @param note - Reason for the adjustment
 * @returns PointsResult with success status and new balance
 */
export async function adjustPoints(
  shopId: string,
  customerId: string,
  points: number,
  note: string
): Promise<PointsResult> {
  if (points === 0) {
    return { success: true, points: 0, balanceAfter: await getCustomerBalance(shopId, customerId) }
  }

  try {
    const currentBalance = await getCustomerBalance(shopId, customerId)

    // For admin adjustments, we use 'adjusted' type for additions
    // and 'redeemed' type for deductions (with admin note)
    if (points > 0) {
      const balanceAfter = await insertLedgerEntry(
        shopId,
        customerId,
        'adjusted',
        points,
        currentBalance,
        { note }
      )
      return { success: true, points, balanceAfter }
    } else {
      // Deduct points
      const absPoints = Math.abs(points)
      if (currentBalance < absPoints) {
        return { success: false, error: 'Insufficient points balance for adjustment' }
      }
      const balanceAfter = await insertLedgerEntry(
        shopId,
        customerId,
        'redeemed',
        absPoints,
        currentBalance,
        { note }
      )
      return { success: true, points: absPoints, balanceAfter }
    }
  } catch (error: any) {
    console.error('[LOYALTY-ENGINE] Error adjusting points:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Expire points that have passed their expires_at date.
 * Called by the expire-points cron job.
 * Creates 'expired' ledger entries for each expiring record.
 *
 * @returns Number of records expired
 */
export async function expireOldPoints(): Promise<number> {
  const supabase = getAdminClient()
  const now = new Date().toISOString()

  // Find all 'earned' or 'welcome_bonus' records that have expired
  // and haven't already been marked as expired
  const { data: expiredRecords, error } = await supabase
    .from('loyalty_points')
    .select('id, shop_id, customer_id, points, balance_after, expires_at')
    .in('type', ['earned', 'welcome_bonus'])
    .lt('expires_at', now)
    .is('expired', null) // We'll use a different approach

  if (error || !expiredRecords || expiredRecords.length === 0) {
    return 0
  }

  let expiredCount = 0

  for (const record of expiredRecords) {
    // Check if there's already an 'expired' entry for this source record
    // We use the booking_id reference to track which earned entry was expired
    const { data: alreadyExpired } = await supabase
      .from('loyalty_points')
      .select('id')
      .eq('shop_id', record.shop_id)
      .eq('customer_id', record.customer_id)
      .eq('type', 'expired')
      .eq('note', `Expired: record ${record.id}`)
      .limit(1)

    if (alreadyExpired && alreadyExpired.length > 0) continue

    const currentBalance = await getCustomerBalance(record.shop_id, record.customer_id)

    await insertLedgerEntry(
      record.shop_id,
      record.customer_id,
      'expired',
      record.points,
      currentBalance,
      { note: `Expired: record ${record.id}` }
    )

    expiredCount++
  }

  return expiredCount
}
