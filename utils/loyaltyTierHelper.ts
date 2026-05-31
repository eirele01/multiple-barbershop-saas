/**
 * Client-Side Loyalty Tier Helper
 *
 * Mirrors the server-side tier logic from loyaltyEngine.ts
 * so the booking wizard (book.vue Step 5) can show accurate
 * tier multiplier previews using total_earned (not current balance).
 *
 * This is used ONLY on the client side.
 * The server always uses its own loyaltyEngine.ts functions.
 *
 * Tier is determined by total_earned (sum of earned + welcome_bonus + adjusted - expired),
 * NOT by current balance. Redeemed points do NOT affect tier.
 */

import type { LoyaltyTiers } from '~/types/database'

/**
 * Get the customer's tier name based on their total earned points.
 *
 * @param totalEarned - Sum of all earned + welcome_bonus + adjusted - expired points
 * @param tiers - Shop's loyalty tier configuration
 * @param tiersEnabled - Whether tiers are enabled for this shop
 * @returns Tier name ('bronze', 'silver', 'gold', 'platinum')
 */
export function getTierFromPoints(
  totalEarned: number,
  tiers: LoyaltyTiers | null | undefined,
  tiersEnabled: boolean | undefined
): string {
  if (!tiersEnabled || !tiers) return 'bronze'

  if (totalEarned >= (tiers.platinum.min ?? 3000)) return 'platinum'
  if (totalEarned >= (tiers.gold.min ?? 1500)) return 'gold'
  if (totalEarned >= (tiers.silver.min ?? 500)) return 'silver'
  return 'bronze'
}

/**
 * Get the tier multiplier for a customer based on their total earned points.
 * Returns 1.0 when tiers are disabled or no tier config exists.
 *
 * @param totalEarned - Sum of all earned + welcome_bonus + adjusted - expired points
 * @param tiers - Shop's loyalty tier configuration
 * @param tiersEnabled - Whether tiers are enabled for this shop
 * @returns Multiplier value (e.g., 1.0, 1.2, 1.5, 2.0)
 */
export function getTierMultiplier(
  totalEarned: number,
  tiers: LoyaltyTiers | null | undefined,
  tiersEnabled: boolean | undefined
): number {
  if (!tiersEnabled || !tiers) return 1.0

  if (totalEarned >= (tiers.platinum.min ?? 3000)) return tiers.platinum.multiplier
  if (totalEarned >= (tiers.gold.min ?? 1500)) return tiers.gold.multiplier
  if (totalEarned >= (tiers.silver.min ?? 500)) return tiers.silver.multiplier
  return tiers.bronze.multiplier
}
