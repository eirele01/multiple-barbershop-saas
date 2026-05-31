/**
 * Global Auth Middleware — runs on every route change.
 *
 * Handles auth initialization timing and route protection:
 *   1. Waits for the auth store to be initialized (Supabase session check)
 *   2. Public routes (/, /login, /register, /customer/login, /auth/*, /shop/*) are always accessible
 *   3. Authenticated users on /login or /register are redirected to their dashboard
 *   4. Protected routes require authentication — redirects to /login if not
 *
 * IMPORTANT: We only redirect on the client side. During SSR, the session
 * may still be loading, so we let the page render and handle redirects
 * client-side after hydration. This prevents the "logged out on refresh" bug.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()

  // Wait for auth to initialize (Supabase session check)
  if (!authStore.initialized) {
    await authStore.initialize()
  }

  // Public routes that never require authentication
  const publicRoutes = ['/', '/login', '/register', '/customer/login', '/auth/verify-email']

  // Shop public pages — always accessible (browsing shops, booking flow)
  if (to.path.startsWith('/shop/')) {
    return
  }

  // API and webhook routes — not protected by client-side middleware
  if (to.path.startsWith('/api/')) {
    return
  }

  // If route is public, allow through
  if (publicRoutes.includes(to.path)) {
    // But if user IS logged in and tries to access login/register,
    // redirect them to their appropriate dashboard
    if (authStore.isAuthenticated && (to.path === '/login' || to.path === '/register' || to.path === '/customer/login')) {
      return navigateTo(authStore.defaultRedirect, { replace: true })
    }
    return
  }

  // Protected route — require authentication
  if (!authStore.isAuthenticated) {
    // Only redirect on the client side. During SSR, the cookie-based
    // session may still be resolving. Let the page render and the
    // client-side will redirect after hydration if truly unauthenticated.
    if (import.meta.server) {
      return
    }

    // All unauthenticated users go to the unified /login page
    return navigateTo('/login', {
      query: { redirect: to.fullPath },
    })
  }
})
