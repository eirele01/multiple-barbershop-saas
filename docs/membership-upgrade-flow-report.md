# Membership Upgrade Flow — Deep Research Report

> **Date:** 2026-08-29
> **Scope:** Current subscription/upgrade implementation + industry best practices
> **Verdict:** Current flow is **super-admin only** — needs a self-service upgrade flow for shop owners

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [What's Missing](#2-whats-missing)
3. [Industry Best Practices](#3-industry-best-practices)
4. [Recommended Upgrade Flow](#4-recommended-upgrade-flow)
5. [Implementation Roadmap](#5-implementation-roadmap)

---

## 1. Current State Analysis

### 1.1 Subscription Tiers

| Plan | Services | Gallery | Products | Staff | Price |
|------|----------|---------|----------|-------|-------|
| **Basic** | 10 | 20 | 10 | 5 | Free |
| **Upgraded** | Unlimited | Unlimited | Unlimited | Unlimited | Paid |

Defined in: `constants/tierLimits.ts`

### 1.2 Current Upgrade Flow (Super Admin Only)

```
Super Admin -> /super-admin/shops/:id -> Subscription Tab
    -> Click "Upgrade" or "Downgrade" button
    -> PATCH /api/super-admin/shops/:id/subscription
    -> Plan changed in database
    -> Activity log recorded
```

### 1.3 Files Involved

| File | Purpose |
|------|---------|
| `constants/tierLimits.ts` | Tier limit definitions |
| `pages/super-admin/subscriptions.vue` | List all shop subscriptions |
| `pages/super-admin/shops/[id].vue` | Shop detail with subscription tab |
| `server/api/super-admin/shops/[id]/subscription.patch.ts` | Change plan endpoint |
| `server/api/super-admin/shops/[id].get.ts` | Shop detail with subscription history |

### 1.4 What Works

- Tier limits enforced server-side (staff creation, service creation)
- Super admin can upgrade/downgrade any shop
- Subscription history tracked in activity logs
- Plan status (active/inactive/trial) supported

---

## 2. What's Missing

### 2.1 Critical Gaps


---

## 3. Industry Best Practices

### 3.1 SaaS Upgrade Flow Patterns

**Pattern A: Self-Service with Payment (Recommended)**

```
1. User hits limit -> Sees upgrade prompt
2. Clicks "Upgrade" -> Pricing page
3. Selects plan -> Checkout (PayMongo/Stripe)
4. Payment success -> Plan activated
5. Confirmation email -> User can now add more
```

**Pattern B: Admin-Assisted (Current)**

```
1. User contacts admin
2. Admin manually changes plan
3. User notified (manually)
```

### 3.2 Best Practice Components

| Component | Description | Example |
|-----------|-------------|---------|
| **Pricing Page** | Public page showing plans & features | Stripe, Notion |
| **Upgrade CTAs** | Contextual prompts when limit reached | "Upgrade to add more staff" |
| **Plan Comparison** | Side-by-side feature comparison | ClickUp, Slack |
| **Self-Service Checkout** | In-app payment without leaving | GitHub, Figma |
| **Trial Graceful Handling** | Clear trial end messaging | HubSpot |
| **Proration** | Fair billing for mid-cycle upgrades | AWS, Azure |

### 3.3 Upgrade Trigger Points

| Trigger | Action |
|---------|--------|
| Limit reached (staff/services) | Show inline upgrade prompt |
| Settings page | Show current plan + upgrade button |
| Dashboard | Show plan badge + "Manage Plan" link |
| Periodic NPS | Suggest upgrade for power users |

---

## 4. Recommended Upgrade Flow

### 4.1 Proposed Architecture

```
PROPOSED MEMBERSHIP FLOW

[ Pricing ]     [ Checkout ]     [ Success ]
[ Page ]   -->  [ Page ]    -->  [ Page ]
[ /pricing]     [ /checkout]     [ /success]
     ^               ^
     |               |
[ Upgrade ]     [ PayMongo ]
[ Prompts ]     [ Payment  ]
[ (inline) ]    [ Intent   ]

Triggers: Limit reached, Dashboard CTA, Settings link
```

### 4.2 New Pages to Create

---

## 5. Implementation Roadmap

### Phase 1: Foundation (Quick Win)

| Task | Effort | Impact |
|------|--------|--------|
| Create `/admin/upgrade` page | 2 hours | HIGH |
| Add upgrade prompts on limit reached | 1 hour | HIGH |
| Add "Current Plan" widget to dashboard | 1 hour | MEDIUM |
| Add plan comparison component | 2 hours | MEDIUM |

### Phase 2: Self-Service (Core)

| Task | Effort | Impact |
|------|--------|--------|
| Integrate PayMongo checkout | 4 hours | HIGH |
| Create checkout flow | 3 hours | HIGH |
| Handle payment webhooks | 2 hours | HIGH |
| Add billing history page | 2 hours | MEDIUM |

### Phase 3: Polish (Nice to Have)

| Task | Effort | Impact |
|------|--------|--------|
| Public pricing page `/pricing` | 3 hours | MEDIUM |
| Trial management | 2 hours | LOW |
| Email notifications for upgrades | 1 hour | LOW |
| Proration logic | 3 hours | LOW |

---

## Appendix: Current Code References

### Tier Limit Enforcement (Example)

```typescript
// server/api/admin/staff/index.post.ts
const { count: currentStaffCount, error: countError } = await supabaseAdmin
  .from('users')
  .select('id', { count: 'exact', head: true })
  .eq('shop_id', shopId)
  .in('role', ['manager', 'cashier', 'barber'])

const limit = TIER_LIMITS[userPlan]?.staff || TIER_LIMITS.basic.staff
if (currentStaffCount !== null && currentStaffCount >= limit) {
  throw createError({
    statusCode: 403,
    statusMessage: `Staff limit reached (${limit}). Please upgrade your plan.`,
  })
}
```

### Subscription Change Endpoint

```typescript
// server/api/super-admin/shops/[id]/subscription.patch.ts
await supabase.from('shops').update(updatePayload).eq('id', shopId)
// Logs to activity_logs
await supabase.from('activity_logs').insert({...})
```

---

## Summary

| Aspect | Current | Recommended |
|--------|---------|-------------|
| Upgrade trigger | Admin manual | Self-service + prompts |
| Payment | None | PayMongo integration |
| User awareness | Error messages | Clear upgrade path |
| Billing | None | Automated |
| Plan visibility | Hidden | Pricing page + dashboard |

**Next Step:** Start with Phase 1 (Foundation) to give shop owners visibility and a clear upgrade path.


| Page | Route | Purpose |
|------|-------|---------|
| Pricing | `/pricing` | Public plan comparison |
| Upgrade | `/admin/upgrade` | In-app plan selection |
| Checkout | `/admin/checkout` | Payment processing |
| Billing | `/admin/billing` | Manage subscription |

### 4.3 New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/billing/plans` | GET | List available plans |
| `/api/billing/upgrade` | POST | Create upgrade intent |
| `/api/billing/subscription` | GET | Get current subscription |
| `/api/billing/checkout` | POST | Create payment session |
| `/api/webhooks/paymongo` | POST | Handle payment webhooks |

### 4.4 Upgrade Prompt Integration

When a user hits a tier limit, show an inline upgrade prompt:

```vue
<!-- Example: staff/index.vue when limit reached -->
<div v-if="tierLimitReached" class="card-design p-4 border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5">
  <div class="flex items-center gap-3">
    <Icon name="lucide:lock" class="h-5 w-5 text-[var(--color-warning)]" />
    <div class="flex-1">
      <p class="text-sm font-medium text-[var(--color-deep)]">
        Staff limit reached ({{ currentCount }}/{{ limit }})
      </p>
      <p class="text-xs text-[var(--color-titanium)]">
        Upgrade to add unlimited staff members
      </p>
    </div>
    <NuxtLink to="/admin/upgrade" class="btn-design rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white">
      Upgrade
    </NuxtLink>
  </div>
</div>
```

| Gap | Impact | Priority |
|-----|--------|----------|
| **No self-service upgrade page** | Shop owners cannot upgrade themselves | HIGH |
| **No pricing page** | No visibility into plan features/pricing | HIGH |
| **No payment integration** | Upgrades are manual, no billing | HIGH |
| **No upgrade CTA on limit reached** | Users don't know why they're blocked | MEDIUM |
| **No plan comparison** | Users can't compare features | MEDIUM |
| **No trial management** | Trial flow not implemented | LOW |

### 2.2 Current User Experience Problem

When a Basic plan user hits a limit (e.g., 5 staff members), they see an error but have **no way to upgrade**:

```
User tries to add 6th staff member
    -> Server rejects with tier limit error
    -> User sees error message
    -> ??? (No upgrade path offered)
```
