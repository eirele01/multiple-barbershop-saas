/**
 * POST /api/admin/products
 *
 * Create a new product for the authenticated user's shop.
 * Checks tier limit: Basic = 10 products, Upgraded = unlimited.
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { readMultipartFormData } from 'h3'
import { TIER_LIMITS } from '~/types/database'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(200),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  price: z.number().min(0, 'Price must be 0 or greater'),
  cost_price: z.number().min(0).nullable().optional(),
  sku: z.string().max(50).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  stock: z.number().int().min(0, 'Stock must be 0 or greater'),
  low_stock_threshold: z.number().int().min(0).default(5),
  is_active: z.boolean().default(true),
  image_urls: z.array(z.string().url()).default([]),
})

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
  const { data: userProfile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (profileError || !userProfile) {
    throw createError({ statusCode: 403, statusMessage: 'User profile not found' })
  }

  if (!['admin', 'manager'].includes(userProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin or manager role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Check tier limit
  const { count: currentCount, error: countError } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', userProfile.shop_id)

  if (countError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to check product limit' })
  }

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('plan')
    .eq('id', userProfile.shop_id)
    .single()

  const plan = shop?.plan || 'basic'
  const limit = TIER_LIMITS[plan as keyof typeof TIER_LIMITS]?.products ?? TIER_LIMITS.basic.products

  if (limit !== Infinity && (currentCount || 0) >= limit) {
    throw createError({
      statusCode: 403,
      statusMessage: `You've reached the maximum of ${limit} products on the Basic plan. Upgrade to the Upgraded plan for unlimited products!`,
    })
  }

  // Parse form data (multipart for file uploads, or JSON)
  const contentType = getHeader(event, 'content-type') || ''
  let productData: z.infer<typeof createProductSchema>
  let uploadedImageUrls: string[] = []

  if (contentType.includes('multipart/form-data')) {
    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No form data received' })
    }

    let jsonFields = ''
    const files: Array<{ data: Buffer; filename: string; type: string }> = []

    for (const part of formData) {
      if (part.name === 'data' && !part.filename) {
        jsonFields = part.data.toString('utf-8')
      } else if (part.name === 'files' && part.filename) {
        const mimeType = part.type || ''
        if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
          throw createError({
            statusCode: 415,
            statusMessage: `Unsupported file type: ${mimeType}. Only JPG, PNG, and WebP images are accepted.`,
          })
        }
        if (part.data.length > MAX_FILE_SIZE) {
          throw createError({
            statusCode: 413,
            statusMessage: `File "${part.filename}" exceeds the 5MB size limit.`,
          })
        }
        files.push({ data: part.data, filename: part.filename, type: mimeType })
      }
    }

    if (!jsonFields) {
      throw createError({ statusCode: 400, statusMessage: 'Product data is required' })
    }

    const parsed = createProductSchema.safeParse(JSON.parse(jsonFields))
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Validation failed',
        data: parsed.error.flatten().fieldErrors,
      })
    }
    productData = parsed.data

    // Upload product images
    for (const file of files) {
      const filePath = `${userProfile.shop_id}/products/${Date.now()}-${file.filename}`

      const { error: uploadError } = await supabaseAdmin.storage
        .from('shop-assets')
        .upload(filePath, file.data, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to upload product image: ' + uploadError.message })
      }

      const { data: urlData } = supabaseAdmin.storage
        .from('shop-assets')
        .getPublicUrl(filePath)

      if (urlData?.publicUrl) {
        uploadedImageUrls.push(urlData.publicUrl)
      }
    }
  } else {
    // JSON body (no file uploads)
    const body = await readBody(event)
    const parsed = createProductSchema.safeParse(body)
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Validation failed',
        data: parsed.error.flatten().fieldErrors,
      })
    }
    productData = parsed.data
  }

  // Generate SKU if blank
  let sku = productData.sku
  if (!sku || sku.trim() === '') {
    sku = `PRD-${Date.now()}`
  }

  // Merge uploaded images with existing image_urls
  const allImageUrls = [...(productData.image_urls || []), ...uploadedImageUrls]

  // Create the product
  const { data: newProduct, error: insertError } = await supabaseAdmin
    .from('products')
    .insert({
      shop_id: userProfile.shop_id,
      name: productData.name,
      description: productData.description || null,
      category: productData.category || null,
      price: productData.price,
      cost_price: productData.cost_price || null,
      sku,
      barcode: productData.barcode || null,
      image_url: allImageUrls.length > 0 ? allImageUrls[0] : null,
      image_urls: allImageUrls,
      stock: productData.stock,
      low_stock_threshold: productData.low_stock_threshold ?? 5,
      is_active: productData.is_active ?? true,
    })
    .select()
    .single()

  if (insertError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create product: ' + insertError.message })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'product.created',
    entity_type: 'product',
    entity_id: newProduct.id,
    entity_name: productData.name,
    new_value: newProduct,
  })

  return { data: newProduct }
})
