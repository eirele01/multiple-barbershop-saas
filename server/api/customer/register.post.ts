/**
 * POST /api/customer/register
 *
 * Register a new customer account.
 * Creates a Supabase auth user + users table record with role = 'customer'.
 * No shop_id — customers are not associated with a specific shop.
 *
 * Body:
 *   first_name  — required, 2–100 chars
 *   last_name   — required, 2–100 chars
 *   email       — required, valid email
 *   phone       — required, up to 50 chars
 *   password    — required, min 8 chars
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const registerCustomerSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters').max(100),
  last_name: z.string().min(2, 'Last name must be at least 2 characters').max(100),
  email: z.string().email('Please provide a valid email address'),
  phone: z.string().min(1, 'Phone number is required').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Parse and validate body
  const body = await readBody(event)
  const parsed = registerCustomerSchema.safeParse(body)

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed'
    throw createError({ statusCode: 400, statusMessage: firstError })
  }

  const { first_name, last_name, email, phone, password } = parsed.data

  // Create Supabase admin client (service role, bypasses RLS)
  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Create the auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: `${first_name} ${last_name}`,
        role: 'customer',
      },
    },
  })

  if (authError) {
    // Map common Supabase auth errors to friendly messages
    if (authError.message.includes('already registered')) {
      throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists' })
    }
    throw createError({ statusCode: 400, statusMessage: authError.message })
  }

  if (!authData.user) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create account' })
  }

  // 2. Create the users table record
  const { error: profileError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authData.user.id,
      email,
      display_name: `${first_name} ${last_name}`,
      phone_number: phone,
      role: 'customer',
      shop_id: null,
    })

  if (profileError) {
    console.error('Error creating customer profile:', profileError)
    // Attempt to clean up the auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create customer profile' })
  }

  return {
    success: true,
    data: {
      user: {
        id: authData.user.id,
        email,
        display_name: `${first_name} ${last_name}`,
        role: 'customer',
      },
    },
  }
})
