# Webhooks

PayMongo sends HTTP POST requests to your server when events occur. Webhooks are the reliable way to confirm payment outcomes.

## Webhook Concepts

- **Webhook Endpoint**: A registered URL that receives POST requests when events occur.
- **Scoped to Mode**: Test endpoints only receive test events; live endpoints only receive live events. Create separate endpoints for each environment.
- **Events**: Immutable snapshots of resources at the time of the event. Never modified after creation.
- **Delivery**: HTTP POST with JSON payload. Must respond with **200–209** within **30 seconds**.
- **Retry Policy**: Up to **12 retries** with exponential backoff on failure.

## Setup

### Via Dashboard

1. Go to **Developers → Webhooks** in the PayMongo Dashboard
2. Click **Add endpoint**
3. Enter the endpoint URL and select events to receive
4. Click **Save**

### Via API

```http
POST https://api.paymongo.com/v1/webhooks
Authorization: Basic base64(sk_test_YOUR_SECRET_KEY:)
Content-Type: application/json
```

```json
{
  "data": {
    "attributes": {
      "url": "https://yoursite.com/api/paymongo/webhook",
      "events": ["payment.paid", "payment.failed", "refund.succeeded"]
    }
  }
}
```

## Signature Verification

Every webhook request includes a `Paymongo-Signature` header for authenticity verification.

### Header Structure

Comma-separated parts: `t`, `te`, `li`

| Part | Description |
|------|-------------|
| `t` | Timestamp of the request |
| `te` | HMAC signature for **test** mode |
| `li` | HMAC signature for **live** mode |

**Test Mode Example**: `t=1496734173,te=1447a89e7ecebeda32...,li=`
**Live Mode Example**: `t=1492224173,te=,li=3f7bs59d200aae63...`

### Verification Algorithm

1. **Parse header**: Split by commas, extract `t`, `te`, `li`
2. **Build signature string**: `{timestamp}.{raw_payload}` — concatenate timestamp, period, and raw JSON body (do not parse or reformat)
3. **Compute HMAC-SHA256**: Hash the signature string using the webhook's secret key
4. **Compare**: Use `te` for test mode, `li` for live mode. If computed signature matches, the request is valid.
5. **Optional**: Check timestamp `t` against current time to prevent replay attacks

### Verification Function (TypeScript)

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyPaymongoSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceMs: number = 5 * 60 * 1000 // 5 minutes
): boolean {
  // Parse signature header
  const parts = signatureHeader.split(',')
  const parsed: Record<string, string> = {}
  for (const part of parts) {
    const [key, value] = part.split('=')
    if (key && value !== undefined) {
      parsed[key.trim()] = value.trim()
    }
  }

  const timestamp = parsed.t
  const signature = parsed.te || parsed.li // te for test, li for live

  if (!timestamp || !signature) {
    return false
  }

  // Check timestamp tolerance (prevent replay attacks)
  const timestampMs = parseInt(timestamp, 10) * 1000
  const now = Date.now()
  if (Math.abs(now - timestampMs) > toleranceMs) {
    return false
  }

  // Build signature string: timestamp.raw_payload
  const signatureString = `${timestamp}.${rawBody}`

  // Compute HMAC-SHA256
  const computed = createHmac('sha256', webhookSecret)
    .update(signatureString)
    .digest('hex')

  // Constant-time comparison
  return timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
}
```

## Nuxt Webhook Handler

```ts
// server/api/paymongo/webhook.post.ts
import { createHmac, timingSafeEqual } from 'node:crypto'

function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(',')
  const parsed: Record<string, string> = {}
  for (const part of parts) {
    const [key, value] = part.split('=')
    if (key && value !== undefined) parsed[key.trim()] = value.trim()
  }

  const timestamp = parsed.t
  const signature = parsed.te || parsed.li
  if (!timestamp || !signature) return false

  // Optional: 5-minute tolerance
  if (Math.abs(Date.now() - parseInt(timestamp, 10) * 1000) > 5 * 60 * 1000) return false

  const computed = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  return timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const signature = getHeader(event, 'paymongo-signature') || ''
  const rawBody = await readRawBody(event)

  if (!verifySignature(rawBody, signature, config.paymongoWebhookSecret)) {
    throw createError({ statusCode: 401, message: 'Invalid webhook signature' })
  }

  const payload = JSON.parse(rawBody)
  const eventType = payload.type

  // Process asynchronously — respond quickly to avoid timeout
  switch (eventType) {
    case 'payment.paid':
      await handlePaymentPaid(payload.data)
      break
    case 'payment.failed':
      await handlePaymentFailed(payload.data)
      break
    case 'refund.succeeded':
      await handleRefundSucceeded(payload.data)
      break
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(payload.data)
      break
    case 'dispute.created':
      await handleDisputeCreated(payload.data)
      break
  }

  return { received: true }
})
```

## Webhook Events

### Payment Acceptance

| Event | Description | Fires When |
|-------|-------------|------------|
| `payment.paid` | Payment received | Transaction completes successfully |
| `payment.failed` | Payment failed | Transaction fails to complete |
| `payment_intent.succeeded` | Intent succeeded | Payment Intent reaches `succeeded` status |
| `payment_intent.awaiting_payment_method` | Intent awaiting method | Intent created or needs retry |
| `refund.succeeded` | Refund processed | Refund transaction completes |
| `dispute.created` | Dispute opened | Customer initiates dispute |
| `dispute.resolved` | Dispute resolved | Dispute status changes to resolved |

### Payouts

| Event | Description | Fires When |
|-------|-------------|------------|
| `payout.deposited` | Payout deposited | Payout successfully deposited to bank |
| `payout.returned` | Payout returned | Payout fails and is returned |

### Subscriptions

| Event | Description | Fires When |
|-------|-------------|------------|
| `subscription.activated` | Subscription active | Status becomes `active` |
| `subscription.past_due` | Subscription late | Payment failed, not yet cancelled |
| `subscription.unpaid` | Subscription unpaid | Past due period expired |
| `subscription.updated` | Subscription changed | Any attribute updated |

#### Subscription Invoices

| Event | Description |
|-------|-------------|
| `subscription.invoice.created` | Invoice created (draft) |
| `subscription.invoice.finalized` | Invoice ready for payment |
| `subscription.invoice.paid` | Invoice paid |
| `subscription.invoice.payment_failed` | Invoice payment failed |
| `subscription.invoice.updated` | Invoice updated |

### QR Code Payments

| Event | Description |
|-------|-------------|
| `qr.paid` | QR code payment received |
| `qr.expired` | QR code expired unpaid |

### Workflows

| Event | Description |
|-------|-------------|
| `workflow.completed` | Workflow finished successfully |
| `workflow.failed` | Workflow execution failed |

## Webhook Best Practices

1. **Always verify signatures** before processing any event
2. **Confirm payment status server-side** by retrieving the Payment Intent before fulfilling orders
3. **Use separate endpoints** for test and live modes
4. **Respond within 30 seconds** with 200–209 status and JSON
5. **Process business logic asynchronously** if it takes longer than a few seconds
6. **Never trust redirect URL parameters** — always verify via webhook or API
7. **Idempotent handling** — webhooks may be delivered multiple times; use event IDs to deduplicate
8. **Handle `payment.failed`** — update order status, notify customer, retry logic if applicable

## Nuxt Config for Webhooks

```ts
// nuxt.config.ts — ensure webhook endpoint is NOT cached
export default defineNuxtConfig({
  routeRules: {
    '/api/paymongo/webhook': { cache: false },
  },
})
```
