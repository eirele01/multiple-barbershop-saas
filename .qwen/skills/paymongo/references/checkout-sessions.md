# Checkout Sessions

Checkout Sessions create a hosted PayMongo checkout page. Pass line items and payment method types, receive a `checkout_url` to redirect customers.

> **Note:** PayMongo recommends using **v2** (`POST /v2/checkout_sessions`) for new integrations. V2 supports new features like pass-on fees.

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/checkout_sessions` | Secret Key | Create a Checkout Session |
| GET | `/v1/checkout_sessions/:id` | Secret Key | Retrieve a Checkout Session |
| POST | `/v1/checkout_sessions/:id/expire` | Secret Key | Expire a Checkout Session |

## Create a Checkout Session

```http
POST https://api.paymongo.com/v1/checkout_sessions
Authorization: Basic base64(sk_test_YOUR_SECRET_KEY:)
Content-Type: application/json
```

### Request Body

```json
{
  "data": {
    "attributes": {
      "line_items": [
        {
          "amount": 5000,
          "currency": "PHP",
          "description": "Premium Barbershop Plan",
          "name": "Premium Plan",
          "quantity": 1
        }
      ],
      "payment_method_types": ["card", "gcash"],
      "cancel_url": "https://yoursite.com/checkout/cancel",
      "success_url": "https://yoursite.com/checkout/success",
      "description": "Checkout for Premium Plan",
      "customer_email": "customer@example.com",
      "reference_number": "ORDER-12345",
      "capture_type": "automatic",
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
      },
      "metadata": {
        "order_id": "12345",
        "user_id": "67890"
      },
      "send_email_receipt": true,
      "show_description": true,
      "show_line_items": true
    }
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `line_items` | Array | **Yes** | Items to purchase. Max 999, min 1. |
| `line_items[].amount` | Integer | **Yes** | Price in centavos. |
| `line_items[].currency` | String | **Yes** | `PHP` (only supported). |
| `line_items[].name` | String | **Yes** | Item name. |
| `line_items[].quantity` | Integer | **Yes** | Item quantity. |
| `line_items[].description` | String | No | Item description. |
| `line_items[].images` | Array[String] | No | Image URLs (one per item). |
| `payment_method_types` | Array[String] | **Yes** | Allowed methods: `card`, `gcash`, `paymaya`, etc. |
| `cancel_url` | String | No | Redirect on cancel. |
| `success_url` | String | No | Redirect on success. |
| `description` | String | No | Checkout description. |
| `customer_email` | String | No | Customer email. |
| `customer_id` | String | No | Existing customer ID. |
| `reference_number` | String | No | Merchant reference number. |
| `capture_type` | String | No | `automatic` (default) or `manual`. |
| `billing` | Object | No | Pre-fill billing info. |
| `metadata` | Object | No | Key-value string pairs. |
| `send_email_receipt` | Boolean | No | Send email receipt. |
| `show_description` | Boolean | No | Show on checkout page. |
| `show_line_items` | Boolean | No | Show items on checkout page. |
| `statement_descriptor` | String | No | On customer statement. |

### Line Item Address Object

| Field | Type | Description |
|-------|------|-------------|
| `line1` | String | Address line 1. |
| `line2` | String | Address line 2. |
| `city` | String | City. |
| `state` | String | State/Province. |
| `postal_code` | String | Postal code. |
| `country` | String | ISO 3166-1 alpha-2 code (`PH`). |

### Response

```json
{
  "data": {
    "id": "cs_xxxxxxxxxxxxxxxxxxxxxxxx",
    "type": "checkout_sessions",
    "attributes": {
      "checkout_url": "https://checkout.paymongo.com/xxxxx",
      "client_key": "cs_xxxxx_client_xxxxx",
      "status": "active",
      "livemode": false,
      "created_at": 1625097600,
      "updated_at": 1625097600
    }
  },
  "has_more": false
}
```

## Checkout Session Resource

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique ID, prefix `cs_`. |
| `checkout_url` | string | URL to redirect customer. |
| `client_key` | string | Session identifier. |
| `status` | string | `active` or `expired`. |
| `livemode` | boolean | `true` for live, `false` for test. |
| `line_items` | array | Items in the session. |
| `payments` | array | Payments created (secret key only). |
| `payment_intent` | object | Related Payment Intent. |
| `payment_method_types` | array | Allowed payment methods. |
| `cancel_url` | string | Cancel redirect URL. |
| `success_url` | string | Success redirect URL. |
| `reference_number` | string | Merchant reference. |
| `metadata` | object | Key-value string pairs. |

## Nuxt Server Route: Create Checkout Session

```ts
// server/api/paymongo/create-checkout-session.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()

  const response = await $fetch('https://api.paymongo.com/v1/checkout_sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${config.paymongoSecretKey}:`).toString('base64')}`,
    },
    body: {
      data: {
        attributes: {
          line_items: body.lineItems.map((item: any) => ({
            amount: item.amount,
            currency: 'PHP',
            name: item.name,
            description: item.description,
            quantity: item.quantity,
          })),
          payment_method_types: body.paymentMethods || ['card'],
          cancel_url: `${config.public.siteUrl}/checkout/cancel`,
          success_url: `${config.public.siteUrl}/checkout/success`,
          description: body.description,
          customer_email: body.customerEmail,
          reference_number: body.referenceNumber,
          metadata: {
            orderId: body.orderId,
            userId: body.userId,
          },
          send_email_receipt: true,
        },
      },
    },
  })

  return {
    sessionId: response.data.id,
    checkoutUrl: response.data.attributes.checkout_url,
  }
})
```

## Nuxt Server Route: Get Checkout Session

```ts
// server/api/paymongo/checkout-session.get.ts
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const config = useRuntimeConfig()

  if (!query.id) {
    throw createError({ statusCode: 400, message: 'Missing session ID' })
  }

  const response = await $fetch(`https://api.paymongo.com/v1/checkout_sessions/${query.id}`, {
    headers: {
      'Authorization': `Basic ${Buffer.from(`${config.paymongoSecretKey}:`).toString('base64')}`,
    },
  })

  return response.data
})
```

## Hosted Checkout Flow

1. **Server**: Create Checkout Session → get `checkout_url`
2. **Client**: Redirect to `checkout_url`
3. **PayMongo**: Customer completes payment on hosted page
4. **PayMongo**: Redirects to `success_url` or `cancel_url`
5. **Server**: Verify payment status via webhook or API before fulfilling

## When to Use Checkout Sessions vs. Payment Intents

| Use Checkout Sessions when... | Use Payment Intents when... |
|------------------------------|----------------------------|
| You want a hosted checkout page | You want a custom checkout UI |
| You need minimal frontend code | You need to control the payment flow |
| You accept multiple payment methods | You need to handle specific payment method flows |
| You want PayMongo to handle card collection | You want to collect card details yourself |
