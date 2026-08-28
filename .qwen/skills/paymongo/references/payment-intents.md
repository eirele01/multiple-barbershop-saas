# Payment Intents

Payment Intents are server-side records representing a single checkout transaction. They hold the amount (in centavos), currency, allowed payment methods, and current status.

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/payment_intents` | Secret Key | Create a Payment Intent |
| GET | `/v1/payment_intents/:id` | Secret Key | Retrieve a Payment Intent |
| POST | `/v1/payment_intents/:id/attach` | Public Key + client_key | Attach a Payment Method |

## Create a Payment Intent

```http
POST https://api.paymongo.com/v1/payment_intents
Authorization: Basic base64(sk_test_YOUR_SECRET_KEY:)
Content-Type: application/json
```

### Request Body

```json
{
  "data": {
    "attributes": {
      "amount": 10000,
      "currency": "PHP",
      "payment_method_allowed": ["card", "gcash"],
      "description": "Order #12345",
      "statement_descriptor": "MyShop",
      "capture_type": "automatic",
      "payment_method_options": {
        "card": {
          "request_three_d_secure": "any"
        }
      },
      "metadata": {
        "order_id": "12345",
        "user_id": "67890"
      }
    }
  }
}
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | Integer | **Yes** | Amount in centavos. Minimum `100` (PHP 1.00). |
| `currency` | String | **Yes** | Three-letter ISO code. Currently only `PHP`. |
| `payment_method_allowed` | Array[String] | **Yes** | Allowed methods: `card`, `gcash`, `paymaya`, `grab_pay`, `shopee_pay`, `qrph`, `brankas`, `dob`, `billease`. |
| `description` | String | No | Saved to resulting Payment resource. |
| `statement_descriptor` | String | No | On customer statements (Card, GCash only). Alphanumeric + `, . - ) ( @ + &` and space. |
| `capture_type` | String | No | `automatic` (default) or `manual` for hold-then-capture. |
| `payment_method_options.card` | Object | No | `request_three_d_secure`: `any` (require 3DS) or `automatic` (default). |
| `payment_method_options.card.installments` | Object | No | `enabled`: Boolean to enable installment plans. |
| `setup_future_usage` | Object | No | `session_type`: `on_session`, `customer_id`: Customer ID for card vaulting. |
| `metadata` | Object | No | Key-value string pairs for additional info. |

### Response

```json
{
  "data": {
    "id": "pi_1JvFbEiRRnh2fsUE5nJ2F1z7",
    "type": "payment_intent",
    "attributes": {
      "amount": 10000,
      "currency": "PHP",
      "status": "awaiting_payment_method",
      "client_key": "pi_1JvFbEiRRnh2fsUE5nJ2F1z7_client_mpe6tJkgaX3pSoiYeSp1AbEU",
      "payment_method_allowed": ["card", "gcash"],
      "livemode": false,
      "created_at": 1586179682,
      "updated_at": 1586179682,
      "last_payment_error": null,
      "next_action": null
    }
  }
}
```

## Payment Intent Object Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique ID, prefix `pi_`. |
| `amount` | integer | Amount in centavos. |
| `currency` | string | `PHP` (only supported currency). |
| `status` | string | `awaiting_payment_method`, `awaiting_next_action`, `processing`, `succeeded`. |
| `client_key` | string | Pass to frontend for attach operations. |
| `capture_type` | string | `automatic` or `manual`. |
| `last_payment_error` | object | Error from latest Payment Method attachment. |
| `payment_method_allowed` | array | Allowed payment method codes. |
| `payments` | array | Payments created by this intent (secret key only). |
| `next_action` | object | Required customer action (3DS URL, redirect URL, etc.). |
| `metadata` | object | Key-value string pairs. |

### `next_action` Object

| Sub-attribute | Type | Description |
|---------------|------|-------------|
| `type` | string | Action type (e.g., `redirect`). |
| `redirect.url` | string | URL to redirect customer for authentication. |
| `redirect.return_url` | string | URL after successful authentication. |

## Attach a Payment Method

```http
POST https://api.paymongo.com/v1/payment_intents/:id/attach
Authorization: Basic base64(pk_test_YOUR_PUBLIC_KEY:)
Content-Type: application/json
```

### Request Body

```json
{
  "data": {
    "attributes": {
      "payment_method": "pm_xxxxxxxxxxxx",
      "client_key": "pi_xxxxx_client_xxxxx",
      "return_url": "https://yoursite.com/payment/complete"
    }
  }
}
```

### Response Statuses

- **`succeeded`**: Payment complete, no redirect needed.
- **`awaiting_next_action`**: Check `next_action` for redirect URL (3DS, e-wallet, etc.).
- **`awaiting_payment_method`**: Error occurred, check `last_payment_error`. Customer can retry.

## Create a Payment Method (Client-Side)

```http
POST https://api.paymongo.com/v1/payment_methods
Authorization: Basic base64(pk_test_YOUR_PUBLIC_KEY:)
Content-Type: application/json
```

### Request Body

```json
{
  "data": {
    "attributes": {
      "type": "card",
      "details": {
        "card_number": "4343434343434345",
        "exp_month": 12,
        "exp_year": 2030,
        "cvc": "123"
      },
      "billing": {
        "name": "Juan dela Cruz",
        "email": "juan@example.com",
        "phone": "09171234567",
        "address": {
          "line1": "123 Main Street",
          "city": "Manila",
          "state": "Metro Manila",
          "postal_code": "1000",
          "country": "PH"
        }
      }
    }
  }
}
```

## Nuxt Server Route: Create Payment Intent

```ts
// server/api/paymongo/create-payment-intent.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()

  // Validate amount server-side
  if (body.amount < 100 || body.amount > 1000000000) {
    throw createError({ statusCode: 400, message: 'Invalid amount' })
  }

  const response = await $fetch('https://api.paymongo.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${config.paymongoSecretKey}:`).toString('base64')}`,
    },
    body: {
      data: {
        attributes: {
          amount: body.amount,
          currency: 'PHP',
          payment_method_allowed: body.methods || ['card'],
          description: body.description,
          metadata: { orderId: body.orderId, userId: body.userId },
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

## Nuxt Server Route: Get Payment Intent Status

```ts
// server/api/paymongo/payment-intent-status.get.ts
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const config = useRuntimeConfig()

  if (!query.id) {
    throw createError({ statusCode: 400, message: 'Missing payment intent ID' })
  }

  const response = await $fetch(`https://api.paymongo.com/v1/payment_intents/${query.id}`, {
    headers: {
      'Authorization': `Basic ${Buffer.from(`${config.paymongoSecretKey}:`).toString('base64')}`,
    },
  })

  return {
    id: response.data.id,
    status: response.data.attributes.status,
    amount: response.data.attributes.amount,
    lastPaymentError: response.data.attributes.last_payment_error,
  }
})
```

## Complete Payment Flow

1. **Server**: `POST /v1/payment_intents` → save `id`, send `client_key` to frontend
2. **Client**: `POST /v1/payment_methods` → get payment method ID
3. **Client**: `POST /v1/payment_intents/:id/attach` → get status
4. **Client**: If `awaiting_next_action`, redirect to `next_action.redirect.url`
5. **Client**: After redirect to `return_url`, call server to check final status
6. **Server**: Confirm via `payment.paid` webhook before fulfilling order
