/**
 * Role-based Middleware — checks if the user has a specific role.
 *
 * IMPORTANT: Redirects are client-side only. During SSR, the auth
 * session is not available (localStorage), so we skip redirects
 * to prevent hydration mismatches.
 *
 * Usage:
 *   definePageMeta({
 *     middleware: [
 *       'auth',
 *       (to, from) => roleMiddleware('admin', 'manager')
 *     ]
 *   })
 *
 * Or use the composable:
 *   definePageMeta({
 *     middleware: 'role:admin,manager'
 *   })
 */
export function roleMiddleware(...allowedRoles: string[]) {
  return defineNuxtRouteMiddleware(() => {
    // Skip redirects during SSR — auth state isn't available
    if (import.meta.server) return

    const authStore = useAuthStore()

    if (!authStore.isAuthenticated || !authStore.role) {
      return navigateTo('/login')
    }

    if (!allowedRoles.includes(authStore.role)) {
      return navigateTo('/')
    }
  })
}
