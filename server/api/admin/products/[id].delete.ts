/**
 * DELETE /api/admin/products/[id]
 *
 * Delete a product.
 * Admin only.
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const productId = getRouterParam(event, 'id')
  if (!productId) {
    throw createError({ statusCode: 400, statusMessage: 'Product ID is required' })
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

  if (!userProfile || userProfile.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Verify the product belongs to this shop
  const { data: existingProduct, error: fetchError } = await supabaseAdmin
    .from('products')
    .select('id, name, image_urls, shop_id')
    .eq('id', productId)
    .eq('shop_id', userProfile.shop_id)
    .single()

  if (fetchError || !existingProduct) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found or does not belong to your shop' })
  }

  // Delete product images from storage
  if (existingProduct.image_urls && Array.isArray(existingProduct.image_urls)) {
    for (const imageUrl of existingProduct.image_urls) {
      try {
        const urlObj = new URL(imageUrl)
        const pathMatch = urlObj.pathname.match(/\/shop-assets\/(.+)/)
        if (pathMatch && pathMatch[1]) {
          await supabaseAdmin.storage
            .from('shop-assets')
            .remove([pathMatch[1]])
        }
      } catch {
        // Ignore individual image cleanup failures
      }
    }
  }

  // Delete the DB record
  const { error: deleteError } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('id', productId)

  if (deleteError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete product' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'product.deleted',
    entity_type: 'product',
    entity_id: productId,
    entity_name: existingProduct.name,
    old_value: existingProduct,
  })

  return { success: true, message: 'Product deleted' }
})
