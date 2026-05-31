/**
 * POST /api/admin/shop/add-background-color
 *
 * One-time migration: Add background_color column to shops table.
 * DELETE this file after running successfully.
 *
 * Accessible by: admin only
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

  // Check if column already exists by trying to select it
  const { error: checkError } = await supabaseAdmin
    .from('shops')
    .select('background_color')
    .limit(1)

  if (!checkError) {
    return { success: true, message: 'Column background_color already exists', alreadyExists: true }
  }

  // Column doesn't exist — tell the user to run the SQL manually
  return {
    success: false,
    needsAlterTable: true,
    message: 'Column background_color does not exist. Please run the ALTER TABLE SQL in Supabase Dashboard SQL Editor.',
    sqlToRun: "ALTER TABLE shops ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT '#0D0D0D';",
    instructions: [
      '1. Go to Supabase Dashboard → SQL Editor',
      "2. Paste and run: ALTER TABLE shops ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT '#0D0D0D';",
      '3. Then call this endpoint again to verify',
    ],
  }
})
