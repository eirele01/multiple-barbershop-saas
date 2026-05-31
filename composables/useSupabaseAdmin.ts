import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side only Supabase client using service role key.
 * Bypasses RLS for all operations.
 * NEVER use this on the client side.
 * ONLY use this inside server/api/ routes.
 */
export function useSupabaseAdmin() {
  const config = useRuntimeConfig()

  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseServiceKey = config.supabaseServiceKey as string

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL — check your .env file')
  }

  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_KEY — check your .env file')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}