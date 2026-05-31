<script setup lang="ts">
/**
 * /customer/bookings/[id] — Customer Booking Detail
 *
 * Full booking detail:
 *   - Booking ref, status, service, barber, date/time
 *   - Payment method, amount, payment proof status
 *   - Points earned (if loyalty)
 *   - [Cancel Booking] button if status is pending/confirmed and date is in future
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
const route = useRoute()
const router = useRouter()

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const hasError = ref(false)
const booking = ref<any>(null)
const isCancelling = ref(false)
const showCancelDialog = ref(false)
const cancellationReason = ref('')

// ─── Computed ──────────────────────────────────────
const canCancel = computed(() => {
  if (!booking.value) return false
  if (!['pending', 'confirmed', 'pending_payment'].includes(booking.value.status)) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const bookingDate = new Date(booking.value.date + 'T00:00:00')
  return bookingDate >= today
})

// ─── Fetch Booking ─────────────────────────────────
async function fetchBooking() {
  isLoading.value = true
  hasError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const bookingId = route.params.id as string

    // Fetch the booking — customer can SELECT their own via RLS
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('customer_id', authStore.user?.id)
      .single()

    if (error || !data) {
      hasError.value = true
      return
    }

    booking.value = data

    // Enrich with shop name
    const { data: shop } = await supabase
      .from('shops')
      .select('name, slug')
      .eq('id', data.shop_id)
      .single()
    booking.value.shopName = shop?.name || 'Unknown Shop'
    booking.value.shopSlug = shop?.slug

    // Enrich with barber name
    if (data.barber_id) {
      const { data: barber } = await supabase
        .from('barbers')
        .select('user_id')
        .eq('id', data.barber_id)
        .single()
      if (barber?.user_id) {
        const { data: barberUser } = await supabase
          .from('users')
          .select('display_name')
          .eq('id', barber.user_id)
          .single()
        booking.value.barberName = barberUser?.display_name || 'TBD'
      }
    } else {
      booking.value.barberName = 'TBD'
    }
  } catch (error: any) {
    hasError.value = true
    toast.error('Failed to load booking')
    console.error('Error fetching booking:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Cancel Booking ────────────────────────────────
async function cancelBooking() {
  if (!cancellationReason.value.trim()) {
    toast.error('Please provide a cancellation reason')
    return
  }

  isCancelling.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    await $fetch(`/api/customer/bookings/${route.params.id}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        cancellation_reason: cancellationReason.value.trim(),
      },
    })

    toast.success('Booking cancelled successfully')
    showCancelDialog.value = false
    await fetchBooking()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to cancel booking'
    toast.error(msg)
  } finally {
    isCancelling.value = false
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
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatPrice(price: number): string {
  return `₱${Number(price).toLocaleString()}`
}

function formatPaymentMethod(method: string): string {
  const labels: Record<string, string> = {
    gcash_manual: 'GCash (Manual)',
    maya_manual: 'Maya (Manual)',
    bank_transfer: 'Bank Transfer',
    gcash_paymongo: 'GCash (PayMongo)',
    maya_paymongo: 'Maya (PayMongo)',
    instapay: 'InstaPay',
    qrph: 'QR Ph',
  }
  return labels[method] || method
}

onMounted(() => {
  if (authStore.isAuthenticated) {
    fetchBooking()
  }
})
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 px-4 py-8">
    <!-- Back Button -->
    <NuxtLink
      to="/customer/bookings"
      class="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
    >
      <Icon name="lucide:arrow-left" class="h-4 w-4" />
      Back to Bookings
    </NuxtLink>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-4">
      <div class="card-design p-6">
        <div class="h-6 w-48 animate-pulse rounded bg-[var(--color-silver)]/10" />
        <div class="mt-4 space-y-3">
          <div v-for="n in 8" :key="n" class="h-5 w-full animate-pulse rounded bg-[var(--color-silver)]/10" />
        </div>
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="hasError"
      title="Booking Not Found"
      message="This booking may not exist or you don't have access to view it."
      :retry-fn="() => router.push('/customer/bookings')"
    />

    <!-- Booking Detail -->
    <template v-else-if="booking">
      <!-- Header -->
      <div class="card-design p-6">
        <div class="flex items-start justify-between">
          <div>
            <p class="font-mono text-sm font-bold text-[var(--color-titanium)]">{{ booking.booking_ref }}</p>
            <h1 class="mt-1 text-xl font-bold text-[var(--color-deep)]">{{ booking.service_name }}</h1>
            <p class="mt-0.5 text-sm text-[var(--color-titanium)]">{{ booking.shopName }}</p>
          </div>
          <StatusBadge :status="booking.status" size="lg" />
        </div>
      </div>

      <!-- Booking Details -->
      <div class="card-design p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-titanium)]">Appointment Details</h2>
        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Date</span>
            <span class="text-sm font-medium text-[var(--color-deep)]">{{ formatDate(booking.date) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Time</span>
            <span class="text-sm font-medium text-[var(--color-deep)]">{{ formatTime(booking.start_time) }} - {{ formatTime(booking.end_time) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Barber</span>
            <span class="text-sm font-medium text-[var(--color-deep)]">{{ booking.barberName }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Duration</span>
            <span class="text-sm font-medium text-[var(--color-deep)]">{{ booking.service_duration }} min</span>
          </div>
        </div>
      </div>

      <!-- Payment Details -->
      <div class="card-design p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-titanium)]">Payment</h2>
        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Amount</span>
            <span class="text-sm font-bold text-[var(--color-deep)]">{{ formatPrice(booking.payment_amount || booking.service_price) }}</span>
          </div>
          <div v-if="booking.payment_method" class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Method</span>
            <span class="text-sm font-medium text-[var(--color-deep)]">{{ formatPaymentMethod(booking.payment_method) }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--color-titanium)]">Payment Status</span>
            <StatusBadge :status="booking.payment_status" size="sm" />
          </div>
          <div v-if="booking.discount_applied > 0" class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Discount</span>
            <span class="text-sm font-medium text-[var(--color-success)]">-{{ formatPrice(booking.discount_applied) }}</span>
          </div>
        </div>
      </div>

      <!-- Payment Proof Status (if manual) -->
      <div v-if="booking.payment_type === 'manual' && booking.proof_image_url" class="card-design p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-titanium)]">Payment Proof</h2>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--color-titanium)]">Status</span>
            <StatusBadge :status="booking.payment_status" size="sm" />
          </div>
          <div v-if="booking.verified_by" class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Verified</span>
            <span class="text-sm font-medium text-[var(--color-success)]">Yes</span>
          </div>
          <div v-if="booking.rejection_reason" class="rounded-input bg-[var(--color-danger)]/5 p-3">
            <p class="text-xs font-medium text-[var(--color-danger)]">Rejection Reason</p>
            <p class="mt-1 text-sm text-[var(--color-deep)]">{{ booking.rejection_reason }}</p>
          </div>
        </div>
      </div>

      <!-- Loyalty Points (if earned) -->
      <div v-if="booking.points_earned > 0 || booking.points_redeemed > 0" class="card-design p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-titanium)]">Loyalty Points</h2>
        <div class="space-y-3">
          <div v-if="booking.points_earned > 0" class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Points Earned</span>
            <span class="text-sm font-bold text-[var(--color-success)]">+{{ booking.points_earned }}</span>
          </div>
          <div v-if="booking.points_redeemed > 0" class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Points Redeemed</span>
            <span class="text-sm font-bold text-[var(--color-danger)]">-{{ booking.points_redeemed }}</span>
          </div>
        </div>
      </div>

      <!-- Customer Notes -->
      <div v-if="booking.customer_notes" class="card-design p-6">
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-titanium)]">Your Notes</h2>
        <p class="text-sm text-[var(--color-deep)]">{{ booking.customer_notes }}</p>
      </div>

      <!-- Cancellation Info (if cancelled) -->
      <div v-if="booking.status === 'cancelled'" class="card-design p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-titanium)]">Cancellation</h2>
        <div class="space-y-3">
          <div v-if="booking.cancellation_reason" class="rounded-input bg-[var(--color-danger)]/5 p-3">
            <p class="text-xs font-medium text-[var(--color-danger)]">Reason</p>
            <p class="mt-1 text-sm text-[var(--color-deep)]">{{ booking.cancellation_reason }}</p>
          </div>
          <div v-if="booking.cancelled_at" class="flex justify-between">
            <span class="text-sm text-[var(--color-titanium)]">Cancelled At</span>
            <span class="text-sm font-medium text-[var(--color-deep)]">{{ new Date(booking.cancelled_at).toLocaleString() }}</span>
          </div>
        </div>
      </div>

      <!-- Cancel Button -->
      <div v-if="canCancel" class="card-design p-6">
        <button
          class="w-full rounded-btn border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
          :disabled="isCancelling"
          @click="showCancelDialog = true"
        >
          <Icon name="lucide:x-circle" class="mr-2 inline h-4 w-4" />
          {{ isCancelling ? 'Cancelling...' : 'Cancel Booking' }}
        </button>
      </div>
    </template>

    <!-- Cancel Dialog -->
    <Teleport to="body">
      <div
        v-if="showCancelDialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        @click.self="showCancelDialog = false"
      >
        <div class="card-design w-full max-w-md p-6">
          <h3 class="text-lg font-bold text-[var(--color-deep)]">Cancel Booking</h3>
          <p class="mt-2 text-sm text-[var(--color-titanium)]">
            Are you sure you want to cancel <span class="font-bold">{{ booking?.booking_ref }}</span>?
            This action cannot be undone.
          </p>
          <div class="mt-4">
            <label class="mb-1 block text-sm font-medium text-[var(--color-deep)]">Reason for cancellation</label>
            <textarea
              v-model="cancellationReason"
              class="input-design w-full rounded-input border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
              rows="3"
              placeholder="Please tell us why you're cancelling..."
            />
          </div>
          <div class="mt-4 flex gap-3">
            <button
              class="flex-1 rounded-btn border border-[var(--color-silver)]/50 px-4 py-2.5 text-sm font-medium text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
              @click="showCancelDialog = false"
            >
              Keep Booking
            </button>
            <button
              class="flex-1 rounded-btn bg-[var(--color-danger)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              :disabled="isCancelling || !cancellationReason.trim()"
              @click="cancelBooking"
            >
              {{ isCancelling ? 'Cancelling...' : 'Confirm Cancellation' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
