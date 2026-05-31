/**
 * useSupabase — Returns the Supabase client instance
 *
 * Uses a Nuxt app-level singleton to prevent multiple GoTrueClient instances.
 * The client is stored on the Nuxt app instance so it persists across
 * composable calls without being recreated.
 *
 * Uses localStorage for session persistence (Supabase default).
 * Session is NOT available during SSR — this is handled by:
 *   1. Auth middleware skips redirects during SSR
 *   2. Auth store only initializes on client-side
 *   3. Client hydration restores the session from localStorage
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database'

const SUPABASE_KEY = '__supabase_client__'

export function useSupabase(): SupabaseClient<Database> {
  const nuxtApp = useNuxtApp()

  // Return existing client from Nuxt app instance (prevents multiple instances)
  if (nuxtApp[SUPABASE_KEY]) {
    return nuxtApp[SUPABASE_KEY] as SupabaseClient<Database>
  }

  const config = useRuntimeConfig()

  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseKey = config.public.supabaseKey as string

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase environment variables. Set SUPABASE_URL and SUPABASE_KEY in .env'
    )
  }

  const client = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  // Store on Nuxt app instance for reuse
  nuxtApp[SUPABASE_KEY] = client

  return client
}
