<script setup lang="ts">
/**
 * /admin/logs — Activity Logs page
 *
 * Features:
 * - Header with retention notice (Basic: 7 days, Upgraded: 90 days)
 * - Filters: date range, user dropdown, action type, Apply/Reset
 * - Table: Time | User | Role | Action | Entity | Details
 * - Action badges colored by type
 * - Details column shows old → new value if available
 * - Pagination: 20 per page
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
const logs = ref<any[]>([])
const totalLogs = ref(0)
const page = ref(1)
const perPage = 20
const retention = ref({ maxLookbackDays: 7, plan: 'basic', cutoffDate: '', enforcedDateFrom: '' })

// Filters
const filterDateFrom = ref('')
const filterDateTo = ref('')
const filterUserId = ref('')
const filterAction = ref('')

// Users for filter
const users = ref<{ id: string; display_name: string }[]>([])

// Action type options
const actionOptions = [
  { value: '', label: 'All Actions' },
  { value: 'booking', label: 'Bookings' },
  { value: 'payment', label: 'Payments' },
  { value: 'service', label: 'Services' },
  { value: 'staff', label: 'Staff' },
  { value: 'loyalty', label: 'Loyalty' },
  { value: 'shop', label: 'Shop Settings' },
  { value: 'auth', label: 'Authentication' },
]

// ─── Retention notice ──────────────────────────────
const retentionNotice = computed(() => {
  if (shopStore.isUpgradedPlan) {
    return 'Showing last 90 days'
  }
  return 'Showing last 7 days'
})

// ─── Action badge colors ───────────────────────────
function actionBadgeClass(action: string): string {
  if (action.startsWith('booking.')) return 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
  if (action.startsWith('payment.verified') || action.startsWith('payment.approved')) return 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
  if (action.startsWith('payment.rejected')) return 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
  if (action.startsWith('service.deleted')) return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
  if (action.startsWith('staff.')) return 'bg-purple-100 text-purple-700'
  if (action.startsWith('loyalty.')) return 'bg-amber-100 text-amber-700'
  if (action.startsWith('shop.')) return 'bg-[var(--color-deep)]/10 text-[var(--color-deep)]'
  if (action.startsWith('auth.')) return 'bg-cyan-100 text-cyan-700'
  return 'bg-[var(--color-silver)]/20 text-[var(--color-titanium)]'
}

// ─── Fetch Logs ────────────────────────────────────
async function fetchLogs() {
  isLoading.value = true
  hasError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token || !authStore.shopId) return

    const params = new URLSearchParams({
      page: page.value.toString(),
      limit: perPage.toString(),
    })
    if (filterDateFrom.value) params.set('dateFrom', filterDateFrom.value)
    if (filterDateTo.value) params.set('dateTo', filterDateTo.value)
    if (filterUserId.value) params.set('userId', filterUserId.value)
    if (filterAction.value) params.set('action', filterAction.value)

    const result = await $fetch(`/api/admin/logs?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    logs.value = result.logs || []
    totalLogs.value = result.pagination?.total || 0
    retention.value = result.retention || { maxLookbackDays: 7, plan: 'basic', cutoffDate: '', enforcedDateFrom: '' }
  } catch (error: any) {
    hasError.value = true
    toast.error('Failed to load activity logs')
  } finally {
    isLoading.value = false
  }
}

// ─── Fetch Users for Filter ────────────────────────
async function fetchUsers() {
  try {
    const supabase = useSupabase()
    const shopId = authStore.shopId
    if (!shopId) return

    const { data: staffData } = await supabase
      .from('users')
      .select('id, display_name, role')
      .eq('shop_id', shopId)
      .in('role', ['admin', 'manager', 'cashier', 'barber'])
      .order('display_name')

    if (staffData) {
      users.value = staffData.map(u => ({ id: u.id, display_name: u.display_name }))
    }
  } catch (error) {
    // Silently fail
  }
}

// ─── Helpers ───────────────────────────────────────
function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatRole(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Admin',
    manager: 'Manager',
    cashier: 'Cashier',
    barber: 'Barber',
    customer: 'Customer',
    super_admin: 'Super Admin',
  }
  return labels[role] || role
}

function formatAction(action: string): string {
  return action
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).replace(/_/g, ' '))
    .join(' → ')
}

function formatEntity(log: any): string {
  if (!log.entity_type && !log.entity_name) return '—'
  const parts: string[] = []
  if (log.entity_type) parts.push(log.entity_type)
  if (log.entity_name) parts.push(log.entity_name)
  return parts.join(': ')
}

function formatDetails(log: any): string {
  if (!log.old_value && !log.new_value) return ''
  const parts: string[] = []
  if (log.old_value) {
    const oldStr = typeof log.old_value === 'object' ? JSON.stringify(log.old_value) : String(log.old_value)
    parts.push(`From: ${oldStr}`)
  }
  if (log.new_value) {
    const newStr = typeof log.new_value === 'object' ? JSON.stringify(log.new_value) : String(log.new_value)
    parts.push(`To: ${newStr}`)
  }
  return parts.join(' → ')
}

const totalPages = computed(() => Math.ceil(totalLogs.value / perPage))

function applyFilters() {
  page.value = 1
  fetchLogs()
}

function resetFilters() {
  filterDateFrom.value = ''
  filterDateTo.value = ''
  filterUserId.value = ''
  filterAction.value = ''
  page.value = 1
  fetchLogs()
}

// ─── Lifecycle ─────────────────────────────────────
onMounted(() => {
  fetchLogs()
  fetchUsers()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Activity Logs</h1>
        <p class="text-sm text-[var(--color-titanium)]">
          {{ totalLogs }} log{{ totalLogs !== 1 ? 's' : '' }} found
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Icon name="lucide:info" class="h-4 w-4 text-[var(--color-info)]" />
        <span
          class="badge-pill text-xs"
          :class="
            shopStore.isUpgradedPlan
              ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
              : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
          "
        >
          {{ retentionNotice }}
        </span>
      </div>
    </div>

    <!-- Filters -->
    <div class="card-design p-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <!-- Date From -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">From</label>
          <input
            v-model="filterDateFrom"
            type="date"
            class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>
        <!-- Date To -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">To</label>
          <input
            v-model="filterDateTo"
            type="date"
            class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>
        <!-- User -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">User</label>
          <select
            v-model="filterUserId"
            class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          >
            <option value="">All Users</option>
            <option v-for="u in users" :key="u.id" :value="u.id">{{ u.display_name }}</option>
          </select>
        </div>
        <!-- Action -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Action</label>
          <select
            v-model="filterAction"
            class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          >
            <option v-for="opt in actionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <!-- Actions -->
        <div class="flex items-end gap-2 lg:col-span-2">
          <button
            class="btn-design flex-1 rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white"
            @click="applyFilters"
          >
            Apply
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
        <div class="h-10 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="hasError"
      title="Failed to Load Logs"
      message="Something went wrong while fetching activity logs."
      :retry-fn="fetchLogs"
    />

    <!-- Empty -->
    <EmptyState
      v-else-if="logs.length === 0"
      icon="lucide:scroll-text"
      title="No Activity Logs"
      message="No logs match your current filters, or no activity has been recorded yet."
    />

    <!-- Logs Table -->
    <div v-else class="card-design overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Time</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">User</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Role</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Action</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Entity</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Details</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="log in logs"
              :key="log.id"
              class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
            >
              <!-- Time -->
              <td class="px-4 py-3 whitespace-nowrap text-xs text-[var(--color-titanium)]">
                {{ formatDateTime(log.created_at) }}
              </td>
              <!-- User -->
              <td class="px-4 py-3">
                <span class="text-sm font-medium text-[var(--color-deep)]">{{ log.user_email || 'System' }}</span>
              </td>
              <!-- Role -->
              <td class="px-4 py-3">
                <span class="badge-pill bg-[var(--color-silver)]/20 text-xs text-[var(--color-titanium)]">
                  {{ formatRole(log.user_role) }}
                </span>
              </td>
              <!-- Action -->
              <td class="px-4 py-3">
                <span class="badge-pill text-xs font-medium" :class="actionBadgeClass(log.action)">
                  {{ formatAction(log.action) }}
                </span>
              </td>
              <!-- Entity -->
              <td class="px-4 py-3 text-sm text-[var(--color-deep)]">
                {{ formatEntity(log) }}
              </td>
              <!-- Details -->
              <td class="px-4 py-3 text-xs text-[var(--color-titanium)]">
                <template v-if="log.old_value || log.new_value">
                  <div v-if="log.old_value" class="flex items-center gap-1">
                    <Icon name="lucide:arrow-right" class="h-3 w-3 text-[var(--color-danger)]" />
                    <span class="max-w-[200px] truncate">{{ formatDetails(log) }}</span>
                  </div>
                </template>
                <span v-else class="text-[var(--color-silver)]">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-between border-t border-[var(--color-silver)]/30 px-4 py-3">
        <p class="text-xs text-[var(--color-titanium)]">
          Showing {{ (page - 1) * perPage + 1 }}-{{ Math.min(page * perPage, totalLogs) }} of {{ totalLogs }}
        </p>
        <div class="flex gap-2">
          <button
            class="rounded-btn border border-[var(--color-silver)]/50 px-3 py-1 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page <= 1"
            @click="page--; fetchLogs()"
          >
            Previous
          </button>
          <button
            class="rounded-btn border border-[var(--color-silver)]/50 px-3 py-1 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page >= totalPages"
            @click="page++; fetchLogs()"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
