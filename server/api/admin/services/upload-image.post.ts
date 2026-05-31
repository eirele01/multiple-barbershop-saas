/**
 * POST /api/admin/services/upload-image
 *
 * Upload a service image to Supabase Storage (shop-assets bucket).
 * Storage path: services/[shopId]/[filename]
 *
 * Validates:
 * - File is an image (jpeg, png, webp)
 * - Max 5MB
 * - Shop ownership
 * - Role: admin, manager
 */
import { createClient } from '@supabase/supabase-js'
import { readMultipartFormData } from 'h3'

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

  // Read multipart form data
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No form data received' })
  }

  let fileData: Buffer | null = null
  let fileName = ''
  let fileContentType = ''

  for (const part of formData) {
    if (part.name === 'file' && part.filename) {
      const mimeType = part.type || ''

      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw createError({
          statusCode: 415,
          statusMessage: `Unsupported file type: ${mimeType}. Only JPEG, PNG, and WebP images are accepted.`,
        })
      }

      if (part.data.length > MAX_FILE_SIZE) {
        throw createError({
          statusCode: 413,
          statusMessage: 'File too large. Maximum size is 5MB for service images.',
        })
      }

      fileData = part.data
      fileName = `${Date.now()}-${part.filename}`
      fileContentType = mimeType
    }
  }

  if (!fileData) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  // Upload to Supabase Storage (shop-assets bucket)
  const filePath = `services/${userProfile.shop_id}/${fileName}`

  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from('shop-assets')
    .upload(filePath, fileData, {
      contentType: fileContentType,
      upsert: false,
    })

  if (uploadError) {
    console.error('Service image upload error:', uploadError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload service image: ' + uploadError.message })
  }

  // Get public URL
  const { data: urlData } = supabaseAdmin.storage
    .from('shop-assets')
    .getPublicUrl(filePath)

  const imageUrl = urlData?.publicUrl || ''

  return { url: imageUrl }
})
