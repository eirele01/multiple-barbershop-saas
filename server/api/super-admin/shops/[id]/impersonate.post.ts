/**
 * POST /api/super-admin/shops/[id]/impersonate
 *
 * Create a short-lived impersonation token for a shop admin.
 * Returns an encrypted token that expires in 15 minutes.
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { encrypt } from '~/utils/server/encryption'

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

  try {
    // ── Get shop ──
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('id, name')
      .eq('id', shopId)
      .single()

    if (shopError || !shop) {
      throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
    }

    // ── Get the shop's admin user ──
    const { data: shopAdmin, error: adminError } = await supabase
      .from('users')
      .select('id, email, display_name')
      .eq('shop_id', shopId)
      .eq('role', 'admin')
      .eq('is_active', true)
      .limit(1)
      .single()

    if (adminError || !shopAdmin) {
      throw createError({ statusCode: 404, statusMessage: 'No active admin found for this shop' })
    }

    // ── Create impersonation payload ──
    const exp = Math.floor(Date.now() / 1000) + (15 * 60) // 15 min from now
    const payload = JSON.stringify({
      shopId: shop.id,
      shopAdminUserId: shopAdmin.id,
      impersonatedBy: user.id,
      exp,
      shopName: shop.name,
    })

    // ── Encrypt the payload to create the token ──
    const encryptedToken = encrypt(payload)

    // ── Log to activity_logs ──
    await supabase.from('activity_logs').insert({
      shop_id: shopId,
      user_id: user.id,
      user_email: user.email,
      user_role: 'super_admin',
      action: 'admin.impersonate',
      entity_type: 'shop',
      entity_id: shopId,
      entity_name: shop.name,
      new_value: { impersonatedUser: shopAdmin.email },
    })

    return { token: encryptedToken }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN IMPERSONATE] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create impersonation token' })
  }
})
