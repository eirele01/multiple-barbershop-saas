/**
 * useAuthMiddlewareGuards — shared boilerplate for auth-based route middleware.
 *
 * Eliminates the 5-line repeat (init, SSR skip, auth check) across every
 * role middleware. Each middleware becomes a 3-liner instead of ~25.
 *
 * Usage:
 *   export default defineNuxtRouteMiddleware(async (to) => {
 *     const auth = await useAuthMiddlewareGuards(to)
 *     if (!auth.canAccessAdmin) return navigateTo('/', { replace: true })
 *   })
 */

export async function useAuthMiddlewareGuards(to: RouteLocation) {
  const authStore = useAuthStore()

  if (!authStore.initialized) {
    await authStore.initialize()
  }

  // Skip redirects during SSR — auth state isn't available
  if (import.meta.server) return authStore

  if (!authStore.isAuthenticated) {
    return navigateTo('/login', {
      query: { redirect: to.fullPath },
    })
  }

  return authStore
}
