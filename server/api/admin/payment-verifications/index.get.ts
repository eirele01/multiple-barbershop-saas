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
  const query = getQuery(event)

  // Authenticate using verifyAuth
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  const authUser = await verifyAuth(token || '')

  // Role check
  if (!['admin', 'manager', 'cashier'].includes(authUser.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }
  if (!authUser.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  )

  // After auth, also check for bookings with proof but no verification record
  const missingVerifications = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('shop_id', authUser.shop_id)
    .eq('payment_type', 'manual')
    .eq('payment_status', 'pending_verification')
    .not('proof_image_url', 'is', null)
    .neq('proof_image_url', '')

  for (const booking of missingVerifications.data || []) {
    const { data: existing } = await supabaseAdmin
      .from('payment_verifications')
      .select('id')
      .eq('booking_id', booking.id)
      .maybeSingle()
    if (!existing && booking.payment_method_id) {
      await supabaseAdmin.from('payment_verifications').insert({
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
    .select('*, bookings!inner(booking_ref, service_name, service_price, customer_id, status, payment_status)', { count: 'exact' })
    .eq('shop_id', authUser.shop_id)

  if (status) dbQuery = dbQuery.eq('status', status)
  if (dateFrom) dbQuery = dbQuery.gte('created_at', dateFrom + 'T00:00:00')
  if (dateTo) dbQuery = dbQuery.lte('created_at', dateTo + 'T23:59:59')
  if (methodId) dbQuery = dbQuery.eq('payment_method_id', methodId)

  // Get total count
  let countQuery = supabaseAdmin
    .from('payment_verifications')
    .select('status', { count: 'exact', head: true })
    .eq('shop_id', authUser.shop_id)
  if (dateFrom) countQuery = countQuery.gte('created_at', dateFrom + 'T00:00:00')
  if (dateTo) countQuery = countQuery.lte('created_at', dateTo + 'T23:59:59')
  if (methodId) countQuery = countQuery.eq('payment_method_id', methodId)

  // Fetch paginated results and count in parallel
  const [verificationsResult, countResult] = await Promise.all([
    dbQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
    countQuery,
  ])

  const { data: verifications, error: fetchError } = verificationsResult
  const totalCount = countResult.count

  if (fetchError) {
    console.error('Error fetching verifications:', fetchError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch payment verifications' })
  }

  // Get counts per status for tab badges — also in parallel
  const { data: statusCounts } = await supabaseAdmin
    .from('payment_verifications')
    .select('status')
    .eq('shop_id', authUser.shop_id)

  const counts: Record<string, number> = { pending: 0, verified: 0, rejected: 0, more_info: 0 }
  if (statusCounts) {
    for (const row of statusCounts) {
      if (row.status in counts) counts[row.status]++
    }
  }

  // Batched enrichment: collect all IDs, fetch in 3 queries total instead of per-item N+1
  const enrichedVerifications = []
  if (verifications && verifications.length > 0) {
    // Collect unique IDs for batched queries
    const customerIds = [...new Set(verifications.map(v => v.customer_id).filter(Boolean))] as string[]
    const paymentMethodIds = [...new Set(verifications.map(v => v.payment_method_id).filter(Boolean))] as string[]
    const reviewerIds = [...new Set(verifications.map(v => v.reviewed_by).filter(Boolean))] as string[]

    // Fetch all in 3 parallel batched queries
    const [customersResult, paymentMethodsResult, reviewersResult] = await Promise.all([
      customerIds.length > 0
        ? supabaseAdmin.from('users').select('id, display_name, phone_number').in('id', customerIds)
        : Promise.resolve({ data: [] }),
      paymentMethodIds.length > 0
        ? supabaseAdmin.from('payment_methods').select('id, name').in('id', paymentMethodIds)
        : Promise.resolve({ data: [] }),
      reviewerIds.length > 0
        ? supabaseAdmin.from('users').select('id, display_name').in('id', reviewerIds)
        : Promise.resolve({ data: [] }),
    ])

    const customerMap = new Map((customersResult.data || []).map((c: any) => [c.id, c]))
    const pmMap = new Map((paymentMethodsResult.data || []).map((pm: any) => [pm.id, pm.name]))
    const reviewerMap = new Map((reviewersResult.data || []).map((r: any) => [r.id, r.display_name]))

    for (const v of verifications) {
      const booking = v.bookings as any
      const customer = v.customer_id ? customerMap.get(v.customer_id) : null

      // Generate signed URL for proof_image_url
      let proofImageUrl = v.proof_image_url || ''
      if (proofImageUrl) {
        const storagePath = extractProofStoragePath(proofImageUrl)
        if (storagePath) {
          const { data: signedData } = await supabaseAdmin.storage
            .from('payment-proofs')
            .createSignedUrl(storagePath, 3600)
          if (signedData?.signedUrl) proofImageUrl = signedData.signedUrl
        }
      }

      let paymentMethodName = 'Unknown'
      if (v.reference_number?.startsWith('PayMongo')) {
        paymentMethodName = v.reference_number
      } else if (v.payment_method_id && pmMap.has(v.payment_method_id)) {
        paymentMethodName = pmMap.get(v.payment_method_id)!
      }

      enrichedVerifications.push({
        ...v,
        bookings: undefined,
        booking_ref: booking?.booking_ref || '',
        service_name: booking?.service_name || '',
        service_price: booking?.service_price || 0,
        booking_status: booking?.status || '',
        booking_payment_status: booking?.payment_status || '',
        customer_name: customer?.display_name || 'Unknown',
        customer_phone: customer?.phone_number || '',
        payment_method_name: paymentMethodName,
        reviewed_by_name: v.reviewed_by ? (reviewerMap.get(v.reviewed_by) || null) : null,
        proof_image_url: proofImageUrl,
      })
    }
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