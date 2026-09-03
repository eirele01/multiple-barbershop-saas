<script setup lang="ts">
/**
 * /admin/billing — Plan & Billing hub (single source of truth)
 *
 * Sections:
 * - Current plan hero: status, billing cycle, next payment, expiry warnings
 * - Usage meters vs plan limits (services, gallery, products, staff)
 * - Billing history (paid upgrade/renewal sessions)
 * - Plan comparison with Monthly/Yearly toggle + PayMongo checkout
 *
 * /admin/upgrade redirects here so old links and bookmarks keep working.
 */
import { useAuthStore } from '~/stores/auth'
import { PLAN_GRACE_PERIOD_DAYS } from '~/stores/shop'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const shopStore = useShopStore()
const { confirm, ConfirmDialogComponent } = useConfirm()

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const currentPlan = ref<string>('basic')
const planStatus = ref<string>('active')
const planEndDate = ref<string | null>(null)
const currentBillingInterval = ref<'monthly' | 'yearly'>('monthly')

// Payment return-flow confirmation state
const isConfirming = ref(false)
const confirmState = ref<'idle' | 'success' | 'pending' | 'error'>('idle')
const confirmedPlanEnd = ref<string | null>(null)

// Billing period selector — applies to every plan card
const billingInterval = ref<'monthly' | 'yearly'>('monthly')

const plans = ref<any[]>([])
const usage = ref({ services: 0, gallery: 0, products: 0, staff: 0 })
const billingHistory = ref<any[]>([])
const isUpgrading = ref(false)

// ─── Feature list builder ──────────────────────────
function limitText(val: number): string {
  if (val === Infinity || val === -1) return 'Unlimited'
  return String(val)
}

function buildFeatures(plan: any): { label: string; value: string | boolean }[] {
  const l = plan.limits || {}
  const feats: { label: string; value: string | boolean }[] = [
    { label: 'Services', value: limitText(l.services) },
    { label: 'Gallery Images', value: limitText(l.gallery) },
    { label: 'Products', value: limitText(l.products) },
    { label: 'Staff Members', value: limitText(l.staff) },
  ]
  for (const f of plan.features || []) feats.push({ label: f, value: true })
  return feats
}

async function fetchPlans() {
  try {
    const data = await $fetch('/api/billing/plans') as any
    plans.value = (data.plans || []).map((p: any) => {
      // Tier Maker (plans DB) is the source of truth for limits.
      // DB convention: -1 = unlimited (JSON can't store Infinity).
      const raw = p.limits || {}
      const limits: Record<string, number> = {}
      for (const k of ['services', 'gallery', 'products', 'staff']) {
        const v = Number(raw[k])
        limits[k] = v === -1 ? Infinity : Math.max(0, Number.isFinite(v) ? v : 0)
      }
      return {
        code: p.code,
        name: p.name,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        priceMonthlyLabel: p.priceMonthlyLabel,
        priceYearlyLabel: p.priceYearlyLabel,
        description: p.description || '',
        features: buildFeatures(p),
        limits,
        is_default: p.is_default,
      }
    })
  } catch (error) {
    console.error('Failed to load plans:', error)
  }
}

// ─── Billing-interval pricing helpers ──────────────
function displayPrice(plan: any): string {
  const isFree = !plan.priceMonthly && !plan.priceYearly
  if (isFree) return 'Free'
  return billingInterval.value === 'yearly' ? plan.priceYearlyLabel : plan.priceMonthlyLabel
}

function priceNote(plan: any): string {
  const isFree = !plan.priceMonthly && !plan.priceYearly
  if (isFree) return 'forever'
  return billingInterval.value === 'yearly' ? 'per year' : 'per month'
}

/** Yearly savings vs 12 × monthly (null when no meaningful discount). */
function yearlySavingsLabel(plan: any): string | null {
  if (!plan.priceMonthly || !plan.priceYearly) return null
  const full = plan.priceMonthly * 12
  if (plan.priceYearly >= full) return null
  const pct = Math.round(((full - plan.priceYearly) / full) * 100)
  return pct > 0 ? `Save ${pct}%` : null
}

/** Savings badge for the Yearly toggle (best discount across plans). */
const yearlyToggleBadge = computed<string | null>(() => {
  const labels = plans.value.map(yearlySavingsLabel).filter(Boolean) as string[]
  if (labels.length === 0) return null
  return labels.reduce((best, cur) => (parseInt(cur.replace(/\D/g, '')) > parseInt(best.replace(/\D/g, '')) ? cur : best))
})

// ─── Renewal / CTA state ───────────────────────────
type CtaState = 'current' | 'renew' | 'expired' | 'upgrade'
const RENEW_WINDOW_DAYS = 30

function daysRemaining(): number | null {
  if (!planEndDate.value) return null
  return Math.ceil((new Date(planEndDate.value).getTime() - Date.now()) / 86_400_000)
}

function ctaState(plan: any): CtaState {
  const isEffectiveCurrent = plan.code === effectivePlan.value
  const isBoughtCurrent = plan.code === currentPlan.value

  // Cards that aren't the subscribed plan nor the enforced plan → upgrade
  if (!isEffectiveCurrent && !isBoughtCurrent) return 'upgrade'

  // The shop's subscribed plan — renewal semantics driven by expiry
  const days = daysRemaining()
  if (isBoughtCurrent) {
    if (days === null) return 'current'
    if (days < 0) return 'expired' // "Renew to Reactivate"
    if (days <= RENEW_WINDOW_DAYS) return 'renew'
    return 'current'
  }

  // Effective plan (e.g. Basic after a paid plan expired beyond grace) → current
  return 'current'
}

function ctaLabel(plan: any): string {
  switch (ctaState(plan)) {
    case 'current': return 'Current Plan'
    case 'renew': return 'Renew Plan'
    case 'expired': return 'Renew to Reactivate'
    default: return isUpgrading.value ? 'Redirecting to payment...' : 'Upgrade Now'
  }
}

// ─── Data fetching ─────────────────────────────────
// syncInterval: only true on first load — refreshes must not clobber the
// user's Monthly/Yearly toggle selection mid-page.
async function fetchCurrentPlan(syncInterval = true) {
  try {
    const supabase = useSupabase()
    if (!authStore.shopId) return
    const { data: shop } = await supabase
      .from('shops')
      .select('plan, plan_status, plan_end_date, billing_interval')
      .eq('id', authStore.shopId)
      .single()

    if (shop) {
      currentPlan.value = shop.plan || 'basic'
      planStatus.value = shop.plan_status || 'active'
      planEndDate.value = shop.plan_end_date
      currentBillingInterval.value = shop.billing_interval === 'yearly' ? 'yearly' : 'monthly'
      if (syncInterval) billingInterval.value = currentBillingInterval.value
    }
  } catch (error) {
    console.error('Error fetching plan:', error)
  }
}

async function fetchUsage() {
  try {
    const supabase = useSupabase()
    const shopId = authStore.shopId
    if (!shopId) return
    const countOf = (table: string) =>
      supabase.from(table).select('id', { count: 'exact', head: true }).eq('shop_id', shopId)
    const [services, gallery, products, staff] = await Promise.all([
      countOf('services'),
      countOf('gallery'),
      countOf('products'),
      countOf('barbers'),
    ])
    usage.value = {
      services: services.count ?? 0,
      gallery: gallery.count ?? 0,
      products: products.count ?? 0,
      staff: staff.count ?? 0,
    }
  } catch (error) {
    console.error('Error fetching usage:', error)
  }
}

async function fetchBillingHistory() {
  try {
    const supabase = useSupabase()
    if (!authStore.shopId) return
    const { data } = await supabase
      .from('upgrade_sessions')
      .select('id, amount, from_plan, to_plan, billing_interval, status, paid_at, created_at')
      .eq('shop_id', authStore.shopId)
      .order('created_at', { ascending: false })
      .limit(12)
    billingHistory.value = data || []
  } catch (error) {
    console.error('Error fetching billing history:', error)
  }
}

// ─── Expiry state (banners + hero) ─────────────────
const expiryState = computed<'ok' | 'expiring' | 'grace' | 'expired'>(() => {
  if (!planEndDate.value) return 'ok'
  const days = daysRemaining() ?? 0
  if (days < 0) return days >= -PLAN_GRACE_PERIOD_DAYS ? 'grace' : 'expired'
  if (days <= 7) return 'expiring'
  return 'ok'
})

/**
 * The plan actually ENFORCED on this shop right now. Same rule as the shop
 * store's `effectivePlan`: an expired-beyond-grace paid plan falls back to
 * 'basic' (so usage meters, badges and CTAs reflect the real limits instead
 * of a stale paid plan).
 */
const effectivePlan = computed<string>(() => {
  if (!planEndDate.value) return currentPlan.value
  const days = daysRemaining() ?? 0
  return days < -PLAN_GRACE_PERIOD_DAYS ? 'basic' : currentPlan.value
})

/**
 * Days left in the grace period. `daysRemaining()` is negative once expired
 * (e.g. -2 = expired 2 days ago); with a 7-day grace that means 5 days left.
 */
const graceDaysLeft = computed(() => Math.max(0, PLAN_GRACE_PERIOD_DAYS + (daysRemaining() ?? 0)))

const planExpiryText = computed<string | null>(() => {
  const end = planEndDate.value
  if (!end) return null
  const days = daysRemaining() ?? 0
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (days < 0) return `Expired ${Math.abs(days)} day${days === -1 ? '' : 's'} ago`
  if (days === 0) return 'Expires today'
  return `Renews ${fmt(new Date(end))}`
})

function currentPlanPriceLabel(): string {
  const plan = plans.value.find(p => p.code === effectivePlan.value)
  if (!plan) return ''
  return currentBillingInterval.value === 'yearly' ? plan.priceYearlyLabel : plan.priceMonthlyLabel
}

function scrollToPlans() {
  document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ─── Usage meters (vs static tier limits — same source the limits enforce) ──
/**
 * Get limits for a plan from the dynamic plans data (source of truth = Tier Maker).
 * Falls back to basic limits only if the plan code is unknown.
 */
function limitsFor(planCode: string): Record<string, number> {
  const plan = plans.value.find(p => p.code === planCode)
  if (plan?.limits) return plan.limits
  // Fallback for unknown plans — read from the default plan in the list
  const defaultPlan = plans.value.find(p => p.is_default) || plans.value[0]
  return defaultPlan?.limits || { services: 5, gallery: 10, products: 5, staff: 2 }
}

const usageMeters = computed(() => {
  const limits = limitsFor(effectivePlan.value)
  const defs = [
    { key: 'services' as const, label: 'Services', icon: 'lucide:scissors' },
    { key: 'gallery' as const, label: 'Gallery Images', icon: 'lucide:image' },
    { key: 'products' as const, label: 'Products', icon: 'lucide:package' },
    { key: 'staff' as const, label: 'Staff Members', icon: 'lucide:users' },
  ]
  return defs.map(({ key, label, icon }) => {
    const limit = limits[key]
    const used = usage.value[key]
    const isUnlimited = limit === Infinity || limit === -1
    return {
      key,
      label,
      icon,
      used,
      isUnlimited,
      valueText: isUnlimited ? `${used} / Unlimited` : `${used} / ${limit}`,
      pct: isUnlimited ? 0 : Math.min(Math.round((used / limit) * 100), 100),
      atLimit: !isUnlimited && used >= limit,
      nearLimit: !isUnlimited && used >= limit * 0.8 && used < limit,
    }
  })
})

// ─── Refresh (manual safety net) ────────────────────
async function refreshAll() {
  isLoading.value = true
  try {
    await Promise.all([
      fetchCurrentPlan(false),
      fetchPlans(),
      fetchUsage(),
      fetchBillingHistory(),
      shopStore.fetchShopById(authStore.shopId),
    ])
  } finally {
    isLoading.value = false
  }
}

// ─── Upgrade / downgrade / renewal ─────────────────
function planByCode(code?: string): any | undefined {
  return plans.value.find(p => p.code === (code || 'upgraded'))
}

async function handleUpgrade(planCode?: string) {
  // ── Build the confirmation prompt first ──
  const target = planByCode(planCode)
  const targetName = target?.name || planCode || 'Upgraded'
  const currentObj = planByCode(currentPlan.value)
  const isRenewal = planCode === currentPlan.value
  const targetPrice = billingInterval.value === 'yearly'
    ? (target?.priceYearly ?? 0)
    : (target?.priceMonthly ?? 0)
  const currentPrice = billingInterval.value === 'yearly'
    ? (currentObj?.priceYearly ?? 0)
    : (currentObj?.priceMonthly ?? 0)
  const isDowngrade = !isRenewal && targetPrice < currentPrice
  const per = billingInterval.value === 'yearly' ? 'year' : 'month'

  let title: string
  let message: string
  let confirmLabel: string
  let variant: 'danger' | 'warning' | 'default' = 'default'

  if (isRenewal) {
    title = 'Renew subscription?'
    message = `You're about to renew the ${targetName} plan for ${formatAmount(targetPrice)} per ${per}. The new period is added on top of your remaining days.`
    confirmLabel = 'Continue to payment'
  } else if (isDowngrade) {
    title = 'Downgrade plan?'
    variant = 'warning'
    confirmLabel = 'Yes, downgrade'
    message = targetPrice <= 0
      ? `You're about to switch from ${currentObj?.name || currentPlan.value} to the ${targetName} (free) plan. The change takes effect immediately and the lower limits will apply.`
      : `You're about to downgrade from ${currentObj?.name || currentPlan.value} to ${targetName} at ${formatAmount(targetPrice)} per ${per}. The change takes effect immediately.`
  } else {
    title = 'Upgrade plan?'
    message = `You're about to upgrade to ${targetName} at ${formatAmount(targetPrice)} per ${per}. You'll be redirected to PayMongo to complete the payment.`
    confirmLabel = 'Continue to payment'
  }

  const ok = await confirm({ title, message, confirmLabel, variant })
  if (!ok) return

  isUpgrading.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      toast.error('Please log in again')
      return
    }

    const result = await $fetch('/api/billing/create-upgrade-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { shopId: authStore.shopId, planCode, billingInterval: billingInterval.value },
    }) as any

    // Free-plan change (e.g. downgrade to Basic) — applied server-side, no checkout
    if (result.freePlan) {
      await Promise.all([fetchCurrentPlan(false), fetchBillingHistory()])
      await shopStore.loadCurrentShop?.()
      toast.success(`Plan changed to ${result.planName || targetName}`)
      return
    }

    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl
    }
  } catch (error: any) {
    toast.error(error.data?.statusMessage || error.message || 'Failed to start checkout')
  } finally {
    isUpgrading.value = false
  }
}

// ─── Formatting helpers ────────────────────────────
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAmount(centavos: number | null): string {
  if (!centavos) return '₱0.00'
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Payment confirmation (return flow) ────────────
/**
 * Owner returned from PayMongo checkout. Webhooks can't reach localhost (and
 * can be delayed in production), so verify the session with PayMongo directly
 * and activate instantly. Idempotent — safe if the webhook already applied it.
 *
 * E-wallet payments (GCash/Maya) can settle a few seconds AFTER the redirect,
 * so failed verifications are retried automatically before giving up.
 */
const CONFIRM_ATTEMPTS = 3
const CONFIRM_RETRY_DELAY_MS = 3000

async function confirmPayment(): Promise<void> {
  isConfirming.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      confirmState.value = 'pending'
      return
    }

    let paid = false
    for (let attempt = 1; attempt <= CONFIRM_ATTEMPTS && !paid; attempt++) {
      try {
        const result = await $fetch('/api/billing/confirm-upgrade', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: {
            shopId: authStore.shopId,
            sessionId: (route.query.session_id as string) || undefined,
          },
        }) as any

        paid = !!result.paid
        // `paid` means PayMongo confirmed the money; `applied` means the plan
        // was actually activated server-side. These can diverge in two ways:
        // 1. `alreadyApplied` — the webhook won the race and activated first.
        //    The plan IS applied → treat as success.
        // 2. `applied === false` without `alreadyApplied` — the DB rejected
        //    the plan change (e.g. a stale CHECK constraint) → real error.
        const applied = result.applied !== false
        const alreadyApplied = !!result.alreadyApplied
        if (paid && !applied && !alreadyApplied) {
          confirmState.value = 'error'
          break // activation failed server-side — retrying won't help here
        }
        if (paid) {
          confirmState.value = 'success'
          confirmedPlanEnd.value = result.planEndDate || null
          // Refresh everywhere: this page + the shared shop store (dashboard badges)
          await Promise.all([fetchCurrentPlan(false), fetchBillingHistory(), shopStore.fetchShopById(authStore.shopId)])
        }
      } catch (error) {
        console.error(`Payment confirmation attempt ${attempt}/${CONFIRM_ATTEMPTS} failed:`, error)
      }
      if (!paid && attempt < CONFIRM_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, CONFIRM_RETRY_DELAY_MS))
      }
    }
    if (!paid) confirmState.value = 'pending'
  } finally {
    isConfirming.value = false
    // Strip ?success=true ONLY on success — when pending, keep it so a page
    // refresh re-runs the verification instead of silently dropping it.
    if (confirmState.value === 'success' && route.query.success) {
      router.replace({ query: {} })
    }
  }
}

/** Latest checkout attempt is still unverified → offer a manual re-check. */
const hasPendingSession = computed(() => billingHistory.value[0]?.status === 'pending')

// ─── Lifecycle ─────────────────────────────────────
onMounted(async () => {
  const tasks: Promise<unknown>[] = [fetchCurrentPlan(), fetchPlans(), fetchUsage(), fetchBillingHistory()]
  if (route.query.success === 'true') tasks.push(confirmPayment())
  await Promise.all(tasks).finally(() => { isLoading.value = false })

  // Detect a stuck activation: the latest session was paid but the shop never
  // received the plan (e.g. the server failed to apply it after the payment).
  // Surface the error banner so the owner can retry without a fresh checkout.
  const latest = billingHistory.value[0]
  if (
    confirmState.value === 'idle' &&
    latest?.status === 'paid' &&
    !!latest.to_plan &&
    latest.to_plan !== currentPlan.value
  ) {
    confirmState.value = 'error'
  }
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-deep)]">Plan &amp; Billing</h1>
      <p class="text-sm text-[var(--color-titanium)]">Manage your subscription, usage, and payments</p>
    </div>

    <!-- Payment Confirmation Banner (also shown when a checkout is still
         unverified, so a lost/late confirmation can be retried manually) -->
    <div
      v-if="isConfirming || confirmState !== 'idle' || hasPendingSession"
      class="card-design flex items-start gap-3 border-l-4 p-4"
      :class="confirmState === 'success' ? 'border-[var(--color-success)]' : confirmState === 'error' ? 'border-[var(--color-danger)]' : 'border-[var(--color-warning)]'"
    >
      <Icon
        :name="isConfirming ? 'lucide:loader-2' : (confirmState === 'success' ? 'lucide:check-circle-2' : confirmState === 'error' ? 'lucide:alert-circle' : 'lucide:clock')"
        class="mt-0.5 h-5 w-5 shrink-0"
        :class="isConfirming
          ? 'animate-spin text-[var(--color-info)]'
          : (confirmState === 'success' ? 'text-[var(--color-success)]' : confirmState === 'error' ? 'text-[var(--color-danger)]' : 'text-[var(--color-warning)]')"
      />
      <div class="flex-1">
        <!-- Verifying with PayMongo -->
        <template v-if="isConfirming">
          <p class="text-sm font-semibold text-[var(--color-deep)]">Confirming your payment…</p>
          <p class="mt-0.5 text-xs text-[var(--color-titanium)]">
            Verifying with PayMongo — this takes just a second.
          </p>
        </template>

        <!-- Confirmed & activated -->
        <template v-else-if="confirmState === 'success'">
          <p class="text-sm font-semibold text-[var(--color-deep)]">Payment confirmed — you're all set! 🎉</p>
          <p class="mt-0.5 text-xs text-[var(--color-titanium)]">
            Your subscription is active<template v-if="confirmedPlanEnd"> until {{ formatDate(confirmedPlanEnd) }}</template>.
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <NuxtLink
              to="/admin/dashboard"
              class="rounded-btn bg-[var(--color-deep)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-titanium)]"
            >
              Back to Dashboard
            </NuxtLink>
          </div>
        </template>

        <!-- Payment verified but activation failed server-side -->
        <template v-else-if="confirmState === 'error'">
          <p class="text-sm font-semibold text-[var(--color-deep)]">Payment received — but we couldn't activate your plan</p>
          <p class="mt-0.5 text-xs text-[var(--color-titanium)]">
            Your payment was verified with PayMongo, but the plan change was rejected by the server.
            This usually means the database still restricts plan codes. The platform admin should run
            the latest plan migration (019), then re-check below — the payment will be applied without
            charging again.
          </p>
          <button
            class="mt-2 rounded-btn bg-[var(--color-deep)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-titanium)] disabled:opacity-50"
            :disabled="isConfirming"
            @click="confirmPayment()"
          >
            Retry Activation
          </button>
        </template>

        <!-- Not yet verifiable -->
        <template v-else>
          <p class="text-sm font-semibold text-[var(--color-deep)]">Payment confirmation pending</p>
          <p class="mt-0.5 text-xs text-[var(--color-titanium)]">
            We couldn't verify your payment automatically yet — e-wallet payments can take a
            moment to settle. If you've completed the checkout, re-check below.
          </p>
          <button
            class="mt-2 rounded-btn bg-[var(--color-deep)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-titanium)] disabled:opacity-50"
            :disabled="isConfirming"
            @click="confirmPayment()"
          >
            Check Payment Status
          </button>
        </template>
      </div>
    </div>

    <!-- Expiry Warning Banner -->
    <div
      v-if="expiryState !== 'ok'"
      class="card-design flex items-start gap-3 border-l-4 p-4"
      :class="expiryState === 'expired' ? 'border-[var(--color-danger)]' : 'border-[var(--color-warning)]'"
    >
      <Icon
        :name="expiryState === 'expired' ? 'lucide:alert-circle' : 'lucide:clock'"
        class="mt-0.5 h-5 w-5 shrink-0"
        :class="expiryState === 'expired' ? 'text-[var(--color-danger)]' : 'text-[var(--color-warning)]'"
      />
      <div class="flex-1">
        <p class="text-sm font-semibold text-[var(--color-deep)]">
          {{ expiryState === 'expired' ? 'Your subscription has expired' : expiryState === 'grace' ? 'Subscription expired — grace period' : 'Your subscription is expiring soon' }}
        </p>
        <p class="mt-0.5 text-xs text-[var(--color-titanium)]">
          {{ expiryState === 'expired'
            ? 'Premium features are locked. Renew now to restore your plan.'
            : expiryState === 'grace'
              ? `You have ${graceDaysLeft} day${graceDaysLeft === 1 ? '' : 's'} left in your grace period before premium features lock.`
              : `${daysRemaining()} day${daysRemaining() === 1 ? '' : 's'} left — renew early to avoid interruption.` }}
        </p>
      </div>
      <button
        class="btn-design rounded-btn bg-[var(--color-deep)] px-3 py-1.5 text-xs font-medium text-white"
        @click="scrollToPlans"
      >
        {{ expiryState === 'expiring' ? 'Renew' : 'View Plans' }}
      </button>
    </div>

    <!-- ═══ Current Plan Hero ═══ -->
    <div v-if="!isLoading" class="card-design overflow-hidden">
      <div class="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-bold text-[var(--color-deep)]">
              {{ plans.find(p => p.code === effectivePlan)?.name || effectivePlan }} Plan
            </h2>
            <PlanBadge :plan="effectivePlan" />
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span class="flex items-center gap-1.5 text-[var(--color-titanium)]">
              <Icon name="lucide:wallet" class="h-4 w-4" />
              <span class="capitalize text-[var(--color-deep)]">{{ currentBillingInterval }}</span> billing
            </span>
            <span v-if="currentPlanPriceLabel()" class="flex items-center gap-1.5 text-[var(--color-titanium)]">
              <Icon name="lucide:banknote" class="h-4 w-4" />
              <span class="font-medium text-[var(--color-deep)]">{{ currentPlanPriceLabel() }}</span>
            </span>
            <span v-if="planExpiryText" class="flex items-center gap-1.5 text-[var(--color-titanium)]">
              <Icon name="lucide:calendar-clock" class="h-4 w-4" />
              <span :class="expiryState === 'expired' || expiryState === 'grace' ? 'font-medium text-[var(--color-danger)]' : 'text-[var(--color-deep)]'">{{ planExpiryText }}</span>
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="badge-pill px-3 py-1 text-xs font-medium"
            :class="expiryState === 'expired'
              ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
              : expiryState === 'grace'
                ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                : 'bg-[var(--color-success)]/10 text-[var(--color-success)]'"
          >
            {{ expiryState === 'expired' ? 'expired' : expiryState === 'grace' ? 'grace' : (expiryState === 'expiring' ? 'expiring' : planStatus) }}
          </span>
          <button
            class="btn-design flex items-center gap-1 rounded-btn border border-[var(--color-silver)]/50 px-2 py-1 text-xs text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/10"
            :disabled="isLoading"
            @click="refreshAll"
            title="Refresh plan status"
          >
            <Icon name="lucide:refresh-cw" :class="isLoading ? 'animate-spin' : ''" class="h-3 w-3" />
            Refresh
          </button>
          <button
            v-if="expiryState !== 'ok'"
            class="btn-design flex items-center gap-1.5 rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)]"
            @click="scrollToPlans"
          >
            <Icon name="lucide:refresh-cw" class="h-4 w-4" />
            Renew Now
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ Usage Meters ═══ -->
    <div v-if="!isLoading" class="card-design p-6">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-[var(--color-deep)]">
          <Icon name="lucide:gauge" class="mr-1.5 inline h-4 w-4" />
          Usage
        </h3>
        <span class="text-xs text-[var(--color-titanium)]">
          Limits for the <span class="font-medium capitalize text-[var(--color-deep)]">{{ plans.find(p => p.code === effectivePlan)?.name || effectivePlan }}</span> plan
        </span>
      </div>
      <div class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <div v-for="meter in usageMeters" :key="meter.key">
          <div class="mb-1.5 flex items-center justify-between text-sm">
            <span class="flex items-center gap-1.5 text-[var(--color-deep)]">
              <Icon :name="meter.icon" class="h-4 w-4 text-[var(--color-titanium)]" />
              {{ meter.label }}
            </span>
            <span
              class="font-medium"
              :class="meter.atLimit ? 'text-[var(--color-danger)]' : meter.nearLimit ? 'text-[var(--color-warning)]' : 'text-[var(--color-titanium)]'"
            >
              {{ meter.valueText }}
            </span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-[var(--color-silver)]/15">
            <div
              class="h-full rounded-full transition-all"
              :class="meter.atLimit ? 'bg-[var(--color-danger)]' : meter.nearLimit ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-info)]'"
              :style="{ width: `${meter.isUnlimited ? 100 : meter.pct}%` }"
            />
          </div>
          <p v-if="meter.atLimit" class="mt-1 text-xs font-medium text-[var(--color-danger)]">
            Limit reached — upgrade to add more
          </p>
        </div>
      </div>
    </div>

    <!-- ═══ Billing History ═══ -->
    <div v-if="!isLoading" class="card-design overflow-hidden">
      <div class="border-b border-[var(--color-silver)]/30 px-4 py-3">
        <h3 class="text-sm font-semibold text-[var(--color-deep)]">
          <Icon name="lucide:receipt-text" class="mr-1.5 inline h-4 w-4" />
          Billing History
        </h3>
      </div>

      <div v-if="billingHistory.length === 0" class="py-10 text-center">
        <Icon name="lucide:receipt" class="mx-auto h-10 w-10 text-[var(--color-silver)]" />
        <p class="mt-2 text-sm text-[var(--color-titanium)]">No payments yet</p>
        <p class="mt-0.5 text-xs text-[var(--color-titanium)]">Your payment records will appear here after your first upgrade or renewal.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Date</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Type</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Plan</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Cycle</th>
              <th class="px-4 py-3 text-right font-medium text-[var(--color-titanium)]">Amount</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="tx in billingHistory"
              :key="tx.id"
              class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
            >
              <td class="px-4 py-3 text-[var(--color-deep)]">{{ formatDate(tx.paid_at || tx.created_at) }}</td>
              <td class="px-4 py-3">
                <span
                  class="badge-pill px-2 py-0.5 text-xs font-medium"
                  :class="tx.from_plan === tx.to_plan
                    ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                    : tx.amount === 0
                      ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                      : 'bg-[var(--color-success)]/10 text-[var(--color-success)]'"
                >
                  {{ tx.from_plan === tx.to_plan ? 'Renewal' : (tx.amount === 0 ? 'Downgrade' : 'Upgrade') }}
                </span>
              </td>
              <td class="px-4 py-3 capitalize text-[var(--color-deep)]">{{ tx.to_plan }}</td>
              <td class="px-4 py-3 capitalize text-[var(--color-titanium)]">{{ tx.billing_interval || 'monthly' }}</td>
              <td class="px-4 py-3 text-right font-medium text-[var(--color-deep)]">{{ formatAmount(tx.amount) }}</td>
              <td class="px-4 py-3 text-center">
                <span
                  class="badge-pill px-2 py-0.5 text-xs font-medium"
                  :class="tx.status === 'paid'
                    ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                    : tx.status === 'applied'
                      ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                      : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'"
                >
                  {{ tx.status === 'applied' ? 'Applied' : tx.status === 'paid' ? 'Paid' : tx.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═══ Plans & Checkout ═══ -->
    <div id="plans" class="scroll-mt-6">
      <!-- Billing Cycle Toggle -->
      <div class="mb-4 flex items-center justify-center">
        <div class="inline-flex items-center rounded-full bg-[var(--color-silver)]/15 p-1">
          <button
            class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            :class="billingInterval === 'monthly' ? 'bg-[var(--color-pure-white)] text-[var(--color-deep)] shadow-sm' : 'text-[var(--color-titanium)]'"
            @click="billingInterval = 'monthly'"
          >
            Monthly
          </button>
          <button
            class="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            :class="billingInterval === 'yearly' ? 'bg-[var(--color-pure-white)] text-[var(--color-deep)] shadow-sm' : 'text-[var(--color-titanium)]'"
            @click="billingInterval = 'yearly'"
          >
            Yearly
            <span
              v-if="yearlyToggleBadge"
              class="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              :class="billingInterval === 'yearly' ? 'bg-[var(--color-success)] text-white' : 'bg-[var(--color-success)]/15 text-[var(--color-success)]'"
            >
              {{ yearlyToggleBadge }}
            </span>
          </button>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="isLoading" class="grid gap-6 md:grid-cols-2">
        <div v-for="n in 2" :key="n" class="card-design p-6">
          <div class="mx-auto h-6 w-24 animate-pulse rounded bg-[var(--color-silver)]/10" />
          <div class="mx-auto mt-2 h-8 w-20 animate-pulse rounded bg-[var(--color-silver)]/10" />
          <div class="mt-4 space-y-2">
            <div v-for="i in 5" :key="i" class="h-4 w-full animate-pulse rounded bg-[var(--color-silver)]/10" />
          </div>
        </div>
      </div>

      <!-- Plan Cards -->
      <div v-else class="grid gap-6 md:grid-cols-2">
        <div
          v-for="plan in plans"
          :key="plan.code"
          class="card-design relative flex flex-col p-6"
          :class="plan.code === effectivePlan ? 'ring-2 ring-[var(--color-success)]' : ''"
        >
          <!-- Current Plan Badge -->
          <div
            v-if="plan.code === effectivePlan"
            class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-success)] px-3 py-1 text-xs font-medium text-white"
          >
            Current Plan
          </div>

          <!-- Yearly savings badge -->
          <div
            v-if="billingInterval === 'yearly' && yearlySavingsLabel(plan)"
            class="absolute -top-3 right-4 rounded-full bg-[var(--color-success)] px-2.5 py-1 text-xs font-bold text-white"
          >
            {{ yearlySavingsLabel(plan) }}
          </div>

          <!-- Plan Header -->
          <div class="text-center">
            <h3 class="text-lg font-bold text-[var(--color-deep)]">{{ plan.name }}</h3>
            <div class="mt-2">
              <span class="text-2xl font-bold text-[var(--color-deep)]">{{ displayPrice(plan) }}</span>
            </div>
            <p class="mt-1 text-xs text-[var(--color-titanium)]">{{ priceNote(plan) }}</p>
            <p class="mt-2 text-sm text-[var(--color-titanium)]">{{ plan.description }}</p>
          </div>

          <!-- Features -->
          <div class="mt-6 flex-1 space-y-3">
            <div
              v-for="feature in plan.features"
              :key="feature.label"
              class="flex items-center justify-between text-sm"
            >
              <span class="text-[var(--color-titanium)]">{{ feature.label }}</span>
              <span v-if="typeof feature.value === 'boolean'">
                <Icon
                  v-if="feature.value"
                  name="lucide:check"
                  class="h-4 w-4 text-[var(--color-success)]"
                />
                <Icon
                  v-else
                  name="lucide:x"
                  class="h-4 w-4 text-[var(--color-silver)]"
                />
              </span>
              <span v-else class="font-medium text-[var(--color-deep)]">{{ feature.value }}</span>
            </div>
          </div>

          <!-- CTA -->
          <button
            class="mt-6 w-full rounded-btn py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            :class="[
              ctaState(plan) === 'current'
                ? 'cursor-not-allowed bg-[var(--color-silver)]/20 text-[var(--color-titanium)]'
                : 'bg-[var(--color-deep)] text-white hover:bg-[var(--color-titanium)]',
            ]"
            :disabled="ctaState(plan) === 'current' || isUpgrading"
            @click="ctaState(plan) !== 'current' && handleUpgrade(plan.code)"
          >
            <Icon
              v-if="isUpgrading && ctaState(plan) !== 'current'"
              name="lucide:loader-2"
              class="h-4 w-4 animate-spin"
            />
            <Icon
              v-else-if="ctaState(plan) === 'renew' || ctaState(plan) === 'expired'"
              name="lucide:refresh-cw"
              class="h-4 w-4"
            />
            {{ ctaLabel(plan) }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ FAQ ═══ -->
    <div class="card-design p-6">
      <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">Frequently Asked Questions</h3>
      <div class="space-y-4">
        <div>
          <p class="text-sm font-medium text-[var(--color-deep)]">What happens when my subscription expires?</p>
          <p class="mt-1 text-xs text-[var(--color-titanium)]">
            You get a {{ PLAN_GRACE_PERIOD_DAYS }}-day grace period to renew. After that, your shop falls back to the Basic plan limits — your data is never lost.
          </p>
        </div>
        <div>
          <p class="text-sm font-medium text-[var(--color-deep)]">Can I switch between monthly and yearly?</p>
          <p class="mt-1 text-xs text-[var(--color-titanium)]">
            Yes. Your next payment simply uses the cycle you pick at checkout. Yearly saves you money compared to paying monthly.
          </p>
        </div>
        <div>
          <p class="text-sm font-medium text-[var(--color-deep)]">Do early renewals lose my remaining days?</p>
          <p class="mt-1 text-xs text-[var(--color-titanium)]">
            No. Renewing before expiry adds the new period on top of your remaining time.
          </p>
        </div>
        <div>
          <p class="text-sm font-medium text-[var(--color-deep)]">What happens to my data if I downgrade?</p>
          <p class="mt-1 text-xs text-[var(--color-titanium)]">
            Your data is never lost. If you exceed the limits of the lower plan, you'll need to reduce your usage before you can add new items.
          </p>
        </div>
      </div>
    </div>

    <!-- Confirmation dialog (upgrade / downgrade / renew) -->
    <ConfirmDialogComponent />
  </div>
</template>
