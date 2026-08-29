# Shop Owner (Admin) User Flow — Codebase Audit Report

> **Scope:** Comparison of `flows/owner-user-flow.md` against the actual implementation.
> **Audited:** Sep, 2026 — pages, server routes, middleware, and role enforcement.
> **Status:** Report only — fixes to be planned in a follow-up.

---

## Executive Summary

The owner flow is **largely implemented and functional**. Registration → email verification → dashboard → all 14 admin sections exist with matching pages, server routes, and tier-limit enforcement. However, the audit found **3 medium** and **4 low** findings. The most important are an **architectural inconsistency** (bookings list/detail bypass the server API layer) and **page-level role guards that don't fully match the documented role matrix**.

No high-severity functional bug was found that breaks the happy path.

---

## Legend

- **HIGH** — bug / security risk / broken feature
- **MEDIUM** — deviation from documented flow, or defense-in-depth gap
- **LOW** — doc inaccuracy, cosmetic, or minor cleanup

---

## 1. Shop Registration & Onboarding — MATCHES

| Flow requirement | Status | Evidence |
|---|---|---|
| 3-step wizard (`/register`) | PASS | `pages/register.vue` (steps validated per screen) |
| Slug real-time check, 400ms debounce | PASS | `register.vue` uses 400ms `setTimeout` + `/api/shops/check-slug` |
| Slug status (checking/available/taken) | PASS | `slugStatus` states in `register.vue` |
| Zod server validation | PASS | `register.post.ts` `registerSchema` |
| Server slug uniqueness re-check | PASS | `register.post.ts` `existingShop` check |
| Creates Auth user + `users` (admin) + `shops` (basic/active) | PASS | `register.post.ts` |
| Seed default hours (Mon-Sat 9-6, Sun closed) | PASS | `DEFAULT_WORKING_HOURS` constant |
| Redirect to `/auth/verify-email?email=` | PASS | `register.vue` |
| Onboarding banner on dashboard | PASS | `admin/dashboard.vue` `displayOnboarding` |

**Note:** `server/api/shops/check-slug.ts` (method-agnostic filename) serves `/api/shops/check-slug`, so the endpoint exists.

---

## 2. Admin Dashboard — functional

- `pages/admin/dashboard.vue` shows onboarding banner + today's bookings / revenue / pending payments / schedule.
- Secured from unauthenticated access by `auth.global.ts` (all non-public routes redirect to `/login`).
- **LOW-1:** `dashboard.vue` and `admin/index.vue` declare **no page-level `admin` middleware** (only `layout: 'admin'`). Protected by global auth, but should add `['auth','admin']` for consistency with all other admin pages.

---

## 3. Booking Management — MEDIUM (architecture)

Pages exist: `admin/bookings/index.vue`, `[id].vue`.

### MEDIUM-1: Bookings list/detail bypass the server API layer
The flow documents these endpoints:

| Documented endpoint | Exists? | Actual |
|---|---|---|
| `GET /api/admin/bookings` | No | `index.vue` queries Supabase directly |
| `GET /api/admin/bookings/[id]` | No | `[id].vue` queries Supabase directly |
| `PATCH /api/admin/bookings/[id]/status` | Yes | `status.patch.ts` |
| `POST /api/admin/bookings/[id]/complete` | Yes | `complete.patch.ts` |

- Only status-change/completion writes go through server routes. List/detail reads hit the client SDK directly, relying **solely on RLS** with no server-authored auth/validation/shape. Inconsistent with every other admin module (services, staff, gallery, loyalty) that uses server routes.
- **Risk:** if shop RLS regresses, booking data could be exposed to the wrong party with no server backstop.

### Status semantics (nuance)
Flow implies one status dropdown; code splits it: `status.patch.ts` handles `confirmed/in_progress/cancelled/no_show`, while `completed` requires the dedicated `/complete` endpoint (where loyalty award/redeem happens). Reasonable by design; flow doc should note it. `[id].vue` correctly routes 'completed' to `/complete`.

---

## 4. Service Management — functional, 1 divergence

- `admin/services.vue`; tier limit 10 enforced server-side (`SERVICE_LIMIT = plan==='upgraded' ? Infinity : 10`) PASS
- Create/update: admin + manager PASS; delete safety-check vs bookings PASS.
- **LOW-2:** **Delete** requires `role === 'admin'` only — **manager cannot delete services**, whereas the flow documents manager as full CRUD. Divergence from doc (arguably safer).

---

## 5. Staff Management — functional

- `admin/staff.vue`; middleware `[auth, roleMiddleware(admin,manager)]` PASS
- Tier limit 5 enforced server-side PASS; new staff roles limited to manager/cashier/barber PASS
- Delete safety: cannot remove self / other admins, refuses if active bookings, soft-deactivates PASS
- Note: code uses `barbers.schedule` (jsonb) rather than a literal `barber_schedules` table the flow names. Internally consistent; doc-phrasing difference.
---

## 6. Payment Verification — functional

- Tabs (pending/verified/rejected/more-info), verify/reject/request-info endpoints all present. Verify -> booking `confirmed` + `payment_status=paid` + email + logs. Reject -> `pending_payment` + email + logs. Sync endpoint present. Realtime channel in `verification.vue` confirmed.

## 7. Payment Methods — functional

- Drag reorder (`reorder.patch.ts`), delete safety-check, upload-QR. Middleware `[auth, roleMiddleware(admin,manager)]`.

## 8. Shop Profile — MEDIUM (role mismatch)

- `admin/shop-profile.vue`; endpoints `profile.get/patch`, `upload-logo/cover` present.

### MEDIUM-2 (3-way role mismatch)
- **Flow:** Shop Profile = admin only
- **Page middleware:** `[auth, admin]` -> allows admin/manager/cashier/barber (page renders for all 4)
- **Server:** `profile.patch.ts` / `profile.get.ts` allow admin + manager
- Net: cashier/barber can navigate (page); manager can read/write (server); flow says admin only. Not a cross-tenant leak, but the three layers disagree and none match the doc.

## 9. Settings — server-enforced, page-guard gap

- `admin/settings.vue` (Payment & Email tabs), `test-paymongo.get/post`, `test-resend.get` present.
- `settings/payment.patch.ts`: **admin-only** + secret-key encryption (dirty-flag/masking), webhook URL rebuild, validation — **exemplary**.
- **(part of MEDIUM-3)** Page middleware `[auth, admin]` -> cashier/barber can navigate to `/admin/settings` (page renders); server rejects writes (403). Defense-in-depth OK, but route should hide for non-admins.

## 10. Gallery — functional
- Tier limit 20 enforced server-side. Middleware `[auth, roleMiddleware(admin,manager)]`.

## 11. Loyalty — MEDIUM (page-guard gap) / plan-gating OK
- Settings/Members/Rewards/Transactions pages + routes present. Customer/engine sides enforce `plan === 'upgraded'` for award/redeem.
- **(part of MEDIUM-3)** All four loyalty pages use `[auth, admin]` (all 4 roles), but flow restricts: Settings=admin only; Members/Rewards/Transactions=admin+manager. Cashier/barber can navigate at route level (server may still gate writes).

## 12. Reports — functional, 1 doc mismatch
- `admin/reports.vue`, `reports.get.ts`, Chart.js, date-range. Flow matrix all 4 roles; page `[auth, admin]` (all 4) — matches.
- **LOW-3:** CSV export is **client-side** (Blob in `exportCSV()`), but flow documents server `GET /api/admin/reports/export-csv` that does **not exist**. Feature works; doc inaccurate.

## 13. Calendar — functional
- `admin/calendar.vue`, `bookings/calendar.get.ts`. Middleware `[auth, admin]` (all 4; matches flow).


---

## 14. Role-Based Access — MEDIUM (central theme)

- Robust middleware chain exists: `auth.global.ts -> auth.ts -> admin.ts -> role.ts(roleMiddleware)`.
- **Admin middleware** (`admin.ts`) intentionally allows admin/manager/cashier/barber (all shop staff).
- Some pages correctly add `roleMiddleware(...)` for granular control:
  - gallery, payment methods `(admin,manager)`; payment verification `(admin,manager,cashier)`; staff `(admin,manager)`.

### MEDIUM-3: Blanket `[auth, admin]` over-exposes restricted pages at the route level

Pages using only `[auth, admin]` let cashier/barber navigate to areas the flow says they should not see:

| Page | Flow says | Page middleware allows |
|---|---|---|
| Settings | admin | all 4 staff |
| Shop Profile | admin | all 4 staff |
| Loyalty Settings | admin | all 4 staff |
| Loyalty Members/Rewards/Transactions | admin + manager | all 4 staff |
| Logs | admin + manager | all 4 staff |

Server-side write endpoints generally enforce the stricter role (settings = admin; shop profile = admin+manager), so data is **not directly writable** by cashier/barber, but pages render and read endpoints are reachable.

**Recommendation:** replace blanket `[auth, admin]` with granular `roleMiddleware(...)` on those pages to match the flow matrix (the sidebar likely already hides them, but direct URL access bypasses that).

### LOW-4 (doc gap)
- Products management exists (`admin/products.vue` + full CRUD API) but is **absent from `flows/owner-user-flow.md`**. The flow doc needs a Products section.

---

## Findings Summary Table

| ID | Severity | Area | Finding |
|---|---|---|---|
| MEDIUM-1 | Medium | Bookings | List/detail query Supabase directly; documented `/api/admin/bookings` GET endpoints don't exist; RLS-only authorization |
| MEDIUM-2 | Medium | Shop Profile | 3-way role mismatch (flow=admin, page=all 4, server=admin+manager) |
| MEDIUM-3 | Medium | Roles | Blanket `[auth,admin]` on Settings/ShopProfile/Loyalty/Logs exposes routes to cashier/barber vs the access matrix |
| LOW-1 | Low | Dashboard | `dashboard.vue`/`admin/index.vue` lack page-level `admin` middleware (rely on global auth) |
| LOW-2 | Low | Services | Manager can't delete services (doc says manager CRUD); admin-only delete |
| LOW-3 | Low | Reports | CSV export is client-side; documented `/api/admin/reports/export-csv` doesn't exist |
| LOW-4 | Low | Flow doc | Products management not documented in owner flow |

### Other observations (non-blocking)
- `check-slug.ts` leaves a `console.log('Checking slug availability...')` debug line in prod.
- A dangling empty `platform_resend_api_key` row remains in `platform_settings` (harmless, treated as unset).
- `barbers.schedule` (jsonb) is used rather than a literal `barber_schedules` table the flow names — internally consistent.

---

*Prepared for planning a fix round. Each MEDIUM is independent and can be addressed separately.*
