<script setup lang="ts">
/**
 * /super-admin/analytics — Platform Analytics
 *
 * Shows platform-wide analytics including:
 * - Key metrics summary (bookings, revenue, avg bookings/shop, conversion rate)
 * - Charts: Bookings over time, Revenue over time, Top shops by bookings/revenue, Plan growth
 * - Date range picker (default: last 30 days)
 *
 * Super admin only access.
 */

definePageMeta({
  layout: 'super-admin',
  middleware: 'super-admin',
})

import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const toast = useToast()

// ─── Date Range ────────────────────────────────────
const dateFrom = ref('')
const dateTo = ref('')

function getDefaultDates() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

const defaults = getDefaultDates()
dateFrom.value = defaults.from
dateTo.value = defaults.to

// ─── State ─────────────────────────────────────────
const isLoading = ref(true)
const metrics = ref({
  totalBookings: 0,
  totalRevenue: 0,
  avgBookingsPerShop: 0,
  conversionRate: 0,
})

// Chart data
const bookingsOverTime = ref<{ labels: string[], data: number[] }>({ labels: [], data: [] })
const revenueOverTime = ref<{ labels: string[], data: number[] }>({ labels: [], data: [] })
const topShopsByBookings = ref<{ labels: string[], data: number[] }>({ labels: [], data: [] })
const topShopsByRevenue = ref<{ labels: string[], data: number[] }>({ labels: [], data: [] })
const planGrowth = ref<{ labels: string[], basic: number[], upgraded: number[] }>({ labels: [], basic: [], upgraded: [] })

// ─── Get Auth Token ────────────────────────────────
async function getAuthToken(): Promise<string | null> {
  const supabase = useSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

// ─── Fetch Analytics ───────────────────────────────
async function fetchAnalytics() {
  isLoading.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    const data = await $fetch('/api/super-admin/analytics', {
      params: {
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
      },
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    // Process metrics
    metrics.value = {
      totalBookings: data.keyMetrics?.totalBookings ?? 0,
      totalRevenue: data.keyMetrics?.totalRevenue ?? 0,
      avgBookingsPerShop: data.keyMetrics?.avgBookingsPerShop ?? 0,
      conversionRate: data.keyMetrics?.conversionRate ?? 0,
    }

    // Process chart data — API returns raw arrays, we need { labels, data } format
    if (data.bookingsOverTime) {
      bookingsOverTime.value = {
        labels: data.bookingsOverTime.map((r: any) => {
          const d = new Date(r.date)
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }),
        data: data.bookingsOverTime.map((r: any) => r.count ?? 0),
      }
    }
    if (data.revenueOverTime) {
      revenueOverTime.value = {
        labels: data.revenueOverTime.map((r: any) => {
          const d = new Date(r.date)
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }),
        data: data.revenueOverTime.map((r: any) => r.total ?? 0),
      }
    }
    if (data.topShopsByBookings) {
      topShopsByBookings.value = {
        labels: data.topShopsByBookings.map((r: any) => r.shopName ?? 'Unknown'),
        data: data.topShopsByBookings.map((r: any) => r.bookingCount ?? 0),
      }
    }
    if (data.topShopsByRevenue) {
      topShopsByRevenue.value = {
        labels: data.topShopsByRevenue.map((r: any) => r.shopName ?? 'Unknown'),
        data: data.topShopsByRevenue.map((r: any) => r.revenue ?? 0),
      }
    }
    if (data.planGrowthOverTime) {
      planGrowth.value = {
        labels: data.planGrowthOverTime.map((r: any) => {
          const [y, m] = (r.month ?? '').split('-')
          return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        }),
        basic: data.planGrowthOverTime.map((r: any) => r.basicCount ?? 0),
        upgraded: data.planGrowthOverTime.map((r: any) => r.upgradedCount ?? 0),
      }
    }
  } catch (error: any) {
    toast.error('Failed to load analytics')
    console.error('Error fetching analytics:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Chart Options ─────────────────────────────────
const lineChartOptions = (yLabel: string) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1D1D1F',
      titleColor: '#fff',
      bodyColor: '#fff',
      padding: 12,
      cornerRadius: 8,
      displayColors: false,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#8A8A8F', font: { size: 11 } },
    },
    y: {
      grid: { color: 'rgba(199, 199, 204, 0.2)' },
      ticks: { color: '#8A8A8F', font: { size: 11 } },
      title: { display: true, text: yLabel, color: '#8A8A8F', font: { size: 12 } },
    },
  },
})

const barChartOptions = (xLabel: string) => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y' as const,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1D1D1F',
      titleColor: '#fff',
      bodyColor: '#fff',
      padding: 12,
      cornerRadius: 8,
      displayColors: false,
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(199, 199, 204, 0.2)' },
      ticks: { color: '#8A8A8F', font: { size: 11 } },
      title: { display: true, text: xLabel, color: '#8A8A8F', font: { size: 12 } },
    },
    y: {
      grid: { display: false },
      ticks: { color: '#1D1D1F', font: { size: 11 } },
    },
  },
})

const planGrowthOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      labels: { color: '#1D1D1F', font: { size: 12 }, usePointStyle: true, pointStyle: 'circle' },
    },
    tooltip: {
      backgroundColor: '#1D1D1F',
      titleColor: '#fff',
      bodyColor: '#fff',
      padding: 12,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#8A8A8F', font: { size: 11 } },
    },
    y: {
      grid: { color: 'rgba(199, 199, 204, 0.2)' },
      ticks: { color: '#8A8A8F', font: { size: 11 } },
      title: { display: true, text: 'Shop Count', color: '#8A8A8F', font: { size: 12 } },
    },
  },
}

// ─── Chart Computed Data ───────────────────────────
const bookingsChartData = computed(() => ({
  labels: bookingsOverTime.value.labels,
  datasets: [
    {
      label: 'Bookings',
      data: bookingsOverTime.value.data,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
    },
  ],
}))

const revenueChartData = computed(() => ({
  labels: revenueOverTime.value.labels,
  datasets: [
    {
      label: 'Revenue (₱)',
      data: revenueOverTime.value.data,
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
    },
  ],
}))

const topBookingsChartData = computed(() => ({
  labels: topShopsByBookings.value.labels,
  datasets: [
    {
      label: 'Bookings',
      data: topShopsByBookings.value.data,
      backgroundColor: '#3b82f6',
      borderRadius: 4,
    },
  ],
}))

const topRevenueChartData = computed(() => ({
  labels: topShopsByRevenue.value.labels,
  datasets: [
    {
      label: 'Revenue (₱)',
      data: topShopsByRevenue.value.data,
      backgroundColor: '#22c55e',
      borderRadius: 4,
    },
  ],
}))

const planGrowthChartData = computed(() => ({
  labels: planGrowth.value.labels,
  datasets: [
    {
      label: 'Basic',
      data: planGrowth.value.basic,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
    },
    {
      label: 'Upgraded',
      data: planGrowth.value.upgraded,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.15)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
    },
  ],
}))

// ─── Helpers ───────────────────────────────────────
function formatPrice(price: number): string {
  return `₱${Number(price).toLocaleString()}`
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function applyDateRange() {
  fetchAnalytics()
}

onMounted(() => {
  fetchAnalytics()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Platform Analytics</h1>
        <p class="text-sm text-[var(--color-titanium)]">Platform-wide insights and metrics</p>
      </div>
    </div>

    <!-- Date Range Picker -->
    <div class="card-design p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="flex-1">
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">From</label>
          <input
            v-model="dateFrom"
            type="date"
            class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>
        <div class="flex-1">
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">To</label>
          <input
            v-model="dateTo"
            type="date"
            class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>
        <button
          class="btn-design rounded-btn bg-[var(--color-deep)] px-6 py-2 text-sm font-medium text-white hover:opacity-90"
          :disabled="isLoading"
          @click="applyDateRange"
        >
          <Icon v-if="isLoading" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
          Apply
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="card-design p-5">
          <div class="h-20 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
        </div>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div v-for="n in 4" :key="n" class="card-design p-5">
          <div class="h-64 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
        </div>
      </div>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Key Metrics Summary -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardStatCard
          label="Total Platform Bookings"
          :value="metrics.totalBookings.toLocaleString()"
          icon="lucide:calendar-check"
          color="info"
        />
        <DashboardStatCard
          label="Total Platform Revenue"
          :value="formatPrice(metrics.totalRevenue)"
          icon="lucide:banknote"
          color="success"
        />
        <DashboardStatCard
          label="Avg Bookings per Shop"
          :value="metrics.avgBookingsPerShop.toFixed(1)"
          icon="lucide:chart-bar"
          color="default"
        />
        <DashboardStatCard
          label="Conversion Rate"
          :value="formatPercent(metrics.conversionRate)"
          icon="lucide:trending-up"
          color="warning"
        />
      </div>

      <!-- Charts Grid -->
      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Total Bookings Over Time -->
        <div class="card-design p-5">
          <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">Total Bookings Over Time</h3>
          <div class="h-64">
            <Line
              v-if="bookingsOverTime.labels.length > 0"
              :data="bookingsChartData"
              :options="lineChartOptions('Bookings')"
            />
            <div v-else class="flex h-full items-center justify-center">
              <p class="text-sm text-[var(--color-titanium)]">No booking data available</p>
            </div>
          </div>
        </div>

        <!-- Revenue Over Time -->
        <div class="card-design p-5">
          <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">Revenue Over Time</h3>
          <div class="h-64">
            <Line
              v-if="revenueOverTime.labels.length > 0"
              :data="revenueChartData"
              :options="lineChartOptions('Revenue (₱)')"
            />
            <div v-else class="flex h-full items-center justify-center">
              <p class="text-sm text-[var(--color-titanium)]">No revenue data available</p>
            </div>
          </div>
        </div>

        <!-- Top 10 Shops by Bookings -->
        <div class="card-design p-5">
          <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">Top 10 Shops by Bookings</h3>
          <div class="h-72">
            <Bar
              v-if="topShopsByBookings.labels.length > 0"
              :data="topBookingsChartData"
              :options="barChartOptions('Bookings')"
            />
            <div v-else class="flex h-full items-center justify-center">
              <p class="text-sm text-[var(--color-titanium)]">No shop data available</p>
            </div>
          </div>
        </div>

        <!-- Top 10 Shops by Revenue -->
        <div class="card-design p-5">
          <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">Top 10 Shops by Revenue</h3>
          <div class="h-72">
            <Bar
              v-if="topShopsByRevenue.labels.length > 0"
              :data="topRevenueChartData"
              :options="barChartOptions('Revenue (₱)')"
            />
            <div v-else class="flex h-full items-center justify-center">
              <p class="text-sm text-[var(--color-titanium)]">No shop data available</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Plan Growth Over Time (full width) -->
      <div class="card-design p-5">
        <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">Plan Growth Over Time</h3>
        <div class="h-72">
          <Line
            v-if="planGrowth.labels.length > 0"
            :data="planGrowthChartData"
            :options="planGrowthOptions"
          />
          <div v-else class="flex h-full items-center justify-center">
            <p class="text-sm text-[var(--color-titanium)]">No plan data available</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
