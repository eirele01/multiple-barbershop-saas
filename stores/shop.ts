import { defineStore } from 'pinia'
import type { Shop, SubscriptionPlan, PlanStatus, BillingInterval } from '~/types/database'

/** Grace period (days) after plan_end_date during which features still work. */
export const PLAN_GRACE_PERIOD_DAYS = 7

interface ShopState {
  currentShop: Shop | null
  isLoading: boolean
}

export const useShopStore = defineStore('shop', {
  state: (): ShopState => ({
    currentShop: null,
    isLoading: false,
  }),

  getters: {
    /**
     * The current shop's subscription plan
     */
    plan: (state): SubscriptionPlan | null => state.currentShop?.plan ?? null,

    /**
     * The current shop's subscription status (active / inactive / trial)
     */
    planStatus: (state): PlanStatus | null => state.currentShop?.plan_status ?? null,

    /**
     * Billing interval of the last payment (monthly | yearly)
     */
    billingInterval: (state): BillingInterval => state.currentShop?.billing_interval ?? 'monthly',

    /**
     * When the paid plan expires (null = no expiry — free plan or manual grant)
     */
    planEndDate: (state): string | null => state.currentShop?.plan_end_date ?? null,

    /**
     * Days until plan_end_date. Null = no expiry. Negative = expired.
     */
    planDaysRemaining: (state): number | null => {
      const end = state.currentShop?.plan_end_date
      if (!end) return null
      return Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000)
    },

    /**
     * True once plan_end_date has passed.
     */
    planExpired: (state): boolean => {
      const end = state.currentShop?.plan_end_date
      return !!end && new Date(end).getTime() < Date.now()
    },

    /**
     * Expired but still inside the grace window — features keep working.
     */
    planInGrace: (state): boolean => {
      const end = state.currentShop?.plan_end_date
      if (!end) return false
      const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000)
      return days < 0 && days >= -PLAN_GRACE_PERIOD_DAYS
    },

    /**
     * The plan actually enforced for limits/features.
     * Expired-beyond-grace paid plans fall back to 'basic'.
     */
    effectivePlan: (state): SubscriptionPlan => {
      const end = state.currentShop?.plan_end_date
      if (end) {
        const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000)
        if (days < -PLAN_GRACE_PERIOD_DAYS) return 'basic'
      }
      return state.currentShop?.plan || 'basic'
    },

    /**
     * Is the current shop effectively on the free/default plan?
     * (true also when a paid plan expired beyond the grace window)
     */
    isBasicPlan(): boolean {
      return this.effectivePlan === 'basic'
    },

    /**
     * Is the current shop on ANY paid plan (upgraded, pro, or any Tier-Maker
     * plan with a price)? False once a paid plan expires beyond grace.
     * 'basic' is the canonical free/default plan code.
     */
    isUpgradedPlan(): boolean {
      return this.effectivePlan !== 'basic'
    },

    /**
     * Is PayMongo enabled for this shop? (Any paid plan, not expired)
     */
    isPayMongoEnabled(): boolean {
      return this.effectivePlan !== 'basic' && !!this.currentShop?.paymongo_enabled
    },

    /**
     * Is loyalty enabled for this shop? (Any paid plan, not expired)
     */
    isLoyaltyEnabled(): boolean {
      return this.effectivePlan !== 'basic' && !!this.currentShop?.loyalty_enabled
    },

    /**
     * Is email notification enabled for this shop? (Any paid plan, not expired)
     */
    isEmailEnabled(): boolean {
      return this.effectivePlan !== 'basic' &&
        !!(this.currentShop?.resend_api_key && this.currentShop?.sender_email)
    },

    /**
     * Shop slug
     */
    slug: (state): string | null => state.currentShop?.slug ?? null,

    /**
     * Shop name
     */
    name: (state): string | null => state.currentShop?.name ?? null,
  },

  actions: {
    /**
     * Fetch the shop by ID
     */
    async fetchShopById(shopId: string) {
      const supabase = useSupabase()
      this.isLoading = true

      try {
        const { data, error } = await supabase
          .from('shops')
          .select('*')
          .eq('id', shopId)
          .single()

        if (error) throw error

        this.currentShop = data as Shop
      } catch (error: unknown) {
        console.error('Error fetching shop:', error)
        this.currentShop = null
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Fetch the shop by slug (for public pages)
     */
    async fetchShopBySlug(slug: string) {
      const supabase = useSupabase()
      this.isLoading = true

      try {
        const { data, error } = await supabase
          .from('shops')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .single()

        if (error) throw error

        this.currentShop = data as Shop
      } catch (error: unknown) {
        console.error('Error fetching shop by slug:', error)
        this.currentShop = null
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Load the current user's shop (from auth store's shop_id)
     */
    async loadCurrentShop() {
      const authStore = useAuthStore()

      if (!authStore.shopId) {
        this.currentShop = null
        return
      }

      await this.fetchShopById(authStore.shopId)
    },

    /**
     * Clear the current shop
     */
    clearShop() {
      this.currentShop = null
    },
  },
})
