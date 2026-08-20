/**
 * PATCH /api/customer/profile
 *
 * Update customer profile:
 *   - display_name and phone_number (always editable)
 *   - Password change (requires old_password + new_password)
 *
 * Customer-only access.
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const profileSchema = z.object({
  display_name: z.string().min(1, 'Name is required').max(100).optional(),
  phone_number: z.string().max(20).optional(),
  old_password: z.string().min(1, 'Current password is required').optional(),
  new_password: z.string().min(8, 'Password must be at least 8 characters').optional(),
}).refine(
  (data) => {
    // If either password field is provided, both must be provided
    if (data.old_password || data.new_password) {
      return !!data.old_password && !!data.new_password
    }
    return true
  },
  { message: 'Both old_password and new_password are required to change password' }
)

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabase = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  )

  // Also create a client with the user's token for password verification
  const supabaseUser = createClient(
    config.public.supabaseUrl as string,
    config.public.supabaseKey as string
  )

  // Auth check
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : ''
  const authUser = await verifyAuth(token)

  // Customer-only access
  if (authUser.role !== 'customer') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Customer access required' })
  }

  // Validate body
  const body = await readBody(event)
  const parsed = profileSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { display_name, phone_number, old_password, new_password } = parsed.data

  // Check if there's anything to update
  if (!display_name && phone_number === undefined && !new_password) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  // Update profile fields (display_name, phone_number)
  const profileUpdates: Record<string, any> = {}
  if (display_name) profileUpdates.display_name = display_name
  if (phone_number !== undefined) profileUpdates.phone_number = phone_number || null

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await supabase
      .from('users')
      .update(profileUpdates)
      .eq('id', authUser.id)

    if (profileError) {
      console.error('Error updating customer profile:', profileError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update profile' })
    }
  }

  // Password change
  if (old_password && new_password) {
    // Verify old password by attempting sign-in
    const { error: verifyError } = await supabaseUser.auth.signInWithPassword({
      email: authUser.email!,
      password: old_password,
    })

    if (verifyError) {
      throw createError({ statusCode: 400, statusMessage: 'Current password is incorrect' })
    }

    // Update password
    const { error: passwordError } = await supabaseUser.auth.updateUser({
      password: new_password,
    })

    if (passwordError) {
      console.error('Error updating customer password:', passwordError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update password' })
    }
  }

  // Fetch updated profile
  const { data: updatedProfile } = await supabase
    .from('users')
    .select('id, email, display_name, phone_number, photo_url')
    .eq('id', authUser.id)
    .single()

  return {
    success: true,
    message: 'Profile updated successfully',
    profile: updatedProfile,
  }
})
