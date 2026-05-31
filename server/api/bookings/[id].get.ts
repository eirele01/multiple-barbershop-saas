/**
 * GET /api/bookings/[id]
 *
 * Fetches a single booking by ID.
 * Used by payment-success/payment-failed pages to verify booking details.
 *
 * Query params: shopId (optional — for additional verification)
 * Returns: { booking }
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const paramsSchema = z.object({
  id: z.string().uuid('Invalid booking ID'),
})

/**
 * Extract the storage path from a Supabase public URL for the payment-proofs bucket.
 * Used to generate signed URLs for private bucket access.
 */
function extractProofStoragePath(proofUrl: string): string | null {
  if (!proofUrl) return null
  const marker = '/object/public/payment-proofs/'
  const idx = proofUrl.indexOf(marker)
  if (idx !== -1) {
    return proofUrl.substring(idx + marker.length).split('?')[0]
  }
  if (!proofUrl.startsWith('http')) {
    return proofUrl
  }
  return null
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const params = getRouterParam(event, 'id')

  const parsed = paramsSchema.safeParse({ id: params })
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid booking ID',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { id } = parsed.data

  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  const { data: booking, error } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_ref,
      shop_id,
      customer_id,
      barber_id,
      service_id,
      service_name,
      service_price,
      service_duration,
      date,
      start_time,
      end_time,
      status,
      payment_method,
      payment_type,
      payment_status,
      payment_amount,
      proof_image_url,
      points_earned,
      points_redeemed,
      discount_applied,
      customer_notes,
      created_at
    `)
    .eq('id', id)
    .single()

  if (error || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  // Generate signed URL for proof_image_url (payment-proofs bucket is private)
  if (booking.proof_image_url) {
    const storagePath = extractProofStoragePath(booking.proof_image_url)
    if (storagePath) {
      const { data: signedData } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(storagePath, 3600) // 1-hour expiry
      if (signedData?.signedUrl) {
        booking.proof_image_url = signedData.signedUrl
      }
    }
  }

  // Get shop slug for navigation links
  const { data: shop } = await supabase
    .from('shops')
    .select('id, slug, name')
    .eq('id', booking.shop_id)
    .single()

  return {
    booking,
    shop: shop || null,
  }
})
