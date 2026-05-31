/**
 * GET /api/shops/[slug]/payment-methods
 *
 * Returns active payment methods for a shop.
 * Used by the booking wizard to display available payment options.
 *
 * Ensures qr_code_url is always a full public URL — if the stored
 * value is a storage path (not starting with http), resolves it
 * using Supabase Storage's getPublicUrl BEFORE returning.
 *
 * Query params:
 * - active: if 'true', only return active methods
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const slug = getRouterParam(event, 'slug')
  const query = getQuery(event)

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Shop slug is required' })
  }

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Get shop ID from slug
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  let queryBuilder = supabase
    .from('payment_methods')
    .select('*')
    .eq('shop_id', shop.id)

  if (query.active === 'true') {
    queryBuilder = queryBuilder.eq('is_active', true)
  }

  const { data: methods, error } = await queryBuilder.order('sort_order', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch payment methods' })
  }

  // Resolve qr_code_url: if it's a storage path (not a full URL),
  // convert it to a full public URL using Supabase Storage
  const resolvedMethods = (methods || []).map((method: any) => {
    if (method.qr_code_url && !method.qr_code_url.startsWith('http')) {
      // This is a storage path like "payment-methods/[shopId]/[filename]"
      // Resolve to a full public URL
      const { data: urlData } = supabase.storage
        .from('payment-methods')
        .getPublicUrl(method.qr_code_url)

      return {
        ...method,
        qr_code_url: urlData?.publicUrl || method.qr_code_url,
      }
    }
    return method
  })

  return resolvedMethods
})
