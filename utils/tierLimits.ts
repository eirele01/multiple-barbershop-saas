import type { SubscriptionPlan, TierLimitCheck } from '~/types/database'
import { TIER_LIMITS } from '~/constants/tierLimits'

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
  plan: SubscriptionPlan | string,
  resource: TierLimitResource,
  currentCount: number
): TierLimitCheck {
  // Dynamic plans (Tier Maker) may add codes not present in the static map.
  // Fall back to Basic limits so nothing crashes for unknown/custom plans;
  // server-side enforcement uses the DB `plans` table via getPlanLimits().
  const limits = TIER_LIMITS[plan as SubscriptionPlan] ?? TIER_LIMITS.basic
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
    services: `services`,
    gallery: `gallery images`,
    products: `products`,
    staff: `staff members`,
  }

  return `You've reached the maximum of ${limit} ${resourceNames[resource]} on your current plan. Upgrade to a higher plan for more!`
}

/**
 * Generate a message showing how many more items can be added.
 */
function getRemainingMessage(resource: TierLimitResource, remaining: number): string {
  if (remaining <= 2) {
    return `You can add ${remaining} more ${resource} on your current plan. Consider upgrading for more.`
  }
  return ''
}

/**
 * Check if a premium-only feature is accessible.
 * Premium features: PayMongo, Email Notifications, Loyalty Program.
 * Any paid plan qualifies — 'basic' is the canonical free/default plan code.
 */
export function isUpgradedFeatureAccessible(plan: SubscriptionPlan | string): boolean {
  return plan !== 'basic'
}

/**
 * Get the activity log retention days based on plan.
 * Basic: 7 days, Upgraded: 90 days
 */
export function getLogRetentionDays(plan: SubscriptionPlan): number {
  return plan === 'basic' ? 7 : 90
}
