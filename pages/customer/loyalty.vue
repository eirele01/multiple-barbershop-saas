<script setup lang="ts">
/**
 * /customer/loyalty — Customer Loyalty Dashboard
 *
 * Shows customer's points balance, tier, and transaction history
 * across all shops where they have loyalty points.
 *
 * Customer-only access.
 */
import { useAuthStore } from '~/stores/auth'
import type { LoyaltyPoint, LoyaltyReward } from '~/types/database'

definePageMeta({
  layout: 'customer',
  middleware: ['auth', 'customer'],
})

const authStore = useAuthStore()
const toast = useToast()

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const hasError = ref(false)
const selectedShopId = ref<string | null>(null)

// Shop loyalty data
interface ShopLoyalty {
  shopId: string
  shopName: string
  shopSlug: string
  balance: number
  tier: string
  totalEarned: number
  rewards: LoyaltyReward[]
}
const shopLoyaltyList = ref<ShopLoyalty[]>([])

// Transaction data
const transactions = ref<LoyaltyPoint[]>([])
const txTotal = ref(0)
const txPage = ref(1)
const txLoading = ref(false)

// ─── Computed ──────────────────────────────────────
const activeShop = computed(() => {
  if (!selectedShopId.value) return null
  return shopLoyaltyList.value.find(s => s.shopId === selectedShopId.value) || null
})

const tierColor = computed(() => {
  const tier = activeShop.value?.tier || 'bronze'
  const colors: Record<string, string> = {
    bronze: 'bg-amber-800 text-white',
    silver: 'bg-gray-400 text-white',
    gold: 'bg-yellow-500 text-white',
    platinum: 'bg-purple-600 text-white',
  }
  return colors[tier] || colors.bronze
})

// ─── Fetch Loyalty Data ────────────────────────────
async function fetchLoyaltyData() {
  isLoading.value = true
  hasError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const response = await $fetch('/api/customer/loyalty/status', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    shopLoyaltyList.value = response.shops || []

    // Auto-select first shop if only one
    if (shopLoyaltyList.value.length === 1) {
      selectedShopId.value = shopLoyaltyList.value[0].shopId
      await fetchTransactions()
    }
  } catch (error: any) {
    hasError.value = true
    toast.error('Failed to load loyalty data')
    console.error('Error fetching loyalty data:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Fetch Transactions ────────────────────────────
async function fetchTransactions() {
  if (!selectedShopId.value) return
  txLoading.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const response = await $fetch('/api/customer/loyalty/transactions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      params: {
        shopId: selectedShopId.value,
        page: txPage.value,
        limit: 20,
      },
    }) as any

    transactions.value = response.transactions || []
    txTotal.value = response.total || 0
  } catch (error: any) {
    toast.error('Failed to load transactions')
    console.error('Error fetching transactions:', error)
  } finally {
    txLoading.value = false
  }
}

// ─── Select Shop ───────────────────────────────────
async function selectShop(shopId: string) {
  selectedShopId.value = shopId
  txPage.value = 1
  await fetchTransactions()
}

// ─── Format Helpers ────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

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

function txPointsClass(type: string): string {
  if (['earned', 'welcome_bonus', 'adjusted'].includes(type)) {
    return 'text-[var(--color-success)]'
  }
  return 'text-[var(--color-danger)]'
}

function txPointsPrefix(type: string): string {
  if (['earned', 'welcome_bonus', 'adjusted'].includes(type)) return '+'
  return '-'
}

onMounted(() => {
  if (authStore.isAuthenticated) {
    fetchLoyaltyData()
  }
})
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-deep)]">My Loyalty Points</h1>
      <p class="mt-1 text-sm text-[var(--color-titanium)]">View your points balance, tier, and transaction history</p>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-6">
      <!-- Skeleton: Points balance + tier + rewards cards -->
      <div class="grid gap-4 sm:grid-cols-3">
        <div v-for="n in 3" :key="n" class="card-design p-6 text-center">
          <div class="mx-auto h-3 w-20 animate-pulse rounded bg-[var(--color-silver)]/10" />
          <div class="mx-auto mt-3 h-8 w-16 animate-pulse rounded bg-[var(--color-silver)]/10" />
          <div class="mx-auto mt-2 h-3 w-24 animate-pulse rounded bg-[var(--color-silver)]/10" />
        </div>
      </div>
      <!-- Skeleton: Rewards grid -->
      <div class="card-design p-6">
        <div class="mb-4 h-5 w-24 animate-pulse rounded bg-[var(--color-silver)]/10" />
        <div class="grid gap-3 sm:grid-cols-2">
          <div v-for="n in 4" :key="n" class="h-20 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
        </div>
      </div>
      <!-- Skeleton: Transaction history -->
      <div class="card-design p-6">
        <div class="mb-4 h-5 w-36 animate-pulse rounded bg-[var(--color-silver)]/10" />
        <div class="space-y-3">
          <div v-for="n in 5" :key="n" class="h-12 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
        </div>
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="hasError"
      title="Failed to Load Loyalty Data"
      message="Something went wrong while fetching your loyalty information. Please try again."
      :retry-fn="fetchLoyaltyData"
    />

    <!-- No loyalty data -->
    <EmptyState
      v-else-if="shopLoyaltyList.length === 0"
      icon="lucide:star"
      title="No Loyalty Points Yet"
      message="Book an appointment at a participating barbershop to start earning points!"
    />

    <!-- Has loyalty data -->
    <template v-else>
      <!-- Shop Selector (if multiple shops) -->
      <div v-if="shopLoyaltyList.length > 1" class="flex flex-wrap gap-2">
        <button
          v-for="shop in shopLoyaltyList"
          :key="shop.shopId"
          class="truncate rounded-btn border px-4 py-2.5 text-sm font-medium transition-colors"
          :class="selectedShopId === shop.shopId
            ? 'border-[var(--color-deep)] bg-[var(--color-deep)] text-white'
            : 'border-[var(--color-silver)]/50 text-[var(--color-titanium)] hover:border-[var(--color-deep)]/30'"
          @click="selectShop(shop.shopId)"
        >
          <span class="truncate">{{ shop.shopName }}</span>
          <span class="ml-2 font-bold">{{ shop.balance }} pts</span>
        </button>
      </div>

      <!-- Select a shop prompt -->
      <div v-if="!selectedShopId && shopLoyaltyList.length > 1" class="card-design p-8 text-center">
        <p class="text-sm text-[var(--color-titanium)]">Select a shop above to view your loyalty details</p>
      </div>

      <!-- Shop Loyalty Overview -->
      <div v-if="activeShop" class="grid gap-4 sm:grid-cols-3">
        <!-- Points Balance -->
        <div class="card-design p-6 text-center">
          <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Points Balance</p>
          <p class="mt-2 text-3xl font-bold text-[var(--color-deep)]">{{ activeShop.balance }}</p>
          <p class="mt-1 text-xs text-[var(--color-titanium)]">Total earned: {{ activeShop.totalEarned }}</p>
        </div>

        <!-- Tier -->
        <div class="card-design p-6 text-center">
          <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Current Tier</p>
          <div class="mt-2">
            <span
              class="inline-block rounded-pill px-4 py-1.5 text-sm font-bold capitalize"
              :class="tierColor"
            >
              {{ activeShop.tier }}
            </span>
          </div>
        </div>

        <!-- Available Rewards -->
        <div class="card-design p-6 text-center">
          <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Rewards Available</p>
          <p class="mt-2 text-3xl font-bold text-[var(--color-deep)]">
            {{ activeShop.rewards.filter(r => r.points_required <= activeShop.balance).length }}
          </p>
          <p class="mt-1 text-xs text-[var(--color-titanium)]">
            of {{ activeShop.rewards.length }} total
          </p>
        </div>
      </div>

      <!-- Rewards You Can Redeem -->
      <div v-if="activeShop && activeShop.rewards && activeShop.rewards.length > 0" class="card-design p-6">
        <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Rewards</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="reward in activeShop.rewards"
            :key="reward.id"
            class="rounded-input border p-4"
            :class="reward.points_required <= activeShop.balance
              ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/5'
              : 'border-[var(--color-silver)]/30 opacity-60'"
          >
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-[var(--color-deep)]">{{ reward.name }}</h4>
              <span class="text-xs font-bold text-[var(--color-deep)]">{{ reward.points_required }} pts</span>
            </div>
            <p v-if="reward.description" class="mt-1 text-xs text-[var(--color-titanium)]">{{ reward.description }}</p>
            <p v-if="reward.points_required > activeShop.balance" class="mt-2 text-xs text-[var(--color-titanium)]">
              Need {{ reward.points_required - activeShop.balance }} more points
            </p>
            <p v-else class="mt-2 text-xs font-medium text-[var(--color-success)]">
              You can redeem this!
            </p>
          </div>
        </div>
      </div>

      <!-- Transaction History -->
      <div v-if="selectedShopId" class="card-design p-6">
        <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Transaction History</h2>

        <div v-if="txLoading" class="space-y-3">
          <div v-for="n in 5" :key="n" class="h-12 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
        </div>

        <div v-else-if="transactions.length === 0" class="py-8 text-center">
          <p class="text-sm text-[var(--color-titanium)]">No transactions yet</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="tx in transactions"
            :key="tx.id"
            class="flex items-center justify-between rounded-input bg-[var(--color-white)] px-4 py-3"
          >
            <div class="flex-1">
              <p class="text-sm font-medium text-[var(--color-deep)]">{{ formatTxType(tx.type) }}</p>
              <p class="text-xs text-[var(--color-titanium)]">
                {{ tx.note || formatDate(tx.created_at) }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-sm font-bold" :class="txPointsClass(tx.type)">
                {{ txPointsPrefix(tx.type) }}{{ tx.points }}
              </p>
              <p class="text-xs text-[var(--color-titanium)]">Balance: {{ tx.balance_after }}</p>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="txTotal > 20" class="mt-4 flex items-center justify-center gap-2">
          <button
            class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 py-1.5 text-xs font-medium text-[var(--color-titanium)] hover:text-[var(--color-deep)] disabled:opacity-50"
            :disabled="txPage <= 1"
            @click="txPage--; fetchTransactions()"
          >
            Previous
          </button>
          <span class="text-xs text-[var(--color-titanium)]">
            Page {{ txPage }} of {{ Math.ceil(txTotal / 20) }}
          </span>
          <button
            class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 py-1.5 text-xs font-medium text-[var(--color-titanium)] hover:text-[var(--color-deep)] disabled:opacity-50"
            :disabled="txPage >= Math.ceil(txTotal / 20)"
            @click="txPage++; fetchTransactions()"
          >
            Next
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
