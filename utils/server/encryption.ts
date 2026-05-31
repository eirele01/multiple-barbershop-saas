/**
 * Encryption Utility — AES-256-CBC
 *
 * Uses Node.js built-in crypto module only (no npm packages).
 * Used to encrypt/decrypt sensitive fields like PayMongo secret keys
 * and webhook secrets stored in the shops table.
 *
 * Algorithm: aes-256-cbc
 * Key: SHA-256 hash of NUXT_ENCRYPTION_KEY env var
 * IV: random 16 bytes prepended to ciphertext
 * Output: hex string format "ivHex:encryptedHex"
 *
 * Null-safe: encrypt/decrypt of null/undefined/'' returns ''
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'crypto'

/**
 * Derive a 32-byte AES key from the NUXT_ENCRYPTION_KEY env var.
 * Throws if the env var is not set.
 *
 * Resolution order:
 * 1. Cached key (once resolved, never re-derive)
 * 2. process.env.NUXT_ENCRYPTION_KEY (available in dev mode and after Nitro startup)
 * 3. useRuntimeConfig().nuxtEncryptionKey (available in production builds via nuxt.config.ts)
 *
 * We avoid calling useRuntimeConfig() outside a Nuxt request context,
 * as it throws an error that can crash the server (e.g., from Supabase auto-refresh).
 */
let _cachedKey: Buffer | null = null

function getEncryptionKey(): Buffer {
  if (_cachedKey) return _cachedKey

  let envKey: string | undefined

  // 1. Try process.env first (always available in dev mode, also set by Nitro at startup)
  envKey = process.env.NUXT_ENCRYPTION_KEY

  // 2. If not in process.env, try runtimeConfig (production builds inline the value)
  if (!envKey) {
    try {
      const config = useRuntimeConfig()
      envKey = config.nuxtEncryptionKey || undefined
      // If found via runtimeConfig, also set it in process.env for future calls
      if (envKey) {
        process.env.NUXT_ENCRYPTION_KEY = envKey
      }
    } catch {
      // Not in a Nuxt request context — can't access runtimeConfig
    }
  }

  if (!envKey || envKey === 'change-this-to-a-random-32-char-secret') {
    throw new Error('NUXT_ENCRYPTION_KEY is not configured. Set it in your .env file.')
  }

  _cachedKey = createHash('sha256').update(envKey).digest()
  return _cachedKey
}

/**
 * Encrypt a plaintext string using AES-256-CBC.
 *
 * @param plaintext - The string to encrypt
 * @returns "ivHex:encryptedHex" format, or '' if input is falsy
 */
export function encrypt(plaintext: string | null | undefined): string {
  if (!plaintext) return ''

  const key = getEncryptionKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  return `${iv.toString('hex')}:${encrypted}`
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 *
 * @param ciphertext - "ivHex:encryptedHex" format
 * @returns The original plaintext, or '' if input is falsy
 */
export function decrypt(ciphertext: string | null | undefined): string {
  if (!ciphertext) return ''

  const key = getEncryptionKey()
  const parts = ciphertext.split(':')

  if (parts.length !== 2) {
    throw new Error('Invalid ciphertext format — expected "ivHex:encryptedHex"')
  }

  const iv = Buffer.from(parts[0], 'hex')
  const encrypted = parts[1]

  const decipher = createDecipheriv('aes-256-cbc', key, iv)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Verify an HMAC-SHA256 signature using timing-safe comparison.
 * Used for PayMongo webhook signature verification.
 *
 * @param payload - The raw body string
 * @param secret - The webhook secret (decrypted)
 * @param signature - The signature to verify (from paymongo-signature header)
 * @returns true if the signature is valid
 */
export function verifyHmacSignature(
  payload: string,
  secret: string,
  signature: string
): boolean {
  const hmac = createHash('sha256')
    .update(payload)
    .update(secret)
    .digest('hex')

  // Use timingSafeEqual to prevent timing attacks
  const hmacBuf = Buffer.from(hmac, 'hex')
  const sigBuf = Buffer.from(signature, 'hex')

  if (hmacBuf.length !== sigBuf.length) {
    return false
  }

  return timingSafeEqual(hmacBuf, sigBuf)
}
