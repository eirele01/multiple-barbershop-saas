# Shop Owner (Admin) User Flow

> End-to-end flow of a shop owner — from registering a shop to managing bookings, staff, payments, loyalty, and settings.

---

## Table of Contents

1. [Shop Registration & Onboarding](#1-shop-registration--onboarding)
2. [Admin Dashboard](#2-admin-dashboard)
3. [Booking Management](#3-booking-management)
4. [Service Management](#4-service-management)
5. [Staff Management](#5-staff-management)
6. [Payment Verification](#6-payment-verification)
7. [Payment Methods](#7-payment-methods)
8. [Shop Profile](#8-shop-profile)
9. [Settings — Payment & Email](#9-settings---payment--email)
10. [Gallery Management](#10-gallery-management)
11. [Loyalty Program Management](#11-loyalty-program-management)
12. [Reports & Analytics](#12-reports--analytics)
13. [Calendar View](#13-calendar-view)
14. [Role-Based Access](#14-role-based-access)

---

## 1. Shop Registration & Onboarding

### Registration Wizard (`/register`)

**Page:** `pages/register.vue` — 3-step wizard

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Account      Step 2: Shop Info     Step 3: Confirm    │
│  (○──────●──────○)     (○──────●──────○)   (○──────●──────●)    │
└─────────────────────────────────────────────────────────────────┘
```

### Step 1 — Account Setup
- Full name, email, password, confirm password
- Client-side validation on each field
- Cannot proceed until all valid

### Step 2 — Shop Information
- **Shop name** — auto-generates slug
- **Shop slug** — real-time uniqueness check via `GET /api/shops/check-slug` (400ms debounce)
  - Status indicators: checking (spinner), available (✓ green), taken (✗ red)
- Phone number, city, description (optional, max 200 chars)
- Slug preview: `yourdomain.com/shop/[slug]`

### Step 3 — Confirmation
- Review account + shop details
- Basic plan info: "Free forever"
- Terms of Service checkbox (required)
- Click "Create My Shop"

### Server Flow

```
POST /api/shops/register
  ↓
1. Zod validation of all fields
2. Server-side slug uniqueness check
3. Create Supabase Auth user
4. Insert `users` row (role: 'admin', shop_id)
5. Insert `shops` row (plan: 'basic', plan_status: 'active')
6. Seed default working hours (Mon-Sat 9am-6pm, Sunday closed)
7. Update user's shop_id → link to shop
  ↓
Redirect to /auth/verify-email?email=xxx
```

### Post-Registration

**Page:** `/auth/verify-email`
- Shows verification email address
- Instructions to check inbox

**Onboarding Banner:** After first login, `pages/admin/dashboard.vue` shows onboarding banner (dismissable) directing owner to set up services, staff, and settings.

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/shops/register` | POST | Atomic shop registration (user + shop + hours) |
| `/api/shops/check-slug` | GET | Check slug uniqueness (public) |

---

## 2. Admin Dashboard

**Page:** `pages/admin/dashboard.vue`

```
┌─────────────────────────────────────────────────────────┐
│  Welcome, Admin!                                        │
│                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │  Today's     │ │  Pending     │ │  Today's     │    │
│  │  Bookings    │ │  Payments    │ │  Revenue     │    │
│  │     12       │ │     3        │ │  ₱2,500      │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Today's Schedule (upcoming bookings by time)      │  │
│  │  09:00  Haircut - Juan (confirmed)                │  │
│  │  10:30  Beard Trim - Pedro (pending payment)      │  │
│  │  14:00  Haircut + Beard - Juan (confirmed)        │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Data Source:**
- Queries Supabase directly via `useSupabase()` with Bearer token
- Today's bookings count, pending payments count, today's revenue, active staff count
- Today's schedule: upcoming bookings sorted by start_time

---

## 3. Booking Management

### 3A. Bookings List (`/admin/bookings`)

**Page:** `pages/admin/bookings/index.vue`

**Access:** `admin` role

**Features:**
- Filter by: status, barber, date range (from/to)
- Table: reference number, customer, service, barber, date/time, status, payment status
- Actions: View details
- Pagination: 20 per page

**Statuses:** pending, pending_payment, confirmed, in_progress, completed, cancelled, no_show

### 3B. Booking Detail (`/admin/bookings/[id]`)

**Page:** `pages/admin/bookings/[id].vue`

**Features:**
- Full booking details
- **Change Status** — dropdown to update booking status:
  - `pending` → `confirmed` → `in_progress` → `completed`
  - Or `cancelled` / `no_show`
- **Payment status** tracking
- When status changes to `completed`:
  - Loyalty points earned (if loyalty enabled)
  - Loyalty points redeemed (if reward was applied at booking)

**Status Change Flow:**
```
Admin selects new status → PATCH request
  ↓
utils/server/bookingStatusChange.ts
  ↓
1. Update bookings.status
2. If completed → trigger loyaltyEngine.awardPoints()
3. If completed with reward → redeem points
4. If cancelled → refund redeemed points (if not yet completed)
5. Send email notification (confirmation/cancellation)
6. Log to activity_logs
```

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/bookings` | GET | List bookings with filters |
| `/api/admin/bookings/[id]` | GET | Booking detail |
| `/api/admin/bookings/[id]` | PATCH | Update booking status |

---

## 4. Service Management

**Page:** `pages/admin/services.vue`

**Access:** `admin`, `manager` (CRUD); `cashier`, `barber` (read-only)

### Features

- Service grid view with category badges
- **Tier limits:** Basic plan = 10 services max, Upgraded = unlimited
- If at limit on Basic plan → "Upgrade to add more" prompt

### Add/Edit Service (Slide-over Panel)

```
Service Name:          [Classic Haircut            ]
Category:              [Haircut        ▼           ]
Description:           [Text area                  ]
Duration:              [30        min              ]
Price:                 [₱ 500                      ]
Assigned Barbers:      [Juan ✓] [Pedro ] [Maria ✓]
Image:                 [Choose File] [Preview]
```

### Fields
- **Name, description** — required
- **Category** — haircut, beard, styling, package, other
- **Duration (minutes)** — required
- **Price** — required
- **Barber assignment** — multi-select from shop barbers
- **Image** — optional, uploaded to Supabase Storage

### Server Flow

```
POST /api/admin/services          → Create service
  ├─ Tier limit check (Basic: 10 max)
  ├─ Insert services row
  └─ Insert services_barbers join rows

PATCH /api/admin/services/[id]    → Update service
  ├─ Update services row
  └─ Upsert services_barbers join rows

DELETE /api/admin/services/[id]   → Delete service
  └─ Safety check: reject if referenced by bookings
```

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/services` | GET | List services |
| `/api/admin/services` | POST | Create service |
| `/api/admin/services/[id]` | PATCH | Update service |
| `/api/admin/services/[id]` | DELETE | Delete service (safe check) |
| `/api/admin/services/upload-image` | POST | Upload service image |

---

## 5. Staff Management

**Page:** `pages/admin/staff.vue`

**Access:** `admin`, `manager`

### Features

- Card grid with profile photos, role badges, specialties
- **Tier limits:** Basic plan = 5 staff max, Upgraded = unlimited
- Slide-over panel for add/edit

### Staff Roles

| Role | Access Level |
|------|-------------|
| `admin` | Full shop access |
| `manager` | Most access (no settings/payment config) |
| `cashier` | Verify payments, view bookings, create bookings |
| `barber` | View bookings, update booking status, set availability |

### Add Staff Flow

```
Click "Add Staff"
  ↓
Slide-over panel opens:
  - Full name, email, phone
  - Role: admin, manager, cashier, barber
  - If barber: bio, specialties, experience (years), schedule
  - Photo upload (optional)
  ↓
POST /api/admin/staff
  ↓
1. Tier limit check
2. Create Supabase Auth user (temporary password)
3. Insert `users` row (role, shop_id)
4. If barber → insert `barbers` row + `barber_schedules`
  ↓
Staff member created, password sent to email
```

### Edit Staff
- Update role, phone, bio, specialties, schedule
- Toggle availability (is_available)
- Toggle active status (is_active)

### Delete Staff
- Safety check: cannot delete if assigned to active bookings
- Sets `is_active = false` (soft disable) instead of hard delete

### Barber Schedule Editor
- 7-day schedule grid (Mon-Sun)
- Set open/close time per day
- Toggle day on/off
- Save → updates `barber_schedules` table

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/staff` | GET | List staff |
| `/api/admin/staff` | POST | Add staff member |
| `/api/admin/staff/[id]` | PATCH | Update staff |
| `/api/admin/staff/[id]` | DELETE | Deactivate staff |

---

## 6. Payment Verification

**Page:** `pages/admin/payments/verification.vue`

**Access:** `admin`, `manager`, `cashier`

### Tabs
- **Pending** — awaiting review
- **Verified** — approved payments
- **Rejected** — denied payments
- **More Info** — additional info requested from customer

### Features
- Filter by date range, payment method
- Real-time updates via Supabase Realtime channel
- Proof image lightbox with inline verify/reject buttons
- Relative time display with auto-refresh

### Verification Actions

#### Verify Payment
```
Admin clicks "Verify"
  ↓
PATCH /api/admin/payment-verifications/[id]/verify
  ↓
1. Update verification: status = 'verified'
2. Update booking: status = 'confirmed', payment_status = 'paid'
3. Send email to customer (payment_verified)
4. Log to activity_logs
```

#### Reject Payment
```
Admin clicks "Reject" (optional reason)
  ↓
PATCH /api/admin/payment-verifications/[id]/reject
  ↓
1. Update verification: status = 'rejected'
2. Update booking: status = 'cancelled'
3. Send email to customer (payment_rejected)
4. Log to activity_logs
```

#### Request More Info
```
Admin clicks "Request More Info" → enters message
  ↓
PATCH /api/admin/payment-verifications/[id]/request-info
  ↓
1. Update verification: status = 'more_info_needed'
2. Send email to customer (payment_more_info)
```

### Payment Sync

**Endpoint:** `POST /api/admin/payment-verifications/sync`

Creates missing `payment_verifications` records for bookings that have `payment_status: pending` but no verification record.

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/payment-verifications` | GET | List verifications with filters |
| `/api/admin/payment-verifications/sync` | POST | Create missing verification records |
| `/api/admin/payment-verifications/[id]/verify` | PATCH | Verify payment |
| `/api/admin/payment-verifications/[id]/reject` | PATCH | Reject payment |
| `/api/admin/payment-verifications/[id]/request-info` | PATCH | Request more info |

---

## 7. Payment Methods

**Page:** `pages/admin/payments/methods.vue`

**Access:** `admin`, `manager`

### Features
- Drag-to-reorder (vuedraggable)
- Slide-over panel for add/edit
- Safety check on delete (referenced methods → deactivate instead)

### Payment Method Types

| Type | Fields |
|------|--------|
| QR Code | QR code image upload, account name, bank |
| Bank Transfer | Account name, account number, bank name |
| E-Wallet | Account details, instructions |
| Cash | Instructions only |

### Add Payment Method Flow
1. Click "Add Payment Method"
2. Select type (QR code, bank transfer, e-wallet, cash)
3. Fill fields, upload QR image if applicable
4. Set as active/inactive
5. Save → `POST /api/admin/payment-methods`

### Server Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/payment-methods` | GET | List payment methods |
| `/api/admin/payment-methods` | POST | Create payment method |
| `/api/admin/payment-methods/[id]` | PATCH | Update payment method |
| `/api/admin/payment-methods/[id]` | DELETE | Delete/deactivate payment method |
| `/api/admin/payment-methods/upload-qr` | POST | Upload QR code image |

---

## 8. Shop Profile

**Page:** `pages/admin/shop-profile.vue`

**Access:** `admin`

### Sections

#### Logo & Cover Image
- Circular logo preview with upload button
- Banner-style cover image with upload button
- Drag-and-drop support
- Local preview before upload

#### Shop Info
```
Shop Name:           [King's Barbers           ] (read-only slug)
Slug:                [kings-barbers]            (read-only after creation)
Description:         [Text area, max 500 chars  ]
Phone:               [+63 917 123 4567          ]
Email:               [kings@example.com         ]
```

#### Address
- Street, City, State, ZIP

#### Social Links
- Facebook URL, Instagram URL, TikTok URL

#### Theme Colors
- Primary color (picker with hex input)
- Accent color (picker with hex input)
- Background color (picker with hex input)
- Live preview of shop page colors

#### Working Hours
- 7-day schedule grid
- Set open/close time per day
- Toggle day on/off
- Timezone selector

### Server Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/shop/profile` | GET | Get shop profile |
| `/api/admin/shop/profile` | PATCH | Update shop profile |
| `/api/admin/shop/upload-logo` | POST | Upload shop logo |
| `/api/admin/shop/upload-cover` | POST | Upload cover image |

---

## 9. Settings — Payment & Email

**Page:** `pages/admin/settings.vue`

**Access:** `admin`

### Tab 1: Payment Settings

#### PayMongo Configuration (Upgraded Plan Only)
- Toggle: PayMongo enabled/disabled
- Public key, Secret key (encrypted in DB), Webhook secret
- Test mode toggle
- Individual method toggles: GCash, Maya, InstaPay, QR Ph
- Webhook URL display: `https://yourdomain.com/api/webhooks/paymongo/[slug]`
- **Test Connection** button → `GET /api/admin/settings/test-paymongo`

#### Manual Payment / QR
- Toggle: Manual payment enabled/disabled

### Tab 2: Email Settings

#### Email Notifications
- Toggle: Booking confirmation emails
- Toggle: Booking reminder emails
- **Test Email** button → `GET /api/admin/settings/test-resend`

### Server Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/settings/payment` | GET | Get payment settings |
| `/api/admin/settings/payment` | PATCH | Save payment settings (encrypts secret keys) |
| `/api/admin/settings/email` | GET | Get email settings |
| `/api/admin/settings/email` | PATCH | Save email settings |
| `/api/admin/settings/test-paymongo` | GET | Test PayMongo connection |
| `/api/admin/settings/test-resend` | GET | Test Resend email |

---

## 10. Gallery Management

**Page:** `pages/admin/gallery.vue`

**Access:** `admin`, `manager`

### Features
- Masonry-style grid layout
- **Tier limits:** Basic = 20 images, Upgraded = unlimited
- Upload modal with drag-and-drop
- Edit modal (caption, category, tags)
- Delete with confirmation

### Image Fields
- Image file (uploaded to Supabase Storage)
- Caption
- Category (interior, exterior, work, team)
- Tags (comma-separated)
- Display order

### Upload Flow
```
Select files (drag-drop or browse)
  ↓
Enter caption, category, tags
  ↓
POST /api/admin/gallery/upload (per image)
  ↓
1. Upload to Supabase Storage
2. Insert gallery_images row
3. Return image URL
```

### Server Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/gallery` | GET | List gallery images |
| `/api/admin/gallery/upload` | POST | Upload image(s) |
| `/api/admin/gallery/[id]` | PATCH | Update image metadata |
| `/api/admin/gallery/[id]` | DELETE | Delete image |

---

## 11. Loyalty Program Management

**Access:** `admin` (requires Upgraded plan)

### 11A. Loyalty Settings (`/admin/loyalty/settings`)

**Page:** `pages/admin/loyalty/settings.vue`

```
Loyalty Enabled:              [toggle]
Earn Rate:                    [1] points per
Earn Base:                    [100] pesos
Welcome Bonus:                [50] points
Points Expiry:                [12] months

Tiers Enabled:                [toggle]
Bronze:    0 – 499 pts       ×1.0
Silver:   500 – 1499 pts     ×1.2
Gold:    1500 – 2999 pts     ×1.5
Platinum: 3000+ pts           ×2.0
```

**Server Routes:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/loyalty/settings` | GET | Get loyalty settings |
| `/api/admin/loyalty/settings` | PATCH | Save loyalty settings |

### 11B. Loyalty Members (`/admin/loyalty/members`)

**Page:** `pages/admin/loyalty/members.vue`

- List of customers with loyalty points at this shop
- Search by name/email
- Columns: name, email, points balance, tier, total earned, joined date
- **Adjust Points** button → slide-over panel
  - Add or subtract points
  - Enter reason (logged in transaction)

**Server Routes:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/loyalty/members` | GET | List members with pagination |
| `/api/admin/loyalty/members/[id]/adjust` | POST | Admin adjust points |

### 11C. Loyalty Rewards (`/admin/loyalty/rewards`)

**Page:** `pages/admin/loyalty/rewards.vue`

- List of available rewards
- Add/Edit/Delete rewards
- Toggle active/inactive

**Reward Fields:**
- Name, description
- Points required
- Active toggle

**Server Routes:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/loyalty/rewards` | GET | List rewards |
| `/api/admin/loyalty/rewards` | POST | Create reward |
| `/api/admin/loyalty/rewards/[id]` | PATCH | Update reward |
| `/api/admin/loyalty/rewards/[id]` | DELETE | Delete reward |

### 11D. Loyalty Transactions (`/admin/loyalty/transactions`)

**Page:** `pages/admin/loyalty/transactions.vue`

- Transaction history across all members
- Filter by type: earned, redeemed, adjusted, expired, welcome_bonus
- Columns: member, type, points, balance after, reason, date

**Server Routes:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/loyalty/transactions` | GET | List transactions with filters |

---

## 12. Reports & Analytics

**Page:** `pages/admin/reports.vue`

**Access:** `admin`

### Features

#### Date Range Picker
- Default: current month
- Apply button to filter

#### Stat Cards
- Total Revenue
- Total Bookings
- Average Booking Value
- Completion Rate

#### Charts (Chart.js)
- Revenue over time (line chart)
- Bookings by status (bar chart)
- Top services (bar chart)
- Top barbers by revenue (bar chart)

#### Recent Transactions
- Paginated table (20/page)
- Date, customer, service, amount, status

#### Export CSV
- Downloads filtered data as CSV

### Server Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/reports` | GET | Report data (stats, charts, transactions) |
| `/api/admin/reports/export-csv` | GET | Download CSV export |

---

## 13. Calendar View

**Page:** `pages/admin/calendar.vue`

**Access:** `admin`

### Features
- View toggle: Day / Week / Month
- Navigation: Previous / Today / Next
- Calendar grid with booking blocks colored by barber
- Click booking → detail slide-over
- Filters: barber dropdown, status dropdown

### Data Flow
```
GET /api/admin/bookings/calendar?from=&to=&barberId=&status=
  ↓
Returns bookings for date range
  ↓
Rendered as colored blocks on calendar grid
  ↓
Click block → slide-over with booking detail + status change
```

---

## 14. Role-Based Access

### Admin Pages Access Matrix

| Page | admin | manager | cashier | barber |
|------|-------|---------|---------|--------|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Bookings List | ✓ | ✓ | ✓ | ✓ |
| Booking Detail | ✓ | ✓ | ✓ | ✓ |
| Change Status | ✓ | ✓ | ✓ | ✓ |
| Services (CRUD) | ✓ | ✓ | view | view |
| Staff Management | ✓ | ✓ | ✗ | ✗ |
| Payment Verification | ✓ | ✓ | ✓ | ✗ |
| Payment Methods | ✓ | ✓ | ✗ | ✗ |
| Shop Profile | ✓ | ✓ | ✗ | ✗ |
| Settings (Payment/Email) | ✓ | ✗ | ✗ | ✗ |
| Gallery (CRUD) | ✓ | ✓ | ✗ | ✗ |
| Loyalty Settings | ✓ | ✗ | ✗ | ✗ |
| Loyalty Members | ✓ | ✓ | ✗ | ✗ |
| Loyalty Rewards | ✓ | ✓ | ✗ | ✗ |
| Loyalty Transactions | ✓ | ✓ | ✗ | ✗ |
| Reports | ✓ | ✓ | ✓ | ✓ |
| Calendar | ✓ | ✓ | ✓ | ✓ |
| Logs | ✓ | ✓ | ✗ | ✗ |

### Middleware Chain
```
auth.global.ts → auth.ts → admin.ts → roleMiddleware('admin','manager')
  ↓              ↓          ↓             ↓
Initialize   Check auth   Check role    Check specific
auth store   (redirect    (admin or     roles (per page)
             if none)     shop staff)
```

---

## Full Owner Journey Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHOP OWNER JOURNEY                           │
└─────────────────────────────────────────────────────────────────┘

Homepage (/) → "Register Your Shop"
  │
  ▼
/register (3-step wizard)
  ├─ Step 1: Account (name, email, password)
  ├─ Step 2: Shop Info (name, slug, phone, city)
  └─ Step 3: Confirm → POST /api/shops/register
       │
       ▼
  /auth/verify-email
       │
       ▼
  /login → /admin/dashboard
       │
       ├─→ [Onboarding] → Set up services, staff, settings
       │
       ├─→ Bookings → Manage appointments (list, detail, status)
       │
       ├─→ Services → CRUD service offerings
       │
       ├─→ Staff → Add/remove team, manage schedules
       │
       ├─→ Payments →
       │    ├─ Verification (review proof, verify/reject)
       │    └─ Methods (bank transfer, QR, cash)
       │
       ├─→ Gallery → Upload/manage shop images
       │
       ├─→ Shop Profile → Info, hours, colors, logo/cover
       │
       ├─→ Settings →
       │    ├─ Payment (PayMongo config, test connection)
       │    └─ Email (notification toggles, test email)
       │
       ├─→ Loyalty →
       │    ├─ Settings (earn rate, tiers, bonus, expiry)
       │    ├─ Members (list, adjust points)
       │    ├─ Rewards (create/manage redeemable rewards)
       │    └─ Transactions (history)
       │
       ├─→ Reports → Revenue, bookings, charts, export
       │
       ├─→ Calendar → Visual schedule view
       │
       └─→ Logs → Activity audit trail

Plan Tiers:
  Basic (Free):  10 services, 5 staff, 20 gallery images
  Upgraded:      Unlimited everything + PayMongo + Email + Loyalty + Reports
```
