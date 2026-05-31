/**
 * POST /api/admin/settings/test-paymongo
 *
 * Tests the PayMongo API connection using either:
 *   1. An unsaved secret key sent in the request body (useUnsavedKey: true)
 *   2. The shop's stored (encrypted) secret key from the database
 *
 * Decrypts the key server-side, makes a test API call, returns result.
 *
 * Accessible by: admin only
 * NEVER sends the secret key to the frontend.
 *
 * Body:
 *   { useUnsavedKey?: boolean, secretKey?: string }
 */
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '~/utils/server/encryption'

const PAYMONGO_TIMEOUT_MS = 10_000

export default defineEventHandler(async (event) => {
  console.log('[test-paymongo] Request received')
  const config = useRuntimeConfig()

  // Parse body
  let body: { useUnsavedKey?: boolean; secretKey?: string } = {}
  try {
    body = await readBody(event) || {}
  } catch {
    body = {}
  }
  console.log('[test-paymongo] Body parsed, useUnsavedKey:', body.useUnsavedKey)

  // Authenticate
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    console.log('[test-paymongo] No token provided')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized — no token provided' })
  }

  const supabase = createClient(config.public.supabaseUrl as string, config.public.supabaseKey as string, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    console.log('[test-paymongo] Auth failed:', authError?.message)
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }
  console.log('[test-paymongo] User authenticated:', user.id)

  const supabaseAdmin = createClient(config.public.supabaseUrl as string, config.supabaseServiceKey as string)
  const { data: userProfile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role, shop_id')
    .eq('id', user.id)
    .single()

  if (profileError || !userProfile) {
    throw createError({ statusCode: 403, statusMessage: 'User profile not found' })
  }

  if (userProfile.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions — admin role required' })
  }

  if (!userProfile.shop_id) {
    throw createError({ statusCode: 403, statusMessage: 'No shop associated with this account' })
  }

  // Get shop info
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('paymongo_secret_key, paymongo_enabled, plan')
    .eq('id', userProfile.shop_id)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  // Only enforce plan and enabled checks when testing a SAVED key.
  // When testing an unsaved key (before first save), we allow it so the user
  // can verify their key works before enabling PayMongo.
  if (!body.useUnsavedKey && (shop.plan !== 'upgraded' || !shop.paymongo_enabled)) {
    throw createError({ statusCode: 403, statusMessage: 'PayMongo is not enabled for this shop. Enable it and save first, or test an unsaved key.' })
  }

  // Still check plan for unsaved key tests — only upgraded shops can use PayMongo
  if (body.useUnsavedKey && shop.plan !== 'upgraded') {
    throw createError({ statusCode: 403, statusMessage: 'PayMongo requires the Upgraded plan' })
  }

  // Determine which key to test
  let secretKey: string

  if (body.useUnsavedKey && body.secretKey) {
    // Test the unsaved key provided in the request body
    secretKey = body.secretKey.trim()
    console.log('[test-paymongo] Using unsaved key from body, length:', secretKey.length)
  } else {
    // Test the saved key from DB
    if (!shop.paymongo_secret_key) {
      console.log('[test-paymongo] No saved secret key found')
      return { valid: false, error: 'No PayMongo secret key saved yet. Enter your secret key and click Test Connection.' }
    }

    // Decrypt the saved secret key
    try {
      secretKey = decrypt(shop.paymongo_secret_key)
      console.log('[test-paymongo] Decrypted saved key, length:', secretKey.length)
    } catch (e) {
      console.error('[test-paymongo] Decrypt failed:', e)
      return { valid: false, error: 'Failed to decrypt stored secret key. This usually means NUXT_ENCRYPTION_KEY was changed after the key was saved. Please re-enter your key.' }
    }
  }

  // Test the connection by calling PayMongo's payment_methods endpoint with timeout
  console.log('[test-paymongo] Calling PayMongo API...')
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PAYMONGO_TIMEOUT_MS)

    const response = await fetch('https://api.paymongo.com/v1/payment_methods?limit=1', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      console.log('[test-paymongo] Connection successful!')
      return { valid: true }
    } else {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData?.errors?.[0]?.detail || errorData?.errors?.[0]?.code || 'Invalid key — check your PayMongo dashboard'
      console.error('[test-paymongo] API returned error:', response.status, errorData)
      return { valid: false, error: errorMessage }
    }
  } catch (error: any) {
    console.error('[test-paymongo] Fetch error:', error.name, error.message)

    if (error.name === 'AbortError') {
      return { valid: false, error: 'Connection timed out — PayMongo API did not respond within 10 seconds. Check your internet connection.' }
    }

    return { valid: false, error: 'Connection failed — please check your internet connection and try again.' }
  }
})
