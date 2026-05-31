/**
 * Auth Middleware — protects routes that require authentication.
 * Redirects unauthenticated users to /login.
 *
 * NOTE: auth.global.ts already handles auth checks for all routes.
 * This middleware exists as a named middleware for pages that want
 * to explicitly declare auth dependency in definePageMeta.
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
})
