<script setup lang="ts">
/**
 * /admin/loyalty/transactions — Admin Loyalty Transaction Log
 *
 * View all loyalty point transactions for this shop.
 * Filter by type and customer. Admin-only.
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const shopStore = useShopStore()
const toast = useToast()
const isUpgraded = computed(() => shopStore.isUpgradedPlan)

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const transactions = ref<any[]>([])
const totalTx = ref(0)
const page = ref(1)
const filterType = ref('')
const filterCustomerId = ref('')

// ─── Fetch Transactions ────────────────────────────
async function fetchTransactions() {
  isLoading.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const params: Record<string, any> = {
      page: page.value,
      limit: 20,
    }
    if (filterType.value) params.type = filterType.value
    if (filterCustomerId.value) params.customerId = filterCustomerId.value

    const response = await $fetch('/api/admin/loyalty/transactions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      params,
    }) as any

    transactions.value = response.transactions || []
    totalTx.value = response.total || 0
  } catch (error: any) {
    toast.error('Failed to load transactions')
    console.error('Error fetching transactions:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Helpers ───────────────────────────────────────
function formatTxType(type: string): string {
  const labels: Record<string, string> = {
    earned: 'Earned',
    redeemed: 'Redeemed',
    adjusted: 'Adjusted',
    expired: 'Expired',
    welcome_bonus: 'Welcome Bonus',
  }
  return labels[type] || type
}

function txColorClass(type: string): string {
  if (['earned', 'welcome_bonus', 'adjusted'].includes(type)) return 'text-[var(--color-success)]'
  return 'text-[var(--color-danger)]'
}

function txPrefix(type: string): string {
  if (['earned', 'welcome_bonus', 'adjusted'].includes(type)) return '+'
  return '-'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function onFilterChange() {
  page.value = 1
  fetchTransactions()
}

onMounted(() => {
  if (isUpgraded.value) fetchTransactions()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <NuxtLink to="/admin/loyalty" class="text-[var(--color-titanium)] hover:text-[var(--color-deep)]">
        <Icon name="lucide:arrow-left" class="h-5 w-5" />
      </NuxtLink>
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Loyalty Transactions</h1>
        <p class="text-sm text-[var(--color-titanium)]">{{ totalTx }} transaction{{ totalTx !== 1 ? 's' : '' }}</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <select
        v-model="filterType"
        class="input-design rounded-btn border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
        @change="onFilterChange"
      >
        <option value="">All Types</option>
        <option value="earned">Earned</option>
        <option value="redeemed">Redeemed</option>
        <option value="adjusted">Adjusted</option>
        <option value="expired">Expired</option>
        <option value="welcome_bonus">Welcome Bonus</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-3">
      <div v-for="n in 5" :key="n" class="card-design p-4">
        <div class="h-12 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="transactions.length === 0" class="card-design p-8 text-center">
      <Icon name="lucide:receipt" class="mx-auto mb-3 h-12 w-12 text-[var(--color-silver)]" />
      <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">No Transactions</h3>
      <p class="text-sm text-[var(--color-titanium)]">Loyalty transactions will appear here as customers earn and redeem points.</p>
    </div>

    <!-- Transaction Table -->
    <div v-else class="card-design overflow-hidden">
      <!-- Desktop Table -->
      <div class="hidden md:block">
        <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Date</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Customer</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Type</th>
              <th class="px-4 py-3 text-right font-medium text-[var(--color-titanium)]">Points</th>
              <th class="px-4 py-3 text-right font-medium text-[var(--color-titanium)]">Balance</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Note</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="tx in transactions"
              :key="tx.id"
              class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
            >
              <td class="px-4 py-3 text-xs text-[var(--color-titanium)]">{{ formatDate(tx.created_at) }}</td>
              <td class="px-4 py-3">
                <p class="font-medium text-[var(--color-deep)]">{{ tx.customerName }}</p>
                <p class="text-xs text-[var(--color-titanium)]">{{ tx.customerEmail }}</p>
              </td>
              <td class="px-4 py-3">
                <span
                  class="rounded-pill px-2 py-0.5 text-xs font-medium"
                  :class="tx.type === 'earned' || tx.type === 'welcome_bonus'
                    ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                    : tx.type === 'redeemed'
                      ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                      : tx.type === 'expired'
                        ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                        : 'bg-[var(--color-silver)]/20 text-[var(--color-titanium)]'"
                >
                  {{ formatTxType(tx.type) }}
                </span>
              </td>
              <td class="px-4 py-3 text-right font-bold" :class="txColorClass(tx.type)">
                {{ txPrefix(tx.type) }}{{ tx.points }}
              </td>
              <td class="px-4 py-3 text-right text-[var(--color-deep)]">{{ tx.balance_after }}</td>
              <td class="max-w-[200px] truncate px-4 py-3 text-xs text-[var(--color-titanium)]">{{ tx.note || '—' }}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      <!-- Mobile Card Layout -->
      <div class="md:hidden">
        <div
          v-for="tx in transactions"
          :key="tx.id"
          class="border-b border-[var(--color-silver)]/10 p-4 last:border-0"
        >
          <div class="mb-2 flex items-center justify-between">
            <span
              class="rounded-pill px-2 py-0.5 text-xs font-medium"
              :class="tx.type === 'earned' || tx.type === 'welcome_bonus'
                ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                : tx.type === 'redeemed'
                  ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                  : tx.type === 'expired'
                    ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                    : 'bg-[var(--color-silver)]/20 text-[var(--color-titanium)]'"
            >
              {{ formatTxType(tx.type) }}
            </span>
            <span class="font-bold" :class="txColorClass(tx.type)">
              {{ txPrefix(tx.type) }}{{ tx.points }} pts
            </span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-[var(--color-deep)]">{{ tx.customerName }}</p>
            <p class="truncate text-xs text-[var(--color-titanium)]">{{ tx.customerEmail }}</p>
          </div>
          <div class="mt-1 flex items-center justify-between text-xs text-[var(--color-titanium)]">
            <span>{{ formatDate(tx.created_at) }}</span>
            <span>Balance: {{ tx.balance_after }}</span>
          </div>
          <p v-if="tx.note" class="mt-1 truncate text-xs text-[var(--color-titanium)]">{{ tx.note }}</p>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalTx > 20" class="flex flex-col gap-2 border-t border-[var(--color-silver)]/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs text-[var(--color-titanium)]">
          Showing {{ (page - 1) * 20 + 1 }}-{{ Math.min(page * 20, totalTx) }} of {{ totalTx }}
        </p>
        <div class="flex gap-2">
          <button
            class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page <= 1"
            @click="page--; fetchTransactions()"
          >
            Previous
          </button>
          <button
            class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page >= Math.ceil(totalTx / 20)"
            @click="page++; fetchTransactions()"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
