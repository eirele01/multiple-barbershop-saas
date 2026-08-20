/**
 * Role constants — single source of truth for role arrays
 * used across auth store, middleware, and server routes.
 */

/** Roles that have access to the shop admin panel */
export const SHOP_STAFF_ROLES = ['admin', 'manager', 'cashier', 'barber'] as string[]

/** Roles that can view/modify payment verifications */
export const PAYMENT_VERIFICATION_ROLES = ['admin', 'manager', 'cashier'] as const

/** Roles that can modify shop settings */
export const SETTINGS_ADMIN_ROLES = ['admin', 'manager'] as const
