import { createClient } from '@supabase/supabase-js'

/**
 * Creates and returns a Supabase client initialized with the service role key.
 * This client bypasses Row Level Security (RLS) and should only be used in secure
 * server environments for admin tasks.
 */
export const useSupabaseAdmin = () => {
  const config = useRuntimeConfig()
  
  if (!config.public.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error('Missing Supabase URL or Service Key in runtime config.')
  }

  return createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  )
}
