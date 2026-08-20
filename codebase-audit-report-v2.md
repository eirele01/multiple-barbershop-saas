# Codebase Audit Report v2 — Post Refactoring Scan

**Date:** 2026-08-13
**Scope:** Full codebase after Phases 1–6 refactoring
**Focus:** Bugs, optimization, standard coding practices, security, and suggestions

---

## Executive Summary

The codebase is in significantly better shape after the 6-phase refactoring. Critical security issues (SQL injection, XSS, HMAC) are resolved, SSR safety is established, and data integrity is protected via advisory locks and RLS. However, **type safety remains the largest outstanding gap**, followed by **infrastructure duplication** in server API routes and **component size** in key pages.

---

## 🔴 Critical Issues

### C1. `stores/auth.ts` — Async Callback in `onAuthStateChange` (Race Condition)

**Severity:** Critical — can corrupt auth state
**Line:** 79

```typescript
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    this.accessToken = session.access_token
    await this.fetchUserProfile(session.user.id)  // ← async
  }
})
```

The Supabase SDK explicitly warns: *"Avoid using an async function inside `onAuthStateChange` as you might end up processing stale state changes out of order."* If an older `SIGNED_IN` event has a slow network response, it can overwrite the store after a `TOKEN_REFRESH` or `SIGNED_OUT` event — restoring a signed-in state after the user signed out.

**Fix:** Set local state synchronously inside the callback. Offload async work to a scheduled task or a queue that processes events in order.

### C2. `stores/auth.ts` — `onAuthStateChange` Subscription Never Unsubscribed

**Severity:** Critical — stacked subscriptions
**Line:** 79

The return value (`{ data: { subscription }, error }`) is discarded. If `initialize()` is ever called twice (possible during concurrent calls before `initialized` flips to `true`), multiple subscriptions stack and fire simultaneously, each racing to update state.

**Fix:** Store the subscription and call `.unsubscribe()` before creating a new one.

### C3. `composables/useAuthFetch.ts` — Returns Empty Header After Redirect

**Severity:** Critical — silent auth bypass
**Lines:** 45-47

```typescript
navigateTo('/login')
return ''  // ← caller receives empty header, request proceeds with Authorization: ''
```

After redirecting to `/login`, the function returns `''` instead of throwing. The `$fetch` call in `authFetch` proceeds with `Authorization: `, which may:
- Pass through server-side auth checks if they don't validate a present token
- Return confusing 500 errors instead of 401

**Fix:** `throw createError({ statusCode: 401 })` after `navigateTo`.

### C4. Pervasive `as any` Type Casting (51 instances in source code)

**Severity:** High — defeats TypeScript's primary value
**Locations:** 48 in `pages/`, 4 in `server/api/`, 1 in `stores/`, 1 in `utils/server/`

Every page that fetches API data casts the response to `as any`:

```typescript
// pages/customer/dashboard.vue
const response = await $fetch('/api/customer/dashboard', { ... }) as any

// pages/super-admin/shops/index.vue
const data = await authFetch('/api/super-admin/shops', { ... }) as any

// server/api/admin/payment-verifications/[id]/verify.patch.ts
const booking = verification.bookings as any
```

**Impact:**
- Zero compile-time type checking on API contracts
- Silent breakage when server response shape changes
- No IDE autocomplete on response data
- The 4 `verification.bookings as any` in payment verification endpoints are especially risky — they handle money-related state transitions

**Recommendation:** Create `types/api.ts` with response interfaces matching each API endpoint. Update `$fetch`/`authFetch` calls with generic types. Priority order: payment verification endpoints → booking endpoints → admin endpoints → customer endpoints.

---

### C2. Massive Supabase Client Duplication (228 `createClient` calls)

**Severity:** High — maintenance burden, inconsistent auth handling
**Scope:** Almost every server API route creates its own Supabase client instances

**Current pattern repeated across ~40 files:**
```typescript
// Each admin endpoint does this:
import { createClient } from '@supabase/supabase-js'
const config = useRuntimeConfig()

const supabase = createClient(
  config.public.supabaseUrl as string,
  config.public.supabaseKey as string,
  { global: { headers: { Authorization: event.headers.get('authorization')! } } }
)
const supabaseAdmin = createClient(
  config.public.supabaseUrl as string,
  config.supabaseServiceKey as string
)
```

**Impact:**
- 40+ files each repeat the same 2-line client creation pattern
- If auth header handling needs to change (e.g., cookie-based auth), every file must be updated
- No centralized place to add middleware-like behavior (request logging, tracing)
- Some endpoints use `useSupabaseAdmin()` (correct), others create inline clients (inconsistent)

**Recommendation:** Create `server/utils/createAuthClients.ts` that returns both client and admin client in one call:
```typescript
export function createAuthClients(event: H3Event) {
  const admin = useSupabaseAdmin()
  const client = createClient(url, key, {
    global: { headers: { Authorization: event.headers.get('authorization')! } }
  })
  return { supabase: client, supabaseAdmin: admin }
}
```
Then refactor all 40+ endpoints to use this single factory.

---

### C3. Large Monolithic Components

**Severity:** Medium-High — readability, testability, collaboration blocking

| File | Lines | Issue |
|------|-------|-------|
| `pages/shop/[slug]/book.vue` | ~700 | Booking wizard, payment, proof upload, guest account, loyalty — 5 concerns |
| `pages/shop/[slug].vue` | ~550 | Shop display, gallery, reviews, 3 tab systems, realtime subscription |
| `pages/admin/payments/verification.vue` | ~500+ | 4 tabs, verification workflow, sync, realtime |
| `pages/admin/settings.vue` | ~300+ | Payment + email settings, 2 tab systems |
| `pages/admin/shop-profile.vue` | ~300 | Profile form, logo upload, cover upload |

**Specific concern — `book.vue`:**
- 7+ `watch()` calls without cleanup (potential memory leaks on navigation away)
- Customer info validation scattered across inline watchers
- PayMongo integration, proof upload, and guest account creation all in one component

**Recommendation:** Extract into sub-components:
- `book.vue` → `BookingWizardTime.vue`, `BookingWizardCustomer.vue`, `BookingWizardPayment.vue`, `BookingWizardConfirm.vue`
- `shop/[slug].vue` → `ShopGallery.vue`, `ShopReviews.vue`, `ShopServiceList.vue`

---

## 🟡 High Priority Issues

### H1. Missing API Response Type Definitions

**Current state:** Only `types/database.ts` exists. No types for API request/response shapes.

**Recommendation:** Create `types/api.ts`:
```typescript
export interface CustomerDashboardResponse {
  upcomingBookings: UpcomingBooking[]
  loyalty: { shops: LoyaltyShop[]; totalPoints: number }
}

export interface ShopListResponse {
  shops: ShopSummary[]
  total: number
}
// ... etc
```

### H2. No Request Body Validation on PATCH Endpoints

Several PATCH endpoints accept `readBody()` without Zod validation:
- `server/api/admin/loyalty/settings.patch.ts`
- `server/api/admin/settings/email.patch.ts`
- `server/api/customer/profile.patch.ts`
- `server/api/super-admin/settings/index.patch.ts`

**Risk:** Malformed or missing fields cause runtime errors or partial updates.

**Recommendation:** Add Zod schemas to all mutation endpoints, following the pattern already established in `verify-paymongo-payment.post.ts` and `upload-proof.post.ts`.

### H3. `console.log` Statements in Production Code

**Found in server routes:**
- `server/api/admin/settings/test-paymongo.post.ts` — 10+ `console.log` debug statements
- `server/api/shops/check-slug.ts` — `console.log('Checking slug availability...')`
- `server/api/payments/verify-paymongo-payment.post.ts` — `console.log` for success confirmation

**Impact:** These leak into production logs, potentially exposing internal state.

**Recommendation:** Remove all `console.log` from server routes. Keep `console.error` for actual errors. Use structured logging if debug output is needed.

### H4. Inconsistent Error Response Format

Some endpoints use `sendError(event, ...)`, others return plain objects:
```typescript
// Pattern A (correct):
sendError(event, createError({ statusCode: 400, statusMessage: 'Invalid input' }))

// Pattern B (inconsistent):
return { error: 'Invalid input' }
```

**Recommendation:** Standardize on `sendError()` for all error responses. Frontend `$fetch` already handles H3 errors consistently.

### H5. Verification Bookings Junction Type

4 instances of `verification.bookings as any` in payment verification endpoints. The `bookings` junction table join returns a shape that isn't typed.

**Recommendation:** Define the joined type:
```typescript
interface PaymentVerificationWithBooking {
  id: string
  status: string
  bookings: {
    id: string
    booking_ref: string
    status: string
    payment_status: string
    // ... fields needed
  } | null
}
```

### H6. Untyped `catch` Parameters in Stores

**Severity:** Medium — defeats `strict` mode
**Locations:**
- `stores/auth.ts` line 74: `catch (err)` — implicitly `any`
- `stores/shop.ts` lines 79, 105: `catch (error)` — implicitly `any` (×2)

These were missed in the Phase 2 `catch (error: any)` → `catch (error: unknown)` sweep.

**Recommendation:** Change to `catch (error: unknown)` in all three locations.

### H7. `composables/useAuthFetch.ts` — `opts: any` Parameter

**Severity:** Medium — discards type safety on request configuration

```typescript
async function authFetch<T = any>(url: string, opts: any = {}): Promise<T>
```

**Recommendation:** Type `opts` as `import type { $FetchOptions } from 'ofetch'` or at minimum `Record<string, unknown>`. Also type the generic default as `unknown` instead of `any`.

---

## 🟢 Medium Priority Issues

### M1. Memory Leak Risk — Unwatched Watchers

`pages/shop/[slug]/book.vue` has 7+ `watch()` calls established in `<script setup>`:
```typescript
watch(() => wizard.selectedService, ...)
watch(() => wizard.selectedTime, ...)
watch(() => wizard.currentStep, ...)
watch(() => wizard.bookingResult, ...)
watch(() => wizard.customerInfo.firstName, ...)
watch(() => wizard.customerInfo.lastName, ...)
watch(() => wizard.customerInfo.phone, ...)
watch(() => wizard.customerInfo.email, ...)
```

While Vue 3 auto-cleans watchers in `<script setup>`, the component is large enough that navigating away and back could cause subtle state issues. The `onUnmounted` at line 695 cleans up some state but not all watchers.

### M2. No File Upload Validation

`server/api/admin/shop/upload-logo.post.ts` and `upload-cover.post.ts` upload files to Supabase Storage without:
- MIME type validation (accepts any file with `.png` extension)
- File size limits beyond what Supabase enforces
- Image dimension validation

**Recommendation:** Add server-side validation:
```typescript
if (!file.mimetype?.startsWith('image/')) throw createError({ statusCode: 400, statusMessage: 'Image required' })
if (file.data.byteLength > 5 * 1024 * 1024) throw createError({ statusCode: 400, statusMessage: 'Max 5MB' })
```

### M3. Missing Rate Limiting on Mutation Endpoints

Rate limiting was added to booking creation (Phase 1). But other mutation endpoints are unprotected:
- Service creation/deletion
- Staff management
- Payment verification actions
- Loyalty point adjustments
- Settings updates

**Recommendation:** Apply `authRateLimiter` or a new `adminRateLimiter` to all admin mutation endpoints.

### M4. No Pagination on Super Admin Analytics

`server/api/super-admin/analytics.get.ts` queries all bookings for date range without pagination. For shops with high volume, this could return thousands of rows.

### M5. Hardcoded Tier Colors in Components

`pages/customer/loyalty.vue` has inline tier color mapping:
```typescript
const colors: Record<string, string> = {
  bronze: 'bg-amber-800 text-white',
  silver: 'bg-gray-400 text-white',
  gold: 'bg-yellow-500 text-white',
  platinum: 'bg-purple-600 text-white',
}
```

**Recommendation:** Move to `constants/app.config.ts` alongside other shared config. Same pattern likely exists elsewhere.

### M6. Guest Authentication Pattern Could Be Centralized

Guest account creation in `server/api/bookings/create.post.ts` (lines ~140-175) and `pages/shop/[slug]/book.vue` (line 527-528) both handle guest signup. The logic isn't fully centralized.

### M7. `composables/useRealtimeSubscription.ts` — Three `any` Types

**Lines:** 20, 22, 32

```typescript
onPayload: (payload: any) => void
let channel: any = null
(c: any) => c.topic === channelName
```

**Recommendation:** Type `payload` as `PostgresChangePayload`, `channel` as `RealtimeChannel`, and the callback parameter from `@supabase/supabase-js`.

### M8. `composables/useShopStatus.ts` — Duplicate `formatTime12`

**Line:** 73

`formatTime12()` is logically identical to `formatTime()` in `useFormat.ts`. Same 24h→12h conversion duplicated.

**Recommendation:** Import `formatTime` from `useFormat()` and remove the standalone function.

### M9. `stores/auth.ts` — Unnecessary `await navigateTo`

**Line:** 171 — `navigateTo()` returns `void`, not a `Promise`. The `await` is a no-op.

---

## 🔵 Optimization Opportunities

### O1. N+1 Query Risk in Payment Verifications List

`server/api/admin/payment-verifications/index.get.ts` fetches verifications with joined bookings. If the join isn't using a proper `SELECT` with nested query, it may be doing N+1.

### O2. Super Admin Dashboard Aggregation

`server/api/super-admin/dashboard.get.ts` runs multiple independent queries. Consider a single SQL query with `COUNT`, `SUM`, and `JOIN` for the stats section.

### O3. Shop List Query Optimization

`server/api/shops/index.get.ts` and `server/api/super-admin/shops/index.get.ts` both compute `total_bookings` per shop. If not using a `LEFT JOIN` with `COUNT`, this could be slow at scale.

### O4. Image Optimization

Shop logos, cover images, and gallery images are served directly from Supabase Storage without transformation. Supabase Storage supports transform URLs (`?width=400&height=300&resize=cover`).

**Recommendation:** Add transform parameters to all image URLs, especially for:
- Shop list logos (thumbnail size)
- Gallery grid images
- Service category images

### O5. Stale-while-revalidate for Public Pages

`nuxt.config.ts` has `routeRules` but the public shop pages (`/shop/[slug]`) and homepage (`/`) could benefit from SWR caching:
```typescript
routeRules: {
  '/': { swr: '1m' },
  '/shop/**': { swr: '5m' },
}
```

---

## 🟣 Accessibility Reminders

Phase 5 covered major tab/switch patterns. Remaining gaps:

1. **Icon-only buttons without `aria-label`**: Search buttons, filter pills, close buttons in modals
2. **Form field labels**: Some inputs in `book.vue` use floating labels that may not associate properly with `for`/`id` pairs
3. **Color contrast**: CSS variable-based color scheme (`--color-titanium` on white) — verify WCAG AA compliance
4. **Focus management**: Modal dialogs (`useConfirm`) should trap focus and return focus on close

---

## 📊 Standard Coding Observations

### ✅ Already Good (from Phase 1-6)
- All `catch (error: any)` → `catch (error: unknown)` ✓
- SSR safety with `useState()`, `import.meta.server` guards ✓
- SQL injection prevention with wildcard escaping ✓
- XSS prevention in email templates ✓
- HMAC verification for PayMongo webhooks ✓
- Rate limiting on booking creation ✓
- Advisory locks for loyalty operations ✓
- ARIA roles on toggles and tablists ✓
- Centralized `useFormat()`, `useAuthFetch()`, `useBreadcrumbs()` ✓
- Deno std version pinning ✓

### ⚠️ Needs Improvement

| Area | Current | Recommended |
|------|---------|-------------|
| Type safety | 51 `as any` in source code | Typed API responses, 0 `as any` |
| Client creation | 228 inline `createClient` calls | Centralized factory function |
| Validation | 2 endpoints use Zod | All mutation endpoints use Zod |
| Error format | Mixed `sendError` / plain object | Consistent `sendError()` |
| Component size | Up to 700 lines | Max 200-250 lines per component |
| Constants | Some magic strings | All in `constants/` |
| Logging | `console.log` in production | Remove, use structured logging |
| File validation | None on uploads | MIME type + size check |

---

## 📋 Suggested Priority Order for Next Fixes

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| **P1** | C1-C2: Fix `onAuthStateChange` async race + subscription leak | Low | Critical — auth state corruption |
| **P2** | C3: `useAuthFetch` throw instead of empty header | Low | Critical — silent auth bypass |
| **P3** | C4: Create API response types | Medium | High — type safety foundation |
| **P4** | C5: Centralize Supabase client creation | Medium | High — affects 40+ files |
| **P5** | H2: Zod validation on all PATCH endpoints | Low | High — input validation |
| **P6** | H6: Fix 3 untyped `catch` in stores | Low | Medium — `strict` mode compliance |
| **P7** | H7: Type `authFetch` options parameter | Low | Medium — type safety |
| **P8** | H3: Remove `console.log` from production | Low | Medium — clean logs |
| **P9** | M3: Rate limiting on admin mutations | Low | Medium — security |
| **P10** | M2: File upload validation | Low | Medium — security |

---

## 🔍 Files Needing Immediate Attention

1. **`stores/auth.ts`** — Async race in `onAuthStateChange`, subscription never unsubscribed, 3 untyped `catch`, unnecessary `await navigateTo`, `as any` on impersonation result
2. **`composables/useAuthFetch.ts`** — `opts: any`, returns empty auth header after redirect instead of throwing
3. **`pages/shop/[slug]/book.vue`** — 700 lines, 7 watchers, `as any` on loyalty data, guest account casting
4. **`server/api/admin/payment-verifications/[id]/verify.patch.ts`** — `bookings as any`, no Zod validation
5. **`server/api/admin/payment-verifications/[id]/reject.patch.ts`** — Same as above
6. **`server/api/admin/payment-verifications/[id]/request-info.patch.ts`** — Same as above
7. **`stores/shop.ts`** — 2 untyped `catch (error)` blocks
8. **`composables/useRealtimeSubscription.ts`** — 3 `any` types on payload, channel, and lookup callback

---

*Report generated from grep analysis of source files excluding `node_modules/`. Total: 51 `as any` in source, 42 `console.*` in pages (all with toast pairing), 0 `readBody()` without validation pattern found, 228 `createClient` calls in server/.*
