/**
 * useAuthFetch — Authenticated $fetch helper
 *
 * Eliminates duplicated getAuthToken() + $fetch({ headers: { Authorization } })
 * patterns across 20+ admin page files.
 *
 * Usage:
 *   const { authFetch } = useAuthFetch()
 *   const data = await authFetch('/api/admin/bookings')
 *   const data = await authFetch('/api/admin/bookings', { method: 'POST', body: { ... } })
 */

export function useAuthFetch() {
  /**
   * Fetch with Authorization header automatically attached.
   * Falls back to session refresh if the stored token is stale.
   */
  async function authFetch<T = any>(url: string, opts: any = {}): Promise<T> {
    const supabase = useSupabase()
    const authHeader = await getAuthHeader(supabase)

    return $fetch<T>(url, {
      ...opts,
      headers: {
        Authorization: authHeader,
        ...(opts.headers || {}),
      },
    })
  }

  return { authFetch }
}

async function getAuthHeader(supabase: ReturnType<typeof useSupabase>): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) {
    return `Bearer ${data.session.access_token}`
  }

  // Try refreshing stale session
  const { data: refreshed } = await supabase.auth.refreshSession()
  if (refreshed.session?.access_token) {
    return `Bearer ${refreshed.session.access_token}`
  }

  navigateTo('/login', { replace: true })
  throw new Error('Authentication required')
}
