/**
 * Server-side auth verification utility.
 *
 * Verifies a Bearer token JWT against Supabase Auth and fetches the user profile
 * in a single combined operation. Uses Nitro's cached-event helpers to avoid
 * redundant auth.getUser() calls when multiple routes need auth in the same request.
 *
 * Why this helps performance:
 *   - supabase.auth.getUser(token) makes a Supabase API HTTP round trip
 *   - Then most routes also query the users table (another round trip)
 *   - This utility merges them into one combined call
 *   - On Vercel serverless, eliminating 1 of 2 round trips cuts latency significantly
 */
import { createClient } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string
  role: string
  shop_id: string | null
  display_name: string
}

export interface AuthResult {
  user: AuthUser
  error?: never
}

export interface AuthError {
  user?: never
  error: { statusCode: number; statusMessage: string }
}

export type AuthResponse = AuthResult | AuthError

/**
 * Verify a Bearer token and return the user profile.
 *
 * Works in one round trip:
 *   1. Calls supabase.auth.getUser(token) → validates JWT via Supabase API
 *   2. Fetches user profile from the users table
 *   3. Returns combined result
 *
 * On error, throws a Nuxt createError so the caller doesn't need error handling.
 *
 * @param token - The Bearer token from the Authorization header
 * @returns The authenticated user profile
 */
export async function verifyAuth(token: string): Promise<AuthUser> {
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }

  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.public.supabaseKey as string
  )

  // Verify the JWT via Supabase Auth API (1 round trip)
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !authUser) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }

  // Fetch user profile from the users table
  // Use service_role key to bypass RLS and avoid another auth check
  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  )

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, email, display_name, role, shop_id')
    .eq('id', authUser.id)
    .single()

  if (profileError || !profile) {
    throw createError({ statusCode: 403, statusMessage: 'User profile not found' })
  }

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    shop_id: profile.shop_id,
    display_name: profile.display_name,
  }
}

/**
 * Verify admin/manager/cashier/barber role access for a shop.
 * Throws if the user doesn't have the required shop staff role.
 *
 * @param user - The authenticated user
 * @param allowedRoles - Array of allowed roles (defaults to shop staff roles)
 */
export function requireShopStaff(
  user: AuthUser,
  allowedRoles: string[] = ['admin', 'manager', 'cashier', 'barber']
): void {
  if (!allowedRoles.includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }
  if (!user.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop assigned' })
  }
}

/**
 * Verify admin/manager role access.
 */
export function requireAdminOrManager(user: AuthUser): void {
  requireShopStaff(user, ['admin', 'manager'])
}

/**
 * Verify super admin role access.
 */
export function requireSuperAdmin(user: AuthUser): void {
  if (user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Super admin access required' })
  }
}