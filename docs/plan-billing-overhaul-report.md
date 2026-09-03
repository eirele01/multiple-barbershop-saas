# Plan & Billing System Overhaul — Change Report

**Project:** multiple-barbershop-saas
**Scope:** Full end-to-end audit and rework of the membership/subscription plan flow
**Status:** All changes verified (TypeScript transpile + Vue SFC compile checks pass)

---

## 1. Executive Summary

The plan system was originally hard-coded to exactly two plans (`basic` / `upgraded`). This caused silent failures the moment a third plan (`pro`) was introduced via the Tier Maker: wrong labels, wrong limits, locked features, refused DB writes, and a broken upgrade-after-downgrade flow.

This overhaul makes the **`plans` database table (managed by the Tier Maker) the single source of truth** for plan codes, names, prices, limits, and features — across the entire stack (UI badges, usage meters, feature gates, server-side limit enforcement, checkout, payment confirmation, and the webhook).

**Totals:** 51 files modified, 14 files created.

---

## 2. Bugs Found & Fixed

### 2.1 Critical: DB CHECK constraint blocked the `pro` plan

**Root cause of "upgrade to Pro never applies."**

The original schema had:

```sql
plan TEXT DEFAULT 'basic' CHECK (plan IN ('basic','upgraded'))
```

Every `UPDATE shops SET plan='pro'` was silently rejected. Worse, the activation flow
claimed the upgrade session (`pending → paid`) *before* the shop update, so on failure
the session stayed `paid` and every retry short-circuited as `alreadyApplied` — a deadlock.

**Fixes:**
- New migration `supabase/migrations/019_dynamic_plan_codes.sql` — drops the hard-coded
  CHECK constraint (plan codes are now dynamic).
- `utils/server/plans.ts` — if the shop update fails after the session was claimed,
  the claim is **released back to `pending`** so the webhook/confirm flow can retry (no deadlock).

**Required SQL (run in Supabase SQL Editor):**

```sql
-- 1. Allow dynamic plan codes (drops shops_plan_check if present)
ALTER TABLE public.shops DROP CONSTRAINT IF EXISTS shops_plan_check;

-- 2. Fix pricing stored in centavos (pro was 200/400 = ₱2/₱4)
UPDATE public.plans SET price_monthly = 20000, price_yearly = 40000 WHERE code = 'pro';
UPDATE public.plans SET price_monthly = 10000, price_yearly = 20000 WHERE code = 'upgraded';
```

### 2.2 Stuck-activation self-recovery

A payment verified *before* the constraint was dropped left the session `paid` while the
shop stayed on the old plan, and the confirm flow skipped it forever.

**Fixes:**
- `utils/server/plans.ts` — if a session is already `paid` but the shop's plan ≠ the
  session's `to_plan`, activation now **proceeds** (logged as `recovering stuck activation`).
  Genuine double-applies are still skipped (webhook/confirm idempotency preserved).
- `pages/admin/billing.vue` — on page load, if the latest billing session is `paid` but its
  `to_plan` ≠ current plan, a red **"Payment received — but we couldn't activate your plan"**
  banner appears automatically with a **Retry Activation** button (idempotent — no second charge).

### 2.3 Downgrade to a free plan charged money

Downgrading to Basic hit the PayMongo path and could be charged the fallback price (₱1,990)
when plan resolution failed.

**Fix:** `server/api/billing/create-upgrade-session.post.ts` — a ₱0 target plan now returns
`{ freePlan: true }` and the plan change is applied **directly in the DB, with no PayMongo
involved**. The fallback price is now only used when no `planCode` is sent (never from the UI).

### 2.4 Duplicate PayMongo reference numbers

Every checkout for the same shop reused `UPGRADE-3b32df92` — PayMongo can reject duplicate
references, which breaks the *second* upgrade attempt (exactly the re-upgrade-after-downgrade
scenario).

**Fix:** `create-upgrade-session.post.ts` — reference number now ends in `-Date.now()`.

### 2.5 Wrong plan labels everywhere ("pro" displayed as Basic/Upgraded)

All plan labels were hard-coded ternaries on `'upgraded'`.

**Fix:** `components/PlanBadge.vue` + `components/AdminSidebar.vue` + all admin pages now
derive the label dynamically (capitalize the plan code; works for `pro` and any future plan).

### 2.6 Hard-coded tier limits / feature gates

20+ places used `plan === 'upgraded'` or static `TIER_LIMITS`, locking `pro` users out of
paid features and showing wrong limits.

**Fix (pattern):** paid-plan gates became `plan !== 'basic'` / `plan === 'basic'`, and limits
are read from the DB plans table with static `constants/tierLimits.ts` kept **only as a
client-side fallback**. Affected files listed in §4.


### 2.7 Usage meter not reflecting the shop's plan

`fetchPlans()` in `billing.vue` dropped `limits` and `is_default` from the API response, so
meters always showed static Basic limits.

**Fix:** `pages/admin/billing.vue` — `fetchPlans()` now preserves `limits` (DB `-1` →
`Infinity`) and `is_default`; the meter reads the actual plan's limits and shows the plan name.

### 2.8 Billing-interval toggle clobbered by refresh

Choosing Monthly→Yearly then hitting Refresh snapped the toggle back to the stored cycle.

**Fix:** `fetchCurrentPlan(syncInterval)` param added; all refresh paths pass `false`,
only initial load syncs.

### 2.9 No confirmation before upgrade/downgrade

**Fix:** `pages/admin/billing.vue` uses the existing `useConfirm()` / `ConfirmDialog`
component — distinct prompts for upgrade, downgrade, and renewal before any action.

### 2.10 Missing routes & dead CDN dependency

- Footer linked to `/privacy` and `/terms` which didn't exist (Vue Router warnings).
- `nuxt.config.ts` pulled Leaflet CSS from unpkg.com — blocked on some networks
  (`ERR_CONNECTION_RESET`) and redundant since `LeafletMap.vue` imports it from npm.

**Fix:** created `pages/privacy.vue` + `pages/terms.vue`; removed the unpkg `<link>`.

### 2.11 Diagnostic improvements

- `server/api/shops/index.get.ts` — real Supabase error now logged on failure (was swallowed).
- `server/api/webhooks/paymongo/upgrade.post.ts` — logs `to_plan` instead of silently
  defaulting to `'upgraded'`.
- Cookie fallback (`upgrade_session_id`, httpOnly) so payment confirmation survives even if
  the `upgrade_sessions` row couldn't be written.

---

## 3. The Plan Flow (End-to-End, After Fixes)

```
Plan cards → Confirm modal (upgrade / downgrade / renew)
    │
    ├─ Target price ₱0 (e.g. downgrade to Basic)
    │     └─ Applied DIRECTLY in DB — no PayMongo, no charge
    │
    └─ Target price > 0
          └─ PayMongo checkout (PLATFORM key, unique reference)
                │
                ├─ Owner returns → /admin/billing?success=true
                │     └─ confirmPayment() (3 retries / 3s for e-wallets)
                │          └─ POST confirm-upgrade
                │               ├─ auth: must be admin of THIS shop
                │               ├─ PayMongo verify (status + payments + intents)
                │               ├─ session must belong to this shop
                │               └─ activatePaidSubscription()  ─┐
                │                                               │ shared
                └─ Webhook (HMAC-verified, rate-limited) ───────┘
                        │
                        ├─ Atomic claim (pending→paid) = double-apply guard
                        ├─ Renewal extends from max(now, current expiry)
                        ├─ Upgrade starts fresh from now
                        ├─ Stuck activation self-recovery
                        ├─ Claim released if DB update fails (no deadlock)
                        └─ Audit log + billing history row
```

---

## 4. Changed Files by Area

### 4.1 New files

| File | Purpose |
|------|---------|
| `supabase/migrations/018_upgrade_sessions.sql` | `upgrade_sessions` table (billing history + idempotency) |
| `supabase/migrations/019_subscription_plans.sql` | Dynamic `plans` table for the Tier Maker |
| `supabase/migrations/019_dynamic_plan_codes.sql` | **Drops the hard-coded `shops_plan_check` constraint** |
| `supabase/migrations/020_billing_cycle.sql` | `shops.billing_interval` column (`monthly`/`yearly`) |
| `server/api/billing/plans.get.ts` | Public plans list from DB (Tier Maker = source of truth) |
| `server/api/super-admin/plans/index.get.ts` / `index.post.ts` | Tier Maker list / create |
| `server/api/super-admin/plans/[id].patch.ts` / `[id].delete.ts` | Tier Maker edit / delete |
| `pages/super-admin/plans.vue` | Tier Maker UI |
| `pages/privacy.vue` | Privacy Policy (fixes missing `/privacy` route) |
| `pages/terms.vue` | Terms of Service incl. subscription billing terms |
| `docs/membership-upgrade-flow-report.md` | Earlier flow report |
| `docs/subscription-tier-maker-report.md` | Tier Maker report |

### 4.2 Billing core (modified)

| File | Change |
|------|--------|
| `pages/admin/billing.vue` | Free-plan direct apply, confirm modal, `freePlan`/`error` states, Retry Activation banner, dynamic limits + usage meter, interval toggle fix, Refresh button |
| `server/api/billing/create-upgrade-session.post.ts` | ₱0 → direct DB change, DB-driven pricing, unique reference, cookie fallback, logging |
| `server/api/billing/confirm-upgrade.post.ts` | DB → cookie session lookup, stuck-activation recovery, `applied` flag returned, cookie cleared |
| `server/api/webhooks/paymongo/upgrade.post.ts` | Shared activation, full metadata logging |
| `utils/server/plans.ts` | `activatePaidSubscription()` (claim → update → release-on-failure → recovery), DB-first limits |
| `stores/shop.ts` | `effectivePlan` getter (grace-period fallback), plan refresh propagation |

### 4.3 De-hardcoding: paid-plan gates (`!== 'basic'`) + DB-driven limits

**Server:** `admin/services/index.post.ts`, `admin/products/index.post.ts`,
`admin/staff/index.post.ts`, `admin/gallery/upload.post.ts`, `admin/logs/index.get.ts`,
`admin/loyalty/rewards/index.post.ts`, `admin/loyalty/settings.patch.ts`,
`admin/settings/payment.patch.ts`, `admin/settings/test-paymongo.get.ts` / `.post.ts`,
`payments/create-paymongo-link.post.ts`, `customer/loyalty/status.get.ts`,
`customer/dashboard.get.ts`, `bookings/create.post.ts`,
`admin/bookings/[id]/complete.patch.ts` / `status.patch.ts`,
`super-admin/analytics.get.ts`, `super-admin/shops/[id]/subscription.patch.ts`,
`utils/server/loyaltyEngine.ts`, `utils/server/sendShopEmail.ts`

### 4.4 Super-admin, types & misc

| File | Change |
|------|--------|
| `super-admin/shops/[id].vue` | Plan switcher lists **all** plans from the plans API (dynamic buttons) |
| `super-admin/shops/index.vue`, `subscriptions.vue` | Plan filter options loaded from the plans API |
| `super-admin/dashboard.vue`, `analytics.vue` | "Upgraded" → "Paid" labels (any paid plan counts) |
| `types/database.ts` | `SubscriptionPlan` includes `'pro'` (+ open string for future plans) |
| `constants/tierLimits.ts`, `utils/tierLimits.ts` | Client-side fallback only; supports any plan code |
| `nuxt.config.ts` | Removed redundant unpkg Leaflet CDN link |
| `server/api/shops/index.get.ts` | Added Supabase error logging |
| `layouts/super-admin.vue`, `components/SuperAdminSidebar.vue` | Tier Maker nav entry |
| `.gitignore` | Ignore temp check scripts |

---

## 5. Known Limitations

1. **Expired-plan enforcement is client-side only.** During grace/after expiry, the UI
   (`resolveEffectivePlan`) shows Basic limits, but server-side limit checks
   (`getPlanLimits`) use the raw `shops.plan` value. Data is never lost; a fully-expired
   shop could still create beyond Basic limits via direct API calls until a cron downgrades
   them. Recommended follow-up: server-side grace-period check + scheduled downgrade job.
2. **Pro rating / partial refunds** are out of scope: upgrades start fresh, downgrades are
   immediate with no pro-rata refund (documented in `/terms`).
3. **Plan deletion with active subscribers** — consider guarding `[id].delete.ts` if shops
   still reference the plan code.

---

## 6. Verification Checklist

1. **Upgrade** basic→upgraded: confirm modal → PayMongo (test card `4343 4343 4343 4345`)
   → return → "Payment confirmed" → badge flips everywhere.
2. **Downgrade** to Basic: confirm modal → instant change, **no PayMongo page**.
3. **Re-upgrade after downgrade**: works (unique reference).
4. **Renew** same plan: expiry extends by +1 month/year from current end date.
5. **Pro plan**: label, limits (20/40/20/10), feature gates, loyalty, PayMongo all active.
6. **Retry path**: if a payment strands, red banner + "Retry Activation" applies it with no
   second charge.
7. **Server logs to watch:**
   - `[CREATE-UPGRADE-SESSION] Shop … checkout cs_… created: a -> b (monthly) amount=…`
   - `[CONFIRM-UPGRADE] session=… → paid=true`
   - `[ACTIVATE-SUBSCRIPTION] …` (no errors)

---

## 7. Environment / Operational Notes

- The dev machine had a **network-level outage to Cloudflare-fronted hosts** (Supabase,
  PayMongo, GitHub, unpkg) during testing — unrelated to the app. Symptoms:
  `Failed to fetch shops` (SWR 500s) and blocked PayMongo calls. If this recurs: try another
  network/VPN, `ipconfig /flushdns`, `netsh winsock reset`.
- Plans table prices are stored in **centavos** (₱100.00 = `10000`). The Tier Maker UI
  handles conversion; verify values if inserting via SQL directly.
- **Migrations to apply (in order):** 018 → 019 (subscription_plans) → 019 (dynamic_plan_codes)
  → 020 → **021 (upgrade_sessions append-only history)**, plus the two pricing UPDATE
  statements in §2.1.
- **`upgrade_sessions` schema changed in 021:** `UNIQUE (shop_id)` was dropped. It is now an
  **append-only history** — idempotency is keyed on `paymongo_session_id` (partial unique,
  so free-plan rows with `NULL` session id can repeat). Billing History now shows *every*
  plan change (paid + free downgrades), and re-processing is keyed on the PayMongo session
  instead of shop.

---

*Report generated from git diff (`51 files changed, 620 insertions(+), 238 deletions(-)`) plus new untracked files.*

