import type { SubscriptionPlan, TierLimitCheck } from '~/types/database'
import { TIER_LIMITS } from '~/types/database'

type TierLimitResource = 'services' | 'gallery' | 'products' | 'staff'

/**
 * Check if a shop can add more of a given resource based on their tier.
 * This is the core enforcement function described in Section 4.
 *
 * @param plan - The shop's subscription plan ('basic' or 'upgraded')
 * @param resource - The resource type to check
 * @param currentCount - The current number of this resource
 * @returns TierLimitCheck with allowed status and message
 */
export function checkTierLimit(
  plan: SubscriptionPlan,
  resource: TierLimitResource,
  currentCount: number
): TierLimitCheck {
  const limits = TIER_LIMITS[plan]
  const limit = limits[resource]

  // Upgraded plan has no limits
  if (limit === Infinity) {
    return {
      allowed: true,
      current: currentCount,
      limit: Infinity,
      message: '',
    }
  }

  // Check if current count has reached the limit
  if (currentCount >= limit) {
    return {
      allowed: false,
      current: currentCount,
      limit,
      message: getLimitMessage(resource, limit),
    }
  }

  return {
    allowed: true,
    current: currentCount,
    limit,
    message: getRemainingMessage(resource, limit - currentCount),
  }
}

/**
 * Generate a user-friendly message when a limit is hit.
 * Shows an upgrade prompt, NOT a generic error — as per Section 4.
 */
function getLimitMessage(resource: TierLimitResource, limit: number): string {
  const resourceNames: Record<TierLimitResource, string> = {
    services: `You've reached the maximum of ${limit} services on the Basic plan`,
    gallery: `You've reached the maximum of ${limit} gallery images on the Basic plan`,
    products: `You've reached the maximum of ${limit} products on the Basic plan`,
    staff: `You've reached the maximum of ${limit} staff members on the Basic plan`,
  }

  return `${resourceNames[resource]}. Upgrade to the Upgraded plan for unlimited ${resource}!`
}

/**
 * Generate a message showing how many more items can be added.
 */
function getRemainingMessage(resource: TierLimitResource, remaining: number): string {
  if (remaining <= 2) {
    return `You can add ${remaining} more ${resource} on the Basic plan. Consider upgrading for unlimited.`
  }
  return ''
}

/**
 * Check if an upgraded-only feature is accessible.
 * Upgraded-only features: PayMongo, Email Notifications, Loyalty Program
 */
export function isUpgradedFeatureAccessible(plan: SubscriptionPlan): boolean {
  return plan === 'upgraded'
}

/**
 * Get the activity log retention days based on plan.
 * Basic: 7 days, Upgraded: 90 days
 */
export function getLogRetentionDays(plan: SubscriptionPlan): number {
  return plan === 'basic' ? 7 : 90
}
