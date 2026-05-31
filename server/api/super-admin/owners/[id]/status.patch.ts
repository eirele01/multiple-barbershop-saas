/**
 * PATCH /api/super-admin/owners/[id]/status
 *
 * Toggle owner active/suspended status.
 * Also updates their shop is_active to match (suspend owner = suspend shop too).
 * Body: { is_active: boolean }
 */
import { z } from 'zod'
import { useSupabaseAdmin } from '~/server/utils/supabase'

const statusSchema = z.object({
  is_active: z.boolean(),
})

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

  // ── Validate body ──
  const body = await readBody(event)
  const parsed = statusSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const { is_active: isActive } = parsed.data

  try {
    // ── Get current owner data ──
    const { data: owner, error: ownerError } = await supabase
      .from('users')
      .select('id, email, display_name, role, shop_id, is_active')
      .eq('id', ownerId)
      .single()

    if (ownerError || !owner) {
      throw createError({ statusCode: 404, statusMessage: 'Owner not found' })
    }

    if (owner.role !== 'admin') {
      throw createError({ statusCode: 400, statusMessage: 'User is not a shop owner' })
    }

    if (owner.is_active === isActive) {
      return { success: true, message: `Owner is already ${isActive ? 'active' : 'suspended'}` }
    }

    // ── Update owner is_active ──
    const { error: updateOwnerError } = await supabase
      .from('users')
      .update({ is_active: isActive })
      .eq('id', ownerId)

    if (updateOwnerError) {
      console.error('[SUPER-ADMIN OWNER STATUS] Update owner error:', updateOwnerError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update owner status' })
    }

    // ── Also update their shop is_active to match ──
    if (owner.shop_id) {
      const { error: updateShopError } = await supabase
        .from('shops')
        .update({ is_active: isActive })
        .eq('id', owner.shop_id)

      if (updateShopError) {
        console.error('[SUPER-ADMIN OWNER STATUS] Update shop error:', updateShopError)
        // Non-fatal: owner was updated but shop update failed
      }
    } else {
      // Try to find shop by owner_id
      const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', ownerId)
        .limit(1)
        .single()

      if (shop) {
        await supabase
          .from('shops')
          .update({ is_active: isActive })
          .eq('id', shop.id)
      }
    }

    // ── Log to activity_logs ──
    const action = isActive ? 'owner.reinstated' : 'owner.suspended'
    await supabase.from('activity_logs').insert({
      shop_id: owner.shop_id,
      user_id: user.id,
      user_email: user.email,
      user_role: 'super_admin',
      action,
      entity_type: 'user',
      entity_id: ownerId,
      entity_name: owner.display_name || owner.email,
      old_value: { is_active: owner.is_active },
      new_value: { is_active: isActive },
    })

    return { success: true }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN OWNER STATUS] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update owner status' })
  }
})
