/**
 * Customer Middleware — protects customer portal routes.
 * Only users with the customer role can access.
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
    return navigateTo('/login?role=customer', {
      query: { redirect: to.fullPath },
    })
  }

  if (!authStore.isCustomer) {
    return navigateTo('/', { replace: true })
  }
})
