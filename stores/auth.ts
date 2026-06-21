/**
 * Auth Store — manages user authentication state
 *
 * Stores user profile data and authentication status.
 * Session persistence is handled by Supabase (localStorage).
 * Pinia's state hydration is managed by the auth-hydration plugin.
 */
import { defineStore } from 'pinia'
import type { User, UserRole } from '~/types/database'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  initialized: boolean
  accessToken: string | null
  isImpersonating: boolean
  impersonatedShopName: string | null
  impersonatedBy: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    initialized: false,
    accessToken: null,
    isImpersonating: false,
    impersonatedShopName: null,
    impersonatedBy: null,
  }),

  getters: {
    role: (state): UserRole | null => state.user?.role ?? null,
    shopId: (state): string | null => state.user?.shop_id ?? null,
    isSuperAdmin: (state): boolean => state.user?.role === 'super_admin',
    isAdmin: (state): boolean => state.user?.role === 'admin',
    isShopStaff: (state): boolean =>
      state.user?.role
        ? ['admin', 'manager', 'cashier', 'barber'].includes(state.user.role)
        : false,
    isCustomer: (state): boolean => state.user?.role === 'customer',
    canAccessAdmin: (state): boolean =>
      state.user?.role
        ? ['admin', 'manager', 'cashier', 'barber'].includes(state.user.role)
        : false,
    canAccessSuperAdmin: (state): boolean => state.user?.role === 'super_admin',
    displayName: (state): string => state.user?.display_name ?? 'User',
    defaultRedirect(): string {
      if (this.user?.role === 'super_admin') return '/super-admin/dashboard'
      if (this.user?.role === 'customer') return '/customer/dashboard'
      if (['admin', 'manager', 'cashier', 'barber'].includes(this.user?.role || '')) return '/admin/dashboard'
      return '/login'
    },
  },

  actions: {
    async initialize() {
      if (this.initialized) return

      if (import.meta.server) {
        this.isLoading = false
        this.initialized = true
        return
      }

      const supabase = useSupabase()

      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          this.accessToken = session.access_token
          await this.fetchUserProfile(session.user.id)
        }
      } catch (err) {
        console.error('Error getting session:', err)
      }

      // Listen for auth state changes (token refresh, sign in/out)
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          this.accessToken = session.access_token
          await this.fetchUserProfile(session.user.id)
        } else {
          this.accessToken = null
          this.clearUser()
        }
      })

      this.isLoading = false
      this.initialized = true
    },

    async fetchUserProfile(userId: string) {
      const supabase = useSupabase()

      const { data, error } = await supabase
        .from('users')
        .select('id, email, display_name, phone_number, photo_url, role, shop_id, is_active, created_at, last_login_at')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error fetching user profile:', error)
        this.clearUser()
        return
      }

      this.user = { ...data } as User
      this.isAuthenticated = true
    },

    async signIn(email: string, password: string) {
      const supabase = useSupabase()

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw new Error(error.message)
      }

      if (data.user) {
        this.accessToken = data.session?.access_token || null
        await this.fetchUserProfile(data.user.id)
      }
    },

    async signUp(email: string, password: string, displayName: string, role: UserRole = 'customer', shopId?: string) {
      const supabase = useSupabase()

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        throw new Error(error.message)
      }

      if (data.user) {
        const { error: profileError } = await supabase.from('users').insert({
          id: data.user.id,
          email,
          display_name: displayName,
          role,
          shop_id: shopId || null,
        })

        if (profileError) {
          console.error('Error creating user profile:', profileError)
          throw new Error('Failed to create user profile')
        }

        await this.fetchUserProfile(data.user.id)
      }
    },

    async signOut() {
      const supabase = useSupabase()

      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error('Error signing out:', error)
      }

      this.accessToken = null
      this.clearUser()
      await navigateTo('/login')
    },

    clearUser() {
      this.user = null
      this.isAuthenticated = false
    },

    async startImpersonation(token: string) {
      try {
        const result = await $fetch('/api/super-admin/impersonate/validate', {
          method: 'POST',
          body: { token },
        }) as any

        if (result.valid) {
          this.isImpersonating = true
          this.impersonatedShopName = result.shopName
          this.impersonatedBy = result.impersonatedBy

          await this.fetchUserProfile(result.shopAdminUserId)

          const shopStore = useShopStore()
          await shopStore.fetchShopById(result.shopId)
        } else {
          throw new Error('Invalid or expired impersonation token')
        }
      } catch (error: any) {
        console.error('Impersonation failed:', error)
        throw error
      }
    },

    async exitImpersonation() {
      this.isImpersonating = false
      this.impersonatedShopName = null
      this.impersonatedBy = null

      const supabase = useSupabase()
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        await this.fetchUserProfile(session.user.id)
      } else {
        this.user = null
        this.isAuthenticated = false
        navigateTo('/login')
        return
      }

      navigateTo('/super-admin/shops')
    },

    hasPermission(permission: string): boolean {
      if (!this.user) return false

      const role = this.user.role

      if (role === 'super_admin') return true

      const permissionMatrix: Record<UserRole, string[]> = {
        super_admin: ['*'],
        admin: [
          'shop.view_dashboard',
          'shop.edit_settings',
          'shop.manage_paymongo',
          'shop.manage_payment_methods',
          'shop.verify_payments',
          'shop.view_bookings',
          'shop.create_booking',
          'shop.cancel_booking',
          'staff.add',
          'staff.edit',
          'staff.delete',
          'staff.assign_roles',
          'cms.services',
          'cms.gallery',
          'cms.products',
          'cms.inventory',
          'loyalty.configure',
          'loyalty.view_points',
          'loyalty.adjust_points',
          'loyalty.redeem_points',
          'reports.view_logs',
          'reports.view_financial',
          'reports.export',
        ],
        manager: [
          'shop.view_dashboard',
          'shop.edit_settings',
          'shop.manage_payment_methods',
          'shop.verify_payments',
          'shop.view_bookings',
          'shop.create_booking',
          'shop.cancel_booking',
          'staff.add',
          'staff.edit',
          'cms.services',
          'cms.gallery',
          'cms.products',
          'cms.inventory',
          'loyalty.view_points',
          'loyalty.adjust_points',
          'loyalty.redeem_points',
          'reports.view_logs',
          'reports.view_financial',
          'reports.export',
        ],
        cashier: [
          'shop.view_dashboard',
          'shop.verify_payments',
          'shop.view_bookings',
          'shop.create_booking',
          'shop.cancel_booking',
          'cms.products',
          'cms.inventory',
          'loyalty.view_points',
          'loyalty.redeem_points',
          'reports.view_financial',
        ],
        barber: [
          'shop.view_dashboard',
          'shop.view_bookings',
          'shop.create_booking',
          'barber.set_availability',
          'barber.view_own_bookings',
          'barber.update_booking_status',
        ],
        customer: [
          'customer.book',
          'customer.view_bookings',
          'customer.cancel_booking',
          'customer.view_loyalty',
          'customer.redeem_rewards',
        ],
      }

      const allowed = permissionMatrix[role] || []
      return allowed.includes(permission)
    },
  },
})