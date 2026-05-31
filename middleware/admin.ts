/**
 * Admin Middleware — protects admin panel routes.
 * Only users with admin, manager, cashier, or barber roles can access.
 * Redirects to /login if not authenticated, or / if not authorized.
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

  if (!authStore.canAccessAdmin) {
    return navigateTo('/', { replace: true })
  }
})
