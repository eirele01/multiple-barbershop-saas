/**
 * Guest Middleware — redirects authenticated users away from login/register pages.
 * If a user is already logged in, they are sent to their appropriate dashboard.
 *
 * IMPORTANT: Redirects are client-side only. During SSR, the auth
 * session is not available (localStorage), so we skip redirects
 * to prevent hydration mismatches.
 */
export default defineNuxtRouteMiddleware(async () => {
  const authStore = useAuthStore()

  // Wait for auth to initialize
  if (!authStore.initialized) {
    await authStore.initialize()
  }

  // Skip redirects during SSR — auth state isn't available
  if (import.meta.server) return

  if (authStore.isAuthenticated) {
    return navigateTo(authStore.defaultRedirect, { replace: true })
  }
})
