/**
 * PATCH /api/admin/gallery/[id]
 *
 * Update a gallery image's caption, category, or tags.
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const updateGallerySchema = z.object({
  caption: z.string().max(500).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  tags: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const imageId = getRouterParam(event, 'id')
  if (!imageId) {
    throw createError({ statusCode: 400, statusMessage: 'Image ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateGallerySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

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
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Verify the image belongs to this shop
  const { data: existingImage, error: fetchError } = await supabaseAdmin
    .from('gallery')
    .select('*')
    .eq('id', imageId)
    .eq('shop_id', userProfile.shop_id)
    .single()

  if (fetchError || !existingImage) {
    throw createError({ statusCode: 404, statusMessage: 'Gallery image not found or does not belong to your shop' })
  }

  // Build update object
  const updateFields: Record<string, unknown> = {}
  if (parsed.data.caption !== undefined) updateFields.caption = parsed.data.caption
  if (parsed.data.category !== undefined) updateFields.category = parsed.data.category
  if (parsed.data.tags !== undefined) updateFields.tags = parsed.data.tags
  if (parsed.data.is_active !== undefined) updateFields.is_active = parsed.data.is_active
  if (parsed.data.sort_order !== undefined) updateFields.sort_order = parsed.data.sort_order

  if (Object.keys(updateFields).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  const { data: updatedImage, error: updateError } = await supabaseAdmin
    .from('gallery')
    .update(updateFields)
    .eq('id', imageId)
    .select()
    .single()

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to update gallery image' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'gallery_image.updated',
    entity_type: 'gallery_image',
    entity_id: imageId,
    old_value: existingImage,
    new_value: updatedImage,
  })

  return { data: updatedImage }
})
