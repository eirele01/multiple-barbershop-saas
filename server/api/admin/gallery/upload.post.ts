/**
 * POST /api/admin/gallery/upload
 *
 * Upload multiple gallery images for the authenticated user's shop.
 * Accepts multipart form data with multiple files.
 * Each file is validated for type (JPG, PNG, WebP) and size (max 5MB).
 * Uploads to shop-assets/[shopId]/gallery/ bucket.
 * Creates gallery records for each uploaded file.
 * Checks tier limit: Basic = 20 images max.
 *
 * Accessible by: admin, manager
 */
import { createClient } from '@supabase/supabase-js'
import { readMultipartFormData } from 'h3'
import { TIER_LIMITS } from '~/types/database'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

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
    .from('gallery')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', userProfile.shop_id)

  if (countError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to check gallery limit' })
  }

  // Get shop plan
  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('plan')
    .eq('id', userProfile.shop_id)
    .single()

  const plan = shop?.plan || 'basic'
  const limit = TIER_LIMITS[plan as keyof typeof TIER_LIMITS]?.gallery ?? TIER_LIMITS.basic.gallery

  if (limit !== Infinity && (currentCount || 0) >= limit) {
    throw createError({
      statusCode: 403,
      statusMessage: `You've reached the maximum of ${limit} gallery images on the Basic plan. Upgrade to the Upgraded plan for unlimited gallery!`,
    })
  }

  // Read multipart form data
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No form data received' })
  }

  // Extract files and metadata
  const files: Array<{ data: Buffer; filename: string; type: string }> = []
  let caption = ''
  let category = ''
  let tagsStr = ''

  for (const part of formData) {
    if (part.name === 'files' && part.filename) {
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
    } else if (part.name === 'caption') {
      caption = part.data.toString('utf-8')
    } else if (part.name === 'category') {
      category = part.data.toString('utf-8')
    } else if (part.name === 'tags') {
      tagsStr = part.data.toString('utf-8')
    }
  }

  if (files.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No files uploaded' })
  }

  // Check if adding these files would exceed the tier limit
  if (limit !== Infinity && (currentCount || 0) + files.length > limit) {
    const remaining = limit - (currentCount || 0)
    throw createError({
      statusCode: 403,
      statusMessage: `You can only upload ${remaining} more image(s) on the Basic plan. You tried to upload ${files.length}.`,
    })
  }

  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : []

  // Get current max sort_order for this shop
  const { data: maxSortResult } = await supabaseAdmin
    .from('gallery')
    .select('sort_order')
    .eq('shop_id', userProfile.shop_id)
    .order('sort_order', { ascending: false })
    .limit(1)

  let nextSortOrder = (maxSortResult && maxSortResult.length > 0) ? maxSortResult[0].sort_order + 1 : 0

  // Upload each file and create DB records
  const uploadedImages: Array<Record<string, unknown>> = []

  for (const file of files) {
    const filePath = `${userProfile.shop_id}/gallery/${Date.now()}-${file.filename}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('shop-assets')
      .upload(filePath, file.data, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to upload image: ' + uploadError.message })
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('shop-assets')
      .getPublicUrl(filePath)

    const imageUrl = urlData?.publicUrl || ''

    // Create gallery record
    const { data: newImage, error: insertError } = await supabaseAdmin
      .from('gallery')
      .insert({
        shop_id: userProfile.shop_id,
        url: imageUrl,
        thumbnail_url: null,
        caption: caption || null,
        category: category || null,
        tags,
        sort_order: nextSortOrder,
        is_active: true,
      })
      .select()
      .single()

    if (insertError) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to create gallery record: ' + insertError.message })
    }

    uploadedImages.push(newImage)
    nextSortOrder++
  }

  return { data: uploadedImages, count: uploadedImages.length }
})
