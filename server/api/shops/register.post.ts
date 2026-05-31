/**
 * POST /api/shops/register
 * Handles multi-step shop registration atomically.
 *
 * Body: { email, password, displayName, shopName, slug, phone, city, description }
 *
 * Steps:
 * 1. Validate input with Zod
 * 2. Check slug uniqueness (again, server-side)
 * 3. Create Supabase Auth user
 * 4. Create users record (role='admin')
 * 5. Create shops record (plan='basic', plan_status='active')
 * 6. Seed default working hours (Mon–Sat 9am–6pm, Sunday closed)
 * 7. Update user's shop_id
 * 8. Return shop + user data
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  shopName: z.string().min(2, 'Shop name must be at least 2 characters').max(100),
  slug: z.string()
    .min(3, 'Slug must be at least 3 characters')
    .max(60, 'Slug must be at most 60 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  phone: z.string().min(7, 'Phone number is required').max(20),
  city: z.string().min(2, 'City is required').max(100),
  description: z.string().max(200, 'Description must be at most 200 characters').optional(),
})

const DEFAULT_WORKING_HOURS = [
  { day: 'monday', open: '09:00', close: '18:00', is_open: true },
  { day: 'tuesday', open: '09:00', close: '18:00', is_open: true },
  { day: 'wednesday', open: '09:00', close: '18:00', is_open: true },
  { day: 'thursday', open: '09:00', close: '18:00', is_open: true },
  { day: 'friday', open: '09:00', close: '18:00', is_open: true },
  { day: 'saturday', open: '09:00', close: '18:00', is_open: true },
  { day: 'sunday', open: '09:00', close: '18:00', is_open: false },
]

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  // 1. Validate input
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { email, password, displayName, shopName, slug, phone, city, description } = parsed.data

  // Use service role key for all operations (bypass RLS during registration)
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // 2. Check slug uniqueness (server-side, authoritative)
  const { data: existingShop } = await supabase
    .from('shops')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (existingShop) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This shop slug is already taken. Please choose another.',
    })
  }

  // 3. Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // User must verify email before accessing dashboard
  })

  if (authError) {
    throw createError({
      statusCode: 400,
      statusMessage: authError.message || 'Failed to create account',
    })
  }

  const userId = authData.user.id

  // 4. Create users record (role='admin')
  const { error: userError } = await supabase.from('users').insert({
    id: userId,
    email,
    display_name: displayName,
    role: 'admin',
    shop_id: null, // Will update after shop creation
  })

  if (userError) {
    // Clean up: delete the auth user we just created
    await supabase.auth.admin.deleteUser(userId)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create user profile: ' + userError.message,
    })
  }

  // 5. Create shops record with default working hours
  const { data: shopData, error: shopError } = await supabase
    .from('shops')
    .insert({
      name: shopName,
      slug,
      phone,
      address_city: city,
      description: description || null,
      owner_id: userId,
      plan: 'basic',
      plan_status: 'active',
      working_hours: DEFAULT_WORKING_HOURS,
      timezone: 'Asia/Manila',
      // Default theme
      primary_color: '#1D1D1F',
      accent_color: '#8A8A8F',
      font_family: 'Inter',
      address_country: 'Philippines',
      // Default booking settings
      booking_settings: {
        slot_duration: 30,
        buffer_time: 5,
        max_advance_days: 30,
        cancellation_hours: 2,
        require_deposit: false,
        deposit_percentage: 0,
      },
      // Payment defaults
      paymongo_enabled: false,
      manual_payment_enabled: true,
      gcash_enabled: false,
      maya_enabled: false,
      instapay_enabled: false,
      qr_ph_enabled: false,
      // Email defaults (upgraded only)
      email_confirmation: false,
      email_reminder: false,
      reminder_hours: [24, 1],
      // Loyalty defaults (upgraded only)
      loyalty_enabled: false,
      loyalty_earn_rate: 1,
      loyalty_earn_base: 100,
      loyalty_welcome_bonus: 50,
      loyalty_expiry_months: 12,
      loyalty_tiers_enabled: false,
      loyalty_tiers: {
        bronze: { min: 0, max: 499, multiplier: 1 },
        silver: { min: 500, max: 1499, multiplier: 1.5 },
        gold: { min: 1500, max: 4999, multiplier: 2 },
        platinum: { min: 5000, max: null, multiplier: 3 },
      },
    })
    .select()
    .single()

  if (shopError) {
    // Clean up: delete user and auth user
    await supabase.from('users').delete().eq('id', userId)
    await supabase.auth.admin.deleteUser(userId)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create shop: ' + shopError.message,
    })
  }

  // 6. Update user's shop_id
  const { error: updateUserError } = await supabase
    .from('users')
    .update({ shop_id: shopData.id })
    .eq('id', userId)

  if (updateUserError) {
    console.error('Failed to update user shop_id:', updateUserError)
    // Non-fatal: shop and user exist, but shop_id isn't linked
    // This can be fixed manually
  }

  return {
    success: true,
    data: {
      user: {
        id: userId,
        email,
        displayName,
        role: 'admin',
        shopId: shopData.id,
      },
      shop: {
        id: shopData.id,
        name: shopName,
        slug,
        plan: 'basic',
        planStatus: 'active',
      },
    },
  }
})
