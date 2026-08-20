/**
 * Admin Middleware — protects admin panel routes.
 * Only users with admin, manager, cashier, or barber roles can access.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = await useAuthMiddlewareGuards(to)
  if (!auth.canAccessAdmin) {
    return navigateTo('/', { replace: true })
  }
})
