/**
 * JS Day-of-Week to Day-Name Mapping
 *
 * JavaScript's Date.getDay() returns 0=Sunday, 1=Monday, ..., 6=Saturday.
 * Our database stores working_hours with day names like 'monday', 'tuesday', etc.
 *
 * This shared utility ensures consistent mapping across:
 * - Client: pages/shop/[slug]/book.vue (calendar disabled days)
 * - Server: server/api/bookings/availability.get.ts (schedule lookup)
 * - Server: server/api/bookings/create.post.ts (race condition check)
 * - Composable: composables/useShopStatus.ts (shop open/closed status)
 */
export const JS_DAY_TO_NAME: readonly string[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

/**
 * Reverse mapping: day name → JS getDay() index
 * Example: DAY_NAME_TO_JS['monday'] === 1
 */
export const DAY_NAME_TO_JS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}
