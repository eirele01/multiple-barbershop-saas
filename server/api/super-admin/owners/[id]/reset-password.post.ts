/**
 * POST /api/super-admin/owners/[id]/reset-password
 *
 * Generate a password reset link for an owner.
 * Uses Supabase admin API to generate a recovery link.
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const supabase = useSupabaseAdmin()

  // ── Auth: verify super_admin ──
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, statusMessage: 'Invalid token' })

  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || userProfile.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Super admin access required' })
  }

  const ownerId = getRouterParam(event, 'id')
  if (!ownerId) {
    throw createError({ statusCode: 400, statusMessage: 'Owner ID is required' })
  }

  try {
    // ── Get the owner's email ──
    const { data: owner, error: ownerError } = await supabase
      .from('users')
      .select('id, email, display_name, shop_id')
      .eq('id', ownerId)
      .single()

    if (ownerError || !owner) {
      throw createError({ statusCode: 404, statusMessage: 'Owner not found' })
    }

    // ── Generate password reset link ──
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: owner.email,
    })

    if (linkError || !linkData) {
      console.error('[SUPER-ADMIN RESET PASSWORD] Generate link error:', linkError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to generate reset link' })
    }

    // ── Log to activity_logs ──
    await supabase.from('activity_logs').insert({
      shop_id: owner.shop_id,
      user_id: user.id,
      user_email: user.email,
      user_role: 'super_admin',
      action: 'owner.reset_password',
      entity_type: 'user',
      entity_id: ownerId,
      entity_name: owner.display_name || owner.email,
    })

    return { resetLink: linkData.properties?.action_link || '' }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN RESET PASSWORD] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to generate reset link' })
  }
})
