<script setup lang="ts">
/**
 * /admin/bookings — Admin Bookings List
 *
 * Shows all bookings for the shop with filters:
 * - Date range (from / to)
 * - Status filter
 * - Barber filter
 *
 * Table columns: ref, customer, service, barber, date/time, status, payment, [View]
 * Pagination: 20 per page
 *
 * Admin-only access.
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const toast = useToast()

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const hasError = ref(false)
const bookings = ref<any[]>([])
const totalBookings = ref(0)
const page = ref(1)
const perPage = 20

// Filters
const filterStatus = ref('')
const filterBarberId = ref('')
const filterDateFrom = ref('')
const filterDateTo = ref('')

// Barber options for filter
const barbers = ref<any[]>([])

// ─── Fetch Bookings ────────────────────────────────
async function fetchBookings() {
  isLoading.value = true
  hasError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token || !authStore.shopId) return

    // Build query using Supabase directly (for complex filters)
    const shopId = authStore.shopId
    let query = supabase
      .from('bookings')
      .select(`
        id, booking_ref, shop_id, customer_id, service_name, service_price,
        date, start_time, end_time, status, payment_status, payment_type, payment_amount,
        barber_id, points_earned, points_redeemed, reward_id, discount_applied,
        created_at
      `, { count: 'exact' })
      .eq('shop_id', shopId)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })

    // Apply filters
    if (filterStatus.value) {
      query = query.eq('status', filterStatus.value)
    }
    if (filterBarberId.value) {
      query = query.eq('barber_id', filterBarberId.value)
    }
    if (filterDateFrom.value) {
      query = query.gte('date', filterDateFrom.value)
    }
    if (filterDateTo.value) {
      query = query.lte('date', filterDateTo.value)
    }

    // Pagination
    const from = (page.value - 1) * perPage
    const to = from + perPage - 1
    query = query.range(from, to)

    const { data, count, error } = await query

    if (error) throw error

    bookings.value = data || []
    totalBookings.value = count || 0

    // Enrich with customer and barber names
    if (bookings.value.length > 0) {
      const customerIds = [...new Set(bookings.value.map(b => b.customer_id).filter(Boolean))]
      const barberIds = [...new Set(bookings.value.map(b => b.barber_id).filter(Boolean))]
      const manualPaymentMethodIds = [...new Set(bookings.value.map(b => b.payment_method_id).filter(Boolean))]

      // Fetch customer names
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from('users')
          .select('id, display_name, email')
          .in('id', customerIds)

        if (customers) {
          const customerMap = Object.fromEntries(customers.map(c => [c.id, c]))
          for (const booking of bookings.value) {
            if (booking.customer_id && customerMap[booking.customer_id]) {
              booking.customerName = customerMap[booking.customer_id].display_name
              booking.customerEmail = customerMap[booking.customer_id].email
            }
          }
        }
      }

      // Fetch barber names
      if (barberIds.length > 0) {
        const { data: barberData } = await supabase
          .from('barbers')
          .select('id, user_id')
          .in('id', barberIds)

        if (barberData) {
          const barberUserIds = barberData.map(b => b.user_id).filter(Boolean)
          if (barberUserIds.length > 0) {
            const { data: barberUsers } = await supabase
              .from('users')
              .select('id, display_name')
              .in('id', barberUserIds)

            if (barberUsers) {
              const barberUserMap = Object.fromEntries(barberUsers.map(u => [u.id, u.display_name]))
              const barberMap = Object.fromEntries(barberData.map(b => [b.id, barberUserMap[b.user_id] || 'Unknown']))
              for (const booking of bookings.value) {
                booking.barberName = barberMap[booking.barber_id] || 'Unknown'
              }
            }
          }
        }
      }

      // Resolve payment method names for manual payments
      if (manualPaymentMethodIds.length > 0) {
        const { data: paymentMethods } = await supabase
          .from('payment_methods')
          .select('id, name')
          .in('id', manualPaymentMethodIds)

        if (paymentMethods) {
          const pmMap = Object.fromEntries(paymentMethods.map(pm => [pm.id, pm.name]))
          for (const booking of bookings.value) {
            if (booking.payment_method_id && pmMap[booking.payment_method_id]) {
              booking.paymentMethodName = pmMap[booking.payment_method_id]
            }
          }
        }
      }

      // Format PayMongo method keys into readable names
      const paymongoLabelMap: Record<string, string> = {
        gcash_paymongo: 'GCash',
        maya_paymongo: 'Maya',
        instapay: 'InstaPay',
        qrph: 'QR PH',
      }
      for (const booking of bookings.value) {
        if (booking.payment_type === 'paymongo' && booking.payment_method) {
          booking.paymentMethodName = paymongoLabelMap[booking.payment_method] || booking.payment_method
        } else if (!booking.paymentMethodName) {
          booking.paymentMethodName = booking.payment_type === 'paymongo' ? 'PayMongo' : 'Manual QR'
        }
      }
    }
  } catch (error: any) {
    hasError.value = true
    toast.error('Failed to load bookings')
    console.error('Error fetching bookings:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Fetch Barbers for Filter ──────────────────────
async function fetchBarbers() {
  try {
    const supabase = useSupabase()
    const shopId = authStore.shopId
    if (!shopId) return

    const { data: barberData } = await supabase
      .from('barbers')
      .select('id, user_id, is_active')
      .eq('shop_id', shopId)
      .eq('is_active', true)

    if (barberData && barberData.length > 0) {
      const userIds = barberData.map(b => b.user_id).filter(Boolean)
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', userIds)

      if (users) {
        const userMap = Object.fromEntries(users.map(u => [u.id, u.display_name]))
        barbers.value = barberData.map(b => ({
          id: b.id,
          name: userMap[b.user_id] || 'Unknown',
        }))
      }
    }
  } catch (error) {
    console.error('Error fetching barbers:', error)
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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatPrice(price: number): string {
  return `₱${Number(price).toLocaleString()}`
}

const totalPages = computed(() => Math.ceil(totalBookings.value / perPage))

function applyFilters() {
  page.value = 1
  fetchBookings()
}

function resetFilters() {
  filterStatus.value = ''
  filterBarberId.value = ''
  filterDateFrom.value = ''
  filterDateTo.value = ''
  page.value = 1
  fetchBookings()
}

// ─── Status options ────────────────────────────────
const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
]

onMounted(() => {
  fetchBookings()
  fetchBarbers()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-deep)]">Bookings</h1>
      <p class="text-sm text-[var(--color-titanium)]">{{ totalBookings }} booking{{ totalBookings !== 1 ? 's' : '' }}</p>
    </div>

    <!-- Filters -->
    <div class="card-design p-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <!-- Date From -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">From</label>
          <input
            v-model="filterDateFrom"
            type="date"
            class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>
        <!-- Date To -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">To</label>
          <input
            v-model="filterDateTo"
            type="date"
            class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>
        <!-- Status -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Status</label>
          <select
            v-model="filterStatus"
            class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          >
            <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <!-- Barber -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Barber</label>
          <select
            v-model="filterBarberId"
            class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          >
            <option value="">All Barbers</option>
            <option v-for="b in barbers" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
        <!-- Actions -->
        <div class="flex items-end gap-2">
          <button
            class="btn-design flex-1 rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white"
            @click="applyFilters"
          >
            Filter
          </button>
          <button
            class="rounded-btn border border-[var(--color-silver)]/50 px-3 py-2 text-sm text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
            @click="resetFilters"
          >
            Reset
          </button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-3">
      <div v-for="n in 5" :key="n" class="card-design p-4">
        <div class="h-12 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="hasError"
      title="Failed to Load Bookings"
      message="Something went wrong while fetching bookings."
      :retry-fn="fetchBookings"
    />

    <!-- Empty -->
    <EmptyState
      v-else-if="bookings.length === 0"
      icon="lucide:calendar-x"
      title="No Bookings Found"
      message="Bookings will appear here once customers start booking appointments."
    />

    <!-- Bookings Table -->
    <div v-else class="card-design overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Ref</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Customer</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Service</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Barber</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Date/Time</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Status</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Payment</th>
              <th class="px-4 py-3 text-right font-medium text-[var(--color-titanium)]">Amount</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="booking in bookings"
              :key="booking.id"
              class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
            >
              <td class="px-4 py-3">
                <span class="font-mono text-xs font-bold text-[var(--color-deep)]">{{ booking.booking_ref }}</span>
              </td>
              <td class="px-4 py-3">
                <p class="font-medium text-[var(--color-deep)]">{{ booking.customerName || 'Guest' }}</p>
                <p v-if="booking.customerEmail" class="text-xs text-[var(--color-titanium)]">{{ booking.customerEmail }}</p>
              </td>
              <td class="px-4 py-3 text-[var(--color-deep)]">{{ booking.service_name }}</td>
              <td class="px-4 py-3 text-[var(--color-deep)]">{{ booking.barberName || 'TBD' }}</td>
              <td class="px-4 py-3">
                <p class="text-[var(--color-deep)]">{{ formatDate(booking.date) }}</p>
                <p class="text-xs text-[var(--color-titanium)]">{{ formatTime(booking.start_time) }}</p>
              </td>
              <td class="px-4 py-3 text-center">
                <StatusBadge :status="booking.status" size="sm" />
              </td>
              <td class="px-4 py-3 text-center">
                <StatusBadge :status="booking.payment_status" size="sm" />
                <p class="mt-1 text-xs text-[var(--color-titanium)]">{{ booking.paymentMethodName || '—' }}</p>
              </td>
              <td class="px-4 py-3 text-right font-medium text-[var(--color-deep)]">
                {{ formatPrice(booking.payment_amount || booking.service_price) }}
              </td>
              <td class="px-4 py-3 text-center">
                <NuxtLink
                  :to="`/admin/bookings/${booking.id}`"
                  class="rounded-btn px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20"
                >
                  <Icon name="lucide:eye" class="mr-1 inline h-3.5 w-3.5" /> View
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-between border-t border-[var(--color-silver)]/30 px-4 py-3">
        <p class="text-xs text-[var(--color-titanium)]">
          Showing {{ (page - 1) * perPage + 1 }}-{{ Math.min(page * perPage, totalBookings) }} of {{ totalBookings }}
        </p>
        <div class="flex gap-2">
          <button
            class="rounded-btn border border-[var(--color-silver)]/50 px-3 py-1 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page <= 1"
            @click="page--; fetchBookings()"
          >
            Previous
          </button>
          <button
            class="rounded-btn border border-[var(--color-silver)]/50 px-3 py-1 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page >= totalPages"
            @click="page++; fetchBookings()"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
