/**
 * PATCH /api/admin/products/[id]
 *
 * Update a product.
 * Admin + Manager: can update all fields.
 * Cashier: can only update stock.
 *
 * Accessible by: admin, manager, cashier (stock only)
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { readMultipartFormData } from 'h3'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  price: z.number().min(0).optional(),
  cost_price: z.number().min(0).nullable().optional(),
  sku: z.string().max(50).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  stock: z.number().int().min(0).optional(),
  low_stock_threshold: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  image_urls: z.array(z.string().url()).optional(),
})

const cashierUpdateSchema = z.object({
  stock: z.number().int().min(0).optional(),
})

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

  if (!userProfile || !['admin', 'manager', 'cashier'].includes(userProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Verify the product belongs to this shop
  const { data: existingProduct, error: fetchError } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('shop_id', userProfile.shop_id)
    .single()

  if (fetchError || !existingProduct) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found or does not belong to your shop' })
  }

  // Parse body based on content type
  const contentType = getHeader(event, 'content-type') || ''
  let parsedData: z.infer<typeof updateProductSchema>
  let uploadedImageUrls: string[] = []

  if (contentType.includes('multipart/form-data')) {
    const formData = await readMultipartFormData(event)
    if (!formData) {
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
          throw createError({ statusCode: 415, statusMessage: `Unsupported file type: ${mimeType}` })
        }
        if (part.data.length > MAX_FILE_SIZE) {
          throw createError({ statusCode: 413, statusMessage: `File "${part.filename}" exceeds the 5MB size limit.` })
        }
        files.push({ data: part.data, filename: part.filename, type: mimeType })
      }
    }

    if (!jsonFields) {
      throw createError({ statusCode: 400, statusMessage: 'Product data is required' })
    }

    const parsed = updateProductSchema.safeParse(JSON.parse(jsonFields))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Validation failed', data: parsed.error.flatten().fieldErrors })
    }
    parsedData = parsed.data

    // Upload new product images
    for (const file of files) {
      const filePath = `${userProfile.shop_id}/products/${Date.now()}-${file.filename}`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('shop-assets')
        .upload(filePath, file.data, { contentType: file.type, upsert: false })

      if (uploadError) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to upload product image' })
      }

      const { data: urlData } = supabaseAdmin.storage.from('shop-assets').getPublicUrl(filePath)
      if (urlData?.publicUrl) {
        uploadedImageUrls.push(urlData.publicUrl)
      }
    }
  } else {
    const body = await readBody(event)

    // Cashier can only update stock
    if (userProfile.role === 'cashier') {
      const parsed = cashierUpdateSchema.safeParse(body)
      if (!parsed.success) {
        throw createError({ statusCode: 400, statusMessage: 'Cashier can only update stock quantity', data: parsed.error.flatten().fieldErrors })
      }
      parsedData = parsed.data
    } else {
      const parsed = updateProductSchema.safeParse(body)
      if (!parsed.success) {
        throw createError({ statusCode: 400, statusMessage: 'Validation failed', data: parsed.error.flatten().fieldErrors })
      }
      parsedData = parsed.data
    }
  }

  // Build update object
  const updateFields: Record<string, unknown> = {}

  if (userProfile.role === 'cashier') {
    // Cashier can only update stock
    if (parsedData.stock !== undefined) updateFields.stock = parsedData.stock
  } else {
    if (parsedData.name !== undefined) updateFields.name = parsedData.name
    if (parsedData.description !== undefined) updateFields.description = parsedData.description
    if (parsedData.category !== undefined) updateFields.category = parsedData.category
    if (parsedData.price !== undefined) updateFields.price = parsedData.price
    if (parsedData.cost_price !== undefined) updateFields.cost_price = parsedData.cost_price
    if (parsedData.sku !== undefined) updateFields.sku = parsedData.sku
    if (parsedData.barcode !== undefined) updateFields.barcode = parsedData.barcode
    if (parsedData.stock !== undefined) updateFields.stock = parsedData.stock
    if (parsedData.low_stock_threshold !== undefined) updateFields.low_stock_threshold = parsedData.low_stock_threshold
    if (parsedData.is_active !== undefined) updateFields.is_active = parsedData.is_active

    // Handle image URLs
    if (parsedData.image_urls !== undefined || uploadedImageUrls.length > 0) {
      const existingUrls = parsedData.image_urls !== undefined ? parsedData.image_urls : (existingProduct.image_urls || [])
      const allImageUrls = [...existingUrls, ...uploadedImageUrls]
      updateFields.image_urls = allImageUrls
      updateFields.image_url = allImageUrls.length > 0 ? allImageUrls[0] : null
    }
  }

  if (Object.keys(updateFields).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  const { data: updatedProduct, error: updateError } = await supabaseAdmin
    .from('products')
    .update(updateFields)
    .eq('id', productId)
    .select()
    .single()

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to update product' })
  }

  // Log to activity_logs
  await supabaseAdmin.from('activity_logs').insert({
    shop_id: userProfile.shop_id,
    user_id: user.id,
    user_email: user.email || '',
    user_role: userProfile.role,
    action: 'product.updated',
    entity_type: 'product',
    entity_id: productId,
    entity_name: updatedProduct.name,
    old_value: existingProduct,
    new_value: updatedProduct,
  })

  return { data: updatedProduct }
})
