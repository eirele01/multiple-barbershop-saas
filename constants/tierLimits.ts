/**
 * Tier limit configuration — maps subscription plans to resource limits
 */
import type { SubscriptionPlan } from '~/types/database'

export interface TierLimit {
  services: number
  gallery: number
  products: number
  staff: number
}

export const TIER_LIMITS: Record<SubscriptionPlan, TierLimit> = {
  basic: {
    services: 10,
    gallery: 20,
    products: 10,
    staff: 5,
  },
  upgraded: {
    services: Infinity,
    gallery: Infinity,
    products: Infinity,
    staff: Infinity,
  },
}
