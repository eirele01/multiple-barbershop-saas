# Refunds

Refund all or part of a payment. Only payments with a `paid` status are eligible.

## API Endpoint

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/refunds` | Secret Key | Create a refund |

## Create a Refund

```http
POST https://api.paymongo.com/v1/refunds
Authorization: Basic base64(sk_test_YOUR_SECRET_KEY:)
Content-Type: application/json
```

### Request Body

```json
{
  "data": {
    "attributes": {
      "amount": 10000,
      "payment_id": "pay_xxxxxxxxxxxx",
      "reason": "duplicate",
      "notes": "Customer requested refund for order cancellation"
    }
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `amount` | Integer | **Yes** | Amount in centavos. Must be ≤ original payment amount minus previous refunds. |
| `payment_id` | String | **Yes** | ID of the payment to refund. |
| `reason` | String | **Yes** | One of: `duplicate`, `fraudulent`, `others`. |
| `notes` | String | No | Internal notes for your records. |

### Response

```json
{
  "data": {
    "id": "re_xxxxxxxxxxxxxxxxxxxxxxxx",
    "type": "refund",
    "attributes": {
      "amount": 10000,
      "payment_id": "pay_xxxxxxxxxxxx",
      "status": "pending",
      "reason": "duplicate",
      "notes": "Customer requested refund",
      "created_at": 1625097600
    }
  }
}
```

## Refund Rules by Payment Method

| Payment Method | Refund Window | Partial Refunds | Time to Reflect |
|----------------|---------------|-----------------|-----------------|
| Debit/Credit Card | 60 days | Yes (full only for installments) | Up to 30 days |
| GCash | 180 days | Yes | Within 24 hours |
| GrabPay | 90 days | Yes | Within 24 hours |
| Maya | 12 months | Yes* | Within 24 hours |
| ShopeePay | 365 days | Yes | Within 24 hours |
| BPI Online Banking | 30 days | Yes | At least 3 banking days |
| BillEase | 60 days | Yes | Within 24 hours |
| BDO, Metrobank, Landbank (Brankas) | 30 days | Yes | Up to 5 banking days† |
| QR Ph | 30 days | **No** | < PHP 50K: Real time<br/>≥ PHP 50K: Next banking day |
| UBP Online Banking | — | **No** | Contact support@paymongo.com |

**Notes:**
- **Maya (\*)**: Full refund only on the same day. Partial refunds allowed starting next day at 12:00 AM.
- **Brankas (†)**: Refunds go to merchant's bank account. Merchant settles directly with customer.
- **QR Ph**: Full refund only — partial refunds not supported.
- **UBP**: Cannot be refunded via standard process; contact PayMongo support.

## Partial Refunds

Multiple partial refunds can be issued on the same payment, provided the total does not exceed the original payment amount.

```json
// First partial refund
{
  "data": {
    "attributes": {
      "amount": 5000,
      "payment_id": "pay_xxxxx",
      "reason": "others",
      "notes": "Partial refund for cancelled item"
    }
  }
}

// Second partial refund (remaining balance)
{
  "data": {
    "attributes": {
      "amount": 5000,
      "payment_id": "pay_xxxxx",
      "reason": "others",
      "notes": "Remaining refund"
    }
  }
}
```

## Payout Impact

- If upcoming payout balance is **insufficient**, the refund request will not process until the balance is replenished.
- Refunds for **already-paid-out** transactions are deducted from the next payout.

## Common Error Codes

| Error Code | Description |
|------------|-------------|
| `payment_not_found` | `payment_id` doesn't exist or isn't in your account |
| `refund_amount_exceeds_payment` | Requested amount exceeds available refund amount |
| `payment_not_refundable` | Payment is in a state that doesn't allow refunds (e.g., `processing`) |

## Nuxt Server Route: Create Refund

```ts
// server/api/paymongo/refund.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()

  if (!body.paymentId || !body.amount) {
    throw createError({ statusCode: 400, message: 'Missing paymentId or amount' })
  }

  if (!['duplicate', 'fraudulent', 'others'].includes(body.reason)) {
    throw createError({ statusCode: 400, message: 'Invalid reason. Must be duplicate, fraudulent, or others.' })
  }

  const response = await $fetch('https://api.paymongo.com/v1/refunds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${config.paymongoSecretKey}:`).toString('base64')}`,
    },
    body: {
      data: {
        attributes: {
          amount: body.amount,
          payment_id: body.paymentId,
          reason: body.reason,
          notes: body.notes,
        },
      },
    },
  })

  return {
    refundId: response.data.id,
    status: response.data.attributes.status,
    amount: response.data.attributes.amount,
  }
})
```

## Refund Flow

1. Find the `payment_id` from the Payment or Payment Intent
2. Verify payment status is `paid`
3. Calculate refund amount (≤ remaining refundable balance)
4. `POST /v1/refunds` with amount, payment_id, and reason
5. Listen for `refund.succeeded` webhook for confirmation
