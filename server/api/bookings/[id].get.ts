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
import { paymongoVerifyRateLimiter } from '~/utils/server/rateLimiter'

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

  // Rate limiting: 10 requests per minute per IP (same as PayMongo verify)
  await paymongoVerifyRateLimiter.check(event, 'bookings_by_id')

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
      service_name,
      service_price,
      service_duration,
      date,
      start_time,
      end_time,
      status,
      payment_type,
      payment_status,
      payment_amount,
      points_earned,
      discount_applied,
      created_at
    `)
    .eq('id', id)
    .single()

  if (error || !booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
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
