/**
 * Customer Middleware — protects customer portal routes.
 * Only users with the customer role can access.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()
  if (!authStore.initialized) {
    await authStore.initialize()
  }
  if (import.meta.server) return

  if (!authStore.isAuthenticated) {
    return navigateTo('/login', {
      query: { redirect: to.fullPath, role: 'customer' },
    })
  }
  if (!authStore.isCustomer) {
    return navigateTo(authStore.defaultRedirect, { replace: true })
  }
})
