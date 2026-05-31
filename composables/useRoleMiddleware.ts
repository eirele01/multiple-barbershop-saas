/**
 * Role-based Middleware — checks if the user has a specific role.
 *
 * Usage:
 *   definePageMeta({
 *     middleware: [
 *       'auth',
 *       (to, from) => roleMiddleware('admin', 'manager')
 *     ]
 *   })
 */
export function roleMiddleware(...allowedRoles: string[]) {
  return defineNuxtRouteMiddleware(() => {
    const authStore = useAuthStore()

    if (!authStore.isAuthenticated || !authStore.role) {
      return navigateTo('/login')
    }

    if (!allowedRoles.includes(authStore.role)) {
      return navigateTo('/')
    }
  })
}
