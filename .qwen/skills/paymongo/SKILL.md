---
name: paymongo
description: "PayMongo payment integration for Nuxt/Node.js — payment intents, checkout sessions, webhooks, refunds, and API security. Triggers: PayMongo integration, payment processing, checkout, refunds, webhooks, GCash, card payments, QR Ph, e-wallets, or Philippine payment gateway."
metadata:
  author: PayMongo
  version: "2026.08.11"
  source: Generated from https://docs.paymongo.com/llms.txt
---

# PayMongo Payment Integration

PayMongo is a Philippine payment gateway supporting credit/debit cards, e-wallets (GCash, Maya, GrabPay, ShopeePay), QR Ph, online banking (Brankas), and Buy Now Pay Later (BillEase, Atome).

## Core Concepts

- **Payment Intent**: Server-side record of a single checkout transaction. Holds amount (in centavos), currency, allowed payment methods, and current status.
- **Payment Method**: Customer's tokenized payment details attached to a Payment Intent to trigger processing.
- **Checkout Session**: Hosted checkout page. Pass line items and payment method types, get a `checkout_url` to redirect customers.
- **client_key**: Short-lived token from Payment Intent creation. Pass to frontend for client-side attach operations without exposing the secret key.
- **centavos**: All amounts in smallest currency unit. PHP 100.00 = `10000`.
- **API Keys**: Secret keys (`sk_*`) for server-side only, public keys (`pk_*`) for client-side. Always use HTTP Basic Auth with secret key as username and empty password.

## API Key Types

| Key | Environment | Use Case |
|-----|------------|----------|
| `pk_test_*` | Sandbox | Client-side (safe to expose) |
| `sk_test_*` | Sandbox | Server-side (keep private) |
| `pk_live_*` | Production | Client-side (safe to expose) |
| `sk_live_*` | Production | Server-side (highly private) |

Authentication: `Authorization: Basic base64(SECRET_KEY:)`

## Quick Reference

### Routing Table

| Task | Load these references |
|------|----------------------|
| Accept card/e-wallet payments | [payment-intents](references/payment-intents.md) |
| Hosted checkout page | [checkout-sessions](references/checkout-sessions.md) |
| Webhook endpoints | [webhooks](references/webhooks.md) |
| Refund a payment | [refunds](references/refunds.md) |
| Security configuration | [security](references/security.md) |
| Test the integration | [testing](references/testing.md) |

### Nuxt Server-Side Implementation Pattern

For Nuxt projects, the standard pattern is:

1. **`runtimeConfig`** — Store PayMongo keys in `nuxt.config.ts`:
   ```ts
   runtimeConfig: {
     paymongoSecretKey: process.env.PAYMONGO_SECRET_KEY || '',
     paymongoWebhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET || '',
     public: {
       paymongoPublicKey: process.env.NUXT_PUBLIC_PAYMONGO_PUBLIC_KEY || '',
     },
   }
   ```

2. **Server API routes** — `server/api/paymongo/*.ts` for all secret-key operations:
   - `create-payment-intent.post.ts` — Create Payment Intent, return `client_key` to frontend
   - `create-checkout-session.post.ts` — Create Checkout Session, return `checkout_url`
   - `refund.post.ts` — Create refund
   - `payment-intent-status.get.ts` — Retrieve Payment Intent status

3. **Webhook handler** — `server/api/paymongo/webhook.post.ts`:
   - Verify `Paymongo-Signature` header with HMAC-SHA256
   - Handle `payment.paid`, `payment.failed`, `refund.succeeded` events
   - Respond with 200 within 30 seconds

4. **Client-side** — Use `useFetch` or `$fetch` to call server API routes. Never call PayMongo directly from the client with secret keys.

### Payment Flow (5 Steps)

1. **Create Payment Intent** (server, secret key) → receive `id` + `client_key`
2. **Create Payment Method** (client, public key) → receive payment method ID
3. **Attach Payment Method** (client, public key + `client_key`) → triggers processing
4. **Handle Next Action** — redirect to 3DS, e-wallet checkout, or display QR Ph
5. **Confirm via Webhook** — listen for `payment.paid` or `payment.failed`

### Payment Intent Lifecycle

| Status | Meaning |
|--------|---------|
| `awaiting_payment_method` | Initial state or after failure/timeout — no method attached |
| `awaiting_next_action` | Method attached — customer must complete action (3DS, redirect, scan) |
| `processing` | Transient — requery after 1–2 seconds |
| `succeeded` | Terminal — payment received |

### Supported Payment Methods

| Method | Code | Complete Window |
|--------|------|-----------------|
| Credit/Debit Card | `card` | Immediate |
| GCash | `gcash` | 4 hours |
| Maya | `paymaya` | 30 minutes |
| GrabPay | `grab_pay` | 15 minutes |
| ShopeePay | `shopee_pay` | 20 minutes (configurable) |
| QR Ph | `qrph` | 30 minutes (configurable) |
| Online Banking | `brankas` / `dob` | Varies by bank |
| BillEase | `billease` | Immediate |

### Amount Limits

- **General Minimum**: PHP 1.00 (`100` centavos)
- **BDO, BillEase, Atome Minimum**: PHP 100.00 (`10000` centavos)
- **Card Installments Minimum**: PHP 3,000.00 (`300000` centavos)
- **Cards Maximum**: PHP 10,000,000.00
- **E-wallets Maximum**: PHP 100,000.00

## Reference Files

**Core integration:**
- [payment-intents](references/payment-intents.md) — Payment Intent API, creation, attachment, lifecycle, Nuxt server routes
- [checkout-sessions](references/checkout-sessions.md) — Checkout Session API, hosted checkout, line items, redirect URLs
- [webhooks](references/webhooks.md) — Webhook setup, signature verification, event types, Nuxt webhook handler

**Operations:**
- [refunds](references/refunds.md) — Refund API, eligibility by payment method, partial/full refunds
- [security](references/security.md) — API key management, PCI DSS scope, webhook security, HTTPS requirements
- [testing](references/testing.md) — Test cards, e-wallet simulation, test OTPs, test scenarios

## Critical Rules

1. **Never expose `sk_*` keys in client-side code.** All secret-key operations happen in Nuxt server routes (`server/api/`).
2. **Always verify webhook signatures.** Use HMAC-SHA256 with the webhook secret and `Paymongo-Signature` header.
3. **Always confirm payment server-side.** Never fulfill orders based on client-side success responses or redirect URL parameters alone.
4. **Amounts are in centavos.** PHP 100.00 = `10000`. Validate amounts server-side before creating intents.
5. **Use separate webhook endpoints for test and live modes.** Test endpoints only receive test events; live endpoints only receive live events.
6. **Handle `next_action` for 3DS/e-wallets.** When status is `awaiting_next_action`, redirect the customer to `next_action.redirect.url` with your `return_url`.
7. **Respond to webhooks within 30 seconds.** Return 200–209 status code with JSON response. Process business logic asynchronously if needed.
8. **Use `capture_type: "manual"` for hold-then-capture.** Default is `"automatic"` which immediately captures funds.

## Common Patterns

### Create Payment Intent (Nuxt Server Route)

```ts
// server/api/paymongo/create-payment-intent.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const secretKey = useRuntimeConfig().paymongoSecretKey

  const response = await $fetch('https://api.paymongo.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
    },
    body: {
      data: {
        attributes: {
          amount: body.amount, // in centavos
          currency: 'PHP',
          payment_method_allowed: body.methods || ['card'],
          description: body.description,
          metadata: { orderId: body.orderId },
        },
      },
    },
  })

  return {
    id: response.data.id,
    clientKey: response.data.attributes.client_key,
  }
})
```

### Webhook Handler (Nuxt Server Route)

```ts
// server/api/paymongo/webhook.post.ts
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const signature = getHeader(event, 'paymongo-signature') || ''
  const rawBody = await readRawBody(event)

  // Verify signature
  if (!verifyPaymongoSignature(rawBody, signature, config.paymongoWebhookSecret)) {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const payload = JSON.parse(rawBody)

  switch (payload.type) {
    case 'payment.paid':
      await handlePaymentPaid(payload.data)
      break
    case 'payment.failed':
      await handlePaymentFailed(payload.data)
      break
    case 'refund.succeeded':
      await handleRefundSucceeded(payload.data)
      break
  }

  return { received: true }
})
```

## Further Reading

- [PayMongo Documentation](https://docs.paymongo.com/)
- [API Reference](https://docs.paymongo.com/reference/)
- [PayMongo Changelog](https://supabase.com/changelog.md)
