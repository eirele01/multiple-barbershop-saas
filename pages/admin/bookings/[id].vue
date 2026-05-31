<script setup lang="ts">
/**
 * /admin/bookings/[id] — Admin Booking Detail Page
 *
 * Shows full booking information with action buttons based on current status:
 * - Confirmed: [Start Service] [Mark Complete] [Cancel] [No Show]
 * - In Progress: [Mark Complete] [Cancel]
 * - Completed: Read-only, show points earned badge if loyalty enabled
 * - Cancelled / No Show: Read-only
 *
 * Admin-only access.
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'

const { confirm, ConfirmDialogComponent } = useConfirm()

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const toast = useToast()
const route = useRoute()
const bookingId = route.params.id as string

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const booking = ref<any>(null)
const customer = ref<any>(null)
const barberName = ref('')
const serviceName = ref('')

// Action states
const isActioning = ref(false)
const showCancelModal = ref(false)
const cancelReason = ref('')

// ─── Fetch Booking ────────────────────────────────
async function fetchBooking() {
  isLoading.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token || !authStore.shopId) return

    // Fetch booking
    const { data: bookingData, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('shop_id', authStore.shopId)
      .single()

    if (error || !bookingData) {
      throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
    }

    booking.value = bookingData

    // Fetch customer info
    if (bookingData.customer_id) {
      const { data: customerData } = await supabase
        .from('users')
        .select('id, display_name, email, phone_number')
        .eq('id', bookingData.customer_id)
        .single()

      customer.value = customerData
    }

    // Fetch barber name
    if (bookingData.barber_id) {
      const { data: barberData } = await supabase
        .from('barbers')
        .select('id, user_id')
        .eq('id', bookingData.barber_id)
        .single()

      if (barberData?.user_id) {
        const { data: barberUser } = await supabase
          .from('users')
          .select('display_name')
          .eq('id', barberData.user_id)
          .single()

        barberName.value = barberUser?.display_name || 'Unknown'
      }
    }
  } catch (error: any) {
    toast.error('Failed to load booking')
    console.error('Error fetching booking:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Get Auth Token ────────────────────────────────
async function getAuthToken(): Promise<string | null> {
  const supabase = useSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

// ─── Actions ───────────────────────────────────────
async function markInProgress() {
  isActioning.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch(`/api/admin/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: { status: 'in_progress' },
    })

    toast.success('Booking marked as in progress')
    await fetchBooking()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to update status'
    toast.error(msg)
  } finally {
    isActioning.value = false
  }
}

async function markComplete() {
  isActioning.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    const result = await $fetch(`/api/admin/bookings/${bookingId}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    toast.success(result.pointsAwarded > 0
      ? `Booking completed! Customer earned ${result.pointsAwarded} points`
      : 'Booking completed'
    )
    await fetchBooking()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to complete booking'
    toast.error(msg)
  } finally {
    isActioning.value = false
  }
}

async function markNoShow() {
  const ok = await confirm({ title: 'Mark as No Show', message: 'Are you sure you want to mark this booking as No Show? This action cannot be undone.', confirmLabel: 'Mark No Show', variant: 'warning' })
  if (!ok) return
  isActioning.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch(`/api/admin/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: { status: 'no_show' },
    })

    toast.success('Booking marked as no show')
    await fetchBooking()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to update status'
    toast.error(msg)
  } finally {
    isActioning.value = false
  }
}

async function cancelBooking() {
  if (!cancelReason.value.trim()) {
    toast.error('Please provide a cancellation reason')
    return
  }
  isActioning.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch(`/api/admin/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        status: 'cancelled',
        cancellationReason: cancelReason.value.trim(),
      },
    })

    toast.success('Booking cancelled')
    showCancelModal.value = false
    cancelReason.value = ''
    await fetchBooking()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to cancel booking'
    toast.error(msg)
  } finally {
    isActioning.value = false
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
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatPrice(price: number): string {
  return `₱${Number(price).toLocaleString()}`
}

const isUpgraded = computed(() => shopStore.isUpgradedPlan)

onMounted(() => {
  fetchBooking()
})
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <!-- Loading -->
    <div v-if="isLoading" class="space-y-6">
      <div class="card-design p-6">
        <div class="h-48 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
      </div>
    </div>

    <template v-else-if="booking">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <NuxtLink to="/admin/bookings" class="text-[var(--color-titanium)] hover:text-[var(--color-deep)]">
            <Icon name="lucide:arrow-left" class="h-5 w-5" />
          </NuxtLink>
          <div>
            <h1 class="text-2xl font-bold text-[var(--color-deep)]">Booking {{ booking.booking_ref }}</h1>
            <p class="text-sm text-[var(--color-titanium)]">{{ formatDate(booking.date) }}</p>
          </div>
        </div>
        <StatusBadge :status="booking.status" size="lg" />
      </div>

      <!-- Points Earned Badge (completed bookings with loyalty) -->
      <div v-if="booking.status === 'completed' && booking.points_earned > 0 && isUpgraded" class="card-design flex items-center gap-3 border-l-4 border-l-[var(--color-info)] bg-[var(--color-info)]/5 p-4">
        <Icon name="lucide:star" class="h-5 w-5 text-[var(--color-info)]" />
        <div>
          <p class="text-sm font-semibold text-[var(--color-deep)]">Customer earned {{ booking.points_earned }} loyalty points</p>
          <p v-if="booking.points_redeemed > 0" class="text-xs text-[var(--color-titanium)]">{{ booking.points_redeemed }} points were redeemed for a reward</p>
        </div>
      </div>

      <!-- Booking Details -->
      <div class="card-design p-6">
        <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Booking Details</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <!-- Service -->
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Service</p>
            <p class="mt-1 text-sm font-medium text-[var(--color-deep)]">{{ booking.service_name }}</p>
            <p class="text-xs text-[var(--color-titanium)]">{{ booking.service_duration }} min</p>
          </div>
          <!-- Price -->
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Price</p>
            <p class="mt-1 text-sm font-medium text-[var(--color-deep)]">{{ formatPrice(booking.service_price) }}</p>
            <p v-if="booking.discount_applied > 0" class="text-xs text-[var(--color-success)]">-{{ formatPrice(booking.discount_applied) }} discount</p>
          </div>
          <!-- Barber -->
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Barber</p>
            <p class="mt-1 text-sm font-medium text-[var(--color-deep)]">{{ barberName || 'TBD' }}</p>
          </div>
          <!-- Date & Time -->
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Time</p>
            <p class="mt-1 text-sm font-medium text-[var(--color-deep)]">{{ formatTime(booking.start_time) }} - {{ formatTime(booking.end_time) }}</p>
          </div>
        </div>
      </div>

      <!-- Customer Info -->
      <div class="card-design p-6">
        <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Customer</h2>
        <div v-if="customer" class="grid gap-4 sm:grid-cols-2">
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Name</p>
            <p class="mt-1 text-sm font-medium text-[var(--color-deep)]">{{ customer.display_name }}</p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Email</p>
            <p class="mt-1 text-sm font-medium text-[var(--color-deep)]">{{ customer.email }}</p>
          </div>
          <div v-if="customer.phone_number">
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Phone</p>
            <p class="mt-1 text-sm font-medium text-[var(--color-deep)]">{{ customer.phone_number }}</p>
          </div>
        </div>
        <p v-else class="text-sm text-[var(--color-titanium)]">Guest booking — no customer account</p>
      </div>

      <!-- Payment Info -->
      <div class="card-design p-6">
        <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Payment</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Amount</p>
            <p class="mt-1 text-sm font-bold text-[var(--color-deep)]">{{ formatPrice(booking.payment_amount || booking.service_price) }}</p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Payment Status</p>
            <div class="mt-1">
              <StatusBadge :status="booking.payment_status" size="sm" />
            </div>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Payment Type</p>
            <p class="mt-1 text-sm font-medium text-[var(--color-deep)] capitalize">{{ booking.payment_type || 'N/A' }}</p>
          </div>
          <div v-if="booking.reference_number">
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Reference</p>
            <p class="mt-1 text-sm font-mono text-[var(--color-deep)]">{{ booking.reference_number }}</p>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div v-if="booking.customer_notes || booking.internal_notes" class="card-design p-6">
        <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Notes</h2>
        <div v-if="booking.customer_notes" class="mb-3">
          <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Customer Notes</p>
          <p class="mt-1 text-sm text-[var(--color-deep)]">{{ booking.customer_notes }}</p>
        </div>
        <div v-if="booking.internal_notes">
          <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Internal Notes</p>
          <p class="mt-1 text-sm text-[var(--color-deep)]">{{ booking.internal_notes }}</p>
        </div>
      </div>

      <!-- Cancellation Info -->
      <div v-if="booking.status === 'cancelled'" class="card-design border-l-4 border-l-[var(--color-danger)] bg-[var(--color-danger)]/5 p-6">
        <h2 class="mb-2 text-lg font-semibold text-[var(--color-danger)]">Cancellation</h2>
        <p v-if="booking.cancellation_reason" class="text-sm text-[var(--color-deep)]">Reason: {{ booking.cancellation_reason }}</p>
        <p v-if="booking.cancelled_at" class="mt-1 text-xs text-[var(--color-titanium)]">Cancelled at: {{ new Date(booking.cancelled_at).toLocaleString() }}</p>
      </div>

      <!-- Action Buttons -->
      <div class="card-design p-6">
        <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Actions</h2>

        <!-- Confirmed status -->
        <div v-if="booking.status === 'confirmed'" class="flex flex-wrap gap-3">
          <button
            class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-info)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            :disabled="isActioning"
            @click="markInProgress"
          >
            <Icon name="lucide:play" class="h-4 w-4" />
            Start Service
          </button>
          <button
            class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-success)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            :disabled="isActioning"
            @click="markComplete"
          >
            <Icon name="lucide:check" class="h-4 w-4" />
            Mark Complete
          </button>
          <button
            class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-danger)] px-5 py-2.5 text-sm font-semibold text-[var(--color-danger)] transition-all hover:bg-[var(--color-danger)]/5 disabled:opacity-50"
            :disabled="isActioning"
            @click="showCancelModal = true"
          >
            <Icon name="lucide:x" class="h-4 w-4" />
            Cancel
          </button>
          <button
            class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-titanium)] px-5 py-2.5 text-sm font-semibold text-[var(--color-titanium)] transition-all hover:bg-[var(--color-titanium)]/5 disabled:opacity-50"
            :disabled="isActioning"
            @click="markNoShow"
          >
            <Icon name="lucide:user-x" class="h-4 w-4" />
            No Show
          </button>
        </div>

        <!-- In Progress status -->
        <div v-else-if="booking.status === 'in_progress'" class="flex flex-wrap gap-3">
          <button
            class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-success)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            :disabled="isActioning"
            @click="markComplete"
          >
            <Icon name="lucide:check" class="h-4 w-4" />
            Mark Complete
          </button>
          <button
            class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-danger)] px-5 py-2.5 text-sm font-semibold text-[var(--color-danger)] transition-all hover:bg-[var(--color-danger)]/5 disabled:opacity-50"
            :disabled="isActioning"
            @click="showCancelModal = true"
          >
            <Icon name="lucide:x" class="h-4 w-4" />
            Cancel
          </button>
        </div>

        <!-- Pending / Pending Payment -->
        <div v-else-if="booking.status === 'pending' || booking.status === 'pending_payment'" class="flex flex-wrap gap-3">
          <button
            class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-success)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            :disabled="isActioning"
            @click="markComplete"
          >
            <Icon name="lucide:check" class="h-4 w-4" />
            Mark Complete
          </button>
          <button
            class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-danger)] px-5 py-2.5 text-sm font-semibold text-[var(--color-danger)] transition-all hover:bg-[var(--color-danger)]/5 disabled:opacity-50"
            :disabled="isActioning"
            @click="showCancelModal = true"
          >
            <Icon name="lucide:x" class="h-4 w-4" />
            Cancel
          </button>
        </div>

        <!-- Completed / Cancelled / No Show — read only -->
        <div v-else class="text-sm text-[var(--color-titanium)]">
          <p>No actions available for this booking status.</p>
        </div>
      </div>
    </template>

    <!-- Not Found -->
    <div v-else class="card-design p-8 text-center">
      <Icon name="lucide:calendar-x" class="mx-auto mb-3 h-12 w-12 text-[var(--color-silver)]" />
      <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Booking Not Found</h3>
      <NuxtLink to="/admin/bookings" class="text-sm text-[var(--color-info)] hover:underline">Back to Bookings</NuxtLink>
    </div>

    <!-- Cancel Modal -->
    <div
      v-if="showCancelModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="showCancelModal = false"
    >
      <div class="card-design mx-4 w-full max-w-md p-6">
        <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Cancel Booking</h2>
        <p class="mb-4 text-sm text-[var(--color-titanium)]">
          Are you sure you want to cancel booking <strong>{{ booking?.booking_ref }}</strong>?
        </p>

        <div>
          <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Cancellation Reason *</label>
          <textarea
            v-model="cancelReason"
            rows="3"
            maxlength="300"
            placeholder="Provide a reason for cancellation..."
            class="input-design w-full resize-none border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>

        <div class="mt-6 flex items-center justify-end gap-3">
          <button
            class="rounded-btn border border-[var(--color-silver)] px-4 py-2 text-sm font-medium text-[var(--color-titanium)]"
            @click="showCancelModal = false"
          >
            Go Back
          </button>
          <button
            class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-danger)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            :disabled="isActioning || !cancelReason.trim()"
            @click="cancelBooking"
          >
            <Icon v-if="isActioning" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
            {{ isActioning ? 'Cancelling...' : 'Cancel Booking' }}
          </button>
        </div>
      </div>
    </div>
    <ConfirmDialogComponent />
  </div>
</template>
