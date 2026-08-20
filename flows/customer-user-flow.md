# Customer User Flow

> End-to-end flow of a customer — from discovering a shop to completing bookings, managing loyalty, and updating their profile.

---

## 1. Discovery — Finding a Shop

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   Homepage   │────>│ Shop Search /     │────>│  Shop Landing     │
│     /        │     │ Popular Shop List │     │   /shop/[slug]    │
└──────────────┘     └──────────────────┘     └───────────────────┘
```

### Steps

1. **Visit Homepage** (`/`)
   - See hero, features, and "For Customers" section
   - Shop search combobox loaded via `GET /api/shops`
   - Popular shop chips for quick navigation

2. **Find Shop**
   - Search by name or city in combobox
   - Or click a popular shop chip
   - Navigates to `/shop/[slug]`

3. **Browse Shop Landing Page** (`/shop/[slug]`)
   - View shop info: cover image, name, city, hours, address
   - Browse services (filter by category)
   - View barber team with specialties
   - View gallery and reviews
   - See "next available slot" indicator
   - Click **Book Now** → `/shop/[slug]/book`

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/shops` | GET | List all active shops (public) |
| `/api/shops/[slug]` | GET | Shop detail + services + barbers + gallery + reviews |

---

## 2. Authentication

### 2A. Sign In

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  /login     │────>│ Email + Password │────>│ Redirect by Role   │
│  (Sign In)  │     │ Supabase Auth    │     │  /customer/dashboard│
└─────────────┘     └──────────────────┘     └────────────────────┘
```

**Steps:**
1. Visit `/login` → "Sign In" tab
2. Enter email + password
3. Call `authStore.signIn()` → Supabase `signInWithPassword`
4. On success, `fetchUserProfile()` loads user data from `users` table
5. Redirect to `/customer/dashboard`

### 2B. Create Account

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  /login     │────>│ Select "Book     │────>│ Inline Customer   │────>│ Auto-sign-in →     │
│  (Create)   │     │ Appointments"    │     │ Registration Form │     │ /customer/dashboard │
└─────────────┘     └──────────────────┘     └──────────────────┘     └────────────────────┘
```

**Steps:**
1. Visit `/login` → "Create Account" tab → "Book Appointments"
2. Fill: first name, last name, email, phone, password, confirm password
3. Call `POST /api/customer/register`
4. Server creates Supabase Auth user + `users` row (`role: customer`)
5. Auto-sign-in via `authStore.signIn()`
6. Redirect to `/customer/dashboard`

### 2C. Auth Middleware Protection

- `middleware/auth.global.ts` runs on every route
- Public routes: `/`, `/login`, `/register`, `/shop/**`, `/auth/**`
- Unauthenticated users on protected routes → `/login?redirect=[path]`
- Authenticated users on `/login` → role-specific dashboard
- SSR-safe: no redirect during server rendering

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/customer/register` | POST | Create customer account |

---

## 3. Customer Dashboard

```
┌───────────────────────────────────────────────────────┐
│              /customer/dashboard                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │  Welcome     │  │ Upcoming    │  │ Loyalty      │  │
│  │ Banner       │  │ Bookings    │  │ Points Card  │  │
│  └─────────────┘  └─────────────┘  └──────────────┘  │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Upcoming Bookings (next 3)                       │ │
│  │ ── Haircut / King's Barbers / Today 2:00 PM ──  │ │
│  │ ── Beard Trim / Fade Shop / Tomorrow 10AM ──    │ │
│  └──────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Your Points by Shop (if multiple shops)          │ │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

**Data Source:** `GET /api/customer/dashboard`

### Dashboard Cards
- **Upcoming bookings** — next 3 future bookings
- **Loyalty points** — total points balance
- **Quick Book CTA** — navigate to `/` to find a shop
- **Points by shop** — if customer has points at multiple shops

---

## 4. Booking Flow (5-Step Wizard)

```
┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐
│ Step 1   │─>│ Step 2   │─>│ Step 3       │─>│ Step 4       │─>│ Step 5      │
│ Service  │  │ Barber   │  │ Date & Time  │  │ Customer     │  │ Confirm &   │
│          │  │          │  │              │  │ Info         │  │ Pay         │
└──────────┘  └──────────┘  └──────────────┘  └──────────────┘  └─────────────┘
```

### Step 1 — Select Service
- Customer browses service grid on `/shop/[slug]/book`
- Can filter by category (Haircut, Beard, etc.)
- Click a service → auto-advances to Step 2

### Step 2 — Select Barber
- View eligible barbers for selected service
- Can choose "Any Available Barber"
- Click a barber → auto-advances to Step 3

### Step 3 — Select Date & Time
- Calendar with month navigation
- Select a date → available time slots loaded
  - `GET /api/bookings/availability?shopId=&date=&barberId=&serviceId=`
- Slots grouped: morning, afternoon, evening
- Click a time slot → auto-advances to Step 4

### Step 4 — Customer Information
- **Logged-in customer:** info pre-filled from profile
- **Guest:** fill first name, last name, email, phone, notes
- **Loyalty reward:** if shop has loyalty enabled and customer has points:
  - Available rewards shown
  - Selecting a reward reserves points (intent only — deducted on booking completion)
- Click Continue → Step 5

### Step 5 — Confirm & Pay
- Summary: service, barber, date/time, price, loyalty discount
- Payment method selection:
  - **PayMongo** (if shop has it enabled) — GCash, Maya, InstaPay, cards
  - **Bank Transfer / QR** — manual payment with proof upload
  - **Pay at Shop** — no online payment
- Click **Confirm Booking** → `POST /api/bookings/create`

### Guest Booking Flow
- Guest fills info in Step 4
- `POST /api/bookings/create` creates a Supabase Auth account behind the scenes:
  1. Check if email exists in `users` table
  2. If not → create Supabase Auth user + `users` row (`role: customer`)
  3. Link booking to the customer
- Response includes `guestAccountCreated: true`

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bookings/availability` | GET | Available time slots for date/barber/service |
| `/api/bookings/create` | POST | Create booking (public — rate limited) |
| `/api/customer/loyalty/status` | GET | Customer loyalty points and rewards |

---

## 5. Payment Flows

### 5A. PayMongo (Online Payment)

```
┌──────────┐  ┌──────────────────┐  ┌────────────────┐  ┌────────────┐  ┌────────────┐
│ Booking   │─>│ Create PayMongo  │─>│ Redirect to    │─>│ Pay via     │─>│ Webhook    │
│ Created   │  │ Checkout Link    │  │ PayMongo Page  │  │ GCash/Card  │  │ Updates    │
│ (pending) │  │                  │  │                │  │             │  │ Booking    │
└──────────┘  └──────────────────┘  └────────────────┘  └────────────┘  └────────────┘
```

1. `POST /api/bookings/create` creates booking (`status: pending`)
2. Server calls `POST /api/payments/create-paymongo-link`
3. PayMongo checkout link created → customer redirected
4. Customer completes payment on PayMongo
5. PayMongo sends webhook → `POST /api/webhooks/paymongo/[shopSlug]`
6. Webhook verifies HMAC signature → updates `payment_status: paid`, `status: confirmed`
7. Customer sees `/shop/[slug]/book/payment-success`

### 5B. Bank Transfer / QR (Manual Payment)

```
┌──────────┐  ┌──────────────────┐  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Booking   │─>│ Show Bank Details│─>│ Customer Makes │─>│ Upload Proof │─>│ Admin Reviews    │
│ Created   │  │ / QR Code        │  │ Transfer       │  │              │  │ (Verify/Reject)  │
│ (pending) │  │                  │  │ (off-platform) │  │              │  │                  │
└──────────┘  └──────────────────┘  └────────────────┘  └──────────────┘  └──────────────────┘
```

1. `POST /api/bookings/create` creates booking + `payment_verifications` row (`status: pending`)
2. Customer sees bank details / QR code
3. Customer makes transfer outside the platform
4. Customer uploads proof image → `POST /api/payments/upload-proof`
5. Shop admin reviews in `/admin/payments/verification`:
   - **Verify** → `status: verified`, booking `status: confirmed`
   - **Reject** → `status: rejected`, booking `status: cancelled`
   - **Request More Info** → `status: more_info_needed`

### 5C. Pay at Shop

- `POST /api/bookings/create` creates booking (`status: confirmed`, `payment_status: unpaid`)
- No online payment step
- Customer pays barber on-site

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payments/create-paymongo-link` | POST | Create PayMongo checkout link |
| `/api/payments/verify-paymongo-payment` | POST | Manual payment verification (retry) |
| `/api/payments/upload-proof` | POST | Upload bank transfer proof |
| `/api/webhooks/paymongo/[shopSlug]` | POST | PayMongo webhook (HMAC verified) |

---

## 6. Booking Management

### 6A. View Bookings (`/customer/bookings`)

```
┌─────────────────────────────────────────────────┐
│  Tabs: [Upcoming] [Past] [Cancelled]            │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ REF-12345  Haircut  King's Barbers        │  │
│  │  Calendar: Oct 15, 2025  Clock: 2:00 PM   │  │
│  │  Barber: Juan  ₱500  [Confirmed] [Paid]   │  │
│  │                              [View Details]│  │
│  └───────────────────────────────────────────┘  │
│  (paginated — 20 per page)                       │
└─────────────────────────────────────────────────┘
```

- Data: `GET /api/customer/bookings?tab=upcoming|past|cancelled&page=`

### 6B. View Booking Detail (`/customer/bookings/[id]`)

- Full booking details: reference number, shop, service, barber, date/time, status, payment status, receipt
- **Cancel Booking** button (if within cancellation window)

### 6C. Cancel Booking

1. Click "Cancel Booking"
2. `PATCH /api/customer/bookings/[id]/cancel`
3. Server checks cancellation policy (time threshold from shop settings)
4. If within window → `status: cancelled`, email sent to customer
5. If outside window → error (must contact shop)

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/customer/bookings` | GET | List customer bookings by tab |
| `/api/customer/bookings/[id]/cancel` | PATCH | Cancel booking |

---

## 7. Loyalty Program

### 7A. Earning Points (Automatic)

- **Trigger:** Booking status changes to `completed`
- **Calculation:** `floor((amount / earn_base) × earn_rate × tier_multiplier)`
- **Welcome Bonus:** First-time customer at a shop (one-time, enforced by unique partial index)
- **Atomic Update:** `loyalty_earn_points()` RPC with PostgreSQL advisory lock

### 7B. Loyalty Dashboard (`/customer/loyalty`)

```
┌─────────────────────────────────────────────────┐
│  [King's Barbers]  [Fade Shop]  (shop selector) │
│                                                 │
│  ┌─────────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Balance: 350 │ │ Tier:    │ │ 2 Rewards    │ │
│  │ Total: 500   │ │ Silver   │ │ Available    │ │
│  └─────────────┘ └──────────┘ └──────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ Rewards:                                  │  │
│  │ ✓ Free Haircut Trim (300 pts) — Redeem!  │  │
│  │ ✐ Free Beard Shave (500 pts) — Need 150  │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ Transaction History:                      │  │
│  │ Earned +50 — Haircut — Oct 15            │  │
│  │ Earned +50 — Haircut — Oct 10            │  │
│  │ Welcome Bonus +50 — Joined               │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

- Data: `GET /api/customer/loyalty/status` + `GET /api/customer/loyalty/transactions`

### 7C. Redeeming Points

- Select reward in booking wizard Step 4
- Points reserved at booking time (intent)
- Actually deducted when booking reaches `completed` status
- If booking cancelled before completion → points refunded

### 7D. Points Expiry

- Supabase Edge Function `expire-points` runs daily
- Finds ledger entries older than `loyalty_expiry_months`
- Creates negative expiry entries + updates balance

### Related API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/customer/loyalty/status` | GET | Loyalty balance, tier, rewards |
| `/api/customer/loyalty/transactions` | GET | Paginated transaction history |

---

## 8. Profile Management

```
┌───────────────────────────────────────────────────────────┐
│  /customer/profile                                        │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Display Name: [Juan Dela Cruz          ]           │  │
│  │ Email:        juan@example.com (read-only)          │  │
│  │ Phone:        [+63 917 123 4567           ]         │  │
│  │ New Password: [●●●●●●●●                   ]         │  │
│  │ Confirm:      [●●●●●●●●                   ]         │  │
│  │                          [Save Changes]             │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

- Load: `GET /api/customer/profile`
- Save: `PATCH /api/customer/profile` (updates name, phone, password)
- Refreshes `authStore` profile data

---

## 9. Email Notifications

Customer receives these automated emails (via Resend API):

| Email Template | Trigger |
|----------------|---------|
| **Booking Confirmation** | After `POST /api/bookings/create` succeeds |
| **Booking Reminder** | 24h before appointment (Supabase Edge Function: `send-reminders`) |
| **Booking Cancellation** | After booking cancellation |
| **Payment Verified** | After admin verifies manual payment proof |
| **Payment Rejected** | After admin rejects manual payment proof |

---

## Full Customer Journey Map

```
                        ┌──────────────┐
                        │    Homepage   │
                        │      /        │
                        └──────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
     ┌──────────────┐  ┌───────────┐   ┌────────────────┐
     │   /login     │  │ /shop/slug │   │ /register      │
     │ Sign In /    │  │ (browse)   │   │ (for shop     │
     │ Register     │  │            │   │  owners only)  │
     └──────┬───────┘  └─────┬─────┘   └────────────────┘
            │                │
            ▼                ▼
     ┌──────────────┐  ┌──────────────┐
     │ /customer/   │  │ /shop/slug/  │
     │ dashboard    │  │ book         │
     └──────┬───────┘  └──────┬───────┘
            │                 │
     ┌──────┴───────┐  ┌──────┴───────┐
     │              │  │              │
     ▼              ▼  ▼              ▼
  Bookings   Loyalty  5-Step     Payment
  (list)     (points) Wizard    (3 methods)
                              │
                     ┌────────┴────────┐
                     ▼        ▼        ▼
                  Online  Manual   Pay at
                  (PayMongo) Proof  Shop
```
