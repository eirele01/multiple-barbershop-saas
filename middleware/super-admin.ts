/**
 * Super Admin Middleware — protects super admin panel routes.
 * Only users with the super_admin role can access.
 *
 * IMPORTANT: Redirects are client-side only. During SSR, the auth
 * session is not available (localStorage), so we skip redirects
 * to prevent hydration mismatches.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()

  // Wait for auth to initialize
  if (!authStore.initialized) {
    await authStore.initialize()
  }

  // Skip redirects during SSR — auth state isn't available
  if (import.meta.server) return

  if (!authStore.isAuthenticated) {
    return navigateTo('/login', {
      query: { redirect: to.fullPath },
    })
  }

  if (!authStore.canAccessSuperAdmin) {
    return navigateTo('/', { replace: true })
  }
})
