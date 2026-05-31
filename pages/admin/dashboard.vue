<script setup lang="ts">
/**
 * Admin Dashboard — Main dashboard page
 * Shows: Onboarding banner (for new shops), today's bookings, revenue, pending payments, quick stats
 * As described in Section 8.5
 */
definePageMeta({
  layout: 'admin',
  middleware: 'admin',
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const route = useRoute()

// Onboarding state
const showOnboardingBanner = ref(false)
const isOnboardingDismissed = ref(false)

// Dashboard loading state
const isLoading = ref(true)
const todayBookings = ref(0)
const pendingPayments = ref(0)
const todayRevenue = ref(0)
const activeStaff = ref(0)

// Fetch dashboard stats
async function fetchDashboardData() {
  isLoading.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token || !authStore.shopId) return

    const shopId = authStore.shopId
    // Use local date (not toISOString which returns UTC — wrong in UTC+8)
    const now = new Date()
    const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`

    // Today's bookings count
    const { count: bookingCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('date', today)
    todayBookings.value = bookingCount || 0

    // Pending payments count
    const { count: paymentCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('payment_status', 'pending')
    pendingPayments.value = paymentCount || 0

    // Today's revenue (sum of completed payments)
    const { data: revenueData } = await supabase
      .from('bookings')
      .select('payment_amount')
      .eq('shop_id', shopId)
      .eq('date', today)
      .eq('payment_status', 'paid')
    todayRevenue.value = (revenueData || []).reduce((sum, b) => sum + (b.payment_amount || 0), 0)

    // Active staff count
    const { count: staffCount } = await supabase
      .from('barbers')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('is_active', true)
    activeStaff.value = staffCount || 0
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
  } finally {
    isLoading.value = false
  }
}

// Check for onboarding query param from registration
onMounted(async () => {
  if (!shopStore.currentShop && authStore.shopId) {
    await shopStore.loadCurrentShop()
  }

  // Show onboarding banner if redirected from registration
  if (route.query.onboarding === '1') {
    showOnboardingBanner.value = true
  }

  // Fetch dashboard data
  await fetchDashboardData()
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
              Welcome to BarberShop! 🎉
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
        <span
          class="badge-pill text-[10px]"
          :class="
            shopStore.isUpgradedPlan
              ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
              : 'bg-[var(--color-silver)]/30 text-[var(--color-titanium)]'
          "
        >
          {{ shopStore.isUpgradedPlan ? 'Upgraded Plan' : 'Basic Plan' }}
        </span>
        <NuxtLink
          v-if="shopStore.isBasicPlan"
          to="/admin/settings"
          class="text-xs font-medium text-[var(--color-info)] hover:underline"
        >
          Upgrade for more features
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

          <!-- Empty state -->
          <div class="py-12 text-center">
            <Icon name="lucide:calendar-x" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
            <p class="mt-3 text-sm text-[var(--color-titanium)]">
              No bookings for today yet.
            </p>
            <NuxtLink
              to="/admin/services"
              class="btn-design mt-4 inline-block rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white"
            >
              Add Your First Service
            </NuxtLink>
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
              0 pending
            </span>
          </div>
          <p class="text-sm text-[var(--color-titanium)]">
            No pending payment verifications.
          </p>
        </div>
      </div>
    </div>

    <!-- Getting Started Checklist -->
    <div class="mt-8 card-design p-6">
      <h3 class="mb-4 text-[var(--color-deep)]">
        <Icon name="lucide:rocket" class="mr-2 inline-block h-5 w-5" />
        Getting Started
      </h3>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="flex items-center gap-3 rounded-input bg-[var(--color-white)] p-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-silver)]/30">
            <span class="text-xs font-bold text-[var(--color-titanium)]">1</span>
          </div>
          <span class="text-sm text-[var(--color-titanium)]">Add your first service</span>
        </div>
        <div class="flex items-center gap-3 rounded-input bg-[var(--color-white)] p-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-silver)]/30">
            <span class="text-xs font-bold text-[var(--color-titanium)]">2</span>
          </div>
          <span class="text-sm text-[var(--color-titanium)]">Add your team</span>
        </div>
        <div class="flex items-center gap-3 rounded-input bg-[var(--color-white)] p-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-silver)]/30">
            <span class="text-xs font-bold text-[var(--color-titanium)]">3</span>
          </div>
          <span class="text-sm text-[var(--color-titanium)]">Set up payments</span>
        </div>
        <div class="flex items-center gap-3 rounded-input bg-[var(--color-white)] p-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-silver)]/30">
            <span class="text-xs font-bold text-[var(--color-titanium)]">4</span>
          </div>
          <span class="text-sm text-[var(--color-titanium)]">Customize your page</span>
        </div>
      </div>
    </div>
  </div>
</template>
