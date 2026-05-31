/**
 * GET /api/admin/shop/profile
 *
 * Fetch the current shop's profile data for the admin editor.
 * Returns all editable fields: name, description, logo_url, cover_image_url,
 * phone, email, address, social links, theme colors, slug, timezone.
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Authenticate
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }

  const supabase = createClient(config.public.supabaseUrl as string, config.public.supabaseKey as string, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }

  const supabaseAdmin = createClient(config.public.supabaseUrl as string, config.supabaseServiceKey as string)
  const { data: userProfile } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['admin', 'manager'].includes(userProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin or manager role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Fetch shop profile
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select(`
      id,
      name,
      slug,
      description,
      logo_url,
      cover_image_url,
      phone,
      email,
      address_street,
      address_city,
      address_state,
      address_zip,
      latitude,
      longitude,
      facebook_url,
      instagram_url,
      tiktok_url,
      primary_color,
      accent_color,
      background_color,
      font_family,
      timezone,
      plan
    `)
    .eq('id', userProfile.shop_id)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  return shop
})
