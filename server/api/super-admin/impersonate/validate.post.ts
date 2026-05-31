/**
 * POST /api/super-admin/impersonate/validate
 *
 * Validates an impersonation token and returns the embedded data.
 * The token is an encrypted JSON string containing:
 *   - shopId: the shop to impersonate
 *   - shopAdminUserId: the shop admin's user ID
 *   - shopName: the shop's name
 *   - impersonatedBy: the super admin's user ID
 *   - exp: expiration timestamp (epoch ms)
 *
 * This endpoint does NOT require super_admin role check — the encrypted
 * token itself is the proof of authorization (created by a super admin).
 */

import { decrypt } from '~/utils/server/encryption'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { token } = body

  if (!token || typeof token !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Token is required',
    })
  }

  try {
    // Decrypt the token
    const decryptedJson = decrypt(token)

    if (!decryptedJson) {
      return { valid: false }
    }

    let payload: {
      shopId: string
      shopAdminUserId: string
      shopName: string
      impersonatedBy: string
      exp: number
    }

    try {
      payload = JSON.parse(decryptedJson)
    } catch {
      return { valid: false }
    }

    // Check if all required fields are present
    if (!payload.shopId || !payload.shopAdminUserId || !payload.shopName || !payload.impersonatedBy || !payload.exp) {
      return { valid: false }
    }

    // Check if the token has expired (exp is in epoch seconds, same as JWT standard)
    const nowSec = Math.floor(Date.now() / 1000)
    if (payload.exp < nowSec) {
      return { valid: false, reason: 'expired' }
    }

    // Token is valid — return the embedded data
    return {
      valid: true,
      shopId: payload.shopId,
      shopAdminUserId: payload.shopAdminUserId,
      shopName: payload.shopName,
      impersonatedBy: payload.impersonatedBy,
    }
  } catch (error) {
    console.error('Impersonation token validation error:', error)
    return { valid: false }
  }
})
