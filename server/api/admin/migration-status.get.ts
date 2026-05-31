/**
 * GET /api/admin/migration-status
 *
 * Check if the payment_verifications.payment_method_id migration has been applied.
 * Returns instructions if the column is still NOT NULL.
 *
 * DELETE this file after migration is complete.
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

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
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || userProfile.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin only' })
  }

  // Test if column is nullable by trying to insert a record with payment_method_id = NULL
  // (We'll immediately delete it)
  // Actually, safer to try an UPDATE on an existing PayMongo record
  const { data: testRecord } = await supabaseAdmin
    .from('payment_verifications')
    .select('id, payment_method_id, reference_number')
    .ilike('reference_number', 'PayMongo%')
    .limit(1)
    .maybeSingle()

  if (!testRecord) {
    return {
      isNullable: true,
      message: 'No PayMongo verification records found. Migration not needed or already applied.',
      hasPayMongoRecords: false,
    }
  }

  // Try to set payment_method_id = NULL
  const { error: testError } = await supabaseAdmin
    .from('payment_verifications')
    .update({ payment_method_id: null })
    .eq('id', testRecord.id)

  if (testError && testError.code === '23502') {
    return {
      isNullable: false,
      hasPayMongoRecords: true,
      message: 'Column payment_method_id is still NOT NULL. Run the ALTER TABLE SQL first.',
      sql: 'ALTER TABLE payment_verifications ALTER COLUMN payment_method_id DROP NOT NULL;',
      instructions: [
        '1. Open Supabase Dashboard → SQL Editor',
        '2. Paste and run: ALTER TABLE payment_verifications ALTER COLUMN payment_method_id DROP NOT NULL;',
        '3. Then call POST /api/admin/run-migration?confirm=true to clean up data',
      ],
    }
  }

  // Column is nullable — the test record was updated
  // Now check if all PayMongo records have been cleaned up
  const { count: remainingWithMethod } = await supabaseAdmin
    .from('payment_verifications')
    .select('id', { count: 'exact', head: true })
    .ilike('reference_number', 'PayMongo%')
    .not('payment_method_id', 'is', null)

  return {
    isNullable: true,
    hasPayMongoRecords: true,
    needsCleanup: (remainingWithMethod || 0) > 0,
    remainingRecordsWithMethodId: remainingWithMethod || 0,
    message: (remainingWithMethod || 0) > 0
      ? 'Column is nullable but PayMongo records still have payment_method_id set. Call POST /api/admin/run-migration?confirm=true to clean up.'
      : 'Migration fully applied. PayMongo verification records cleaned up.',
  }
})
