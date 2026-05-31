import { defineStore } from 'pinia'
import type { Shop, SubscriptionPlan } from '~/types/database'

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
     * Is the current shop on the Basic plan?
     */
    isBasicPlan: (state): boolean => state.currentShop?.plan === 'basic',

    /**
     * Is the current shop on the Upgraded plan?
     */
    isUpgradedPlan: (state): boolean => state.currentShop?.plan === 'upgraded',

    /**
     * Is PayMongo enabled for this shop? (Upgraded only)
     */
    isPayMongoEnabled: (state): boolean =>
      state.currentShop?.plan === 'upgraded' && state.currentShop.paymongo_enabled,

    /**
     * Is loyalty enabled for this shop? (Upgraded only)
     */
    isLoyaltyEnabled: (state): boolean =>
      state.currentShop?.plan === 'upgraded' && state.currentShop.loyalty_enabled,

    /**
     * Is email notification enabled for this shop? (Upgraded only)
     */
    isEmailEnabled: (state): boolean =>
      state.currentShop?.plan === 'upgraded' &&
      !!(state.currentShop?.resend_api_key && state.currentShop?.sender_email),

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
      } catch (error) {
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
      } catch (error) {
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
