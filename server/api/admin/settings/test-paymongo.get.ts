/**
 * GET /api/admin/settings/test-paymongo
 *
 * Tests the PayMongo API connection using the shop's stored secret key.
 * Decrypts the key server-side, makes a test API call, returns result.
 *
 * Accessible by: admin only
 * NEVER sends the secret key to the frontend.
 */
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '~/utils/server/encryption'

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

  // Get shop's encrypted secret key
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('paymongo_secret_key, paymongo_enabled, plan')
    .eq('id', userProfile.shop_id)
    .single()

  if (shopError || !shop) {
    throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
  }

  if (shop.plan !== 'upgraded' || !shop.paymongo_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'PayMongo is not enabled for this shop' })
  }

  if (!shop.paymongo_secret_key) {
    return { valid: false, error: 'No PayMongo secret key configured. Please add your secret key first.' }
  }

  // Decrypt the secret key
  let secretKey: string
  try {
    secretKey = decrypt(shop.paymongo_secret_key)
  } catch (e) {
    console.error('Error decrypting PayMongo secret key:', e)
    return { valid: false, error: 'Failed to decrypt stored secret key. Please re-enter your key.' }
  }

  // Test the connection by calling PayMongo's payment_methods endpoint
  try {
    const response = await fetch('https://api.paymongo.com/v1/payment_methods?limit=1', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
    })

    if (response.ok) {
      return { valid: true }
    } else {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData?.errors?.[0]?.detail || errorData?.errors?.[0]?.code || 'Invalid key — check your PayMongo dashboard'
      console.error('PayMongo test connection failed:', response.status, errorData)
      return { valid: false, error: errorMessage }
    }
  } catch (error: any) {
    console.error('PayMongo test connection error:', error)
    return { valid: false, error: 'Connection failed — please check your internet connection and try again.' }
  }
})
