# Testing

Testing PayMongo integrations in sandbox mode. No real money moves — full test environment mirroring the live API.

## Sandbox Mode

- Uses `sk_test_*` and `pk_test_*` keys
- Full API parity with production
- No real financial transactions
- Retrieve keys from PayMongo Dashboard > **Developers > API Keys**

## Test Card Numbers

Use any future expiry date and any 3-digit CVC for all cards.

### Successful Payments

| Card Number | Network | 3DS |
|-------------|---------|-----|
| `4343434343434345` | Visa | No |
| `4571736000000075` | Visa | No |
| `5123000000000002` | Mastercard | No |
| `4120000000000007` | Visa | **Yes** (select "Authorize" at prompt) |
| `5123000000000001` | Mastercard | Supported but optional |

### Declined Payments

| Card Number | Reason |
|-------------|--------|
| `4200000000000018` | Expired card |
| `4300000000000017` | Invalid CVC |
| `5100000000000198` | Insufficient funds |
| `4111111111111111` | Generic decline |

### Hold-Then-Capture

| Card Number | Behavior |
|-------------|----------|
| `4120000000000007` (Select Authorize) | Status `awaiting_capture` |
| `4120000000000007` (Select Fail) | Status `awaiting_payment_method`, no payment attached |
| `5234000000000106` (Select Authorize) | Auth passes, payment fails → `awaiting_payment_method` |

## E-Wallet Testing

No real wallet accounts needed. Outcomes controlled via redirect URL.

| Method | How to Test |
|--------|-------------|
| GCash | Attach Payment Method → open `next_action.redirect.url` → select **Authorize** or **Fail** |
| Maya | Same as GCash |
| GrabPay | Same as GCash |
| ShopeePay | Same as GCash |

## QR Ph Testing

- Use the `test_url` in the API response to simulate outcomes
- **⚠️ Warning**: QR codes generated in test mode are **real**. Do not scan and pay them — this processes a real transaction.

## Direct Online Banking (Brankas)

| Bank | Success OTP | Failure |
|------|-------------|---------|
| BDO, Landbank, Metrobank | `123456` | Close page early → `EXPIRED`, `DENIED`, or `CANCELLED` |
| UnionBank | `111111` | OTPs `222222`–`666666` |
| BPI | Select account `***0001`, OTP `123456` | Invalid OTP: `654321`, Expired: `000000` |

## Card Vaulting Test Scenarios

| Scenario | Card | Result |
|----------|------|--------|
| 3DS success, card vaulted | `4120000000000007` | Select Authorize → vaulted |
| Payment fails, not vaulted | `5234000000000106` | Card NOT vaulted |
| Auth fails, not vaulted | `4120000000000007` | Select Fail → card NOT vaulted |
| Reuse vaulted card | Customer payment method ID | Attach to new Payment Intent without `setup_future_usage` |

## Subscription Test Scenarios

| Test Case | Card | Expected Result |
|-----------|------|-----------------|
| Successful activation | `4120000000000007` | Select Authorize → `active` |
| Failed activation | `5234000000000106` | Select Fail → `incomplete` → `incomplete_cancelled` (24h) |
| Activation succeeds, recurring fails | `5123000000000001` | First payment `active`; next cycle fails → `past_due` → `unpaid` |

## Hold-Then-Capture Test Scenarios

| Scenario | Result |
|----------|--------|
| Capture amount ≤ Payment Intent amount | Status `succeeded` |
| Capture amount > Payment Intent amount | Error `allowed_amount_exceeded` |

## Testing Checklist

- [ ] Create Payment Intent with test key (`sk_test_*`)
- [ ] Test card payment success (e.g., `4343434343434345`)
- [ ] Test card payment decline (e.g., `4111111111111111`)
- [ ] Test 3DS authentication flow (`4120000000000007`)
- [ ] Test e-wallet redirect (GCash, Maya, etc.)
- [ ] Test webhook delivery (`payment.paid`, `payment.failed`)
- [ ] Test webhook signature verification
- [ ] Test refund creation
- [ ] Test Checkout Session redirect flow
- [ ] Verify payment status server-side before fulfilling orders
- [ ] Test error handling (invalid amount, missing fields)
- [ ] Test with separate test webhook endpoint (not live)

## Common Test Mistakes

1. **Using live keys in test environment** — always use `sk_test_*` / `pk_test_*`
2. **Scanning test QR Ph codes** — use `test_url` instead; real QR codes are generated even in test mode
3. **Skipping 3DS test** — use `4120000000000007` and select "Authorize" to test the full redirect flow
4. **Not testing webhook verification** — always test with malformed signatures to ensure they're rejected
5. **Fulfilling orders on redirect** — always verify via webhook or server-side API call
