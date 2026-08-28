# API Security

Security guidelines for PayMongo integration including API key management, PCI DSS scope, webhook security, and HTTPS requirements.

## API Key Security

### Key Types and Usage

| Key | Prefix | Environment | Where to Use | Risk if Exposed |
|-----|--------|-------------|--------------|-----------------|
| Public Test | `pk_test_` | Sandbox | Client-side (frontend) | Low |
| Secret Test | `sk_test_` | Sandbox | Server-side only | Medium (test data) |
| Public Live | `pk_live_` | Production | Client-side (frontend) | Low |
| Secret Live | `sk_live_` | Production | Server-side only | **Critical** (full account access) |

### Rules

1. **Never expose `sk_*` keys** in client-side code, public repositories, or logs
2. **Store in environment variables** (`.env` for dev, secrets manager for production)
3. **Use `pk_*` keys in frontend** — safe to embed in client-side code
4. **Isolate environments** — strictly use test keys for dev/staging, live keys for production
5. **Rotate keys regularly** — regenerate via PayMongo Dashboard > Developers (requires MFA)
6. **Immediate invalidation on rotation** — old key is instantly invalidated when regenerated

### Nuxt Configuration

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  runtimeConfig: {
    // Server-only — never exposed to client
    paymongoSecretKey: process.env.PAYMONGO_SECRET_KEY || '',
    paymongoWebhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET || '',
    // Public — exposed to client
    public: {
      paymongoPublicKey: process.env.NUXT_PUBLIC_PAYMONGO_PUBLIC_KEY || '',
    },
  },
})
```

### .env Example

```env
# PayMongo API Keys
PAYMONGO_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx
NUXT_PUBLIC_PAYMONGO_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
PAYMONGO_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx

# Ensure .env is in .gitignore
```

```gitignore
# .gitignore
.env
```

## PCI DSS Scope

### PayMongo Handles (PCI Service Provider Level 1)

- Card number storage and tokenization
- 3D Secure 2.0 processing
- TLS encryption on all API endpoints
- Machine learning fraud detection
- Continuous vulnerability scanning
- Annual PCI audits

### Merchant Responsibilities

- **Never store raw card numbers** — use client-side tokenization
- Redirect customers for 3DS and handle returns correctly
- Ensure servers make HTTPS-only requests to PayMongo
- Monitor orders for unusual patterns
- Keep server dependencies updated
- Maintain your own SAQ based on integration type

## Card Data Handling

| Do | Don't |
|----|-------|
| Collect card details client-side | Send raw card numbers to your server |
| Use PayMongo's tokenization | Store card data in your database |
| Let PayMongo handle validation | Log request bodies containing card details |
| Create Payment Methods with public key | Expose CVC, expiry, or card number server-side |

## HTTPS Requirements

1. **Enforce HTTPS** on all checkout and payment pages
2. **Use HTTPS-only** for PayMongo API requests
3. **Serve return URLs over HTTPS** — PayMongo redirects use HTTPS

## Webhook Security

1. **Always verify `Paymongo-Signature` header** using HMAC-SHA256
2. **Use separate webhook endpoints** for test and live modes
3. **Check timestamp tolerance** (recommended: 5 minutes) to prevent replay attacks
4. **Use `timingSafeEqual` for signature comparison** to prevent timing attacks
5. **Process events idempotently** — webhooks may be delivered multiple times
6. **Respond within 30 seconds** or PayMongo will retry (up to 12 times)

### Webhook Signature Verification

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

function verifyPaymongoSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceMs = 5 * 60 * 1000
): boolean {
  const parts = signatureHeader.split(',')
  const parsed: Record<string, string> = {}
  for (const part of parts) {
    const [key, value] = part.split('=')
    if (key && value !== undefined) parsed[key.trim()] = value.trim()
  }

  const timestamp = parsed.t
  const signature = parsed.te || parsed.li
  if (!timestamp || !signature) return false

  // Prevent replay attacks
  if (Math.abs(Date.now() - parseInt(timestamp, 10) * 1000) > toleranceMs) return false

  const computed = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  return timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
}
```

## 3D Secure (3DS 2.0)

- PayMongo automatically applies 3DS 2.0 to card transactions
- When authenticated, liability for fraud-related chargebacks shifts to the issuing bank
- Configure via `payment_method_options.card.request_three_d_secure`:
  - `any` — requires 3DS if supported by the card
  - `automatic` — uses the card issuer's default

## Best Practices Summary

| Practice | Why |
|----------|-----|
| Store secret keys in env vars | Prevents exposure in source control |
| Verify webhook signatures | Prevents forged events |
| Confirm payment server-side | Prevents client-side manipulation |
| Use HTTPS everywhere | Protects data in transit |
| Rotate API keys regularly | Limits exposure window |
| Enable 3DS | Shifts fraud liability to issuer |
| Separate test/live webhooks | Prevents test events in production |
| Use constant-time comparison | Prevents timing attacks |
| Never log card data | PCI DSS compliance |
| Monitor webhook delivery | Detect integration failures early |
