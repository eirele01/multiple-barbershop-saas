// ============================================
// TypeScript Types for Barbershop SaaS
// Based on Section 7: Data Models
// ============================================

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'cashier' | 'barber' | 'customer'

export type SubscriptionPlan = 'basic' | 'upgraded'

export type PlanStatus = 'active' | 'inactive' | 'trial'

export type BookingStatus = 'pending' | 'pending_payment' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

export type PaymentMethodType = 'gcash_manual' | 'maya_manual' | 'bank_transfer' | 'gcash_paymongo' | 'maya_paymongo' | 'instapay' | 'qrph'

export type PaymentType = 'manual' | 'paymongo'

export type PaymentStatus = 'pending' | 'pending_verification' | 'paid' | 'verified' | 'rejected' | 'refunded' | 'failed'

export type PaymentMethodCategory = 'qr_code' | 'bank_account' | 'e_wallet'

export type ServiceCategory = 'haircut' | 'beard' | 'shave' | 'treatment' | 'package' | 'other'

export type LoyaltyPointsType = 'earned' | 'redeemed' | 'adjusted' | 'expired' | 'welcome_bonus'

export type LoyaltyRewardType = 'discount_fixed' | 'discount_percent' | 'free_service' | 'free_product'

export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'more_info'

// ============================================
// Database Row Types
// ============================================

export interface User {
  id: string
  email: string
  display_name: string
  phone_number: string | null
  photo_url: string | null
  role: UserRole
  shop_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  last_login_at: string | null
}

export interface BookingSettings {
  slot_duration: number
  buffer_time: number
  max_advance_days: number
  cancellation_hours: number
  require_deposit: boolean
  deposit_percentage: number
}

export interface WorkingHoursDay {
  day: string
  open: string
  close: string
  is_open: boolean
}

export interface LoyaltyTiers {
  bronze: { min: number; max: number; multiplier: number }
  silver: { min: number; max: number; multiplier: number }
  gold: { min: number; max: number; multiplier: number }
  platinum: { min: number; max: number | null; multiplier: number }
}

export interface Shop {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  cover_image_url: string | null
  owner_id: string | null

  // Subscription
  plan: SubscriptionPlan
  plan_status: PlanStatus
  plan_start_date: string | null
  plan_end_date: string | null

  // Contact
  email: string | null
  phone: string | null
  address_street: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  address_country: string
  latitude: number | null
  longitude: number | null

  // Social
  facebook_url: string | null
  instagram_url: string | null
  tiktok_url: string | null

  // Theme
  primary_color: string
  accent_color: string
  background_color: string
  font_family: string

  // Settings
  booking_settings: BookingSettings
  working_hours: WorkingHoursDay[]
  timezone: string

  // Payment (Upgraded)
  paymongo_enabled: boolean
  manual_payment_enabled: boolean
  paymongo_public_key: string | null
  paymongo_secret_key: string | null
  gcash_enabled: boolean
  maya_enabled: boolean
  instapay_enabled: boolean
  qr_ph_enabled: boolean
  paymongo_webhook_secret: string | null
  paymongo_test_mode: boolean
  paymongo_webhook_url: string | null

  // Email (Upgraded)
  resend_api_key: string | null
  sender_email: string | null
  sender_name: string | null
  email_confirmation: boolean
  email_reminder: boolean
  reminder_hours: number[]

  // Loyalty (Upgraded)
  loyalty_enabled: boolean
  loyalty_earn_rate: number
  loyalty_earn_base: number
  loyalty_welcome_bonus: number
  loyalty_expiry_months: number
  loyalty_tiers_enabled: boolean
  loyalty_tiers: LoyaltyTiers

  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PaymentMethod {
  id: string
  shop_id: string
  name: string
  type: PaymentMethodCategory
  qr_code_url: string | null
  account_name: string | null
  account_number: string | null
  bank_name: string | null
  instructions: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Service {
  id: string
  shop_id: string
  name: string
  description: string | null
  category: ServiceCategory
  duration_mins: number
  price: number
  deposit_amount: number
  image_url: string | null
  barber_ids: string[]
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface BarberSchedule {
  start: string
  end: string
  is_working: boolean
  breaks: Array<{ start: string; end: string }>
}

export interface BarberTimeOff {
  start_date: string
  end_date: string
  reason: string
}

export interface Barber {
  id: string
  user_id: string
  shop_id: string
  bio: string | null
  specialties: string[]
  experience_yrs: number | null
  portfolio_urls: string[]
  schedule: Record<string, BarberSchedule>
  time_off: BarberTimeOff[]
  rating: number
  total_reviews: number
  is_active: boolean
  is_available: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  shop_id: string
  name: string
  description: string | null
  category: string | null
  price: number
  cost_price: number | null
  sku: string | null
  barcode: string | null
  image_url: string | null
  image_urls: string[]
  stock: number
  low_stock_threshold: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface GalleryImage {
  id: string
  shop_id: string
  url: string
  thumbnail_url: string | null
  caption: string | null
  category: string | null
  tags: string[]
  barber_id: string | null
  service_id: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  booking_ref: string
  shop_id: string
  customer_id: string | null
  barber_id: string
  service_id: string

  // Service snapshot
  service_name: string
  service_price: number
  service_duration: number

  // Appointment
  date: string
  start_time: string
  end_time: string

  // Status
  status: BookingStatus

  // Payment
  payment_method: PaymentMethodType | null
  payment_type: PaymentType | null
  payment_status: PaymentStatus
  payment_amount: number | null
  payment_method_id: string | null
  proof_image_url: string | null
  reference_number: string | null
  paymongo_payment_id: string | null
  verified_by: string | null
  verified_at: string | null
  rejection_reason: string | null
  paid_at: string | null

  // Loyalty
  points_earned: number          // Actual earned points (set on completion)
  points_redeemed: number        // INTENT field — not deducted until completion
  reward_id: string | null       // Selected reward (set at booking creation)
  discount_applied: number       // Discount from reward (applied to payment_amount)

  // Other
  customer_notes: string | null
  internal_notes: string | null
  reminder_sent: boolean
  confirmation_sent: boolean
  cancellation_reason: string | null
  cancelled_by: string | null
  cancelled_at: string | null

  // Review
  rating: number | null
  review: string | null
  reviewed_at: string | null

  created_at: string
  updated_at: string
}

export interface PaymentVerification {
  id: string
  shop_id: string
  booking_id: string
  customer_id: string
  payment_method_id: string
  amount: number
  proof_image_url: string
  reference_number: string | null
  status: VerificationStatus
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  info_request_msg: string | null
  created_at: string
  updated_at: string
}

export interface LoyaltyReward {
  id: string
  shop_id: string
  name: string
  description: string | null
  type: LoyaltyRewardType
  points_required: number
  discount_value: number | null
  discount_percent: number | null
  service_id: string | null
  product_id: string | null
  max_value: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LoyaltyPoint {
  id: string
  shop_id: string
  customer_id: string
  booking_id: string | null
  reward_id: string | null
  type: LoyaltyPointsType
  points: number
  balance_after: number
  note: string | null
  expires_at: string | null
  created_at: string
}

export interface ActivityLog {
  id: string
  shop_id: string | null
  user_id: string
  user_email: string
  user_role: string
  action: string
  entity_type: string | null
  entity_id: string | null
  entity_name: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface Review {
  id: string
  shop_id: string
  booking_id: string
  customer_id: string
  barber_id: string
  service_id: string
  rating: number
  comment: string | null
  is_public: boolean
  reply_message: string | null
  replied_by: string | null
  replied_at: string | null
  created_at: string
  updated_at: string
}

// ============================================
// Tier Limit Configuration
// ============================================

export interface TierLimit {
  services: number    // Basic: 10, Upgraded: Infinity
  gallery: number     // Basic: 20, Upgraded: Infinity
  products: number    // Basic: 10, Upgraded: Infinity
  staff: number       // Basic: 5, Upgraded: Infinity
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

// ============================================
// Platform Settings
// ============================================

export interface PlatformSettings {
  id: string
  key: string
  value: string | null
  updated_at: string
}

export interface PlatformSettingsMap {
  platform_name: string
  platform_url: string
  support_email: string
  upgraded_monthly_price: string
  upgraded_yearly_price: string
  maintenance_mode: string
  maintenance_message: string
}

// ============================================
// API Response Types
// ============================================

export interface TierLimitCheck {
  allowed: boolean
  current: number
  limit: number
  message: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
