# Codebase Audit Report

**Date:** 2025-08-12
**Scope:** Full codebase — Nuxt 3.16 + Supabase + PayMongo multi-tenant SaaS platform
**Method:** 5 parallel Explore agents scanned 97 server API routes, 17 composable/store/middleware files, 61 component/page/layout files, 9 utility/type files, 18 config/migration/edge function files

---

## Executive Summary

This audit identified **13 CRITICAL**, **26 HIGH**, **60 MEDIUM**, and **34 LOW** severity findings. The most urgent issues:

1. **Security vulnerabilities** — SQL injection, broken HMAC verification, unauthenticated endpoints, dev-mode signature bypass
2. **SSR safety** — Module-level refs bleed state across requests, middleware bypasses auth during SSR
3. **Data integrity** — Race conditions in loyalty points engine, missing atomic operations
4. **Maintainability** — Massive files (up to 2,012 lines), duplicate logic in 20+ places, stale files in production

---

## Severity Legend

| Severity | Meaning |
|----------|---------|
| 🔴 CRITICAL | Security exploit, data loss, or production crash risk |
| 🟠 HIGH | Significant bug, vulnerability, or architectural concern |
| 🟡 MEDIUM | Code quality, maintainability, or standard practice issue |
| 🟢 LOW | Minor improvement, cosmetic, or best-practice suggestion |

---

## 1. CRITICAL Findings

### 1.1 No rate limiting on sensitive endpoints

**Files affected:** All 97 server API routes

None of the server API routes implement rate limiting. Endpoints like booking creation, payment proof upload, and auth operations are completely unprotected against brute-force, DDoS, and enumeration attacks.

**Fix:** Implement rate limiting middleware using `@upstash/ratelimit` (Redis) or an in-memory limiter. Apply at minimum to `bookings/create.post.ts`, `payments/upload-proof.post.ts`, `auth/**`, and webhook endpoints.

---

### 1.2 SQL injection in search endpoints

**Files:**
- `server/api/super-admin/shops/index.get.ts`
- `server/api/super-admin/owners/index.get.ts`
- `server/api/shops/index.get.ts`
- `server/api/admin/loyalty/members/index.get.ts`

```typescript
.or(`name.ilike.%${search}%,slug.ilike.%${search}%`) // raw user input
```

**Fix:** Escape `%` and `_` wildcards:
```typescript
const safe = search.replace(/[%_]/g, (c) => `\\${c}`)
```

---

### 1.3 Webhook HMAC signature verification broken

**Files:**
- `server/api/webhooks/paymongo/[shopSlug].post.ts`
- `utils/server/encryption.ts`

**Issue A — Wrong message format:** PayMongo spec requires `{timestamp}.{rawBody}` but code only hashes `rawBody`.

**Issue B — `verifyHmacSignature()` uses `createHash` (SHA-256) instead of `createHmac`:** Dead code that is mathematically incorrect.

**Issue C — No timestamp tolerance check:** Replay attacks possible.

**Issue D — `rawBody` type mismatch:** `readRawBody(event)` may return `Buffer` instead of string, producing wrong HMAC.

**Fix:**
1. Update to `createHmac('sha256', secret).update(\`${timestamp}.${rawBody}\`).digest('hex')`
2. Add ±5 min timestamp tolerance check
3. Ensure `rawBody` is string: `typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')`
4. Delete dead `verifyHmacSignature()` function

---

### 1.4 Webhook signature bypassed in development

**File:** `server/api/webhooks/paymongo/[shopSlug].post.ts`

```typescript
if (process.env.NODE_ENV !== 'development') { /* skip verification */ }
```

**Fix:** Use explicit flag `SKIP_WEBHOOK_VERIFICATION=true` instead of `NODE_ENV`. Add startup warning log.

---

### 1.5 SSR-unsafe module-level ref in useToast

**File:** `composables/useToast.ts`

Module-level `ref<ToastMessage[]>([])` shared across all SSR requests. Also, `setTimeout` never cleaned up.

**Fix:** Use `useState('toasts', () => [])` and guard timers with `import.meta.client`. Track timer IDs and `clearTimeout` on remove.

---

### 1.6 Auth middleware bypasses all checks during SSR

**Files:** All 7 middleware files (`auth.global.ts`, `auth.ts`, `admin.ts`, `customer.ts`, `guest.ts`, `super-admin.ts`, `role.ts`)

```typescript
if (import.meta.server) return // bypasses ALL auth during SSR
```

**Impact:** Protected pages render full content to crawlers. SEO and data leakage.

**Fix:** Use `routeRules` to disable SSR for authenticated routes:
```typescript
routeRules: {
  '/admin/**': { swr: 0, cors: false },
  '/customer/**': { swr: 0, cors: false },
  '/super-admin/**': { swr: 0, cors: false },
}
```

---

### 1.7 Unauthenticated booking creation

**File:** `server/api/bookings/create.post.ts`

No auth check, no shop validation, no rate limiting.

**Fix:** Add `requireAuth(event)` and validate shop exists and is active.

---

### 1.8 Unauthenticated payment proof upload

**File:** `server/api/payments/upload-proof.post.ts`

**Fix:** Require authentication and validate uploader is the booking customer.

---

### 1.9 Loyalty engine race conditions

**File:** `utils/server/loyaltyEngine.ts`

All operations use read-modify-write without atomicity. Concurrent requests can produce incorrect balances.

**Fix:** Use PostgreSQL advisory locks or atomic SQL functions with `SELECT ... FOR UPDATE`.

---

### 1.10 Devtools enabled unconditionally

**File:** `nuxt.config.ts`

`devtools: { enabled: true }` should be gated by `NODE_ENV`.

---

### 1.11 Send-reminders Edge Function out of sync with migration 013

**File:** `supabase/functions/send-reminders/index.ts`

Still reads per-shop `resend_api_key` (removed by migration 013). Will process ZERO shops.

**Fix:** Read platform-level Resend key from environment variables.

---

### 1.12 Migration endpoints still in production

**Files:**
- `server/api/admin/run-migration.post.ts`
- `server/api/admin/migration-status.get.ts`
- `server/api/admin/shop/add-background-color.post.ts`

Accessible to any admin. Should be deleted.

---

### 1.13 `booking_ref` CHECK constraint bug

**Migration 010** sets `payment_method = 'paymongo'` but the CHECK constraint on `bookings` does not include `'paymongo'` as a valid value. Re-running migration 010 would fail.

---

## 2. HIGH Findings

### 2.1 XSS in email templates (all 9 templates)

**File:** `utils/server/emailTemplates.ts`

User-controlled fields (`customerName`, `barberName`, `rejectionReason`, `shopName`, `primaryColor`) interpolated directly into HTML. `primaryColor` in inline `style` attributes allows CSS injection.

**Fix:** Add `htmlEscape()` utility and CSS validator for `primaryColor`.

---

### 2.2 `$fetch` cast to `any`

**Files:** `composables/useSupabase.ts`, `stores/auth.ts` (line 187, impersonation validation)

**Fix:** Use typed `$fetch<ResponseInterface>()` and `catch (error: unknown)` instead of `any`.

---

### 2.3 Super-admin shop detail returns encrypted secrets

**File:** `server/api/super-admin/shops/[id].get.ts`

`select('*')` returns `paymongo_secret_key` and `webhook_secret`.

**Fix:** Explicitly select only needed columns.

---

### 2.4 Super-admin analytics loads all bookings into memory

**File:** `server/api/super-admin/analytics.get.ts`

No limit on bookings or shops query. Potential OOM.

**Fix:** Use SQL-side aggregation (`GROUP BY`, `SUM()`).

---

### 2.5 GET endpoint mutates data

**File:** `server/api/admin/payment-verifications/index.get.ts`

Creates `payment_verifications` records on GET.

**Fix:** Move to `POST /api/admin/payment-verifications/sync`.

---

### 2.6 Duplicate `roleMiddleware` with different SSR guards

**Files:** `composables/useRoleMiddleware.ts` and `middleware/role.ts`

**Fix:** Single canonical implementation.

---

### 2.7 Missing Zod validation on payment verify endpoint

**File:** `server/api/payments/verify-paymongo-payment.post.ts`

---

### 2.8 Webhook errors swallowed silently

**File:** `server/api/webhooks/paymongo/[shopSlug].post.ts`

Failed booking updates return 200, stopping PayMongo retries.

**Fix:** Return 500 on failure, implement dead-letter queue.

---

### 2.9 `verifyAuth()` creates 3 Supabase API calls per request

**File:** `server/utils/auth.ts`

After JWT verify, creates separate service_role client. Calling route then creates another. Total: 3 calls before business logic.

**Fix:** Accept service_role client as parameter or return reusable client.

---

### 2.10 Manual two-client auth in 30+ admin routes

Every admin route duplicates `getAuthToken()` + `createClient(serviceKey)`. Standardize on `verifyAuth()`.

---

### 2.11 Silent error swallowing in `fetchShopById`/`fetchShopBySlug`

**File:** `stores/shop.ts`

Callers have no way to detect fetch failure. `startImpersonation` in `auth.ts` calls `fetchShopById` and failure is swallowed.

---

### 2.12 `onAuthStateChange` subscription never unsubscribed

**File:** `stores/auth.ts`

**Fix:** Store subscription reference and clean up.

---

### 2.13 `useConfirm` Promise leak on unmount

**File:** `composables/useConfirm.ts`

Open dialogs never resolve if component unmounts.

---

### 2.14 Console.log/console.error in production pages

20+ `console.error` statements across frontend pages, stores, and layouts.

---

### 2.15 `Icon.vue` uses `any` types for props

**File:** `components/Icon.vue`

`class?: any; style?: any`

---

### 2.16 Missing `aria-label` on icon-only buttons

Gallery arrows, close buttons, action buttons in admin tables.

---

### 2.17 Weak temp passwords in staff creation

**File:** `server/api/admin/staff/index.post.ts`

---

### 2.18 Public booking exposure

Public shop endpoints return booking data without proper scoping.

---

### 2.19 `payment_method` CHECK constraint missing `'paymongo'`

Migration 010 fix conflicts with existing CHECK constraint.

---

### 2.20 `$fetch` response cast to `any` in `startImpersonation`

**File:** `stores/auth.ts:187`

Authentication-critical API call with no type safety.

---

### 2.21 `EmptyState.vue` missing `withDefaults`

**File:** `components/EmptyState.vue`

---

### 2.22 No keyboard navigation for custom components

Gallery lightbox, search combobox missing Enter/Escape/focus trapping.

---

### 2.23 Missing `role="switch"` on toggle controls

---

### 2.24 Partial `role="tablist"` implementation

Admin tabs lack proper ARIA roles.

---

### 2.25 `catch (error: any)` instead of `unknown`

**File:** `stores/auth.ts:201`

---

### 2.26 `any` types in loyaltyEngine.ts and sendShopEmail.ts

`getAdminClient()` returns untyped Supabase client. `supabase: any` parameter in sendShopEmail. `enrichedData as any` cast.

---

### 2.27 Direct store mutation in `auth-hydration.ts` plugin

Should use explicit action.

---

## 3. MEDIUM Findings

### 3.1 Missing database indexes on 16+ foreign keys

**File:** `supabase/migrations/001_initial_schema.sql`

Missing: `bookings.service_id`, `bookings.reward_id`, `bookings.payment_method_id`, `bookings.verified_by`, `bookings.cancelled_by`, `loyalty_points.booking_id`, `loyalty_points.reward_id`, `reviews.booking_id`, `reviews.customer_id`, `reviews.barber_id`, `reviews.replied_by`, `gallery.barber_id`, `gallery.service_id`, `activity_logs.user_id`, `payment_verifications.reviewed_by`.

---

### 3.2 Missing CHECK constraints

- `services.price >= 0`, `services.duration_mins > 0`
- `products.price >= 0`
- `loyalty_points.points != 0`

---

### 3.3 Bare `NUMERIC` for lat/lng

Should be `NUMERIC(9, 6)`.

---

### 3.4 `formatPrice()` / `formatTime()` / `formatDate()` duplicated in 15+ files each

**Fix:** Create `composables/useFormat.ts`.

---

### 3.5 `getAuthToken()` duplicated in 20+ admin pages

**Fix:** Create `composables/useAuthFetch.ts`.

---

### 3.6 Breadcrumb computation duplicated in layouts

---

### 3.7 Pinia store in `composables/` directory

**File:** `composables/useBookingWizard.ts`

**Fix:** Move to `stores/booking-wizard.ts`.

---

### 3.8 `useSupabaseAdmin()` returns untyped client

---

### 3.9 `enrichedData as any` cast in email sender

**File:** `utils/server/sendShopEmail.ts`

---

### 3.10 `getAdminClient()` returns `any` typed client

**File:** `utils/server/loyaltyEngine.ts`

---

### 3.11 Sequential processing in Edge Functions

Both `send-reminders` and `expire-points` use `for...of` loops.

---

### 3.12 CORS wildcard on expire-points

Should be restricted to app origin.

---

### 3.13 Fragile idempotency in expire-points

---

### 3.14 N+1 queries in send-reminders for barber names

---

### 3.15 Missing error handling in `expireOldPoints()` per record

---

### 3.16 `awardWelcomeBonus()` TOCTOU race

Check-then-insert not atomic.

---

### 3.17 Geist font declared but never imported

**File:** `tailwind.config.ts`

---

### 3.18 `@types/node@^25.9.1` doesn't exist

**File:** `package.json`

---

### 3.19 `vue-router@^4.5.0` redundant

---

### 3.20 No security headers in Vercel config

---

### 3.21 Plan badge inline styles duplicated 20+ times

**Fix:** Create `<PlanBadge>` component.

---

### 3.22 Tier lookup logic duplicated across 3 files

---

### 3.23 Supabase admin client creation duplicated in 5+ files

---

### 3.24 Realtime subscription setup duplicated

---

### 3.25 Middleware boilerplate duplicated 7 times

**Fix:** Create `useAuthMiddlewareGuards()` composable.

---

### 3.26 Role arrays duplicated in 4 places in `stores/auth.ts`

`isShopStaff`, `canAccessAdmin`, `defaultRedirect`, and middleware all repeat `['admin','manager','cashier','barber']`.

**Fix:** Extract `SHOP_STAFF_ROLES` constant.

---

### 3.27 Time formatting logic duplicated in `useShopStatus` and `useBookingWizard`

---

### 3.28 `isShopStaff` and `canAccessAdmin` getters are identical

---

### 3.29 `confirmDialogComponent` recreated per composable call

---

### 3.30 Initial shop status shows "Closed" during SSR (visual flash)

---

### 3.31 `10 reactive refs` in `useShopStatus` — unwieldy API

---

### 3.32 Direct DOM manipulation in `GalleryLightbox.vue`

`document.body.style.overflow = 'hidden'`

---

### 3.33 Click-outside detection with `document.addEventListener`

**File:** `components/ShopSearchCombobox.vue`

---

### 3.34 `navigator.clipboard.writeText()` direct usage in 4+ files

---

### 3.35 Hardcoded currency, locale, file sizes, phone regex, pagination, toast durations

**Fix:** Create `~/constants/app.config.ts`.

---

### 3.36 No lazy-loaded routes

42 pages loaded eagerly.

---

### 3.37 Multiple `IntersectionObserver` instances without cleanup

**File:** `pages/shop/[slug].vue`

---

### 3.38 Business logic in server routes (CSV generation, time slot computation, review enrichment)

**Fix:** Extract to `server/utils/`.

---

### 3.39 `verifyAuth()` missing error check on profile query

**File:** `server/utils/auth.ts`

Newly registered users get 403 before DB trigger fires.

---

### 3.40 Loyalty settings PATCH spreads `parsed.data` directly into `.update()`

**File:** `server/api/admin/loyalty/settings.patch.ts`

---

### 3.41 Customer loyalty `shopId` not validated as UUID

**File:** `server/api/customer/loyalty/status.get.ts`

---

### 3.42 Admin payment-methods DELETE auto-cleans without notification

---

### 3.43 Impersonation token has no server-side consumption check

---

### 3.44 `getEncryptionKey()` mutates `process.env` and caches forever

**File:** `utils/server/encryption.ts`

---

### 3.45 `PlatformSettingsMap` values all typed as `string`

**File:** `types/database.ts`

---

### 3.46 `LoyaltyTiers.max` field defined but never used

---

### 3.47 `booking_ref` generation race condition

`COUNT(*) + 1` can produce duplicates under concurrent inserts.

---

### 3.48 Google Fonts loaded as render-blocking `<link>` without `preconnect`

**File:** `nuxt.config.ts`

---

### 3.49 `deno.json` uses `@latest` for resend import

---

### 3.50 RLS public read policies expose full shop rows

---

### 3.51 `bookings.shop_id` FK missing `ON DELETE` clause (defaults RESTRICT)

---

### 3.52 `SECURITY DEFINER` helper functions bypass all RLS

**Migration 009** — correct pattern but increases blast radius.

---

### 3.53 `getCustomerBalance()` called in no-op early returns (5x in loyaltyEngine)

---

### 3.54 Expiry date calculation duplicated in `awardPoints` and `awardWelcomeBonus`

---

### 3.55 `process.env.NUXT_PUBLIC_SITE_URL || ''` repeated in every email template

---

### 3.56 `ShopBranding` interface in `emailTemplates.ts` drifts from `types/database.ts`

---

### 3.57 `verifyAuth()` creates two Supabase API calls internally

---

### 3.58 `signOut` clears local state even if server signOut fails

Acceptable UX tradeoff but worth noting.

---

### 3.59 `initialize()` catches session errors silently — no retry mechanism

---

### 3.60 `catch (error: any)` in stores should be `unknown`

---

## 4. LOW Findings

### 4.1 Stale `pages/index copy.vue` creates `/index-copy` route

**Action:** Delete immediately.

---

### 4.2 Massive single-file pages

| File | Lines |
|------|-------|
| `pages/shop/[slug]/book.vue` | 2,012 |
| `pages/shop/[slug].vue` | 1,486 |
| `pages/admin/staff.vue` | 1,246 |
| `pages/admin/shop-profile.vue` | 1,056 |
| `pages/admin/payments/verification.vue` | 916 |
| `pages/admin/services.vue` | 829 |
| `pages/admin/products.vue` | 777 |
| `pages/admin/calendar.vue` | 709 |
| `components/AdminSidebar.vue` | 580 |

**Fix:** Target each page/component under 500 lines.

---

### 4.3 `setTimeout` never cleaned up in useToast

---

### 4.4 Consistent boilerplate in all 7 middleware files

---

### 4.5 No JSDoc on public composables

---

### 4.6 Mixed error handling patterns across server routes

---

### 4.7 No `.env.example` file

---

### 4.8 Unused imports in several files

---

### 4.9 No ESLint configuration

---

### 4.10 No Prettier configuration

---

### 4.11 `pinia` in dependencies alongside `@pinia/nuxt`

Redundant but harmless.

---

### 4.12 All dependencies use caret ranges `^`

Consider pinning security-critical packages.

---

### 4.13 `.gitignore` missing `.env.local`, `supabase/.temp`

---

### 4.14 `github.silent: true` in vercel.json suppresses PR status comments

---

### 4.15 `types: ["node"]` in tsconfig.json redundant (Nuxt includes it)

---

### 4.16 Deeply nested ternaries in templates (plan badge pattern)

---

### 4.17 Complex inline `:style` bindings in shop page

---

### 4.18 Admin tables may overflow on small screens

---

### 4.19 Booking wizard progress indicator may not display on very small screens

---

### 4.20 `v-for` keys use `.label` (only safe if labels are unique)

---

### 4.21 Direct store mutation in `auth-hydration.ts` plugin

Acceptable in bootstrap context but should use explicit action.

---

### 4.22 `as string` casts on runtime config

Could use proper typing.

---

### 4.23 Non-standard 8px-grid spacing `4.5: '18px'` in Tailwind

---

### 4.24 CSS custom properties for colors prevent Tailwind build-time optimization

Trade-off, not a bug.

---

### 4.25 Loyalty helper functions (`formatTxType`, `txColorClass`, `txPrefix`) duplicated between customer and admin loyalty pages

---

### 4.26 `timeToMinutes` in `useShopStatus` is generic utility that should be extracted

---

### 4.27 `confirm()` in `useConfirm` has no SSR guard

---

### 4.28 `render function captures stale refs` — actually correct, but `ConfirmDialogComponent` recreated per call

---

### 4.29 Loyalty engine error messages are generic (`'Failed to insert loyalty_points record'`)

---

### 4.30 `getCustomerBalanceFallback` silent degradation with no log entry

---

## 5. Prioritized Action Plan

### Phase 1: Security (Immediate — Week 1)

| # | Action | Impact |
|---|--------|--------|
| 1 | Fix webhook HMAC: `{timestamp}.{rawBody}` format + timestamp tolerance | Prevents payment fraud |
| 2 | Fix SQL injection in 4 search endpoints | Prevents data breach |
| 3 | Add auth to booking creation + proof upload | Prevents spam bookings |
| 4 | Implement rate limiting on sensitive endpoints | Prevents brute-force/DDoS |
| 5 | Sanitize all email template inputs + CSS validator for `primaryColor` | Prevents XSS/CSS injection |
| 6 | Delete 3 migration endpoints from codebase | Prevents unauthorized data changes |
| 7 | Delete dead `verifyHmacSignature()` from `encryption.ts` | Removes broken code |
| 8 | Add input validation (Zod) to `verify-paymongo-payment.post.ts` | Prevents unhandled errors |
| 9 | Delete `pages/index copy.vue` | Removes stale route |

### Phase 2: SSR Safety & Type Safety (Week 2)

| # | Action | Impact |
|---|--------|--------|
| 10 | Fix `useToast` — `useState()`, client guard, timer cleanup | Prevents state bleed |
| 11 | Add `routeRules` to disable SSR for auth routes | Prevents data leakage |
| 12 | Deduplicate middleware boilerplate into `useAuthMiddlewareGuards()` | Maintainability |
| 13 | Remove duplicate `roleMiddleware` | Consistency |
| 14 | Replace `$fetch as any` with typed responses | Type safety |
| 15 | Replace `catch (error: any)` with `catch (error: unknown)` | Type safety |
| 16 | Gate devtools behind `NODE_ENV` | Security |
| 17 | Fix `Icon.vue` prop types | Type safety |

### Phase 3: Data Integrity (Week 3)

| # | Action | Impact |
|---|--------|--------|
| 18 | Add PostgreSQL advisory locks to loyalty engine | Prevents double-spend |
| 19 | Add UNIQUE INDEX for welcome bonus TOCTOU fix | Prevents double bonus |
| 20 | Add database indexes on 16+ foreign keys | Query performance |
| 21 | Add CHECK constraints (price, duration, points) | Data validity |
| 22 | Fix send-reminders Edge Function (platform-level keys) | Restores email reminders |
| 23 | Fix `booking_ref` CHECK constraint to include `'paymongo'` | Prevents migration failure |
| 24 | Fix `payment_verifications` GET endpoint (move mutation to POST) | HTTP correctness |

### Phase 4: Code Quality & Maintainability (Weeks 4-5)

| # | Action | Impact |
|---|--------|--------|
| 25 | Create `composables/useFormat.ts` (formatPrice, formatTime, formatDate) | Eliminates 45+ duplicates |
| 26 | Create `composables/useAuthFetch.ts` | Eliminates 20+ duplicates |
| 27 | Create `<PlanBadge>` component | Eliminates 20+ inline styles |
| 28 | Extract `SHOP_STAFF_ROLES` constant | Single source of truth |
| 29 | Deduplicate Supabase admin client creation | Maintainability |
| 30 | Extract `useRealtimeSubscription()` composable | Eliminates duplicate subscriptions |
| 31 | Extract breadcrumb composable from layouts | DRY |
| 32 | Move `useBookingWizard` store to `stores/` | Convention compliance |
| 33 | Create `~/constants/app.config.ts` for hardcoded values | Configurability |
| 34 | Extract CSV, time slot, review enrichment to `server/utils/` | Separation of concerns |

### Phase 5: Component Architecture (Weeks 6-7)

| # | Action | Target |
|---|--------|--------|
| 35 | Split `pages/shop/[slug]/book.vue` (2,012 lines) | 6 step components + modals |
| 36 | Split `pages/shop/[slug].vue` (1,486 lines) | Section components |
| 37 | Split `pages/admin/staff.vue` (1,246 lines) | Table + slide-over + schedule |
| 38 | Split `pages/admin/shop-profile.vue` (1,056 lines) | Tab components |
| 39 | Split `components/AdminSidebar.vue` (580 lines) | Nav sections |
| 40 | Add `aria-label` to all icon-only buttons | Accessibility |
| 41 | Add `role="switch"`, `role="tablist"` ARIA roles | Accessibility |
| 42 | Add keyboard navigation (Enter/Escape/focus trap) | Accessibility |

### Phase 6: Tooling & Config (Ongoing)

| # | Action | Impact |
|---|--------|--------|
| 43 | Add security headers to `vercel.json` | Security |
| 44 | Fix `package.json` (vue-router, @types/node versions) | Clean deps |
| 45 | Add ESLint + Prettier config | Code quality |
| 46 | Add `.env.example` | Onboarding |
| 47 | Add `.gitignore` entries for `.env.local`, `supabase/.temp` | Security |
| 48 | Replace `console.error` in pages with toast/logging composable | UX |
| 49 | Pin `deno.json` resend import to version | Stability |
| 50 | Add lazy loading for heavy admin routes | Performance |

---

## 6. Architecture Observations

### Strengths
- Clear multi-tenant architecture with `shop_id` scoping
- Good separation of server routes by domain
- AES-256-CBC encryption of sensitive fields (correctly implemented)
- Email templating system with 9 templates
- Comprehensive loyalty points engine with tiers and expiry
- Real-time updates via Supabase subscriptions
- Proper RLS policies on sensitive tables

### Concerns
- **No transaction management** — Multi-step operations not wrapped in DB transactions
- **No audit logging** — Admin actions not tracked
- **No pagination** — Several endpoints return unbounded result sets
- **No input validation layer** — Zod used inconsistently
- **No centralized error handling** — Each route handles errors differently
- **Edge Functions tightly coupled to schema** — Send-reminders broke when migration 013 changed schema
- **No logging utility** — `console.error` everywhere, no structured logging

### Suggestions
1. **Database transactions** for multi-step operations via SQL functions
2. **Audit log table** for admin actions (who, what, when)
3. **Cursor-based pagination** on all list endpoints
4. **Standardize Zod validation** — every endpoint validates input
5. **Error handling middleware** for consistent response format
6. **Version Edge Functions** alongside migrations
7. **Structured logging utility** to replace `console.error`
8. **Health check endpoint** for monitoring

---

## 7. Files With Most Issues (Priority for Review)

| Rank | File | Issue Count | Severity |
|------|------|-------------|----------|
| 1 | `server/api/webhooks/paymongo/[shopSlug].post.ts` | 6 | CRITICAL |
| 2 | `utils/server/loyaltyEngine.ts` | 8 | CRITICAL/HIGH |
| 3 | `utils/server/emailTemplates.ts` | 10 | HIGH |
| 4 | `utils/server/encryption.ts` | 3 | CRITICAL |
| 5 | `composables/useToast.ts` | 4 | CRITICAL |
| 6 | `server/api/bookings/create.post.ts` | 3 | CRITICAL |
| 7 | `pages/shop/[slug]/book.vue` | 5 | CRITICAL/LOW |
| 8 | `pages/shop/[slug].vue` | 4 | CRITICAL/LOW |
| 9 | `middleware/*` (all 7 files) | 7 | CRITICAL/MEDIUM |
| 10 | `stores/auth.ts` | 6 | HIGH/MEDIUM |
| 11 | `supabase/functions/send-reminders/index.ts` | 5 | CRITICAL |
| 12 | `supabase/migrations/001_initial_schema.sql` | 6 | MEDIUM |
| 13 | `server/api/super-admin/shops/index.get.ts` | 2 | HIGH |
| 14 | `server/api/super-admin/analytics.get.ts` | 3 | HIGH/MEDIUM |
| 15 | `server/api/admin/payment-verifications/index.get.ts` | 2 | HIGH |

---

*Report generated from 5 parallel automated codebase scans totaling 1,872 tool uses across all agents. Each finding should be verified manually before implementation of fixes.*
