<script setup lang="ts">
/**
 * /admin/reports — Reports & Analytics page
 *
 * Features:
 * - Date range picker (default: this month) + Apply button
 * - 4 stat cards: Total Revenue, Total Bookings, Avg Booking Value, Completion Rate
 * - Charts: Revenue Over Time, Bookings by Status, Top Services, Top Barbers
 * - Recent Transactions table (paginated, 20/page)
 * - Export CSV button
 */
import { useAuthStore } from '~/stores/auth'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const toast = useToast()

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const hasError = ref(false)

// Date range — default this month
// Use local date components (not toISOString which returns UTC — wrong in UTC+8)
const now = new Date()
const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}
const filterDateFrom = ref(toLocalDateStr(firstOfMonth))
const filterDateTo = ref(toLocalDateStr(now))

// Report data
const stats = ref({ totalRevenue: 0, totalBookings: 0, avgBookingValue: 0, completionRate: 0 })
const revenueOverTime = ref<{ date: string; amount: number }[]>([])
const bookingsByStatus = ref<{ status: string; count: number }[]>([])
const topServices = ref<{ name: string; count: number }[]>([])
const topBarbers = ref<{ name: string; revenue: number }[]>([])
const transactions = ref<any[]>([])

// Pagination
const txPage = ref(1)
const txPerPage = 20

// ─── Fetch Reports ─────────────────────────────────
async function fetchReports() {
  isLoading.value = true
  hasError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token || !authStore.shopId) return

    const params = new URLSearchParams({
      dateFrom: filterDateFrom.value,
      dateTo: filterDateTo.value,
    })

    const result = await $fetch(`/api/admin/reports?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    stats.value = result.stats || { totalRevenue: 0, totalBookings: 0, avgBookingValue: 0, completionRate: 0 }
    revenueOverTime.value = result.revenueOverTime || []
    bookingsByStatus.value = result.bookingsByStatus || []
    topServices.value = result.topServices || []
    topBarbers.value = result.topBarbers || []
    transactions.value = result.transactions || []
    txPage.value = 1
  } catch (error: any) {
    hasError.value = true
    toast.error('Failed to load reports')
  } finally {
    isLoading.value = false
  }
}

// ─── Helpers ───────────────────────────────────────
function formatPrice(price: number): string {
  return `₱${Number(price).toLocaleString()}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  })
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Chart helpers ─────────────────────────────────
const maxRevenue = computed(() => {
  if (revenueOverTime.value.length === 0) return 1
  return Math.max(...revenueOverTime.value.map(r => r.amount), 1)
})

const maxServiceCount = computed(() => {
  if (topServices.value.length === 0) return 1
  return Math.max(...topServices.value.map(s => s.count), 1)
})

const maxBarberRevenue = computed(() => {
  if (topBarbers.value.length === 0) return 1
  return Math.max(...topBarbers.value.map(b => b.revenue), 1)
})

const maxStatusCount = computed(() => {
  if (bookingsByStatus.value.length === 0) return 1
  return Math.max(...bookingsByStatus.value.map(s => s.count), 1)
})

const statusColors: Record<string, string> = {
  pending: 'bg-[var(--color-warning)]',
  pending_payment: 'bg-[var(--color-warning)]',
  confirmed: 'bg-[var(--color-success)]',
  in_progress: 'bg-[var(--color-info)]',
  completed: 'bg-[var(--color-success)]',
  cancelled: 'bg-[var(--color-danger)]',
  no_show: 'bg-[var(--color-titanium)]',
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending',
    pending_payment: 'Pending Payment',
    confirmed: 'Confirmed',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
  }
  return labels[status] || status
}

// ─── Transaction pagination ────────────────────────
const totalTxPages = computed(() => Math.ceil(transactions.value.length / txPerPage))
const paginatedTransactions = computed(() => {
  const start = (txPage.value - 1) * txPerPage
  return transactions.value.slice(start, start + txPerPage)
})

// ─── CSV Export ────────────────────────────────────
function exportCSV() {
  if (transactions.value.length === 0) {
    toast.error('No data to export')
    return
  }

  const headers = ['Date', 'Booking Ref', 'Customer', 'Service', 'Barber', 'Amount', 'Payment Method', 'Status']
  const rows = transactions.value.map(t => [
    t.date,
    t.booking_ref,
    t.customer_name,
    t.service_name,
    t.barber_name,
    t.amount,
    t.payment_method,
    t.status,
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `report_${filterDateFrom.value}_to_${filterDateTo.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
  toast.success('CSV exported successfully')
}

// ─── Lifecycle ─────────────────────────────────────
onMounted(() => {
  fetchReports()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-deep)]">Reports</h1>
      <p class="text-sm text-[var(--color-titanium)]">Financial overview and analytics</p>
    </div>

    <!-- Date Range Picker -->
    <div class="card-design p-4">
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">From</label>
          <input
            v-model="filterDateFrom"
            type="date"
            class="rounded-input border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">To</label>
          <input
            v-model="filterDateTo"
            type="date"
            class="rounded-input border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>
        <button
          class="btn-design rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white"
          @click="fetchReports"
        >
          Apply
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="card-design p-5">
          <div class="h-4 w-24 animate-pulse rounded bg-[var(--color-silver)]/10" />
          <div class="mt-2 h-8 w-20 animate-pulse rounded bg-[var(--color-silver)]/10" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <ErrorState
      v-else-if="hasError"
      title="Failed to Load Reports"
      message="Something went wrong while fetching report data."
      :retry-fn="fetchReports"
    />

    <template v-else>
      <!-- ═══ Stat Cards ═══ -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardStatCard
          label="Total Revenue"
          :value="formatPrice(stats.totalRevenue)"
          icon="lucide:banknote"
          color="success"
        />
        <DashboardStatCard
          label="Total Bookings"
          :value="stats.totalBookings"
          icon="lucide:calendar-check"
          color="info"
        />
        <DashboardStatCard
          label="Avg Booking Value"
          :value="formatPrice(stats.avgBookingValue)"
          icon="lucide:trending-up"
          color="default"
        />
        <DashboardStatCard
          label="Completion Rate"
          :value="`${stats.completionRate}%`"
          icon="lucide:check-circle"
          color="success"
        />
      </div>

      <!-- ═══ Charts ═══ -->
      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Revenue Over Time (Bar Chart) -->
        <div class="card-design p-5">
          <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">
            <Icon name="lucide:bar-chart-3" class="mr-1.5 inline h-4 w-4" />
            Revenue Over Time
          </h3>
          <div v-if="revenueOverTime.length === 0" class="py-8 text-center text-xs text-[var(--color-titanium)]">
            No revenue data for this period
          </div>
          <div v-else class="flex items-end gap-[2px]" style="height: 180px;">
            <div
              v-for="(item, idx) in revenueOverTime"
              :key="idx"
              class="group relative flex-1 min-w-[4px] rounded-t-sm bg-[var(--color-success)]/70 transition-colors hover:bg-[var(--color-success)]"
              :style="{ height: `${Math.max((item.amount / maxRevenue) * 100, 2)}%` }"
            >
              <!-- Tooltip -->
              <div class="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-[var(--color-deep)] px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {{ formatDate(item.date) }}: {{ formatPrice(item.amount) }}
              </div>
            </div>
          </div>
          <!-- X-axis labels -->
          <div v-if="revenueOverTime.length > 0" class="mt-1 flex gap-[2px]">
            <div
              v-for="(item, idx) in revenueOverTime"
              :key="idx"
              class="flex-1 min-w-[4px] text-center text-[8px] text-[var(--color-titanium)]"
            >
              <span v-if="idx % Math.max(Math.ceil(revenueOverTime.length / 7), 1) === 0">
                {{ formatDate(item.date) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Bookings by Status (Horizontal Bar) -->
        <div class="card-design p-5">
          <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">
            <Icon name="lucide:pie-chart" class="mr-1.5 inline h-4 w-4" />
            Bookings by Status
          </h3>
          <div v-if="bookingsByStatus.length === 0" class="py-8 text-center text-xs text-[var(--color-titanium)]">
            No booking data
          </div>
          <div v-else class="space-y-3">
            <div v-for="item in bookingsByStatus" :key="item.status">
              <div class="mb-1 flex items-center justify-between text-xs">
                <span class="font-medium text-[var(--color-deep)]">{{ statusLabel(item.status) }}</span>
                <span class="text-[var(--color-titanium)]">{{ item.count }}</span>
              </div>
              <div class="h-5 w-full rounded-full bg-[var(--color-silver)]/10">
                <div
                  class="h-5 rounded-full transition-all"
                  :class="statusColors[item.status] || 'bg-[var(--color-deep)]'"
                  :style="{ width: `${(item.count / maxStatusCount) * 100}%`, minWidth: item.count > 0 ? '8px' : '0' }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Top Services (Horizontal Bar) -->
        <div class="card-design p-5">
          <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">
            <Icon name="lucide:scissors" class="mr-1.5 inline h-4 w-4" />
            Top Services by Bookings
          </h3>
          <div v-if="topServices.length === 0" class="py-8 text-center text-xs text-[var(--color-titanium)]">
            No service data
          </div>
          <div v-else class="space-y-3">
            <div v-for="item in topServices" :key="item.name">
              <div class="mb-1 flex items-center justify-between text-xs">
                <span class="font-medium text-[var(--color-deep)]">{{ item.name }}</span>
                <span class="text-[var(--color-titanium)]">{{ item.count }} booking{{ item.count !== 1 ? 's' : '' }}</span>
              </div>
              <div class="h-5 w-full rounded-full bg-[var(--color-silver)]/10">
                <div
                  class="h-5 rounded-full bg-[var(--color-info)] transition-all"
                  :style="{ width: `${(item.count / maxServiceCount) * 100}%`, minWidth: item.count > 0 ? '8px' : '0' }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Top Barbers by Revenue (Horizontal Bar) -->
        <div class="card-design p-5">
          <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">
            <Icon name="lucide:users" class="mr-1.5 inline h-4 w-4" />
            Top Barbers by Revenue
          </h3>
          <div v-if="topBarbers.length === 0" class="py-8 text-center text-xs text-[var(--color-titanium)]">
            No barber data
          </div>
          <div v-else class="space-y-3">
            <div v-for="item in topBarbers" :key="item.name">
              <div class="mb-1 flex items-center justify-between text-xs">
                <span class="font-medium text-[var(--color-deep)]">{{ item.name }}</span>
                <span class="text-[var(--color-titanium)]">{{ formatPrice(item.revenue) }}</span>
              </div>
              <div class="h-5 w-full rounded-full bg-[var(--color-silver)]/10">
                <div
                  class="h-5 rounded-full bg-[var(--color-deep)] transition-all"
                  :style="{ width: `${(item.revenue / maxBarberRevenue) * 100}%`, minWidth: item.revenue > 0 ? '8px' : '0' }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Recent Transactions Table ═══ -->
      <div class="card-design overflow-hidden">
        <div class="flex items-center justify-between border-b border-[var(--color-silver)]/30 px-4 py-3">
          <h3 class="text-sm font-semibold text-[var(--color-deep)]">Recent Transactions</h3>
          <button
            class="btn-design flex items-center gap-1.5 rounded-btn bg-[var(--color-deep)] px-3 py-1.5 text-xs font-medium text-white"
            @click="exportCSV"
          >
            <Icon name="lucide:download" class="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

        <div v-if="transactions.length === 0" class="py-12 text-center">
          <Icon name="lucide:receipt" class="mx-auto h-10 w-10 text-[var(--color-silver)]" />
          <p class="mt-2 text-sm text-[var(--color-titanium)]">No transactions in this period</p>
        </div>

        <template v-else>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
                  <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Date</th>
                  <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Booking Ref</th>
                  <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Customer</th>
                  <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Service</th>
                  <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Barber</th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-titanium)]">Amount</th>
                  <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Payment Method</th>
                  <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="tx in paginatedTransactions"
                  :key="tx.id"
                  class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
                >
                  <td class="px-4 py-3 text-[var(--color-deep)]">{{ formatDateShort(tx.date) }}</td>
                  <td class="px-4 py-3 font-mono text-xs font-bold text-[var(--color-deep)]">{{ tx.booking_ref }}</td>
                  <td class="px-4 py-3 text-[var(--color-deep)]">{{ tx.customer_name }}</td>
                  <td class="px-4 py-3 text-[var(--color-deep)]">{{ tx.service_name }}</td>
                  <td class="px-4 py-3 text-[var(--color-deep)]">{{ tx.barber_name }}</td>
                  <td class="px-4 py-3 text-right font-medium text-[var(--color-deep)]">{{ formatPrice(tx.amount) }}</td>
                  <td class="px-4 py-3 text-[var(--color-titanium)]">{{ tx.payment_method }}</td>
                  <td class="px-4 py-3 text-center">
                    <StatusBadge :status="tx.status" size="sm" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div v-if="totalTxPages > 1" class="flex items-center justify-between border-t border-[var(--color-silver)]/30 px-4 py-3">
            <p class="text-xs text-[var(--color-titanium)]">
              Showing {{ (txPage - 1) * txPerPage + 1 }}-{{ Math.min(txPage * txPerPage, transactions.length) }} of {{ transactions.length }}
            </p>
            <div class="flex gap-2">
              <button
                class="rounded-btn border border-[var(--color-silver)]/50 px-3 py-1 text-xs text-[var(--color-titanium)] disabled:opacity-50"
                :disabled="txPage <= 1"
                @click="txPage--"
              >
                Previous
              </button>
              <button
                class="rounded-btn border border-[var(--color-silver)]/50 px-3 py-1 text-xs text-[var(--color-titanium)] disabled:opacity-50"
                :disabled="txPage >= totalTxPages"
                @click="txPage++"
              >
                Next
              </button>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
