<script setup lang="ts">
/**
 * Admin Dashboard — Main dashboard page
 * Shows: Onboarding banner (for new shops), today's bookings, revenue, pending payments, quick stats
 * As described in Section 8.5
 */

/** Shape of GET /api/admin/dashboard response (mirrors utils/server/dashboard.ts) */
interface DashboardStats {
  todayBookings: number
  pendingPayments: number
  todayRevenue: number
  activeStaff: number
  servicesCount: number
  paymentsConfigured: boolean
  brandingCustomized: boolean
}

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const route = useRoute()
const toast = useToast()
const { authFetch } = useAuthFetch()



/** Human-readable billing/expiry status for the Current Plan widget. */
const planExpiryText = computed(() => {
  const end = shopStore.planEndDate
  if (!end) return null
  const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (days < 0) return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Expires today'
  if (days <= 30) return `Expires in ${days} day${days === 1 ? '' : 's'}`
  return `Renews ${fmt(new Date(end))}`
})

// Onboarding state
const showOnboardingBanner = ref(false)
const isOnboardingDismissed = ref(false)

// Dashboard loading state
const isLoading = ref(true)
const stats = ref<DashboardStats>({
  todayBookings: 0,
  pendingPayments: 0,
  todayRevenue: 0,
  activeStaff: 0,
  servicesCount: 0,
  paymentsConfigured: false,
  brandingCustomized: false,
})

// Fetch dashboard stats
/**
 * Fetch dashboard stats from the server endpoint (single auth-scoped API call).
 */
async function fetchDashboardData() {
  isLoading.value = true
  try {
    const response = await authFetch('/api/admin/dashboard') as DashboardStats
    stats.value = {
      todayBookings: response.todayBookings || 0,
      pendingPayments: response.pendingPayments || 0,
      todayRevenue: response.todayRevenue || 0,
      activeStaff: response.activeStaff || 0,
      servicesCount: response.servicesCount || 0,
      paymentsConfigured: !!response.paymentsConfigured,
      brandingCustomized: !!response.brandingCustomized,
    }
  } catch (error) {
    toast.error('Could not load dashboard stats. Please refresh the page.')
    console.error('Error fetching dashboard data:', error) // logged to console for debugging
  } finally {
    isLoading.value = false
  }
}

// ─── Stat aliases (template compatibility) ──────────
const todayBookings = computed(() => stats.value.todayBookings)
const pendingPayments = computed(() => stats.value.pendingPayments)
const todayRevenue = computed(() => stats.value.todayRevenue)
const activeStaff = computed(() => stats.value.activeStaff)

// ─── Plan widget ────────────────────────────────────
// Compact chip only — usage meters, billing history, and plan comparison
// live on /admin/billing (single source of truth).

// ─── Today's Bookings list (left column card) ───────
interface TodayBooking {
  id: string
  booking_ref: string
  service_name: string
  start_time: string
  end_time: string
  status: string
  customerName?: string | null
  barberName?: string
}
const todayBookingsList = ref<TodayBooking[]>([])
const todayBookingsTotal = ref(0)

const { formatTime } = useFormat()

/** Fetch today's schedule via the existing bookings list endpoint (reused, no duplication). */
async function fetchTodayBookings() {
  try {
    // Local date (matches the server-side 'today' logic — not UTC)
    const now = new Date()
    const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
    const response = await authFetch(`/api/admin/bookings?dateFrom=${today}&dateTo=${today}&limit=5`) as { data: TodayBooking[]; total: number }
    // Endpoint orders start_time DESC — reverse for a chronological schedule view
    todayBookingsList.value = (response.data || []).slice().reverse()
    todayBookingsTotal.value = response.total || 0
  } catch (error) {
    console.error('Error fetching today\'s bookings:', error) // non-fatal — stat card still shows the count
  }
}

/** Booking status → badge color classes (consistent with logs page convention). */
function statusBadgeClass(status: string): string {
  switch (status) {
    case 'confirmed': return 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
    case 'in_progress': return 'bg-purple-100 text-purple-700'
    case 'completed': return 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
    case 'cancelled': return 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
    case 'no_show': return 'bg-[var(--color-silver)]/20 text-[var(--color-titanium)]'
    default: return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' // pending
  }
}

// ─── Getting Started checklist (dynamic completion state) ──
interface ChecklistItem {
  label: string
  done: boolean
  to: string
}

const checklistItems = computed<ChecklistItem[]>(() => [
  { label: 'Add your first service', done: stats.value.servicesCount > 0, to: '/admin/services' },
  { label: 'Add your team', done: stats.value.activeStaff > 0, to: '/admin/staff' },
  { label: 'Set up payments', done: stats.value.paymentsConfigured, to: '/admin/payments/methods' },
  { label: 'Customize your page', done: stats.value.brandingCustomized, to: '/admin/shop-profile' },
])
const checklistDoneCount = computed(() => checklistItems.value.filter(i => i.done).length)
const checklistAllDone = computed(() => checklistDoneCount.value === checklistItems.value.length)

// Check for onboarding query param from registration
onMounted(async () => {
  // Always refresh — the plan may have changed (e.g. after a payment)
  if (authStore.shopId) {
    await shopStore.loadCurrentShop()
  }

  // Show onboarding banner if redirected from registration
  if (route.query.onboarding === '1') {
    showOnboardingBanner.value = true
  }

  // Fetch dashboard data + today's schedule in parallel
  await Promise.all([fetchDashboardData(), fetchTodayBookings()])
})

function dismissOnboarding() {
  isOnboardingDismissed.value = true
  // Remove query param without navigation
  navigateTo('/admin/dashboard', { replace: true })
}

const displayOnboarding = computed(() => showOnboardingBanner.value && !isOnboardingDismissed.value)
</script>

<template>
  <div>
    <!-- Onboarding Welcome Banner -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-4"
    >
      <div
        v-if="displayOnboarding"
        class="mb-8 overflow-hidden rounded-card border border-[var(--color-success)]/20 bg-gradient-to-r from-[var(--color-success)]/5 to-[var(--color-info)]/5"
      >
        <div class="flex items-start gap-4 p-6">
          <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-success)]/10">
            <Icon name="lucide:party-popper" class="h-6 w-6 text-[var(--color-success)]" />
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-bold text-[var(--color-deep)]">
              Welcome to Reservation PH! 🎉
            </h3>
            <p class="mt-1 text-sm text-[var(--color-titanium)]">
              Your shop <span class="font-semibold text-[var(--color-deep)]">{{ shopStore.name || 'is now live' }}</span> is set up and ready to go.
              Start by adding your services and team to get the most out of your dashboard.
            </p>
            <div class="mt-4 flex flex-wrap gap-3">
              <NuxtLink
                to="/admin/services"
                class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)]"
              >
                <Icon name="lucide:plus" class="h-4 w-4" />
                Add Your First Service
              </NuxtLink>
              <NuxtLink
                to="/admin/staff"
                class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-silver)] px-4 py-2 text-sm font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
              >
                <Icon name="lucide:user-plus" class="h-4 w-4" />
                Add Team Members
              </NuxtLink>
              <NuxtLink
                to="/admin/settings"
                class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-silver)] px-4 py-2 text-sm font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
              >
                <Icon name="lucide:settings" class="h-4 w-4" />
                Customize Your Page
              </NuxtLink>
            </div>
          </div>
          <button
            class="flex-shrink-0 rounded-full p-1 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
            @click="dismissOnboarding"
          >
            <Icon name="lucide:x" class="h-5 w-5" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- Welcome Header -->
    <div class="mb-8">
      <h2 class="text-[var(--color-deep)]">
        Welcome back, {{ authStore.displayName }}!
      </h2>
      <p class="text-sm text-[var(--color-titanium)]">
        Here's what's happening at <span class="font-medium text-[var(--color-deep)]">{{ shopStore.name || 'your shop' }}</span> today.
      </p>
      <!-- Plan badge -->
      <div class="mt-2 flex items-center gap-2">
        <PlanBadge :plan="shopStore.effectivePlan" />
        <NuxtLink
          v-if="shopStore.isBasicPlan || shopStore.planExpired"
          to="/admin/billing"
          class="text-xs font-medium text-[var(--color-info)] hover:underline"
        >
          {{ shopStore.planExpired && !shopStore.isBasicPlan ? 'Renew your plan' : 'Upgrade for more features' }}
        </NuxtLink>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <!-- Skeleton -->
      <template v-if="isLoading">
        <div v-for="n in 4" :key="n" class="card-design p-5">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="h-4 w-24 animate-pulse rounded bg-[var(--color-silver)]/10" />
              <div class="mt-2 h-8 w-16 animate-pulse rounded bg-[var(--color-silver)]/10" />
            </div>
            <div class="h-10 w-10 animate-pulse rounded-btn bg-[var(--color-silver)]/10" />
          </div>
        </div>
      </template>
      <!-- Actual stats -->
      <template v-else>
        <DashboardStatCard
          label="Today's Bookings"
          :value="todayBookings"
          icon="lucide:calendar-check"
          color="info"
        />
        <DashboardStatCard
          label="Pending Payments"
          :value="pendingPayments"
          icon="lucide:clock"
          color="warning"
        />
        <DashboardStatCard
          label="Today's Revenue"
          :value="`₱${todayRevenue.toLocaleString()}`"
          icon="lucide:banknote"
          color="success"
        />
        <DashboardStatCard
          label="Active Staff"
          :value="activeStaff"
          icon="lucide:users"
          color="default"
        />
      </template>
    </div>

    <!-- Main Content: Two columns on desktop -->
    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Left column: Today's Bookings -->
      <div class="lg:col-span-2">
        <div class="card-design p-6">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-[var(--color-deep)]">Today's Bookings</h3>
            <NuxtLink
              to="/admin/bookings"
              class="text-sm font-medium text-[var(--color-info)] hover:underline"
            >
              View All
            </NuxtLink>
          </div>

          <!-- Loading skeleton -->
          <div v-if="isLoading" class="divide-y divide-[var(--color-silver)]/10">
            <div v-for="n in 3" :key="n" class="flex items-center gap-4 py-3">
              <div class="h-8 w-20 animate-pulse rounded bg-[var(--color-silver)]/10" />
              <div class="flex-1">
                <div class="h-4 w-32 animate-pulse rounded bg-[var(--color-silver)]/10" />
                <div class="mt-1.5 h-3 w-24 animate-pulse rounded bg-[var(--color-silver)]/10" />
              </div>
              <div class="h-6 w-20 animate-pulse rounded-full bg-[var(--color-silver)]/10" />
            </div>
          </div>

          <!-- Empty state -->
          <div v-else-if="todayBookingsList.length === 0" class="py-12 text-center">
            <Icon name="lucide:calendar-x" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
            <p class="mt-3 text-sm text-[var(--color-titanium)]">
              No bookings for today yet.
            </p>
            <NuxtLink
              to="/admin/services"
              class="btn-design mt-4 inline-block rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white"
            >
              Manage Services
            </NuxtLink>
          </div>

          <!-- Today's bookings list -->
          <div v-else class="divide-y divide-[var(--color-silver)]/10">
            <div
              v-for="booking in todayBookingsList"
              :key="booking.id"
              class="flex items-center gap-4 py-3"
            >
              <!-- Time block -->
              <div class="w-24 flex-shrink-0 text-center">
                <p class="text-sm font-semibold text-[var(--color-deep)]">{{ formatTime(booking.start_time) }}</p>
                <p class="text-xs text-[var(--color-titanium)]">{{ formatTime(booking.end_time) }}</p>
              </div>
              <!-- Service + who -->
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-[var(--color-deep)]">{{ booking.service_name }}</p>
                <p class="truncate text-xs text-[var(--color-titanium)]">
                  {{ booking.customerName || 'Guest' }} · {{ booking.barberName || 'Unassigned' }}
                </p>
              </div>
              <!-- Status badge -->
              <span class="badge-pill flex-shrink-0 text-xs font-medium" :class="statusBadgeClass(booking.status)">
                {{ booking.status.replace('_', ' ') }}
              </span>
            </div>
            <p v-if="todayBookingsTotal > todayBookingsList.length" class="pt-3 text-center text-xs text-[var(--color-titanium)]">
              + {{ todayBookingsTotal - todayBookingsList.length }} more today
            </p>
          </div>
        </div>
      </div>

      <!-- Right column: Quick Actions + Payment Queue -->
      <div class="space-y-6">
        <!-- Quick Actions -->
        <div class="card-design p-6">
          <h3 class="mb-4 text-[var(--color-deep)]">Quick Actions</h3>
          <div class="space-y-2">
            <NuxtLink
              to="/admin/services"
              class="flex items-center gap-3 rounded-input px-3 py-2 text-sm text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
            >
              <Icon name="lucide:plus" class="h-4 w-4" />
              Add Service
            </NuxtLink>
            <NuxtLink
              to="/admin/staff"
              class="flex items-center gap-3 rounded-input px-3 py-2 text-sm text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
            >
              <Icon name="lucide:user-plus" class="h-4 w-4" />
              Add Staff
            </NuxtLink>
            <NuxtLink
              to="/admin/payments/methods"
              class="flex items-center gap-3 rounded-input px-3 py-2 text-sm text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
            >
              <Icon name="lucide:qr-code" class="h-4 w-4" />
              Set Up Payments
            </NuxtLink>
            <NuxtLink
              to="/admin/settings"
              class="flex items-center gap-3 rounded-input px-3 py-2 text-sm text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
            >
              <Icon name="lucide:settings" class="h-4 w-4" />
              Shop Settings
            </NuxtLink>
          </div>
        </div>

        <!-- Payment Verification Queue -->
        <div class="card-design p-6">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-[var(--color-deep)]">Payment Queue</h3>
            <span class="badge-pill bg-[var(--color-warning)]/10 text-xs text-[var(--color-warning)]">
              {{ pendingPayments }} pending
            </span>
          </div>
          <p v-if="pendingPayments > 0" class="text-sm text-[var(--color-titanium)]">
            You have {{ pendingPayments }} payment{{ pendingPayments === 1 ? '' : 's' }} awaiting verification.
          </p>
          <p v-else class="text-sm text-[var(--color-titanium)]">
            No pending payment verifications.
          </p>
          <NuxtLink
            v-if="pendingPayments > 0"
            to="/admin/payments/verification"
            class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-info)] hover:underline"
          >
            Review payments
            <Icon name="lucide:arrow-right" class="h-4 w-4" />
          </NuxtLink>
        </div>

        <!-- Current Plan (compact — details live on /admin/billing) -->
        <div class="card-design p-6">
          <div class="flex items-center justify-between">
            <h3 class="text-[var(--color-deep)]">Current Plan</h3>
            <PlanBadge :plan="shopStore.effectivePlan" />
          </div>
          <p v-if="planExpiryText" class="mt-2 text-xs" :class="shopStore.planExpired ? 'text-[var(--color-danger)]' : 'text-[var(--color-titanium)]'">
            {{ planExpiryText }} · <span class="capitalize">{{ shopStore.billingInterval }}</span>
          </p>
          <NuxtLink
            to="/admin/billing"
            class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-btn bg-[var(--color-deep)] py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)]"
          >
            Manage Plan
            <Icon name="lucide:arrow-right" class="h-4 w-4" />
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Getting Started Checklist (dynamic — reflects actual setup state) -->
    <div class="mt-8 card-design p-6">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-[var(--color-deep)]">
          <Icon name="lucide:rocket" class="mr-2 inline-block h-5 w-5" />
          Getting Started
        </h3>
        <span
          class="badge-pill text-xs font-medium"
          :class="checklistAllDone ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-silver)]/20 text-[var(--color-titanium)]'"
        >
          {{ checklistAllDone ? 'All set! 🎉' : `${checklistDoneCount}/${checklistItems.length} complete` }}
        </span>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink
          v-for="(item, i) in checklistItems"
          :key="item.label"
          :to="item.to"
          class="flex items-center gap-3 rounded-input p-3 transition-colors"
          :class="item.done
            ? 'bg-[var(--color-success)]/5 hover:bg-[var(--color-success)]/10'
            : 'bg-[var(--color-white)] hover:bg-[var(--color-silver)]/10'"
        >
          <div
            class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
            :class="item.done ? 'bg-[var(--color-success)]' : 'bg-[var(--color-silver)]/30'"
          >
            <Icon v-if="item.done" name="lucide:check" class="h-4 w-4 text-white" />
            <span v-else class="text-xs font-bold text-[var(--color-titanium)]">{{ i + 1 }}</span>
          </div>
          <span
            class="text-sm"
            :class="item.done ? 'text-[var(--color-deep)] line-through opacity-70' : 'text-[var(--color-titanium)]'"
          >
            {{ item.label }}
          </span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
