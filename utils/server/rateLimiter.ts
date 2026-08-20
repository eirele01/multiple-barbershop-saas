/**
 * In-memory sliding-window rate limiter for Nitro API routes.
 *
 * Tracks request counts per IP per route within a configurable time window.
 * Not distributed — each server instance has its own counter. For multi-instance
 * deployments, use Redis-based rate limiting instead.
 *
 * Usage:
 *   const rateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 30 })
 *   await rateLimit.check(event)  // throws 429 if exceeded
 */

interface RateLimitEntry {
  timestamps: number[]
}

interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

const store = new Map<string, RateLimitEntry>()

function cleanupExpired(entries: RateLimitEntry, now: number, windowMs: number): void {
  entries.timestamps = entries.timestamps.filter((t) => now - t < windowMs)
}

/**
 * Create a rate limiter with the given window and max request count.
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests } = config

  async function check(event: any, routeKey?: string): Promise<void> {
    const ip = getRequestIP(event, { xForwardedFor: true })
    const key = `${routeKey ?? event.path}::${ip}`
    const now = Date.now()

    let entry = store.get(key)
    if (!entry) {
      entry = { timestamps: [] }
      store.set(key, entry)
    }

    cleanupExpired(entry, now, windowMs)

    if (entry.timestamps.length >= maxRequests) {
      const retryAfter = Math.ceil((entry.timestamps[0] + windowMs - now) / 1000)
      throw createError({
        statusCode: 429,
        statusMessage: 'Too many requests. Please try again later.',
      })
    }

    entry.timestamps.push(now)
  }

  // Periodic cleanup to prevent memory leaks (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      cleanupExpired(entry, now, windowMs)
      if (entry.timestamps.length === 0) {
        store.delete(key)
      }
    }
  }, 5 * 60 * 1000).unref()

  // Expose cleanup for testing
  return { check, cleanup: () => clearInterval(cleanupInterval) }
}

// Pre-configured limiters for common use cases

// Booking creation: 5 requests per 5 minutes per IP
export const bookingRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 5,
})

// Payment proof upload: 3 requests per 5 minutes per IP
export const proofUploadRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 3,
})

// PayMongo verify: 10 requests per minute per IP
export const paymongoVerifyRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
})

// Auth endpoints (login/register/forgot-password): 5 requests per 5 minutes per IP
export const authRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 5,
})

// Webhook endpoints: 60 requests per minute per IP (generous, PayMongo may burst)
export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
})
