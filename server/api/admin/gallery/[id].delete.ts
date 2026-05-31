/**
 * DELETE /api/admin/gallery/[id]
 *
 * Delete a gallery image record and its file from storage.
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const imageId = getRouterParam(event, 'id')
  if (!imageId) {
    throw createError({ statusCode: 400, statusMessage: 'Image ID is required' })
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
    .select('id, url, thumbnail_url, shop_id')
    .eq('id', imageId)
    .eq('shop_id', userProfile.shop_id)
    .single()

  if (fetchError || !existingImage) {
    throw createError({ statusCode: 404, statusMessage: 'Gallery image not found or does not belong to your shop' })
  }

  // Delete file from storage
  if (existingImage.url) {
    try {
      const urlObj = new URL(existingImage.url)
      const pathMatch = urlObj.pathname.match(/\/shop-assets\/(.+)/)
      if (pathMatch && pathMatch[1]) {
        await supabaseAdmin.storage
          .from('shop-assets')
          .remove([pathMatch[1]])
      }
    } catch {
      // If URL parsing fails, still delete the DB record
    }
  }

  // Delete thumbnail from storage if exists
  if (existingImage.thumbnail_url) {
    try {
      const urlObj = new URL(existingImage.thumbnail_url)
      const pathMatch = urlObj.pathname.match(/\/shop-assets\/(.+)/)
      if (pathMatch && pathMatch[1]) {
        await supabaseAdmin.storage
          .from('shop-assets')
          .remove([pathMatch[1]])
      }
    } catch {
      // Ignore thumbnail cleanup failure
    }
  }

  // Delete the DB record
  const { error: deleteError } = await supabaseAdmin
    .from('gallery')
    .delete()
    .eq('id', imageId)

  if (deleteError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete gallery image' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'gallery_image.deleted',
    entity_type: 'gallery_image',
    entity_id: imageId,
    old_value: existingImage,
  })

  return { success: true, message: 'Gallery image deleted' }
})
