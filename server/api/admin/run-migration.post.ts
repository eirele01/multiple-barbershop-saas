/**
 * POST /api/admin/run-migration
 *
 * One-time migration endpoint for: payment_verifications.payment_method_id nullable + PayMongo cleanup
 *
 * Steps:
 *   1. User runs ALTER TABLE SQL in Supabase Dashboard SQL Editor
 *   2. User calls this endpoint with ?confirm=true to clean up data
 *
 * DELETE this file after running the migration.
 *
 * Accessible by: admin only
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)

  // Authenticate — admin only
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const supabase = createClient(config.public.supabaseUrl as string, config.public.supabaseKey as string, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid token' })
  }

  const supabaseAdmin = createClient(config.public.supabaseUrl as string, config.supabaseServiceKey as string, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data: userProfile } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (!userProfile || userProfile.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin only' })
  }

  const results: string[] = []

  // ── Step 1: Check if column is already nullable ──
  // Test by trying to set payment_method_id = NULL on a PayMongo verification record
  const { data: testRecords } = await supabaseAdmin
    .from('payment_verifications')
    .select('id')
    .ilike('reference_number', 'PayMongo%')
    .limit(1)

  const hasPayMongoRecords = testRecords && testRecords.length > 0

  if (hasPayMongoRecords) {
    // Try setting payment_method_id = NULL on one record to test if column is nullable
    const { error: testError } = await supabaseAdmin
      .from('payment_verifications')
      .update({ payment_method_id: null })
      .eq('id', testRecords[0].id)

    if (testError && testError.code === '23502') {
      // Column is still NOT NULL
      return {
        success: false,
        needsAlterTable: true,
        message: 'Column payment_method_id is still NOT NULL. Please run the ALTER TABLE SQL first.',
        sqlToRun: 'ALTER TABLE payment_verifications ALTER COLUMN payment_method_id DROP NOT NULL;',
        instructions: [
          '1. Go to Supabase Dashboard → SQL Editor',
          '2. Paste and run: ALTER TABLE payment_verifications ALTER COLUMN payment_method_id DROP NOT NULL;',
          '3. Then call this endpoint again with ?confirm=true',
        ],
      }
    }

    if (testError) {
      throw createError({ statusCode: 500, statusMessage: `Test update failed: ${testError.message}` })
    }

    // Column IS nullable — the test record was already updated
    results.push('✅ Column payment_method_id is nullable')
  }

  // ── Step 2: Update ALL PayMongo verification records ──
  if (query.confirm === 'true') {
    const { data: paymongoVerifications } = await supabaseAdmin
      .from('payment_verifications')
      .select('id, payment_method_id, reference_number')
      .ilike('reference_number', 'PayMongo%')

    if (paymongoVerifications && paymongoVerifications.length > 0) {
      // Set payment_method_id = NULL for all PayMongo verification records
      const { error: updateError, count } = await supabaseAdmin
        .from('payment_verifications')
        .update({ payment_method_id: null })
        .ilike('reference_number', 'PayMongo%')

      if (updateError) {
        results.push(`❌ Failed to update PayMongo verifications: ${updateError.message}`)
      } else {
        results.push(`✅ Set payment_method_id = NULL for ${paymongoVerifications.length} PayMongo verification records`)
      }

      // ── Step 3: Check which manual "PayMongo" methods can be deleted ──
      const methodIds = [...new Set(paymongoVerifications.map(v => v.payment_method_id).filter(Boolean) as string[])]

      for (const methodId of methodIds) {
        const { count: bookingCount } = await supabaseAdmin
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('payment_method_id', methodId)

        const { count: verifyCount } = await supabaseAdmin
          .from('payment_verifications')
          .select('id', { count: 'exact', head: true })
          .eq('payment_method_id', methodId)

        const { data: method } = await supabaseAdmin
          .from('payment_methods')
          .select('id, name')
          .eq('id', methodId)
          .single()

        results.push(`📋 Method "${method?.name}" (${methodId}): bookings=${bookingCount || 0}, verifications=${verifyCount || 0}`)

        if ((bookingCount || 0) === 0 && (verifyCount || 0) === 0) {
          results.push('   ✅ Safe to delete from admin panel!')
        } else {
          results.push('   ⚠️ Still has references — deactivate instead')
        }
      }
    }

    // ── Step 4: Fix bookings with UUID in payment_method field ──
    const { data: paymongoBookings } = await supabaseAdmin
      .from('bookings')
      .select('id, payment_method, payment_type, booking_ref')
      .eq('payment_type', 'paymongo')

    if (paymongoBookings && paymongoBookings.length > 0) {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      const badBookings = paymongoBookings.filter(b => uuidPattern.test(b.payment_method || ''))

      if (badBookings.length > 0) {
        results.push(`⚠️ Found ${badBookings.length} PayMongo booking(s) with UUID in payment_method field`)
        badBookings.forEach(b => results.push(`   - ${b.booking_ref}: payment_method = ${b.payment_method}`))

        const { error: fixError } = await supabaseAdmin
          .from('bookings')
          .update({ payment_method: 'paymongo' })
          .eq('payment_type', 'paymongo')
          .like('payment_method', '________-____-____-____-____________')

        if (fixError) {
          results.push(`❌ Failed to fix: ${fixError.message}`)
        } else {
          results.push(`✅ Fixed ${badBookings.length} booking(s)`)
        }
      } else {
        results.push('✅ All PayMongo bookings have correct payment_method values')
      }
    }

    results.push('=== Migration complete ===')
  } else {
    results.push('Column is nullable! Call with ?confirm=true to run the data cleanup.')
  }

  return { success: true, results }
})
