<script setup lang="ts">
/**
 * /customer/dashboard — Customer Dashboard
 *
 * Shows:
 *   - Upcoming bookings (next 3)
 *   - Loyalty status card (if any shops with points)
 *   - Quick book CTA
 *
 * Customer-only access.
 */
import { useAuthStore } from '~/stores/auth'

definePageMeta({
  layout: 'customer',
  middleware: ['auth', 'customer'],
})

const authStore = useAuthStore()
const toast = useToast()

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const hasError = ref(false)

interface UpcomingBooking {
  id: string
  booking_ref: string
  shop_name: string
  shopSlug: string
  service_name: string
  service_price: number
  date: string
  start_time: string
  end_time: string
  status: string
  payment_status: string
  barberName: string
}

interface LoyaltyShop {
  shopId: string
  shopName: string
  shopSlug: string
  balance: number
}

const upcomingBookings = ref<UpcomingBooking[]>([])
const loyaltyShops = ref<LoyaltyShop[]>([])
const totalPoints = ref(0)

// ─── Fetch Dashboard ──────────────────────────────
async function fetchDashboard() {
  isLoading.value = true
  hasError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const response = await $fetch('/api/customer/dashboard', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    upcomingBookings.value = (response.upcomingBookings || []).map((b: any) => ({
      id: b.id,
      booking_ref: b.booking_ref,
      shop_name: b.shopName,
      shopSlug: b.shopSlug,
      service_name: b.service_name,
      service_price: b.service_price,
      date: b.date,
      start_time: b.start_time,
      end_time: b.end_time,
      status: b.status,
      payment_status: b.payment_status,
      barberName: b.barberName,
    }))

    loyaltyShops.value = response.loyalty?.shops || []
    totalPoints.value = response.loyalty?.totalPoints || 0
  } catch (error: any) {
    hasError.value = true
    toast.error('Failed to load dashboard')
    console.error('Error fetching dashboard:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Helpers ───────────────────────────────────────
function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatPrice(price: number): string {
  return `₱${Number(price).toLocaleString()}`
}

onMounted(() => {
  if (authStore.isAuthenticated) {
    fetchDashboard()
  }
})
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <!-- Welcome Header -->
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-deep)]">
        Welcome back, {{ authStore.displayName }}!
      </h1>
      <p class="mt-1 text-sm text-[var(--color-titanium)]">Manage your bookings and loyalty points</p>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-2">
        <div v-for="n in 2" :key="n" class="card-design p-6">
          <div class="h-4 w-24 animate-pulse rounded bg-[var(--color-silver)]/10" />
          <div class="mt-3 h-8 w-32 animate-pulse rounded bg-[var(--color-silver)]/10" />
          <div class="mt-2 h-3 w-20 animate-pulse rounded bg-[var(--color-silver)]/10" />
        </div>
      </div>
      <div class="card-design p-6">
        <div class="mb-4 h-5 w-32 animate-pulse rounded bg-[var(--color-silver)]/10" />
        <div class="space-y-3">
          <div v-for="n in 3" :key="n" class="h-16 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
        </div>
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="hasError"
      title="Failed to Load Dashboard"
      message="Something went wrong while fetching your data. Please try again."
      :retry-fn="fetchDashboard"
    />

    <!-- Dashboard Content -->
    <template v-else>
      <!-- Quick Stats -->
      <div class="grid gap-4 sm:grid-cols-2">
        <!-- Upcoming Bookings Card -->
        <div class="card-design p-6">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-deep)]/10">
              <Icon name="lucide:calendar-check" class="h-5 w-5 text-[var(--color-deep)]" />
            </div>
            <div>
              <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Upcoming</p>
              <p class="text-2xl font-bold text-[var(--color-deep)]">{{ upcomingBookings.length }}</p>
            </div>
          </div>
        </div>

        <!-- Loyalty Points Card -->
        <div v-if="totalPoints > 0" class="card-design p-6">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-warning)]/10">
              <Icon name="lucide:star" class="h-5 w-5 text-[var(--color-warning)]" />
            </div>
            <div>
              <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Loyalty Points</p>
              <p class="text-2xl font-bold text-[var(--color-deep)]">{{ totalPoints }}</p>
            </div>
          </div>
        </div>

        <!-- Quick Book CTA -->
        <NuxtLink
          to="/"
          class="card-design flex items-center gap-3 p-6 transition-colors hover:border-[var(--color-deep)]/30"
        >
          <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-success)]/10">
            <Icon name="lucide:plus" class="h-5 w-5 text-[var(--color-success)]" />
          </div>
          <div>
            <p class="text-sm font-semibold text-[var(--color-deep)]">Book an Appointment</p>
            <p class="text-xs text-[var(--color-titanium)]">Find a barbershop and book now</p>
          </div>
          <Icon name="lucide:chevron-right" class="ml-auto h-5 w-5 text-[var(--color-titanium)]" />
        </NuxtLink>
      </div>

      <!-- Loyalty Summary (if multiple shops) -->
      <div v-if="loyaltyShops.length > 1" class="card-design p-6">
        <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Your Points by Shop</h2>
        <div class="space-y-2">
          <div
            v-for="shop in loyaltyShops"
            :key="shop.shopId"
            class="flex items-center justify-between rounded-input bg-[var(--color-white)] px-4 py-3"
          >
            <NuxtLink
              :to="`/shop/${shop.shopSlug}`"
              class="text-sm font-medium text-[var(--color-deep)] hover:underline"
            >
              {{ shop.shopName }}
            </NuxtLink>
            <span class="text-sm font-bold text-[var(--color-deep)]">{{ shop.balance }} pts</span>
          </div>
        </div>
      </div>

      <!-- Upcoming Bookings -->
      <div class="card-design p-6">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-[var(--color-deep)]">Upcoming Bookings</h2>
          <NuxtLink
            v-if="upcomingBookings.length > 0"
            to="/customer/bookings"
            class="text-sm font-medium text-[var(--color-deep)] hover:underline"
          >
            View all
          </NuxtLink>
        </div>

        <div v-if="upcomingBookings.length === 0" class="py-8 text-center">
          <Icon name="lucide:calendar-x" class="mx-auto h-12 w-12 text-[var(--color-silver)]/30" />
          <p class="mt-3 text-sm text-[var(--color-titanium)]">No upcoming bookings</p>
          <NuxtLink
            to="/"
            class="mt-3 inline-block rounded-btn bg-[var(--color-deep)] px-5 py-2 text-sm font-medium text-white"
          >
            Book Now
          </NuxtLink>
        </div>

        <div v-else class="space-y-3">
          <NuxtLink
            v-for="booking in upcomingBookings"
            :key="booking.id"
            :to="`/customer/bookings/${booking.id}`"
            class="block rounded-input border border-[var(--color-silver)]/20 bg-[var(--color-white)] p-4 transition-colors hover:border-[var(--color-deep)]/20"
          >
            <div class="flex items-start justify-between">
              <div>
                <p class="text-sm font-semibold text-[var(--color-deep)]">{{ booking.service_name }}</p>
                <p class="mt-0.5 text-xs text-[var(--color-titanium)]">{{ booking.shop_name }}</p>
              </div>
              <StatusBadge :status="booking.status" size="sm" />
            </div>
            <div class="mt-3 flex items-center gap-4 text-xs text-[var(--color-titanium)]">
              <span class="flex items-center gap-1">
                <Icon name="lucide:calendar" class="h-3.5 w-3.5" />
                {{ formatDate(booking.date) }}
              </span>
              <span class="flex items-center gap-1">
                <Icon name="lucide:clock" class="h-3.5 w-3.5" />
                {{ formatTime(booking.start_time) }}
              </span>
              <span class="flex items-center gap-1">
                <Icon name="lucide:user" class="h-3.5 w-3.5" />
                {{ booking.barberName }}
              </span>
            </div>
            <div class="mt-2 flex items-center justify-between">
              <span class="text-sm font-bold text-[var(--color-deep)]">{{ formatPrice(booking.service_price) }}</span>
              <StatusBadge :status="booking.payment_status" size="sm" />
            </div>
          </NuxtLink>
        </div>
      </div>
    </template>
  </div>
</template>
