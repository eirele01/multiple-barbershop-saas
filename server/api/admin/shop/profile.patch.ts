/**
 * PATCH /api/admin/shop/profile
 *
 * Update the current shop's profile data.
 * Accepts partial updates — only included fields are updated.
 *
 * Editable fields: name, description, logo_url, cover_image_url,
 * phone, email, address_street, address_city, address_state, address_zip,
 * latitude, longitude, facebook_url, instagram_url, tiktok_url,
 * primary_color, accent_color, font_family
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'

const EDITABLE_FIELDS = [
  'name',
  'description',
  'logo_url',
  'cover_image_url',
  'phone',
  'email',
  'address_street',
  'address_city',
  'address_state',
  'address_zip',
  'latitude',
  'longitude',
  'facebook_url',
  'instagram_url',
  'tiktok_url',
  'primary_color',
  'accent_color',
  'background_color',
  'font_family',
] as const

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

  // Parse request body
  const body = await readBody(event)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  // Only pick allowed fields
  const updates: Record<string, any> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      updates[field] = body[field] === '' ? null : body[field]
    }
  }

  // Validate: name is required if provided
  if ('name' in updates && (!updates.name || updates.name.trim().length === 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Shop name cannot be empty' })
  }

  // Validate: email format if provided
  if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email format' })
  }

  // Validate: hex color format if provided
  if (updates.primary_color && !/^#[0-9A-Fa-f]{6}$/.test(updates.primary_color)) {
    throw createError({ statusCode: 400, statusMessage: 'Primary color must be a valid hex color (e.g., #1a1a2e)' })
  }
  if (updates.accent_color && !/^#[0-9A-Fa-f]{6}$/.test(updates.accent_color)) {
    throw createError({ statusCode: 400, statusMessage: 'Accent color must be a valid hex color (e.g., #16213e)' })
  }
  if (updates.background_color && !/^#[0-9A-Fa-f]{6}$/.test(updates.background_color)) {
    throw createError({ statusCode: 400, statusMessage: 'Background color must be a valid hex color (e.g., #0D0D0D)' })
  }

  // Validate: URL format for social links if provided
  const urlFields = ['facebook_url', 'instagram_url', 'tiktok_url'] as const
  for (const urlField of urlFields) {
    if (updates[urlField]) {
      try {
        new URL(updates[urlField])
      } catch {
        throw createError({ statusCode: 400, statusMessage: `${urlField.replace('_', ' ')} must be a valid URL` })
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields to update' })
  }

  // Update shop
  const { data: updatedShop, error: updateError } = await supabaseAdmin
    .from('shops')
    .update(updates)
    .eq('id', userProfile.shop_id)
    .select()
    .single()

  if (updateError) {
    console.error('Shop profile update error:', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update shop profile: ' + updateError.message })
  }

  return updatedShop
})
