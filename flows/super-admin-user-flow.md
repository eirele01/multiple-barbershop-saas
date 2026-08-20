# Super Admin User Flow

> End-to-end flow of the super admin — platform-level management of shops, owners, subscriptions, analytics, and settings.

---

## Table of Contents

1. [Super Admin Dashboard](#1-super-admin-dashboard)
2. [Platform Analytics](#2-platform-analytics)
3. [Shop Management](#3-shop-management)
4. [Shop Detail View](#4-shop-detail-view)
5. [Shop Impersonation](#5-shop-impersonation)
6. [Owner Management](#6-owner-management)
7. [Subscription Management](#7-subscription-management)
8. [Platform Settings](#8-platform-settings)
9. [Access Control & Roles](#9-access-control--roles)

---

## 1. Super Admin Dashboard

**Page:** `pages/super-admin/dashboard.vue`

```
┌───────────────────────────────────────────────────────────────┐
│  Platform Overview                                            │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Shops    │ │ Active   │ │ Basic    │ │ Upgraded       │  │
│  │   45     │ │   38     │ │   27     │ │   18           │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘  │
│                                                               │
│  ┌──────────────────────────┐ ┌──────────────────────────┐   │
│  │  Monthly Recurring Rev  │ │ Plan Distribution        │   │
│  │  ₱18,000 / month        │ │  [Donut Chart]           │   │
│  └──────────────────────────┘ └──────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ New Shop Registrations (last 30 days)                │    │
│  │  [Bar Chart — bars per week]                         │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Recent Shop Registrations                            │    │
│  │ ── King's Barbers — Basic — 2 days ago ──           │    │
│  │ ── Fade Shop — Basic — 5 days ago ──                │    │
│  │ ── Style Studio — Upgraded — 1 week ago ──          │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Recent Plan Upgrades                                 │    │
│  │ ── Style Studio — Basic → Upgraded — 1 week ago ──  │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

**Data Source:** `GET /api/super-admin/dashboard`

### Dashboard Metrics
- **Total Shops** — count of all shops
- **Active Shops** — `is_active = true`
- **Basic Plan Count** — `plan = 'basic'`
- **Upgraded Plan Count** — `plan = 'upgraded'`
- **Monthly Recurring Revenue (MRR)** — sum of upgraded plan prices
- **New Shop Registrations** — bar chart (last 30 days, weekly buckets)
- **Plan Distribution** — donut chart (basic vs upgraded)
- **Recent Shop Registrations** — table (last 5 shops)
- **Recent Plan Upgrades** — table (last 5 upgrades)

### Server Route

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/super-admin/dashboard` | GET | Dashboard metrics + chart data |

---

## 2. Platform Analytics

**Page:** `pages/super-admin/analytics.vue`

```
┌───────────────────────────────────────────────────────────────┐
│  Analytics                                          [Date ▼]  │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Bookings │ │ Revenue  │ │ Avg/Shop │ │ Conversion     │  │
│  │  1,234   │ │ ₱125K    │ │  27.4    │ │  68%           │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Bookings Over Time [Line Chart]                        │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Revenue Over Time [Line Chart]                         │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────┐ ┌─────────────────────┐            │
│  │ Top Shops by        │ │ Plan Growth Over     │            │
│  │ Bookings [Bar Chart]│ │ Time [Line Chart]   │            │
│  └─────────────────────┘ └─────────────────────┘            │
└───────────────────────────────────────────────────────────────┘
```

**Data Source:** `GET /api/super-admin/analytics?from=&to=`

### Analytics Features
- **Date range picker** — default: last 30 days
- **Key metrics summary** — total bookings, revenue, bookings per shop, conversion rate
- **Charts** (Chart.js):
  - Bookings over time (line chart)
  - Revenue over time (line chart)
  - Top shops by bookings (bar chart)
  - Top shops by revenue (bar chart)
  - Plan growth over time (line chart — basic vs upgraded count)

### Server Route

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/super-admin/analytics` | GET | Platform analytics with date range |

---

## 3. Shop Management

**Page:** `pages/super-admin/shops/index.vue`

```
┌───────────────────────────────────────────────────────────────┐
│  Shops                                            [12 shops]  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ [🔍 Search by shop name, slug, or owner email...]     │   │
│  └────────────────────────────────────────────────────────┘   │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐    │
│  │ Plan:   │ │ Status:  │ │ Registered   │ │[Apply]   │    │
│  │ [All ▼] │ │ [All ▼]  │ │ From: [📅]   │ │[Reset]   │    │
│  └─────────┘ └──────────┘ └──────────────┘ └──────────┘    │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Shop Name  │ Slug      │ Owner Email  │ Plan │ Status │  │
│  │ King's     │ kings-    │ juan@ex.com  │ Up   │ Active │  │
│  │ Fade Shop  │ fade-     │ pedro@ex.co  │ Basic│ Active │  │
│  │ Style      │ style-    │ maria@ex.co  │ Basic│ Susp.  │  │
│  └─────────────────────────────────────────────────────────┘  │
│  Actions: [View] [Suspend/Reinstate]                          │
└───────────────────────────────────────────────────────────────┘
```

### Features
- **Search** — shop name, slug, owner email
- **Filters:** plan (basic/upgraded), status (active/suspended), registration date range
- **Table columns:** Shop Name, Slug, Owner Email, Plan, Status, Bookings, Registered Date
- **Actions per row:** View (→ `/super-admin/shops/[id]`), Suspend/Reinstate
- Pagination: 20 per page

### Suspend/Reinstate Shop

```
Super admin clicks "Suspend" on a shop
  ↓
Confirmation dialog: "Are you sure you want to suspend this shop?"
  ↓
PATCH /api/super-admin/shops/[id]/status → { is_active: false }
  ↓
Server:
  1. Update shops.is_active = false
  2. Update owner user.is_active = false
  ↓
Shop becomes invisible to customers (shop listing filters out inactive)
Owner cannot log in (middleware checks is_active)
```

**Reinstate reverses:** `is_active = true` on both shops and owner.

### Server Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/super-admin/shops` | GET | List shops with search, filters, pagination |
| `/api/super-admin/shops/[id]/status` | PATCH | Suspend or reinstate shop |

---

## 4. Shop Detail View

**Page:** `pages/super-admin/shops/[id].vue`

### Tabs

#### Tab 1: Overview
```
┌───────────────────────────────────────────────────────────────┐
│  King's Barbers                     [Suspend] [Impersonate]   │
│                                                               │
│  ┌──────────────────┐ ┌──────────────────┐                   │
│  │ Shop Info        │ │ Owner Info       │                   │
│  │ Slug: kings-     │ │ Name: Juan       │                   │
│  │ Plan: Upgraded   │ │ Email: juan@...  │                   │
│  │ Status: Active   │ │ Role: admin      │                   │
│  │ Registered: Oct  │ │ Registered: Oct  │                   │
│  │ City: Makati     │ └──────────────────┘                   │
│  └──────────────────┘                                         │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Bookings │ │ Revenue  │ │ Staff    │ │ Plan           │  │
│  │   156    │ │ ₱45,000  │ │   4      │ │ Upgraded       │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

#### Tab 2: Staff
- Read-only table of all staff members
- Columns: Name, Email, Role, Status, Created
- Data: `GET /api/super-admin/shops/[id]/staff`

#### Tab 3: Bookings
- Last 50 bookings for this shop
- Columns: Reference, Customer, Service, Date, Status, Payment Status
- Data: `GET /api/super-admin/shops/[id]/bookings`

#### Tab 4: Subscription
- Current plan and status
- Plan history (if available)
- Data: loaded from shop detail

### Server Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/super-admin/shops/[id]` | GET | Shop detail + stats |
| `/api/super-admin/shops/[id]/staff` | GET | Staff list for a shop |
| `/api/super-admin/shops/[id]/bookings` | GET | Recent bookings for a shop |
| `/api/super-admin/shops/[id]/subscription` | PATCH | Change shop plan |
| `/api/super-admin/shops/[id]/export-csv` | GET | Export shop bookings as CSV |

---

## 5. Shop Impersonation

### Overview

Super admin can log in as a shop admin to troubleshoot issues, test features, or provide support.

### Flow

```
Super admin on /super-admin/shops/[id] (Overview tab)
  ↓
Clicks "Impersonate" button
  ↓
POST /api/super-admin/shops/[id]/impersonate
  ↓
Server:
  1. Verify super_admin role
  2. Get shop's admin user
  3. Generate encrypted token (15-minute expiry)
     Format: encrypt(shopAdminUserId + "." + shopId + "." + timestamp)
  4. Return: { token, shopName, impersonatedBy }
  ↓
Frontend: authStore.startImpersonation(token)
  ↓
  1. POST /api/super-admin/impersonate/validate
  2. Sets: isImpersonating = true, impersonatedShopName, impersonatedBy
  3. Loads shop admin user profile into authStore
  4. Loads shop into shopStore
  ↓
Redirect to /admin/dashboard (as shop admin)
```

### Impersonation UI

When impersonating, the admin layout (`layouts/admin.vue`) shows an impersonation banner:
- Yellow/warning colored banner at top
- Shows: "Impersonating [Shop Name] — by [Super Admin Name]"
- **"Exit Impersonation"** button → `authStore.exitImpersonation()`

### Exit Impersonation Flow

```
Shop admin (impersonated) clicks "Exit Impersonation"
  ↓
authStore.exitImpersonation()
  ↓
  1. Clear impersonation flags
  2. Restore original super admin session
  3. Refresh super admin user profile
  ↓
Redirect to /super-admin/shops
```

### Server Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/super-admin/shops/[id]/impersonate` | POST | Generate impersonation token |
| `/api/super-admin/impersonate/validate` | POST | Validate token, start impersonation |

---

## 6. Owner Management

**Page:** `pages/super-admin/owners/index.vue`

```
┌───────────────────────────────────────────────────────────────┐
│  Shop Owners                                       [8 owners] │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ [🔍 Search by name or email...]                        │   │
│  └────────────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐                                   │
│  │ Status:  │ │ [Apply]  │                                   │
│  │ [All ▼]  │ │ [Reset]  │                                   │
│  └──────────┘ └──────────┘                                   │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Name   │ Email        │ Shop       │ Plan │ Status   │   │
│  │ Juan   │ juan@ex.com  │ King's     │ Up   │ Active   │   │
│  │ Pedro  │ pedro@ex.co  │ Fade Shop  │ Basic│ Active   │   │
│  │ Maria  │ maria@ex.co  │ Style      │ Basic│ Suspended│   │
│  └────────────────────────────────────────────────────────┘   │
│  Actions: [View Shop] [Suspend/Reinstate] [Reset Password]   │
└───────────────────────────────────────────────────────────────┘
```

### Features
- **Search** — owner name, email
- **Filters:** status (active/suspended)
- **Table columns:** Name, Email, Shop Name, Plan, Registered Date, Last Login, Status
- Pagination: 20 per page

### Actions

#### Suspend/Reinstate Owner
```
Click "Suspend" → Confirmation dialog
  ↓
PATCH /api/super-admin/owners/[id]/status → { is_active: false }
  ↓
Server:
  1. Update users.is_active = false
  2. Update shops.is_active = false (cascading)
```

#### Reset Password
```
Click "Reset Password"
  ↓
POST /api/super-admin/owners/[id]/reset-password
  ↓
Server:
  1. Generate password recovery link (Supabase auth API)
  2. Return link to super admin
  ↓
Modal shows reset link → super admin copies to clipboard → sends to owner
```

### Server Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/super-admin/owners` | GET | List owners with search, filters, pagination |
| `/api/super-admin/owners/[id]/status` | PATCH | Suspend or reinstate owner |
| `/api/super-admin/owners/[id]/reset-password` | POST | Generate password reset link |

---

## 7. Subscription Management

**Page:** `pages/super-admin/subscriptions.vue`

```
┌───────────────────────────────────────────────────────────────┐
│  Subscriptions                                                │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────────────┐    │
│  │ Plan:    │ │ Status:  │ │ [🔍 Search...]             │    │
│  │ [All ▼]  │ │ [All ▼]  │                              │    │
│  └──────────┘ └──────────┘ └────────────────────────────┘    │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Shop Name │ Plan    │ Status  │ Bookings │ Since     │  │
│  │ King's    │ Upgraded│ Active  │ 156      │ Oct 2024  │  │
│  │ Fade Shop │ Basic   │ Active  │ 89       │ Jan 2025  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  Page 1 of 2   [Previous] [Next]                             │
└───────────────────────────────────────────────────────────────┘
```

### Features
- Filter by plan (basic/upgraded) and status (active/suspended)
- Search by shop name
- Paginated (10 per page)

### Plan Upgrade/Downgrade

From shop detail (`/super-admin/shops/[id]` → Subscription tab):
```
Super admin selects new plan
  ↓
PATCH /api/super-admin/shops/[id]/subscription → { plan: 'upgraded' }
  ↓
Server:
  1. Update shops.plan = 'upgraded'
  2. Log to activity_logs
  ↓
Shop now has access to upgraded features:
  - Unlimited services, staff, gallery
  - PayMongo integration
  - Email notifications
  - Loyalty program
  - Advanced analytics
```

### Server Route

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/super-admin/shops/[id]/subscription` | PATCH | Change shop plan |

---

## 8. Platform Settings

**Page:** `pages/super-admin/settings.vue`

### Tab 1: Platform Info
```
Platform Name:    [Reservation PH            ]
Platform URL:     [https://reservation.ph     ]
Support Email:    [support@reservation.ph     ]
                           [Save]
```

### Tab 2: Pricing Configuration
```
Upgraded Monthly Price:   [₱ 500       ]
Upgraded Yearly Price:    [₱ 5,000     ]
                           [Save]
```

### Tab 3: Maintenance Mode
```
Maintenance Mode:       [toggle switch]
Message:                [Text area]
[Default: "We are currently undergoing scheduled maintenance. We'll be back shortly."]
                           [Save]
```

When maintenance mode is enabled, the platform can show a maintenance page to all users (except super admins).

### Server Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/super-admin/settings` | GET | Get all platform settings |
| `/api/super-admin/settings` | PATCH | Save platform settings |

---

## 9. Access Control & Roles

### Super Admin Access
- Only users with `role = 'super_admin'` in the `users` table
- Protected by `middleware/super-admin.ts`
- All super admin routes prefixed with `/super-admin/`

### Middleware Chain
```
auth.global.ts → super-admin.ts
  ↓              ↓
Initialize auth  Verify role === 'super_admin'
store            Redirect to /login if not authorized
```

### What Super Admin Cannot Do
- Cannot access shop-specific admin pages directly (must use impersonation)
- Cannot modify customer accounts directly (must use impersonation)
- Cannot delete shops (can only suspend)
- Cannot delete owners (can only suspend)

### Server-Side Verification

Each server API route in `server/api/super-admin/` verifies:
```
1. Extract Bearer token from Authorization header
2. supabase.auth.getUser(token) → verify user
3. users table lookup → verify role === 'super_admin'
4. If not → 403 Forbidden
```

---

## Full Super Admin Journey Map

```
┌─────────────────────────────────────────────────────────────────┐
│                     SUPER ADMIN JOURNEY                         │
└─────────────────────────────────────────────────────────────────┘

/login → /super-admin/dashboard
  │
  ├─→ Dashboard →
  │    ├─ Shop count, active count, plan distribution
  │    ├─ MRR, registration chart, plan donut chart
  │    └─ Recent shops, recent upgrades
  │
  ├─→ Analytics →
  │    ├─ Date range filter
  │    ├─ Bookings/revenue over time (line charts)
  │    ├─ Top shops by bookings/revenue (bar charts)
  │    └─ Plan growth (line chart)
  │
  ├─→ Shops →
  │    ├─ Search, filter (plan, status, date range)
  │    ├─ Table: name, slug, owner, plan, status, bookings
  │    ├─ Suspend/Reinstate shops
  │    └─ View Detail →
  │         ├─ Overview: shop info, owner info, stats
  │         ├─ Staff: read-only staff list
  │         ├─ Bookings: last 50 bookings
  │         ├─ Subscription: plan details, upgrade/downgrade
  │         ├─ Impersonate: 15-min token → admin view
  │         └─ Export CSV: download bookings data
  │
  ├─→ Owners →
  │    ├─ Search, filter (status)
  │    ├─ Table: name, email, shop, plan, registered, last login
  │    ├─ Suspend/Reinstate owners
  │    └─ Reset Password: generates recovery link
  │
  ├─→ Subscriptions →
  │    ├─ Filter by plan and status
  │    ├─ Paginated shop subscription list
  │    └─ Upgrade/downgrade shops
  │
  └─→ Settings →
       ├─ Platform Info (name, URL, support email)
       ├─ Pricing Config (monthly/yearly upgraded prices)
       └─ Maintenance Mode (toggle + message)
```
