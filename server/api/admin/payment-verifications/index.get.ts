/**
 * GET /api/admin/payment-verifications
 *
 * List payment verifications for the authenticated user's shop.
 *
 * Query params:
 *   status     — filter by status (pending, verified, rejected, more_info)
 *   dateFrom   — filter from date (YYYY-MM-DD)
 *   dateTo     — filter to date (YYYY-MM-DD)
 *   methodId   — filter by payment method ID
 *   page       — page number (default 1)
 *   limit      — items per page (default 20)
 *
 * Accessible by: admin, manager, cashier
 */
import { createClient } from '@supabase/supabase-js'

/**
 * Extract the storage path (relative to bucket root) from a Supabase public URL
 * or return the path directly if already a storage path (not a full URL).
 *
 * Public URL format:
 *   https://{project}.supabase.co/storage/v1/object/public/payment-proofs/{path}
 *   → returns "{path}"
 *
 * Storage path format (backward compatible):
 *   payment-proofs/{shopId}/{bookingId}/{filename}
 *   → returned as-is
 */
function extractProofStoragePath(proofUrl: string): string | null {
  if (!proofUrl) return null

  // Handle full public URL — extract path after bucket name
  const marker = '/object/public/payment-proofs/'
  const idx = proofUrl.indexOf(marker)
  if (idx !== -1) {
    return proofUrl.substring(idx + marker.length).split('?')[0]
  }

  // Handle storage path (already a relative path, not a URL)
  if (!proofUrl.startsWith('http')) {
    return proofUrl
  }

  return null
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)

  // Authenticate
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }

  const supabase = createClient(config.public.supabaseUrl as string, config.public.supabaseKey as string, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  // Verify the user token
  const anonClient = createClient(
    config.public.supabaseUrl as string,
    config.public.supabaseKey as string,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` }
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      }
    }
  )

  const { data: { user }, error: authError } =
    await anonClient.auth.getUser()

  if (authError || !user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or expired token'
    })
  }

  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      }
    }
  )

  // Get user profile
  const { data: userProfile } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (!userProfile || !['admin', 'manager', 'cashier']
    .includes(userProfile.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Insufficient permissions'
    })
  }

  if (!userProfile.shop_id) {
    throw createError({
      statusCode: 403,
      statusMessage: 'No shop associated with this account'
    })
  }

// After the main verifications query, also check for 
// bookings with proof but no verification record
const { data: missingVerifications } = await supabaseAdmin
  .from('bookings')
  .select('*')
  .eq('shop_id', userProfile.shop_id)
  .eq('payment_type', 'manual')
  .eq('payment_status', 'pending_verification')
  .not('proof_image_url', 'is', null)
  .neq('proof_image_url', '')

// For each booking without a verification record, 
// create one automatically
for (const booking of missingVerifications || []) {
  // Check if verification record already exists
  const { data: existing } = await supabaseAdmin
    .from('payment_verifications')
    .select('id')
    .eq('booking_id', booking.id)
    .maybeSingle()

  if (!existing && booking.payment_method_id) {
    // Auto-create the missing verification record
    await supabaseAdmin
      .from('payment_verifications')
      .insert({
        shop_id: booking.shop_id,
        booking_id: booking.id,
        customer_id: booking.customer_id || null,
        payment_method_id: booking.payment_method_id,
        amount: booking.payment_amount || 0,
        proof_image_url: booking.proof_image_url || '',
        reference_number: booking.reference_number || null,
        status: 'pending',
      })
  }
}

  // Build query
  const status = query.status as string | undefined
  const dateFrom = query.dateFrom as string | undefined
  const dateTo = query.dateTo as string | undefined
  const methodId = query.methodId as string | undefined
  const page = Math.max(1, parseInt(query.page as string) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(query.limit as string) || 20))
  const offset = (page - 1) * limit

  let dbQuery = supabaseAdmin
    .from('payment_verifications')
    .select('*, bookings(booking_ref, service_name, service_price, customer_id, status, payment_status)', { count: 'exact' })
    .eq('shop_id', userProfile.shop_id)

  if (status) {
    dbQuery = dbQuery.eq('status', status)
  }
  if (dateFrom) {
    dbQuery = dbQuery.gte('created_at', dateFrom + 'T00:00:00')
  }
  if (dateTo) {
    dbQuery = dbQuery.lte('created_at', dateTo + 'T23:59:59')
  }
  if (methodId) {
    dbQuery = dbQuery.eq('payment_method_id', methodId)
  }

  // Get total count for the status filter
  let countQuery = supabaseAdmin
    .from('payment_verifications')
    .select('status', { count: 'exact', head: true })
    .eq('shop_id', userProfile.shop_id)

  if (dateFrom) {
    countQuery = countQuery.gte('created_at', dateFrom + 'T00:00:00')
  }
  if (dateTo) {
    countQuery = countQuery.lte('created_at', dateTo + 'T23:59:59')
  }
  if (methodId) {
    countQuery = countQuery.eq('payment_method_id', methodId)
  }

  const { count: totalCount } = await countQuery

  // Fetch paginated results
  const { data: verifications, error: fetchError } = await dbQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (fetchError) {
    console.error('Error fetching verifications:', fetchError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch payment verifications' })
  }

  // Get counts per status for tab badges
  const { data: statusCounts } = await supabaseAdmin
    .from('payment_verifications')
    .select('status')
    .eq('shop_id', userProfile.shop_id)

  const counts: Record<string, number> = {
    pending: 0,
    verified: 0,
    rejected: 0,
    more_info: 0,
  }
  if (statusCounts) {
    for (const row of statusCounts) {
      if (row.status in counts) {
        counts[row.status]++
      }
    }
  }

  // Enrich with customer and payment method info
  const enrichedVerifications = []
  for (const v of verifications || []) {
    const booking = v.bookings as any

    // Get customer info
    let customerName = 'Unknown'
    let customerPhone = ''
    if (v.customer_id) {
      const { data: customer } = await supabaseAdmin
        .from('users')
        .select('display_name, phone_number')
        .eq('id', v.customer_id)
        .single()
      if (customer) {
        customerName = customer.display_name
        customerPhone = customer.phone_number || ''
      }
    }

    // Get payment method name
    let paymentMethodName = 'Unknown'
    if (v.reference_number?.startsWith('PayMongo')) {
      // PayMongo payment — use the reference_number as the method name
      paymentMethodName = v.reference_number
    } else if (v.payment_method_id) {
      const { data: pm } = await supabaseAdmin
        .from('payment_methods')
        .select('name')
        .eq('id', v.payment_method_id)
        .single()
      if (pm) {
        paymentMethodName = pm.name
      }
    }

    // Get reviewer name
    let reviewedByName: string | null = null
    if (v.reviewed_by) {
      const { data: reviewer } = await supabaseAdmin
        .from('users')
        .select('display_name')
        .eq('id', v.reviewed_by)
        .single()
      if (reviewer) {
        reviewedByName = reviewer.display_name
      }
    }

    // Generate signed URL for proof_image_url (private bucket)
    let proofImageUrl = v.proof_image_url || ''
    if (proofImageUrl) {
      const storagePath = extractProofStoragePath(proofImageUrl)
      if (storagePath) {
        const { data: signedData } = await supabaseAdmin.storage
          .from('payment-proofs')
          .createSignedUrl(storagePath, 3600) // 1-hour expiry
        if (signedData?.signedUrl) {
          proofImageUrl = signedData.signedUrl
        }
      }
    }

    enrichedVerifications.push({
      ...v,
      bookings: undefined,
      booking_ref: booking?.booking_ref || '',
      service_name: booking?.service_name || '',
      service_price: booking?.service_price || 0,
      booking_status: booking?.status || '',
      booking_payment_status: booking?.payment_status || '',
      customer_name: customerName,
      customer_phone: customerPhone,
      payment_method_name: paymentMethodName,
      reviewed_by_name: reviewedByName,
      proof_image_url: proofImageUrl,
    })
  }

  return {
    data: enrichedVerifications,
    pagination: {
      page,
      limit,
      total: totalCount || 0,
      totalPages: Math.ceil((totalCount || 0) / limit),
    },
    counts,
  }
})
