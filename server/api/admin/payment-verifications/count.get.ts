/**
 * GET /api/admin/payment-verifications/count
 *
 * Returns the count of pending payment verifications for the authenticated
 * user's shop. Used by the admin sidebar badge.
 *
 * Accessible by: admin, manager, cashier
 */
import { getHeader } from 'h3'
import { verifyAuth, requirePaymentVerification } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  const user = await verifyAuth(token!)
  requirePaymentVerification(user)

  const shopId = user.shop_id!
  const supabase = useSupabaseAdmin()

  const { count, error } = await supabase
    .from('payment_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('status', 'pending')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { count: count ?? 0 }
})
