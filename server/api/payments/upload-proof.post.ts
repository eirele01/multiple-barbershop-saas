/**
 * POST /api/payments/upload-proof
 *
 * Accepts multipart form data to upload payment proof for a booking.
 * - Validates file server-side: size <= 5MB, MIME type, booking ownership, payment status
 * - Uploads file to Supabase Storage bucket 'payment-proofs/[shopId]/[bookingId]/[filename]'
 * - Updates bookings.proof_image_url
 * - Updates payment_verifications.proof_image_url
 * - Returns: { proofUrl }
 */
import { createClient } from '@supabase/supabase-js'
import { readMultipartFormData, getHeader } from 'h3'
import { z } from 'zod'
import { proofUploadRateLimiter } from '~/utils/server/rateLimiter'

// Server-side allowed MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024

const uploadProofSchema = z.object({
  bookingId: z.string().uuid(),
  shopId: z.string().uuid(),
  referenceNumber: z.string().max(200).optional(),
  amountSent: z.string().max(20).optional(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Rate limiting: 3 uploads per 5 minutes per IP
  await proofUploadRateLimiter.check(event)

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

        // Auth check — optional.
  // Authenticated customers must own the booking; guests (no session token)
  // may still upload a proof for their own booking, relying on the
  // unguessability of the booking/shop UUIDs + rate limiting as the boundary.
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : ''
  const authUser = token ? await verifyAuth(token) : null

  // Read multipart form data
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No form data received' })
  }

  // Extract fields from form data
  let bookingId = ''
  let shopId = ''
  let referenceNumber = ''
  let amountSent = ''
  let fileData: Buffer | null = null
  let fileName = ''
  let fileContentType = ''

  for (const part of formData) {
    if (part.name === 'bookingId' && part.data) {
      bookingId = part.data.toString()
    } else if (part.name === 'shopId' && part.data) {
      shopId = part.data.toString()
    } else if (part.name === 'referenceNumber' && part.data) {
      referenceNumber = part.data.toString()
    } else if (part.name === 'amountSent' && part.data) {
      amountSent = part.data.toString()
    } else if (part.name === 'file' && part.filename) {
      // ── Server-side validation ──

      // 1. Validate MIME type (use the content-type from the upload, not file extension)
      const mimeType = part.type || ''
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw createError({
          statusCode: 415,
          statusMessage: `Unsupported media type: ${mimeType}. Only JPG, PNG, and PDF files are accepted.`,
        })
      }

      // 2. Validate file size
      if (part.data.length > MAX_FILE_SIZE) {
        throw createError({
          statusCode: 413,
          statusMessage: 'File too large. Maximum size is 5MB.',
        })
      }

      fileData = part.data
      fileName = `${Date.now()}-${part.filename}`
      fileContentType = mimeType
    }
  }

  // Validate file presence before Zod check (file isn't part of schema)
  if (!fileData) {
    throw createError({ statusCode: 400, statusMessage: 'No file attached. A proof image is required.' })
  }

  // Validate form fields with Zod
  const parsed = uploadProofSchema.safeParse({ bookingId, shopId, referenceNumber, amountSent })
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }
  bookingId = parsed.data.bookingId
  shopId = parsed.data.shopId
  referenceNumber = parsed.data.referenceNumber || ''
  amountSent = parsed.data.amountSent || ''

  // 3. Verify the booking exists and belongs to the shop
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_ref, shop_id, status, payment_status, customer_id')
    .eq('id', bookingId)
    .eq('shop_id', shopId)
    .single()

  if (bookingError || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found or does not belong to this shop' })
  }

        // 3b. Verify ownership — only enforce when an authenticated user is present.
  //     Guests (token-less) proceed; booking ID + shop ID act as the ownership boundary.
  if (authUser && booking.customer_id !== authUser.id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: You can only upload proof for your own bookings' })
  }

  // 4. Check payment_status — reject re-upload if already verified
  if (booking.payment_status === 'verified' || booking.payment_status === 'paid') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Payment has already been verified. No further uploads are allowed.',
    })
  }

  // Only allow upload if payment_status is 'pending' or 'pending_verification'
  if (booking.payment_status !== 'pending' && booking.payment_status !== 'pending_verification') {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot upload proof for a booking with payment_status '${booking.payment_status}'.`,
    })
  }

  // Upload file to Supabase Storage
  const filePath = `payment-proofs/${shopId}/${bookingId}/${fileName}`

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(filePath, fileData, {
      contentType: fileContentType,
      upsert: false,
    })

  if (uploadError) {
    console.error('Storage upload error:', uploadError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload file: ' + uploadError.message })
  }

  // Generate a signed URL (payment-proofs bucket is PRIVATE — getPublicUrl returns 403)
  const { data: signedData } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(filePath, 3600) // 1-hour expiry for the returned URL

  // Store the storage path in DB (not the public URL) — extract from the upload path
  const proofPath = uploadData.path // e.g. "payment-proofs/{shopId}/{bookingId}/{filename}"
  const signedProofUrl = signedData?.signedUrl || ''

  // Update booking with proof path
  const updateFields: Record<string, any> = {
    proof_image_url: proofPath,
    status: 'pending_payment',
    payment_status: 'pending_verification',
  }
  if (referenceNumber) {
    updateFields.reference_number = referenceNumber
  }
  if (amountSent) {
    updateFields.payment_amount = parseFloat(amountSent) || null
  }

  await supabase
    .from('bookings')
    .update(updateFields)
    .eq('id', bookingId)

  // Update payment_verifications with proof image URL
  await supabase
    .from('payment_verifications')
        .update({
      proof_image_url: proofPath,
      reference_number: referenceNumber || null,
      amount: amountSent ? parseFloat(amountSent) : null,
    })
    .eq('booking_id', bookingId)

  // Log to activity_logs
  await supabase.from('activity_logs').insert({
    shop_id: shopId,
    user_email: 'customer',
    action: 'payment.proof_uploaded',
    entity_type: 'booking',
    entity_id: bookingId,
        entity_name: booking.booking_ref,
    new_value: { proofPath, referenceNumber },
  })

  return { proofUrl: signedProofUrl }
})
