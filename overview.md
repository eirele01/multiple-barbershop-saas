# Barbershop SaaS — Codebase Overview

## Identity

**Multi-Tenant SaaS Barbershop Management Platform** — a full-stack application enabling barbershops to manage bookings, staff, payments, loyalty programs, and customer relationships. Built for the Philippine market with PayMongo integration as the primary payment processor.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | **Nuxt 3.16** (Vue 3.5, TypeScript strict mode) |
| UI | **Tailwind CSS** + **shadcn-nuxt** + **radix-vue** primitives |
| Icons | **Lucide** (lucide-vue-next) |
| State | **Pinia** (auth, shop stores) |
| Database | **Supabase** (PostgreSQL, Auth, RLS) |
| Payments | **PayMongo** (Checkout Sessions API) |
| Email | **Resend** API |
| Charts | **Chart.js** + **vue-chartjs** |
| Validation | **Zod** |
| Drag & Drop | **vuedraggable** |
| Deployment | **Vercel** (Singapore region `sin1`) |
| Fonts | Inter (Google Fonts) |

### Nuxt Modules

- `@nuxtjs/tailwindcss` — Tailwind integration
- `@pinia/nuxt` — Pinia state management
- `shadcn-nuxt` — shadcn-vue component library
- `@nuxtjs/color-mode` — Dark/light mode (default: light)

---

## Architecture

### Multi-Tenant Model

The platform serves multiple barbershops (tenants) from a single codebase. Tenancy is enforced through:

- **`shop_id` foreign key** on all tenant-scoped tables (`users`, `bookings`, `services`, etc.)
- **Row Level Security (RLS)** in Supabase for client-side queries
- **Service role key** in server routes to bypass RLS with explicit `shop_id` filtering
- **Shop slug** in public URLs (`/shop/[slug]`) for customer-facing pages

### Subscription Tiers

| Plan | Features |
|------|----------|
| **Basic** | Core booking, limited items (10 services, 20 gallery, 10 products, 5 staff), manual payments only |
| **Upgraded** | Unlimited items, **PayMongo** payments, **loyalty program**, **email notifications** (Resend), all advanced features |

### Role-Based Access Control

Five roles with granular permission matrix in `auth` store:

| Role | Scope |
|------|-------|
| `super_admin` | Platform-wide: analytics, shop/owner management, impersonation, platform settings |
| `admin` | Full shop management: staff, services, bookings, payments, loyalty, reports |
| `manager` | Similar to admin but cannot manage PayMongo or delete staff |
| `cashier` | Dashboard, payments, bookings, products/inventory, loyalty redemption |
| `barber` | Dashboard, bookings (own + create), availability management |
| `customer` | Book appointments, view bookings, loyalty points, redeem rewards |

---

## Directory Structure

```
barbershop-saas/
├── app.vue                           # Root component, auth/shop init
├── nuxt.config.ts                    # Config: modules, routeRules, runtimeConfig
├── tailwind.config.ts                # Theme: colors, fonts, shadcn tokens
├── tsconfig.json
├── vercel.json                       # Deployment: sin1 region
│
├── assets/
│   └── css/
│       └── tailwind.css              # Design system, CSS vars, dark mode, utilities
│
├── components/                       # 13 custom components (flat, no subdirs)
│   ├── AdminSidebar.vue              # Admin panel navigation
│   ├── AppNavbar.vue                 # Public navbar with glassmorphism
│   ├── ConfirmDialog.vue             # Reusable confirmation modal
│   ├── DashboardStatCard.vue         # Stat card for dashboards
│   ├── EmptyState.vue                # Empty data placeholder
│   ├── ErrorState.vue                # Error display component
│   ├── GalleryLightbox.vue           # Image gallery viewer
│   ├── Icon.vue                      # Lucide icon wrapper
│   ├── ShopSearchCombobox.vue        # Shop search with autocomplete
│   ├── StatusBadge.vue               # Status indicator with variants
│   ├── SuperAdminSidebar.vue         # Super admin navigation
│   ├── ToastContainer.vue            # Toast notification container
│   └── UpgradePrompt.vue             # Plan upgrade CTA (Basic → Upgraded)
│
├── composables/                      # 7 composables
│   ├── useBookingWizard.ts           # 5-step booking wizard state management
│   ├── useConfirm.ts                 # Async confirmation dialog composable
│   ├── useRoleMiddleware.ts          # Factory for role-based route guards
│   ├── useShopStatus.ts              # Open/closed status from working hours + timezone
│   ├── useSupabase.ts                # Supabase client singleton
│   ├── useSupabaseAdmin.ts           # Service role client factory
│   └── useToast.ts                   # Toast notification system
│
├── layouts/                          # 5 layouts
│   ├── default.vue                   # Public pages (AppNavbar + main)
│   ├── auth.vue                      # Auth pages layout
│   ├── admin.vue                     # Admin panel (AdminSidebar + content)
│   ├── customer.vue                  # Customer portal layout
│   ├── shop.vue                      # Shop public pages layout
│   └── super-admin.vue               # Super admin panel (SuperAdminSidebar)
│
├── middleware/                       # 7 middleware files
│   ├── auth.global.ts                # Global auth (runs on every route)
│   ├── auth.ts                       # Named auth middleware
│   ├── guest.ts                      # Redirects logged-in users from auth pages
│   ├── role.ts                       # Role-based access middleware
│   ├── admin.ts                      # Admin-only guard
│   ├── customer.ts                   # Customer-only guard
│   └── super-admin.ts                # Super admin-only guard
│
├── pages/                            # File-based routing
│   ├── index.vue                     # Homepage
│   ├── login.vue                     # Unified login (all roles)
│   ├── register.vue                  # Registration page
│   ├── auth/
│   │   └── verify-email.vue          # Email verification
│   ├── shop/
│   │   ├── [slug].vue                # Shop landing page
│   │   └── [slug]/
│   │       ├── book.vue              # Booking entry point
│   │       └── book/                 # Booking wizard steps
│   ├── admin/                        # Admin panel pages
│   │   ├── dashboard.vue             # Admin dashboard with stats
│   │   ├── calendar.vue              # Booking calendar
│   │   ├── bookings/                 # Booking list + detail
│   │   ├── services.vue              # Service management
│   │   ├── products.vue              # Product/inventory management
│   │   ├── staff.vue                 # Staff management
│   │   ├── gallery.vue               # Gallery management
│   │   ├── payments/                 # Payment methods + verification
│   │   ├── loyalty/                  # Loyalty program management (5 pages)
│   │   ├── reports.vue               # Financial reports
│   │   ├── logs.vue                  # Activity logs
│   │   ├── settings.vue              # Shop settings
│   │   ├── shop-profile.vue          # Shop profile editing
│   │   └── index.vue                 # Admin redirect
│   ├── customer/                     # Customer portal
│   │   ├── dashboard.vue             # Customer dashboard
│   │   ├── bookings.vue              # My bookings list
│   │   ├── bookings/[id].vue         # Booking detail
│   │   ├── loyalty.vue               # Loyalty points/rewards
│   │   ├── profile.vue               # Customer profile
│   │   └── login.vue                 # Customer login
│   └── super-admin/                  # Super admin panel
│       ├── dashboard.vue             # Platform dashboard
│       ├── analytics.vue             # Platform analytics
│       ├── shops/                    # Shop management (list + detail)
│       ├── owners/                   # Owner management
│       ├── subscriptions.vue         # Subscription management
│       ├── settings.vue              # Platform settings
│       └── index.vue
│
├── plugins/
│   └── auth-hydration.ts             # Fixes Pinia SSR hydration for auth store
│
├── public/
│   └── robots.txt
│
├── server/                           # Nitro server
│   ├── api/                          # Auto-routed API handlers
│   │   ├── admin/                    # Admin API routes
│   │   │   ├── bookings/             # Booking CRUD, calendar
│   │   │   ├── gallery/              # Gallery CRUD
│   │   │   ├── logs/                 # Activity logs
│   │   │   ├── loyalty/              # Loyalty management
│   │   │   ├── payment-methods/      # Payment method CRUD
│   │   │   ├── payment-verifications/ # Payment verification workflow
│   │   │   ├── products/             # Product CRUD
│   │   │   ├── services/             # Service CRUD
│   │   │   ├── settings/             # Settings (email, payment, test endpoints)
│   │   │   ├── shop/                 # Shop settings
│   │   │   ├── staff/                # Staff CRUD
│   │   │   ├── migration-status.get.ts
│   │   │   ├── reports.get.ts
│   │   │   └── run-migration.post.ts
│   │   ├── auth/
│   │   │   └── session.ts            # GET current session
│   │   ├── bookings/
│   │   │   ├── [id].get.ts           # Booking detail
│   │   │   ├── availability.get.ts   # Barber availability check
│   │   │   └── create.post.ts        # Create new booking
│   │   ├── customer/
│   │   │   ├── bookings/             # Customer booking routes
│   │   │   ├── bookings.get.ts       # Customer's booking list
│   │   │   ├── dashboard.get.ts      # Customer dashboard data
│   │   │   ├── loyalty/              # Customer loyalty API
│   │   │   ├── profile.patch.ts      # Update customer profile
│   │   │   └── register.post.ts      # Customer registration
│   │   ├── payments/
│   │   │   ├── create-paymongo-link.post.ts    # Create PayMongo checkout session
│   │   │   ├── upload-proof.post.ts             # Upload payment proof image
│   │   │   └── verify-paymongo-payment.post.ts  # Manual payment verification
│   │   ├── shops/
│   │   │   ├── index.get.ts          # Shop listing
│   │   │   ├── [slug].get.ts         # Shop detail by slug
│   │   │   ├── [slug]/payment-methods.get.ts
│   │   │   ├── [slug]/reviews.get.ts
│   │   │   ├── check-slug.ts         # Check slug availability
│   │   │   └── register.post.ts      # New shop registration
│   │   ├── super-admin/
│   │   │   ├── dashboard.get.ts      # Platform dashboard data
│   │   │   ├── analytics.get.ts      # Platform analytics
│   │   │   ├── impersonate/          # Shop admin impersonation
│   │   │   ├── owners/               # Owner management
│   │   │   ├── settings/             # Platform settings
│   │   │   └── shops/                # Shop management
│   │   └── webhooks/
│   │       └── paymongo/
│   │           └── [shopSlug].post.ts # PayMongo webhook handler
│   │
│   ├── routes/
│   │   └── sitemap.xml.ts            # Dynamic sitemap
│   │
│   └── utils/
│       ├── auth.ts                   # verifyAuth(), requireShopStaff(), requireSuperAdmin()
│       └── supabase.ts               # useSupabaseAdmin() — service role client
│
├── stores/                           # Pinia stores
│   ├── auth.ts                       # Auth state, permissions, impersonation
│   └── shop.ts                       # Current shop data, plan feature flags
│
├── types/
│   └── database.ts                   # All TypeScript types for DB models
│
└── utils/                            # Client + server utilities
    ├── dayMapping.ts                 # JS day index ↔ day name mapping
    ├── loyaltyTierHelper.ts          # Loyalty tier calculation helpers
    ├── tierLimits.ts                 # Tier limit configuration (basic vs upgraded)
    └── server/
        ├── bookingStatusChange.ts    # Booking status transition logic
        ├── emailTemplates.ts         # Email HTML templates (10 types)
        ├── encryption.ts             # AES-256-CBC encrypt/decrypt + HMAC verify
        ├── loyaltyEngine.ts          # Loyalty points engine (643 lines)
        └── sendShopEmail.ts         # Resend API email sender
```

---

## Key Data Flow

### Authentication Flow

1. User enters email/password on `/login`
2. `authStore.signIn()` calls Supabase `signInWithPassword()`
3. On success, `fetchUserProfile()` loads user data from `users` table
4. `auth.global.ts` middleware redirects to role-appropriate dashboard
5. Session persisted in localStorage by Supabase (client-side only)
6. SSR skips auth redirects to prevent "logged out on refresh" bug
7. `auth-hydration.ts` plugin resets SSR state on client, triggering proper re-init

### Booking Flow (5-Step Wizard)

1. **Select Service** — Choose from shop's active services
2. **Select Barber** — Pick a specific barber or "Any Available"
3. **Select Date & Time** — Real-time availability via `/api/bookings/availability.get.ts`
4. **Customer Info** — Name, phone, email, notes
5. **Review & Pay** — Review details, select payment method, apply loyalty rewards

Payment paths:
- **PayMongo (Upgraded)**: Creates Checkout Session → redirects to PayMongo → webhook confirms
- **Manual (all plans)**: Upload payment proof → admin verifies → booking confirmed

### Payment Flow (PayMongo)

```
Customer selects PayMongo
    ↓
POST /api/payments/create-paymongo-link
    ↓ Fetch shop + decrypt paymongo_secret_key
    ↓ Build line items from booking
    ↓ POST to PayMongo /v1/checkout_sessions
    ↓ Store paymongo_payment_id on booking
    ↓ Return checkout_url to client
    ↓
Client redirects to PayMongo hosted checkout
    ↓
Customer completes payment (GCash, Maya, card, QR Ph, etc.)
    ↓
PayMongo sends webhook to /api/webhooks/paymongo/[shopSlug]
    ↓ Verify HMAC signature (timingSafeEqual)
    ↓ Find booking by metadata → update status to 'confirmed'
    ↓ Send email confirmation via Resend
```

### Server-Side Authentication Pattern

All server API routes verify auth via Bearer token:

```ts
const authHeader = getHeader(event, 'authorization')
const token = authHeader?.replace('Bearer ', '')
const user = await verifyAuth(token)  // server/utils/auth.ts
requireShopStaff(user)                 // Optional role check
```

`verifyAuth()` performs:
1. JWT validation via Supabase Auth API
2. User profile fetch with service role key
3. Returns combined `{ id, email, role, shop_id, display_name }`

### Caching Strategy (routeRules)

| Route Pattern | Strategy | Rationale |
|--------------|----------|-----------|
| `/shop/**` | SWR 60s | Public pages benefit from caching |
| `/api/shops/**` | SWR 30-60s | Shop data changes infrequently |
| `/api/bookings/**` | No cache | Real-time booking data |
| `/api/admin/**` | No cache | Authenticated, mutable data |
| `/api/customer/**` | No cache | Authenticated, user-specific |

---

## Database Schema (Key Tables)

Based on `types/database.ts`:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Auth + profiles | `id`, `email`, `role`, `shop_id`, `display_name` |
| `shops` | Tenant records | `slug`, `plan`, `booking_settings`, `working_hours`, `timezone`, PayMongo/email/loyalty config |
| `services` | Shop services | `name`, `category`, `duration_mins`, `price`, `barber_ids` |
| `barbers` | Staff details | `user_id`, `schedule`, `specialties`, `rating` |
| `products` | Inventory | `name`, `price`, `stock`, `low_stock_threshold` |
| `bookings` | Appointments | `booking_ref`, `status`, `payment_*`, `points_*`, `date`, `start_time` |
| `payment_methods` | Shop payment options | `type` (qr_code/bank/e_wallet), `qr_code_url` |
| `payment_verifications` | Manual payment proof | `proof_image_url`, `status` |
| `loyalty_rewards` | Redeemable rewards | `type`, `points_required`, `discount_*` |
| `loyalty_points` | Points ledger | `type`, `points`, `balance_after`, `expires_at` |
| `gallery_images` | Shop gallery | `url`, `category`, `tags`, `sort_order` |
| `activity_logs` | Audit trail | `action`, `entity_type`, `old_value`, `new_value` |
| `reviews` | Customer reviews | `rating`, `comment`, `is_public`, `reply_message` |
| `platform_settings` | Platform config | `key`, `value` (key-value store) |

---

## Design System

**Theme: Modern Classic (Apple / iPhone Pro Style)**

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Titanium | `#8A8A8F` | Secondary text, borders |
| Silver | `#C7C7CC` | Dividers, subtle backgrounds |
| Deep | `#1D1D1F` | Primary text, CTAs |
| Apple White | `#F5F5F7` | Page background |
| Pure White | `#FFFFFF` | Cards, modals |
| Success | `#30D158` | Status: success |
| Warning | `#FF9F0A` | Status: warning |
| Danger | `#FF3B30` | Status: error/danger |
| Info | `#0A84FF` | Status: info |

### Typography

- **Font:** Inter (300–800 weights)
- **Scale:** h1: 48px/700 → h2: 36px/700 → h3: 24px/600 → h4: 20px/600
- **Base:** 16px, line-height 1.6

### Component Classes

- `.card-design` — 20px radius, card shadow, silver border
- `.btn-design` — 12px radius, medium font
- `.input-design` — 10px radius, input shadow
- `.glass` — 20px backdrop blur, 80% white
- `.badge-pill` — 999px radius status indicators

---

## Security

| Measure | Implementation |
|---------|---------------|
| API Key Storage | AES-256-CBC encryption for PayMongo keys and webhook secrets in database |
| Webhook Verification | HMAC-SHA256 + `timingSafeEqual` to prevent timing attacks |
| Auth Middleware | Client-side redirects skip during SSR to prevent hydration mismatches |
| Server Auth | Bearer token validation via Supabase Auth API + service role queries |
| RLS | Row Level Security on all Supabase tables |
| Encryption Key | `NUXT_ENCRYPTION_KEY` env var, SHA-256 derived AES key, cached in memory |

---

## Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `SUPABASE_URL` | Public | Supabase project URL |
| `SUPABASE_KEY` | Public | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Server | Supabase service role key |
| `NUXT_ENCRYPTION_KEY` | Server | AES-256 encryption key for sensitive data |
| `RESEND_API_KEY` | Server | Resend email API key (legacy, now platform_settings) |
| `NUXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Public | Google Maps embedding |
| `NUXT_PUBLIC_SITE_URL` | Public | Base URL for webhook/redirect URLs |

---

## Existing PayMongo Integration

The codebase already has a **functional PayMongo integration**:

- ✅ Checkout Sessions creation (`create-paymongo-link.post.ts`)
- ✅ Webhook handler with signature verification (`webhooks/paymongo/[shopSlug].post.ts`)
- ✅ Manual payment verification fallback (`verify-paymongo-payment.post.ts`)
- ✅ Encrypted key storage (AES-256-CBC)
- ✅ Payment method configuration per shop (GCash, Maya, InstaPay, QR Ph)
- ✅ Test mode support
- ✅ Activity logging for payment events
- ✅ Email notifications on payment success

**Integration Points:**
- Shop settings: `paymongo_enabled`, `paymongo_secret_key`, `paymongo_webhook_secret`, `paymongo_test_mode`
- Payment methods: `gcash_enabled`, `maya_enabled`, `instapay_enabled`, `qr_ph_enabled`
- Settings API: `test-paymongo.get.ts` and `test-paymongo.post.ts` for connectivity testing
- Booking flow: PayMongo checkout session created after booking, payment confirmed via webhook

---

## Email System (Resend)

**10 email templates** in `utils/server/emailTemplates.ts`:

| Template | Trigger |
|----------|---------|
| `booking.confirmed` | Payment confirmed (webhook/manual) |
| `booking.reminder` | Scheduled reminder before appointment |
| `payment.verified` | Manual payment verified by admin |
| `payment.rejected` | Payment proof rejected |
| `payment.info_requested` | Admin requests more payment info |
| `booking.cancelled` | Booking cancelled |
| `loyalty.earned` | Points earned on booking completion |
| `loyalty.tier_upgraded` | Customer tier upgrade |
| `loyalty.expiring` | Points expiring soon |
| `welcome` | New customer welcome |

Credentials managed via `platform_settings` table (super admin configured), with fallback to per-shop legacy config.

---

## Loyalty Program

**643-line engine** (`utils/server/loyaltyEngine.ts`) covering:

- Points earning on booking completion
- Tier system: Bronze → Silver → Gold → Platinum (configurable multipliers)
- Welcome bonus (one-time per shop-customer pair)
- Point redemption at booking (intent → actual deduction on completion)
- Point expiry with configurable months
- Admin point adjustments
- Cancellation reversal logic

---

## Deployment

- **Platform:** Vercel
- **Region:** Singapore (`sin1`)
- **Build:** `nuxt build`
- **GitHub integration:** Silent mode (suppresses commit status noise)

---

## Code Conventions

- **File naming:** kebab-case for files, PascalCase for Vue components
- **TypeScript:** Strict mode enabled, full typing via `types/database.ts`
- **Comments:** JSDoc blocks on modules, inline comments for non-obvious logic
- **Error handling:** `createError()` in server routes, try/catch with logging
- **Server routes:** Explicit Zod validation on request bodies
- **Supabase queries:** Service role key for server, anon key for client

---

## Identified Gaps / Opportunities

### Implemented But Could Be Improved

1. **Webhook signature format** — Current implementation uses `createHmac('sha256', secret).update(rawBody)` which concatenates body + secret. PayMongo docs specify `{timestamp}.{rawBody}` format with the timestamp. The timestamp tolerance check is also missing in production.

2. **Payment Intent API not used** — Integration uses Checkout Sessions exclusively. Payment Intents would enable custom checkout UIs and hold-then-capture flows.

3. **Refund functionality not exposed** — PayMongo refunds API exists in skill docs but no server route or UI for processing refunds.

4. **No idempotency handling** — Webhook processing doesn't deduplicate by event ID; repeated deliveries could cause duplicate bookings or emails.

5. **Activity logs user_id nullable inconsistency** — Some inserts use `null`, others use `''` for system-generated entries.

### Not Yet Implemented

1. **PayMongo subscription/recurring payments** — No subscription billing support
2. **QR Ph payments** — Enabled as a toggle but QR Ph-specific handling not detailed
3. **3D Secure flow testing** — Test cards with 3DS exist in skill docs but untested
4. **Payment dispute handling** — `dispute.created` webhook event not handled
5. **Payout tracking** — `payout.deposited` / `payout.returned` events not handled
6. **Card vaulting** — Customer card storage for repeat purchases not implemented

### Structural Observations

1. **No `components/ui` directory** — `shadcn-nuxt` is configured with `componentDir: './components/ui'` but the directory doesn't exist. Components may be auto-imported or manually placed.

2. **`index copy.vue` in pages/** — Stale file, should be removed.

3. **Flat component directory** — All 13 custom components are in the root `components/` without subdirectories. Consider organizing as the app grows.

4. **No tests** — No test framework or test files detected.

5. **No `.env.example`** — Environment variable documentation relies on README/nuxt.config only.
