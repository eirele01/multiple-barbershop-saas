/**
 * Application-wide constants and configuration.
 * Centralizes hardcoded values that were previously duplicated
 * across pages, composables, and server routes.
 */

// ─── Currency ──────────────────────────────────────────

export const CURRENCY_SYMBOL = '\u20b1' // ₱
export const CURRENCY_CODE = 'PHP'
export const CURRENCY_LOCALE = 'en-PH' as const

// ─── Platform Identity ─────────────────────────────────

export const PLATFORM_SENDER_EMAIL = 'notifications@reservationph.com'
export const PLATFORM_SENDER_NAME = 'BarberShop SaaS'
export const FOOTER_POWERED_BY = 'Powered by BarberShop SaaS'

// ─── Pagination Defaults ───────────────────────────────

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// ─── Time Defaults ─────────────────────────────────────

export const DEFAULT_BOOKING_BUFFER_MINS = 15
export const DEFAULT_SLOT_DURATION_MINS = 30

// ─── Toast Defaults ────────────────────────────────────

export const TOAST_DURATION_MS = 4000
export const TOAST_ERROR_DURATION_MS = 6000

// ─── Storage ───────────────────────────────────────────

export const PAYMENT_PROOFS_BUCKET = 'payment-proofs'
export const MAX_UPLOAD_SIZE_MB = 5
export const ALLOWED_PROOF_MIMES = ['image/jpeg', 'image/png', 'application/pdf'] as const
