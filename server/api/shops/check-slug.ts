/**
 * GET /api/shops/check-slug?slug=kings-barbers
 * Checks if a shop slug is available (for registration form).
 * Uses the service role key to bypass RLS.
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  console.log('Checking slug availability...')
  const config = useRuntimeConfig()
  const query = getQuery(event)
  const slug = query.slug as string

  if (!slug) {
    return { available: false, message: 'Slug is required' }
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return {
      available: false,
      message: 'Slug must contain only lowercase letters, numbers, and hyphens',
    }
  }

  if (slug.length < 3) {
    return {
      available: false,
      message: 'Slug must be at least 3 characters',
    }
  }

  // Use service role key to check slug (bypass RLS)
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  const { data, error } = await supabase
    .from('shops')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    return { available: false, message: 'Error checking slug availability' }
  }

  return {
    available: !data,
    message: data ? 'This slug is already taken' : 'Slug is available!',
  }
})
