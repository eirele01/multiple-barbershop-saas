<script setup lang="ts">
/**
 * Super Admin Dashboard — Platform overview page
 * Shows: Total/Active shops, plan distribution, MRR,
 * New Shop Registrations bar chart, Plan Distribution donut chart,
 * Recent Shop Registrations table, Recent Plan Upgrades table
 */
definePageMeta({
  layout: 'super-admin',
  middleware: 'super-admin',
})

import { Bar, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

const authStore = useAuthStore()

// ─── Reactive data ──────────────────────────────────────
const isLoading = ref(true)
const totalShops = ref(0)
const activeShops = ref(0)
const basicPlanCount = ref(0)
const upgradedPlanCount = ref(0)
const mrr = ref(0)

// Chart data
const registrationLabels = ref<string[]>([])
const registrationData = ref<number[]>([])
const planDistributionData = ref<number[]>([0, 0])

// Tables
const recentShops = ref<any[]>([])
const recentUpgrades = ref<any[]>([])

// ─── Format helpers ──────────────────────────────────────
function formatCurrency(value: number): string {
  return '₱' + value.toLocaleString()
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Fetch dashboard data ────────────────────────────────
async function fetchDashboardData() {
  isLoading.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    if (!token) return

    const d = await $fetch('/api/super-admin/dashboard', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }) as any

    if (d) {
      totalShops.value = d.totalShops ?? 0
      activeShops.value = d.activeShops ?? 0
      basicPlanCount.value = d.basicCount ?? 0
      upgradedPlanCount.value = d.upgradedCount ?? 0
      mrr.value = d.mrr ?? 0

      // Registration chart data — API returns registrationsByDay array
      const regByDay = d.registrationsByDay ?? []
      registrationLabels.value = regByDay.map((r: any) => {
        const date = new Date(r.date)
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      })
      registrationData.value = regByDay.map((r: any) => r.count ?? 0)

      // Plan distribution chart data
      planDistributionData.value = [d.basicCount ?? 0, d.upgradedCount ?? 0]

      // Tables — API uses camelCase keys
      recentShops.value = (d.recentRegistrations ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        owner_email: s.ownerEmail,
        plan: s.plan,
        created_at: s.createdAt,
        plan_status: s.isActive ? 'active' : 'inactive',
      }))
      recentUpgrades.value = (d.recentUpgrades ?? []).map((u: any) => ({
        id: u.id,
        shop_name: u.shopName,
        old_plan: u.oldPlan,
        new_plan: u.newPlan,
        upgraded_at: u.createdAt,
      }))
    }
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchDashboardData()
})

// ─── Chart options ──────────────────────────────────────
const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: { display: false },
    tooltip: {
      backgroundColor: '#1D1D1F',
      titleColor: '#FFFFFF',
      bodyColor: '#FFFFFF',
      cornerRadius: 8,
      padding: 12,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: '#8A8A8F',
        font: { size: 11 },
        maxRotation: 45,
      },
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(199, 199, 204, 0.3)' },
      ticks: {
        color: '#8A8A8F',
        font: { size: 11 },
        stepSize: 1,
      },
    },
  },
}

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        padding: 20,
        usePointStyle: true,
        pointStyle: 'circle',
        color: '#8A8A8F',
        font: { size: 12 },
      },
    },
    tooltip: {
      backgroundColor: '#1D1D1F',
      titleColor: '#FFFFFF',
      bodyColor: '#FFFFFF',
      cornerRadius: 8,
      padding: 12,
    },
  },
  cutout: '65%',
}

const barChartData = computed(() => ({
  labels: registrationLabels.value,
  datasets: [
    {
      label: 'New Shops',
      data: registrationData.value,
      backgroundColor: 'rgba(10, 132, 255, 0.8)',
      borderColor: 'rgba(10, 132, 255, 1)',
      borderWidth: 1,
      borderRadius: 4,
      maxBarThickness: 24,
    },
  ],
}))

const doughnutChartData = computed(() => ({
  labels: ['Basic', 'Upgraded'],
  datasets: [
    {
      data: planDistributionData.value,
      backgroundColor: ['rgba(255, 159, 10, 0.8)', 'rgba(10, 132, 255, 0.8)'],
      borderColor: ['rgba(255, 159, 10, 1)', 'rgba(10, 132, 255, 1)'],
      borderWidth: 2,
      hoverOffset: 8,
    },
  ],
}))
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-8">
      <h2 class="text-[var(--color-deep)]">
        Platform Dashboard
      </h2>
      <p class="text-sm text-[var(--color-titanium)]">
        Overview of all shops, subscriptions, and platform activity.
      </p>
    </div>

    <!-- Stats Cards Row -->
    <div class="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <!-- Loading skeletons -->
      <template v-if="isLoading">
        <div v-for="i in 5" :key="i" class="card-design p-5">
          <div class="animate-pulse">
            <div class="h-4 w-20 rounded bg-[var(--color-silver)]/30" />
            <div class="mt-3 h-8 w-16 rounded bg-[var(--color-silver)]/30" />
          </div>
        </div>
      </template>

      <!-- Actual cards -->
      <template v-else>
        <DashboardStatCard
          label="Total Shops"
          :value="totalShops"
          icon="lucide:store"
          color="default"
        />
        <DashboardStatCard
          label="Active Shops"
          :value="activeShops"
          icon="lucide:store"
          color="success"
        />
        <DashboardStatCard
          label="Basic Plan"
          :value="basicPlanCount"
          icon="lucide:package"
          color="warning"
        />
        <DashboardStatCard
          label="Upgraded Plan"
          :value="upgradedPlanCount"
          icon="lucide:crown"
          color="info"
        />
        <DashboardStatCard
          label="MRR"
          :value="formatCurrency(mrr)"
          icon="lucide:banknote"
          color="success"
        />
      </template>
    </div>

    <!-- Charts Section -->
    <div class="mb-8 grid gap-6 lg:grid-cols-2">
      <!-- Bar Chart: New Shop Registrations -->
      <div class="card-design p-6">
        <h3 class="mb-4 text-[var(--color-deep)]">New Shop Registrations</h3>
        <div v-if="isLoading" class="flex h-64 items-center justify-center">
          <div class="animate-pulse h-full w-full rounded bg-[var(--color-silver)]/20" />
        </div>
        <div v-else class="h-64">
          <Bar v-if="registrationLabels.length > 0" :data="barChartData" :options="barChartOptions" />
          <div v-else class="flex h-full items-center justify-center">
            <div class="text-center">
              <Icon name="lucide:bar-chart-3" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
              <p class="mt-3 text-sm text-[var(--color-titanium)]">No registration data yet.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Donut Chart: Plan Distribution -->
      <div class="card-design p-6">
        <h3 class="mb-4 text-[var(--color-deep)]">Plan Distribution</h3>
        <div v-if="isLoading" class="flex h-64 items-center justify-center">
          <div class="animate-pulse h-full w-full rounded bg-[var(--color-silver)]/20" />
        </div>
        <div v-else class="h-64">
          <Doughnut
            v-if="planDistributionData.some(v => v > 0)"
            :data="doughnutChartData"
            :options="doughnutChartOptions"
          />
          <div v-else class="flex h-full items-center justify-center">
            <div class="text-center">
              <Icon name="lucide:pie-chart" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
              <p class="mt-3 text-sm text-[var(--color-titanium)]">No plan data yet.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Section: Two columns -->
    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Recent Shop Registrations -->
      <div class="card-design p-6">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-[var(--color-deep)]">Recent Shop Registrations</h3>
          <NuxtLink
            to="/super-admin/shops"
            class="text-sm font-medium text-[var(--color-info)] hover:underline"
          >
            View All
          </NuxtLink>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="space-y-3">
          <div v-for="i in 5" :key="i" class="animate-pulse h-10 rounded bg-[var(--color-silver)]/20" />
        </div>

        <!-- Empty state -->
        <div v-else-if="recentShops.length === 0" class="py-12 text-center">
          <Icon name="lucide:store" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
          <p class="mt-3 text-sm text-[var(--color-titanium)]">No shops registered yet.</p>
        </div>

        <!-- Desktop Table -->
        <div v-else class="hidden md:block overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[var(--color-silver)]/30">
                <th class="pb-3 text-left font-medium text-[var(--color-titanium)]">Shop Name</th>
                <th class="pb-3 text-left font-medium text-[var(--color-titanium)]">Owner Email</th>
                <th class="pb-3 text-left font-medium text-[var(--color-titanium)]">Plan</th>
                <th class="pb-3 text-left font-medium text-[var(--color-titanium)]">Registered</th>
                <th class="pb-3 text-left font-medium text-[var(--color-titanium)]">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="shop in recentShops"
                :key="shop.id"
                class="border-b border-[var(--color-silver)]/20 last:border-0"
              >
                <td class="py-3">
                  <NuxtLink
                    :to="`/super-admin/shops/${shop.id}`"
                    class="font-medium text-[var(--color-deep)] hover:text-[var(--color-info)] hover:underline"
                  >
                    {{ shop.name }}
                  </NuxtLink>
                </td>
                <td class="py-3 text-[var(--color-titanium)]">{{ shop.owner_email || '—' }}</td>
                <td class="py-3">
                  <span
                    class="badge-pill text-[10px]"
                    :class="
                      shop.plan === 'upgraded'
                        ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                        : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                    "
                  >
                    {{ shop.plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
                  </span>
                </td>
                <td class="py-3 text-[var(--color-titanium)]">{{ formatDate(shop.created_at) }}</td>
                <td class="py-3">
                  <StatusBadge :status="shop.plan_status || 'active'" size="sm" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Card Layout -->
        <div class="md:hidden">
          <div
            v-for="shop in recentShops"
            :key="shop.id"
            class="border-b border-[var(--color-silver)]/20 py-3 last:border-0"
          >
            <div class="flex items-center justify-between">
              <NuxtLink
                :to="`/super-admin/shops/${shop.id}`"
                class="truncate font-medium text-[var(--color-deep)] hover:text-[var(--color-info)] hover:underline"
              >
                {{ shop.name }}
              </NuxtLink>
              <StatusBadge :status="shop.plan_status || 'active'" size="sm" />
            </div>
            <p class="truncate text-xs text-[var(--color-titanium)]">{{ shop.owner_email || '\u2014' }}</p>
            <div class="mt-1 flex items-center justify-between text-xs text-[var(--color-titanium)]">
              <span
                class="badge-pill text-[10px]"
                :class="
                  shop.plan === 'upgraded'
                    ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                    : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                "
              >
                {{ shop.plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
              </span>
              <span>{{ formatDate(shop.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Plan Upgrades -->
      <div class="card-design p-6">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-[var(--color-deep)]">Recent Plan Upgrades</h3>
          <NuxtLink
            to="/super-admin/subscriptions"
            class="text-sm font-medium text-[var(--color-info)] hover:underline"
          >
            View All
          </NuxtLink>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="space-y-3">
          <div v-for="i in 5" :key="i" class="animate-pulse h-10 rounded bg-[var(--color-silver)]/20" />
        </div>

        <!-- Empty state -->
        <div v-else-if="recentUpgrades.length === 0" class="py-12 text-center">
          <Icon name="lucide:arrow-up-circle" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
          <p class="mt-3 text-sm text-[var(--color-titanium)]">No plan upgrades yet.</p>
        </div>

        <!-- Desktop Table -->
        <div v-else class="hidden md:block overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[var(--color-silver)]/30">
                <th class="pb-3 text-left font-medium text-[var(--color-titanium)]">Shop Name</th>
                <th class="pb-3 text-left font-medium text-[var(--color-titanium)]">From</th>
                <th class="pb-3 text-left font-medium text-[var(--color-titanium)]">To</th>
                <th class="pb-3 text-left font-medium text-[var(--color-titanium)]">Date</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="upgrade in recentUpgrades"
                :key="upgrade.id"
                class="border-b border-[var(--color-silver)]/20 last:border-0"
              >
                <td class="py-3 font-medium text-[var(--color-deep)]">{{ upgrade.shop_name }}</td>
                <td class="py-3">
                  <span
                    class="badge-pill text-[10px]"
                    :class="
                      upgrade.old_plan === 'upgraded'
                        ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                        : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                    "
                  >
                    {{ upgrade.old_plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
                  </span>
                </td>
                <td class="py-3">
                  <span
                    class="badge-pill text-[10px]"
                    :class="
                      upgrade.new_plan === 'upgraded'
                        ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                        : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                    "
                  >
                    {{ upgrade.new_plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
                  </span>
                </td>
                <td class="py-3 text-[var(--color-titanium)]">{{ formatDate(upgrade.upgraded_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Card Layout -->
        <div class="md:hidden">
          <div
            v-for="upgrade in recentUpgrades"
            :key="upgrade.id"
            class="border-b border-[var(--color-silver)]/20 py-3 last:border-0"
          >
            <p class="truncate font-medium text-[var(--color-deep)]">{{ upgrade.shop_name }}</p>
            <div class="mt-1 flex items-center gap-2 text-xs text-[var(--color-titanium)]">
              <span
                class="badge-pill text-[10px]"
                :class="
                  upgrade.old_plan === 'upgraded'
                    ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                    : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                "
              >
                {{ upgrade.old_plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
              </span>
              <Icon name="lucide:arrow-right" class="h-3 w-3" />
              <span
                class="badge-pill text-[10px]"
                :class="
                  upgrade.new_plan === 'upgraded'
                    ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                    : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                "
              >
                {{ upgrade.new_plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
              </span>
              <span class="ml-auto">{{ formatDate(upgrade.upgraded_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
