/**
 * PATCH /api/super-admin/shops/[id]/status
 *
 * Toggle shop active/suspended status.
 * Also updates the owner's is_active to match.
 * Body: { is_active: boolean }
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { z } from 'zod'

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

  const shopId = getRouterParam(event, 'id')
  if (!shopId) {
    throw createError({ statusCode: 400, statusMessage: 'Shop ID is required' })
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
    // ── Get current shop data ──
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('id, name, owner_id, is_active')
      .eq('id', shopId)
      .single()

    if (shopError || !shop) {
      throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
    }

    if (shop.is_active === isActive) {
      return { success: true, message: `Shop is already ${isActive ? 'active' : 'suspended'}` }
    }

    // ── Update shop is_active ──
    const { error: updateShopError } = await supabase
      .from('shops')
      .update({ is_active: isActive })
      .eq('id', shopId)

    if (updateShopError) {
      console.error('[SUPER-ADMIN SHOP STATUS] Update shop error:', updateShopError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update shop status' })
    }

    // ── Update owner is_active to match ──
    if (shop.owner_id) {
      const { error: updateOwnerError } = await supabase
        .from('users')
        .update({ is_active: isActive })
        .eq('id', shop.owner_id)

      if (updateOwnerError) {
        console.error('[SUPER-ADMIN SHOP STATUS] Update owner error:', updateOwnerError)
        // Non-fatal: shop was updated but owner update failed
      }
    }

    // ── Log to activity_logs ──
    const action = isActive ? 'shop.reinstated' : 'shop.suspended'
    await supabase.from('activity_logs').insert({
      shop_id: shopId,
      user_id: user.id,
      user_email: user.email,
      user_role: 'super_admin',
      action,
      entity_type: 'shop',
      entity_id: shopId,
      entity_name: shop.name,
      old_value: { is_active: shop.is_active },
      new_value: { is_active: isActive },
    })

    return { success: true }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN SHOP STATUS] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update shop status' })
  }
})
