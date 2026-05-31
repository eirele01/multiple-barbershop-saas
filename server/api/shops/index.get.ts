/**
 * GET /api/shops
 * Returns a list of active shops for the homepage search combobox.
 *
 * Query params:
 * - q: optional search string (filters by name, slug, or city)
 *
 * Returns: array of { slug, name, city, logo_url }
 * Sorted alphabetically by name ascending.
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)
  const searchQuery = (query.q as string || '').trim().toLowerCase()

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  let supabaseQuery = supabase
    .from('shops')
    .select('slug, name, address_city, logo_url')
    .eq('is_active', true)
    .order('name', { ascending: true })

  // If a search query is provided, filter server-side
  if (searchQuery) {
    // Use ilike on name for partial matching, plus or filters for slug and city
    const { data: shops, error } = await supabase
      .from('shops')
      .select('slug, name, address_city, logo_url')
      .eq('is_active', true)
      .or(`name.ilike.%${searchQuery}%,slug.ilike.%${searchQuery}%,address_city.ilike.%${searchQuery}%`)
      .order('name', { ascending: true })

    if (error) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch shops' })
    }

    return {
      data: (shops || []).map((s: any) => ({
        slug: s.slug,
        name: s.name,
        city: s.address_city || null,
        logo_url: s.logo_url || null,
      })),
    }
  }

  const { data: shops, error } = await supabaseQuery

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch shops' })
  }

  return {
    data: (shops || []).map((s: any) => ({
      slug: s.slug,
      name: s.name,
      city: s.address_city || null,
      logo_url: s.logo_url || null,
    })),
  }
})
