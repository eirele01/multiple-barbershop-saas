# Subscription & Plan Tier System — Improved Flow Report

> **Date:** 2026-08-29
> **Version:** 2.0 (Dynamic Plan Tiers)
> **Status:** ✅ Implemented

---

## 1. What Changed & Why

### Before (v1)
- Plans were **hardcoded** in `constants/tierLimits.ts` (`basic` / `upgraded`).
- Upgrades were **super-admin only** — no self-service, no payment.
- Upgrading always meant moving to one fixed "Upgraded" plan at one fixed price.
- Adding a new plan required a code deploy.

### After (v2)
- Plans live in a **`plans` DB table**, fully editable by the super-admin through a new **Plan/Tier Maker** UI.
- Shop owners get a **self-service upgrade page** fed by the active plans.
- Upgrades are paid via the **platform's PayMongo** account (GCash / Maya / Card / QR Ph).
- The webhook activates the **exact plan purchased** (any plan code), with idempotency.

---

## 2. The New Flow (End to End)

```
SUPER ADMIN                          SHOP OWNER                           PAYMONGO
───────────                          ──────────                           ────────
Creates "Pro" plan
(price, limits, features)
    │                                   │                                    │
    ▼                                   ▼                                    │
/api/super-admin/plans        /admin/upgrade (dynamic cards)                 │
  (POST create)               reads /api/billing/plans                       │
    │                                   │                                    │
    ▼                                   ▼                                    │
plans table → seeded            Owner picks "Pro", clicks Upgrade             │
'basic' / 'upgraded'                    │                                    │
                                        ▼                                    │
                              POST /api/billing/create-upgrade-session       │
                              { shopId, planCode: 'pro' }                    │
                                        │                                    │
                                        ▼                                    │
                              Platform PayMongo Checkout Session ──────────►  │
                              (price from plans table)                       │
                                        │                                    │
                                        ▼                                    │
                              Owner pays (GCash/Maya/Card/QR)                 │
                                        │                                    │
                                        ▼                                    │
                              PayMongo webhook → /api/webhooks/paymongo/upgrade
                                        │  (HMAC-verified, idempotent)
                                        ▼
                              shops.plan = 'pro'  ✅ activated
```

---

## 3. New Files / Changes

| File | Type | Purpose |
|------|------|---------|
| `supabase/migrations/019_subscription_plans.sql` | NEW | `plans` table + seed + drops `shops.plan` CHECK constraint |
| `utils/server/plans.ts` | NEW | Shared resolvers (`fetchPlans`, `getPlanLimits`, normalization, fallback) |
| `server/api/super-admin/plans/index.get.ts` | NEW | List plans (Tier Maker) |
| `server/api/super-admin/plans/index.post.ts` | NEW | Create plan |
| `server/api/super-admin/plans/[id].patch.ts` | NEW | Update plan |
| `server/api/super-admin/plans/[id].delete.ts` | NEW | Delete plan (guards: default + in-use) |
| `pages/super-admin/plans.vue` | NEW | **Tier Maker UI** (cards + create/edit modal) |
| `server/api/billing/plans.get.ts` | NEW | Public-safe plan list for upgrade/pricing pages |
| `components/SuperAdminSidebar.vue` | EDIT | Added "Plans" nav link |
| `layouts/super-admin.vue` | EDIT | Added Plans breadcrumb |
| `server/api/super-admin/shops/[id]/subscription.patch.ts` | EDIT | Accept any plan code |
| `server/api/billing/create-upgrade-session.post.ts` | EDIT | Dynamic plan + price from DB |
| `server/api/webhooks/paymongo/upgrade.post.ts` | EDIT | Upgrades to `metadata.to_plan` |
---

## 4. Plans Table Design

```sql
plans (
  id            UUID PK,
  code          TEXT UNIQUE,      -- machine key, e.g. 'pro'
  name          TEXT,             -- display name
  description   TEXT,
  price_monthly INTEGER,          -- centavos (0 = free)
  price_yearly  INTEGER,          -- centavos (0 = free)
  limits        JSONB,            -- { services, gallery, products, staff }  (-1 = unlimited)
  features      JSONB,            -- marketing feature strings
  is_active     BOOLEAN,
  is_default    BOOLEAN,          -- fallback for new shops
  sort_order    INTEGER,
  created_at / updated_at
)
```

**Convention:** `-1` = unlimited (JSON can't store Infinity). The shared resolver converts `-1 → Infinity` before returning; a DB-first lookup falls back to the old static `TIER_LIMITS` so nothing breaks if the migration hasn't been applied.

---

## 5. The Tier Maker (Super Admin)

**Route:** `/super-admin/plans` (new sidebar item under _Management_)

Capabilities:
- **Create** a plan: code, name, description, monthly & yearly price (in ₱), resource limits (with per-field "Unlimited" toggle), marketing features (dynamic list), active flag, default flag, display order.
- **Edit** any plan (excluding the Basic default — that guard is enforced server-side).
- **Delete** — blocked if the plan is the default or is assigned to any shop.
- Full activity logging (`plan.created` / `plan.updated` / `plan.deleted`).

---

## 6. Security & Correctness

| Concern | Handling |
|---------|----------|
| Super-admin only writes | Every `/api/super-admin/plans*` route validates `role === 'super_admin'` via token |
| Plan code injection | `zod` regex `^[a-z0-9_]+$` + DB trigger |
| Duplicate codes | 409 on duplicate; unique DB constraint |
| Deleting a plan in use | Blocked server-side (count query) |
| Default plan protection | `basic` cannot be un-defaulted; default can't be deleted |
| Platform revenue | Upgrade payments use platform `PAYMONGO_SECRET_KEY`, not the shop's key |
| Webhook safety | Raw-body HMAC (SHA-256, `timingSafeEqual`), 5-min timestamp tolerance, live-sig preference, rate limited |
| Idempotency | Webhook skips if `shops.plan === to_plan` |

---

## 7. Practical Steps to Activate (You)

1. **Run the migration** against your Supabase project (or `supabase db push`):
   `supabase/migrations/019_subscription_plans.sql`
2. **Add platform PayMongo keys** to `.env` (server-only):
   ```env
   PAYMONGO_SECRET_KEY=sk_test_xxx
   PAYMONGO_WEBHOOK_SECRET=whsec_xxx
   ```
3. **Register webhook** in PayMongo dashboard → `https://<yourdomain>/api/webhooks/paymongo/upgrade` (enable `checkout_session.payment.paid`).
4. Restart dev server, log in as super-admin → **Plans** → edit pricing/limits as needed.

---

## 8. Open Items (Nice-to-Have Next)

- Make `/super-admin/subscriptions` plan filters dynamic (currently `basic|upgraded`).
- Let shop admins **downgrade** self-service with proration.
- Recurring billing (monthly/yearly subscription instead of one-time upgrade).
- Public `/pricing` page rendering from `/api/billing/plans`.
- Email receipt after successful upgrade.