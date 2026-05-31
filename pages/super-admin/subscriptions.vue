<script setup lang="ts">
/**
 * Super Admin Subscriptions — View all shop subscriptions
 * Shows a filterable, paginated table of shops with subscription details.
 * Reuses the /api/super-admin/shops API with plan/status filters.
 */
definePageMeta({
  layout: 'super-admin',
  middleware: 'super-admin',
})

// ─── Filters ──────────────────────────────────────────
const planFilter = ref<'all' | 'basic' | 'upgraded'>('all')
const statusFilter = ref<'all' | 'active' | 'suspended'>('all')
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = 10

// ─── Data ─────────────────────────────────────────────
const isLoading = ref(true)
const shops = ref<any[]>([])
const totalCount = ref(0)

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

// ─── Fetch shops ──────────────────────────────────────
async function fetchShops() {
  isLoading.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    if (!token) return

    const params = new URLSearchParams()
    params.set('page', String(currentPage.value))
    params.set('limit', String(pageSize))
    if (planFilter.value !== 'all') params.set('plan', planFilter.value)
    if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim())

    const data = await $fetch(`/api/super-admin/shops?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }) as any

    if (data) {
      shops.value = data.shops ?? []
      totalCount.value = data.total ?? 0
    }
  } catch (error) {
    console.error('Failed to fetch shops:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Watch filters with debounce ───────────────────────
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch([planFilter, statusFilter, searchQuery], () => {
  currentPage.value = 1
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    fetchShops()
  }, 300)
})

watch(currentPage, () => {
  fetchShops()
})

onMounted(() => {
  fetchShops()
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

// ─── Helpers ──────────────────────────────────────────
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-8">
      <h2 class="text-[var(--color-deep)]">
        Subscriptions
      </h2>
      <p class="text-sm text-[var(--color-titanium)]">
        Manage and monitor all shop subscription plans.
      </p>
    </div>

    <!-- Filters -->
    <div class="card-design mb-6 p-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
        <!-- Search -->
        <div class="relative flex-1">
          <Icon name="lucide:search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-titanium)]" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search shops..."
            class="input-design w-full border border-[var(--color-silver)]/30 bg-[var(--color-pure-white)] py-2 pl-10 pr-4 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-titanium)] focus:border-[var(--color-info)] focus:outline-none focus:ring-1 focus:ring-[var(--color-info)]"
          />
        </div>

        <!-- Plan Filter -->
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-[var(--color-titanium)]">Plan:</span>
          <div class="flex rounded-input border border-[var(--color-silver)]/30 p-0.5">
            <button
              v-for="option in (['all', 'basic', 'upgraded'] as const)"
              :key="option"
              class="rounded-[8px] px-3 py-1.5 text-xs font-medium transition-colors"
              :class="
                planFilter === option
                  ? 'bg-[var(--color-deep)] text-white'
                  : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'
              "
              @click="planFilter = option"
            >
              {{ option.charAt(0).toUpperCase() + option.slice(1) }}
            </button>
          </div>
        </div>

        <!-- Status Filter -->
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-[var(--color-titanium)]">Status:</span>
          <div class="flex rounded-input border border-[var(--color-silver)]/30 p-0.5">
            <button
              v-for="option in (['all', 'active', 'suspended'] as const)"
              :key="option"
              class="rounded-[8px] px-3 py-1.5 text-xs font-medium transition-colors"
              :class="
                statusFilter === option
                  ? 'bg-[var(--color-deep)] text-white'
                  : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'
              "
              @click="statusFilter = option"
            >
              {{ option.charAt(0).toUpperCase() + option.slice(1) }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="card-design overflow-hidden">
      <!-- Loading -->
      <div v-if="isLoading" class="p-6">
        <div class="space-y-3">
          <div v-for="i in 5" :key="i" class="animate-pulse h-12 rounded bg-[var(--color-silver)]/20" />
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="shops.length === 0" class="py-16 text-center">
        <Icon name="lucide:credit-card" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
        <p class="mt-3 text-sm text-[var(--color-titanium)]">No subscriptions found.</p>
        <p class="mt-1 text-xs text-[var(--color-titanium)]">Try adjusting your filters.</p>
      </div>

      <!-- Table content -->
      <div v-else>
        <!-- Desktop Table -->
        <div class="hidden md:block">
          <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-white)]/50">
                <th class="px-6 py-3 text-left font-medium text-[var(--color-titanium)]">Shop Name</th>
                <th class="px-6 py-3 text-left font-medium text-[var(--color-titanium)]">Plan</th>
                <th class="px-6 py-3 text-left font-medium text-[var(--color-titanium)]">Status</th>
                <th class="px-6 py-3 text-left font-medium text-[var(--color-titanium)]">Start Date</th>
                <th class="px-6 py-3 text-left font-medium text-[var(--color-titanium)]">End Date</th>
                <th class="px-6 py-3 text-right font-medium text-[var(--color-titanium)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="shop in shops"
                :key="shop.id"
                class="border-b border-[var(--color-silver)]/20 transition-colors hover:bg-[var(--color-white)]/50"
              >
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-deep)]/5 text-xs font-bold text-[var(--color-deep)]"
                    >
                      {{ shop.name?.charAt(0)?.toUpperCase() || 'S' }}
                    </div>
                    <div>
                      <p class="font-medium text-[var(--color-deep)]">{{ shop.name }}</p>
                      <p class="text-[10px] text-[var(--color-titanium)]">{{ shop.ownerEmail || shop.email || '' }}</p>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4">
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
                <td class="px-6 py-4">
                  <StatusBadge :status="shop.plan_status || 'active'" size="sm" />
                </td>
                <td class="px-6 py-4 text-[var(--color-titanium)]">{{ formatDate(shop.plan_start_date) }}</td>
                <td class="px-6 py-4 text-[var(--color-titanium)]">{{ formatDate(shop.plan_end_date) }}</td>
                <td class="px-6 py-4 text-right">
                  <NuxtLink
                    :to="`/super-admin/shops/${shop.id}`"
                    class="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-info)] hover:underline"
                  >
                    <Icon name="lucide:eye" class="h-3.5 w-3.5" />
                    View
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <!-- Mobile Card Layout -->
        <div class="md:hidden">
          <div
            v-for="shop in shops"
            :key="shop.id"
            class="border-b border-[var(--color-silver)]/20 p-4 last:border-0"
          >
            <div class="mb-2 flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-deep)]/5 text-xs font-bold text-[var(--color-deep)]"
                >
                  {{ shop.name?.charAt(0)?.toUpperCase() || 'S' }}
                </div>
                <div class="min-w-0">
                  <p class="truncate font-medium text-[var(--color-deep)]">{{ shop.name }}</p>
                  <p class="truncate text-[10px] text-[var(--color-titanium)]">{{ shop.ownerEmail || shop.email || '' }}</p>
                </div>
              </div>
              <span
                class="badge-pill shrink-0 text-[10px]"
                :class="
                  shop.plan === 'upgraded'
                    ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                    : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'"
              >
                {{ shop.plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
              </span>
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-[var(--color-titanium)]">
              <div class="flex items-center gap-3">
                <StatusBadge :status="shop.plan_status || 'active'" size="sm" />
                <span>{{ formatDate(shop.plan_start_date) }}</span>
              </div>
              <NuxtLink
                :to="`/super-admin/shops/${shop.id}`"
                class="h-9 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-info)] hover:underline"
              >
                <Icon name="lucide:eye" class="h-3.5 w-3.5" />
                View
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div
          v-if="totalPages > 1"
          class="flex flex-col gap-2 border-t border-[var(--color-silver)]/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-xs text-[var(--color-titanium)]">
            Showing {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, totalCount) }} of {{ totalCount }}
          </p>
          <div class="flex items-center gap-1">
            <button
              :disabled="currentPage <= 1"
              class="flex h-8 w-8 items-center justify-center rounded-input text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 disabled:opacity-40 disabled:hover:bg-transparent"
              @click="currentPage--"
            >
              <Icon name="lucide:chevron-left" class="h-4 w-4" />
            </button>

            <template v-for="page in totalPages" :key="page">
              <button
                v-if="totalPages <= 5 || Math.abs(page - currentPage) <= 1 || page === 1 || page === totalPages"
                class="flex h-8 w-8 items-center justify-center rounded-input text-xs font-medium transition-colors"
                :class="
                  currentPage === page
                    ? 'bg-[var(--color-deep)] text-white'
                    : 'text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20'
                "
                @click="currentPage = page"
              >
                {{ page }}
              </button>
              <span
                v-else-if="Math.abs(page - currentPage) === 2"
                class="px-1 text-xs text-[var(--color-titanium)]"
              >
                …
              </span>
            </template>

            <button
              :disabled="currentPage >= totalPages"
              class="flex h-8 w-8 items-center justify-center rounded-input text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 disabled:opacity-40 disabled:hover:bg-transparent"
              @click="currentPage++"
            >
              <Icon name="lucide:chevron-right" class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
