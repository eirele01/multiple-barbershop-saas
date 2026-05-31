<script setup lang="ts">
/**
 * /super-admin/shops — Super Admin Shops List
 *
 * Shows all shops on the platform with filters:
 * - Search (shop name, slug, owner email)
 * - Plan filter (basic / upgraded)
 * - Status filter (active / suspended)
 * - Date range
 *
 * Table columns: Shop Name, Slug, Owner Email, Plan, Status, Bookings, Registered, Actions
 * Pagination: 20 per page
 *
 * Super admin only access.
 */

definePageMeta({
  layout: 'super-admin',
  middleware: 'super-admin',
})

const toast = useToast()
const { confirm, ConfirmDialogComponent } = useConfirm()

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const shops = ref<any[]>([])
const totalShops = ref(0)
const page = ref(1)
const perPage = 20

// Filters
const searchQuery = ref('')
const filterPlan = ref('')
const filterStatus = ref('')
const filterDateFrom = ref('')
const filterDateTo = ref('')

// Action states
const isToggling = ref<string | null>(null)

// ─── Get Auth Token ────────────────────────────────
async function getAuthToken(): Promise<string | null> {
  const supabase = useSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

// ─── Fetch Shops ──────────────────────────────────
async function fetchShops() {
  isLoading.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    const data = await $fetch('/api/super-admin/shops', {
      params: {
        search: searchQuery.value || undefined,
        plan: filterPlan.value || undefined,
        status: filterStatus.value || undefined,
        dateFrom: filterDateFrom.value || undefined,
        dateTo: filterDateTo.value || undefined,
        page: page.value,
        limit: perPage,
      },
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    shops.value = data.shops || []
    totalShops.value = data.total || 0
  } catch (error: any) {
    toast.error('Failed to load shops')
    console.error('Error fetching shops:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Toggle Shop Status ───────────────────────────
async function toggleShopStatus(shopId: string, currentActive: boolean) {
  const action = currentActive ? 'suspend' : 'reinstate'
  const ok = await confirm({ title: `${action === 'suspend' ? 'Suspend' : 'Reinstate'} Shop`, message: `Are you sure you want to ${action} this shop?`, confirmLabel: action === 'suspend' ? 'Suspend' : 'Reinstate', variant: 'warning' })
  if (!ok) return

  isToggling.value = shopId
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch(`/api/super-admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: { is_active: !currentActive },
    })

    toast.success(`Shop ${action}d successfully`)
    await fetchShops()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || `Failed to ${action} shop`
    toast.error(msg)
  } finally {
    isToggling.value = null
  }
}

// ─── Filter Actions ───────────────────────────────
function applyFilters() {
  page.value = 1
  fetchShops()
}

function resetFilters() {
  searchQuery.value = ''
  filterPlan.value = ''
  filterStatus.value = ''
  filterDateFrom.value = ''
  filterDateTo.value = ''
  page.value = 1
  fetchShops()
}

// ─── Helpers ───────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatPrice(price: number): string {
  return `₱${Number(price).toLocaleString()}`
}

function getInitial(name: string): string {
  return name ? name.charAt(0).toUpperCase() : '?'
}

const totalPages = computed(() => Math.ceil(totalShops.value / perPage))

const planOptions = [
  { value: '', label: 'All Plans' },
  { value: 'basic', label: 'Basic' },
  { value: 'upgraded', label: 'Upgraded' },
]

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

onMounted(() => {
  fetchShops()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-deep)]">Shops</h1>
      <p class="text-sm text-[var(--color-titanium)]">{{ totalShops }} shop{{ totalShops !== 1 ? 's' : '' }}</p>
    </div>

    <!-- Search -->
    <div class="card-design p-4">
      <div class="relative">
        <Icon name="lucide:search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-titanium)]" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by shop name, slug, or owner email..."
          class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] py-2.5 pl-10 pr-4 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          @keyup.enter="applyFilters"
        />
      </div>
    </div>

    <!-- Filters -->
    <div class="card-design p-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <!-- Plan -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Plan</label>
          <select
            v-model="filterPlan"
            class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          >
            <option v-for="opt in planOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
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
        <!-- Date From -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Registered From</label>
          <input
            v-model="filterDateFrom"
            type="date"
            class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>
        <!-- Date To -->
        <div>
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Registered To</label>
          <input
            v-model="filterDateTo"
            type="date"
            class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>
        <!-- Actions -->
        <div class="flex items-end gap-2">
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
        <div class="h-12 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="shops.length === 0" class="card-design p-8 text-center">
      <Icon name="lucide:store" class="mx-auto mb-3 h-12 w-12 text-[var(--color-silver)]" />
      <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">No Shops Found</h3>
      <p class="text-sm text-[var(--color-titanium)]">No shops match your current filters. Try adjusting your search criteria.</p>
    </div>

    <!-- Shops Table -->
    <div v-else class="card-design overflow-hidden">
      <!-- Desktop Table -->
      <div class="hidden md:block">
        <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Shop Name</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Slug</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Owner Email</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Plan</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Status</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Bookings</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Registered</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="shop in shops"
              :key="shop.id"
              class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
            >
              <!-- Shop Name with logo -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div v-if="shop.logo_url" class="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full">
                    <img :src="shop.logo_url" :alt="shop.name" loading="lazy" class="h-full w-full object-cover" />
                  </div>
                  <div v-else class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-deep)] text-xs font-bold text-white">
                    {{ getInitial(shop.name) }}
                  </div>
                  <span class="font-medium text-[var(--color-deep)]">{{ shop.name }}</span>
                </div>
              </td>
              <!-- Slug -->
              <td class="px-4 py-3">
                <span class="truncate font-mono text-xs text-[var(--color-titanium)]">{{ shop.slug }}</span>
              </td>
              <!-- Owner Email -->
              <td class="px-4 py-3 text-[var(--color-deep)]">{{ shop.owner_email || '—' }}</td>
              <!-- Plan -->
              <td class="px-4 py-3 text-center">
                <span
                  class="badge-pill inline-flex items-center font-medium"
                  :class="shop.plan === 'upgraded'
                    ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                    : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'"
                >
                  {{ shop.plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
                </span>
              </td>
              <!-- Status -->
              <td class="px-4 py-3 text-center">
                <StatusBadge :status="shop.is_active ? 'active' : 'inactive'" size="sm" />
              </td>
              <!-- Total Bookings -->
              <td class="px-4 py-3 text-center font-medium text-[var(--color-deep)]">
                {{ shop.total_bookings ?? 0 }}
              </td>
              <!-- Registered Date -->
              <td class="px-4 py-3 text-[var(--color-titanium)]">
                {{ formatDate(shop.created_at) }}
              </td>
              <!-- Actions -->
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  <NuxtLink
                    :to="`/super-admin/shops/${shop.id}`"
                    class="rounded-btn px-2.5 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20"
                  >
                    <Icon name="lucide:eye" class="mr-1 inline h-3.5 w-3.5" /> View
                  </NuxtLink>
                  <button
                    v-if="shop.is_active"
                    class="rounded-btn px-2.5 py-1.5 text-xs font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
                    :disabled="isToggling === shop.id"
                    @click="toggleShopStatus(shop.id, true)"
                  >
                    <Icon v-if="isToggling === shop.id" name="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
                    <Icon v-else name="lucide:ban" class="mr-1 inline h-3.5 w-3.5" />
                    Suspend
                  </button>
                  <button
                    v-else
                    class="rounded-btn px-2.5 py-1.5 text-xs font-medium text-[var(--color-success)] transition-colors hover:bg-[var(--color-success)]/10 disabled:opacity-50"
                    :disabled="isToggling === shop.id"
                    @click="toggleShopStatus(shop.id, false)"
                  >
                    <Icon v-if="isToggling === shop.id" name="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
                    <Icon v-else name="lucide:check-circle" class="mr-1 inline h-3.5 w-3.5" />
                    Reinstate
                  </button>
                </div>
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
          class="border-b border-[var(--color-silver)]/10 p-4 last:border-0"
        >
          <div class="mb-2 flex items-center justify-between">
            <div class="flex min-w-0 items-center gap-2">
              <div v-if="shop.logo_url" class="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full">
                <img :src="shop.logo_url" :alt="shop.name" loading="lazy" class="h-full w-full object-cover" />
              </div>
              <div v-else class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-deep)] text-xs font-bold text-white">
                {{ getInitial(shop.name) }}
              </div>
              <NuxtLink
                :to="`/super-admin/shops/${shop.id}`"
                class="truncate font-medium text-[var(--color-deep)] hover:text-[var(--color-info)] hover:underline"
              >
                {{ shop.name }}
              </NuxtLink>
            </div>
            <StatusBadge :status="shop.is_active ? 'active' : 'inactive'" size="sm" />
          </div>
          <p class="truncate text-xs text-[var(--color-titanium)]">{{ shop.owner_email }}</p>
          <p class="truncate font-mono text-[10px] text-[var(--color-silver)]">/{{ shop.slug }}</p>
          <div class="mt-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span
                class="badge-pill text-[10px]"
                :class="shop.plan === 'upgraded'
                  ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                  : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'"
              >
                {{ shop.plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
              </span>
              <span class="text-xs text-[var(--color-titanium)]">{{ shop.total_bookings ?? 0 }} bookings</span>
            </div>
            <div class="flex items-center gap-1">
              <NuxtLink
                :to="`/super-admin/shops/${shop.id}`"
                class="h-9 rounded-btn px-2.5 text-xs font-medium text-[var(--color-info)] transition-colors hover:bg-[var(--color-info)]/10"
              >
                View
              </NuxtLink>
              <button
                v-if="shop.is_active"
                class="h-9 rounded-btn px-2.5 text-xs font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
                :disabled="isToggling === shop.id"
                @click="toggleShopStatus(shop.id, true)"
              >
                <Icon v-if="isToggling === shop.id" name="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
                <Icon v-else name="lucide:ban" class="mr-1 inline h-3.5 w-3.5" />
                Suspend
              </button>
              <button
                v-else
                class="h-9 rounded-btn px-2.5 text-xs font-medium text-[var(--color-success)] transition-colors hover:bg-[var(--color-success)]/10 disabled:opacity-50"
                :disabled="isToggling === shop.id"
                @click="toggleShopStatus(shop.id, false)"
              >
                <Icon v-if="isToggling === shop.id" name="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
                <Icon v-else name="lucide:check-circle" class="mr-1 inline h-3.5 w-3.5" />
                Reinstate
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex flex-col gap-2 border-t border-[var(--color-silver)]/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs text-[var(--color-titanium)]">
          Showing {{ (page - 1) * perPage + 1 }}-{{ Math.min(page * perPage, totalShops) }} of {{ totalShops }}
        </p>
        <div class="flex gap-2">
          <button
            class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page <= 1"
            @click="page--; fetchShops()"
          >
            Previous
          </button>
          <button
            class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page >= totalPages"
            @click="page++; fetchShops()"
          >
            Next
          </button>
        </div>
      </div>
    </div>
    <ConfirmDialogComponent />
  </div>
</template>
