/**
 * Super Admin Middleware — protects super admin panel routes.
 * Only users with the super_admin role can access.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = await useAuthMiddlewareGuards(to)
  if (!auth.canAccessSuperAdmin) {
    return navigateTo('/', { replace: true })
  }
})
