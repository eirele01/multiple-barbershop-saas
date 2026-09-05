/**
 * Tier limit configuration — maps subscription plans to resource limits.
 *
 * ⚠️ This static map is the CLIENT-SIDE FALLBACK only. The source of truth
 * is the `plans` table (Tier Maker, migration 019) — server-side enforcement
 * reads it via getPlanLimits() in utils/server/plans.ts.
 *
 * Keyed by plan code (string, not the narrow SubscriptionPlan union) so plans
 * created in the Tier Maker can be added here without a type change.
 * Keep these values in sync with the seeded rows in migration 019.
 */
export interface TierLimit {
  services: number
  gallery: number
  products: number
  staff: number
}

export const TIER_LIMITS: Record<string, TierLimit> = {
  basic: {
    services: 5,
    gallery: 10,
    products: 5,
    staff: 2,
  },
  upgraded: {
    services: 10,
    gallery: 20,
    products: 10,
    staff: 5,
  },
  pro: {
    services: 20,
    gallery: 40,
    products: 20,
    staff: 10,
  },
}
