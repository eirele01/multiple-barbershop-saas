<script setup lang="ts">
/**
 * /customer/bookings — Customer Bookings List
 *
 * Tabs: Upcoming | Past | Cancelled
 * Each booking row: shop name, service, barber, date/time, status badge,
 *   payment status, [View] button
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
const bookings = ref<any[]>([])
const totalBookings = ref(0)
const page = ref(1)
const perPage = 20
const activeTab = ref<'upcoming' | 'past' | 'cancelled'>('upcoming')

// ─── Tabs ─────────────────────────────────────────
const tabs = [
  { key: 'upcoming' as const, label: 'Upcoming', icon: 'lucide:calendar-clock' },
  { key: 'past' as const, label: 'Past', icon: 'lucide:calendar-check' },
  { key: 'cancelled' as const, label: 'Cancelled', icon: 'lucide:calendar-x' },
]

// ─── Fetch Bookings ────────────────────────────────
async function fetchBookings() {
  isLoading.value = true
  hasError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const response = await $fetch('/api/customer/bookings', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      params: {
        tab: activeTab.value,
        page: page.value,
        limit: perPage,
      },
    }) as any

    bookings.value = response.bookings || []
    totalBookings.value = response.total || 0
  } catch (error: any) {
    hasError.value = true
    toast.error('Failed to load bookings')
    console.error('Error fetching bookings:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Switch Tab ────────────────────────────────────
function switchTab(tab: 'upcoming' | 'past' | 'cancelled') {
  activeTab.value = tab
  page.value = 1
  fetchBookings()
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

const totalPages = computed(() => Math.ceil(totalBookings.value / perPage))

onMounted(() => {
  if (authStore.isAuthenticated) {
    fetchBookings()
  }
})
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-deep)]">My Bookings</h1>
      <p class="mt-1 text-sm text-[var(--color-titanium)]">View and manage your appointments</p>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 rounded-btn bg-[var(--color-silver)]/10 p-1">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex flex-1 items-center justify-center gap-2 rounded-btn px-4 py-2.5 text-sm font-medium transition-colors"
        :class="activeTab === tab.key
          ? 'bg-[var(--color-deep)] text-white'
          : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'"
        @click="switchTab(tab.key)"
      >
        <Icon :name="tab.icon" class="h-4 w-4" />
        <span class="hidden sm:inline">{{ tab.label }}</span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-3">
      <div v-for="n in 5" :key="n" class="card-design p-4">
        <div class="h-20 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="hasError"
      title="Failed to Load Bookings"
      message="Something went wrong while fetching your bookings. Please try again."
      :retry-fn="fetchBookings"
    />

    <!-- Empty -->
    <EmptyState
      v-else-if="bookings.length === 0"
      :icon="activeTab === 'upcoming' ? 'lucide:calendar-clock' : activeTab === 'past' ? 'lucide:calendar-check' : 'lucide:calendar-x'"
      :title="activeTab === 'upcoming' ? 'No Upcoming Bookings' : activeTab === 'past' ? 'No Past Bookings' : 'No Cancelled Bookings'"
      :message="activeTab === 'upcoming' ? 'You have no upcoming appointments. Book one now!' : 'No bookings found in this category.'"
      :action-label="activeTab === 'upcoming' ? 'Book Now' : undefined"
      :action-fn="activeTab === 'upcoming' ? () => navigateTo('/') : undefined"
    />

    <!-- Bookings List -->
    <div v-else class="space-y-3">
      <div
        v-for="booking in bookings"
        :key="booking.id"
        class="card-design p-4"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-bold text-[var(--color-titanium)]">{{ booking.booking_ref }}</span>
              <StatusBadge :status="booking.status" size="sm" />
            </div>
            <p class="mt-1 text-sm font-semibold text-[var(--color-deep)]">{{ booking.service_name }}</p>
            <p class="mt-0.5 text-xs text-[var(--color-titanium)]">{{ booking.shopName }}</p>
          </div>
          <div class="text-right">
            <p class="text-sm font-bold text-[var(--color-deep)]">{{ formatPrice(booking.payment_amount || booking.service_price) }}</p>
            <StatusBadge :status="booking.payment_status" size="sm" />
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-titanium)]">
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

        <div class="mt-3 flex justify-end">
          <NuxtLink
            :to="`/customer/bookings/${booking.id}`"
            class="rounded-btn px-4 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20"
          >
            <Icon name="lucide:eye" class="mr-1 inline h-3.5 w-3.5" /> View Details
          </NuxtLink>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 pt-4">
        <button
          class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 py-1.5 text-xs font-medium text-[var(--color-titanium)] hover:text-[var(--color-deep)] disabled:opacity-50"
          :disabled="page <= 1"
          @click="page--; fetchBookings()"
        >
          Previous
        </button>
        <span class="text-xs text-[var(--color-titanium)]">
          Page {{ page }} of {{ totalPages }}
        </span>
        <button
          class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 py-1.5 text-xs font-medium text-[var(--color-titanium)] hover:text-[var(--color-deep)] disabled:opacity-50"
          :disabled="page >= totalPages"
          @click="page++; fetchBookings()"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>
