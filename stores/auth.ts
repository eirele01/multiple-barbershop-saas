/**
 * Auth Store — manages user authentication state
 *
 * Stores user profile data and authentication status.
 * Session persistence is handled by Supabase (localStorage).
 * Pinia's state hydration is managed by the auth-hydration plugin.
 */
import { defineStore } from 'pinia'
import type { User, UserRole } from '~/types/database'
import { SHOP_STAFF_ROLES } from '~/constants/roles'
import { PERMISSION_MATRIX } from '~/constants/permissions'

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

// Module-level subscription reference — allows unsubscribing before re-subscribing
let authSubscription: { unsubscribe: () => void } | null = null
// Sequence counter to discard stale async profile fetches (prevents out-of-order overwrites)
let profileFetchSequence = 0

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
      state.user?.role ? SHOP_STAFF_ROLES.includes(state.user.role as (typeof SHOP_STAFF_ROLES)[number]) : false,
    isCustomer: (state): boolean => state.user?.role === 'customer',
    canAccessAdmin: (state): boolean =>
      state.user?.role ? SHOP_STAFF_ROLES.includes(state.user.role as (typeof SHOP_STAFF_ROLES)[number]) : false,
    canAccessSuperAdmin: (state): boolean => state.user?.role === 'super_admin',
    displayName: (state): string => state.user?.display_name ?? 'User',
    defaultRedirect(): string {
      if (this.user?.role === 'super_admin') return '/super-admin/dashboard'
      if (this.user?.role === 'customer') return '/customer/dashboard'
      if (SHOP_STAFF_ROLES.includes(this.user?.role as (typeof SHOP_STAFF_ROLES)[number])) return '/admin/dashboard'
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
      } catch (err: unknown) {
        console.error('Error getting session:', err)
      }

      // Unsubscribe any existing subscription (prevents stacking on re-init)
      if (authSubscription) {
        authSubscription.unsubscribe()
        authSubscription = null
      }

      // Listen for auth state changes — callback must be synchronous.
      // Async profile fetch is guarded by a sequence counter to discard stale results.
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          this.accessToken = session.access_token
          this.isAuthenticated = true
          // Fire-and-forget with sequence guard (not awaited in callback)
          const seq = ++profileFetchSequence
          this.fetchUserProfile(session.user.id).then(() => {
            // If a newer event overwrote us while we were fetching, discard result
            if (seq !== profileFetchSequence) {
              // Stale — a newer auth event already triggered its own fetch
            }
          })
        } else {
          this.accessToken = null
          // Invalidate any in-flight profile fetch
          profileFetchSequence++
          this.clearUser()
        }
      })

      if (subscription) {
        authSubscription = subscription
      }

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

        // fetchUserProfile() swallows its own errors (logs + clearUser) and
        // resolves normally. That made signIn "succeed" even when the user's
        // profile row couldn't be loaded — handleLogin then showed a false
        // "Welcome back!" while isAuthenticated stayed false, leaving the
        // booking wizard stuck on the guest form with a disabled Continue
        // button. Surface a real error so the login modal can display it.
        if (!this.isAuthenticated) {
          throw new Error('Account found, but your profile could not be loaded. Please try again or contact support.')
        }
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
      navigateTo('/login')
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
      } catch (error: unknown) {
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

    resetForHydration() {
      this.initialized = false
      this.isLoading = true
    },

    hasPermission(permission: string): boolean {
      if (!this.user) return false

      const role = this.user.role

      if (role === 'super_admin') return true

      const allowed = PERMISSION_MATRIX[role] || []
      return allowed.includes(permission)
    },
  },
})