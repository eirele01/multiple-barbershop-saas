<script setup lang="ts">
/**
 * /super-admin/shops/[id] — Super Admin Shop Detail Page
 *
 * Shows full shop information with tabs:
 * - Overview: Shop info, owner info, stats, action buttons
 * - Staff: Read-only table of staff
 * - Bookings: Last 50 bookings for this shop
 * - Subscription: Plan details and history
 *
 * Super admin only access.
 */

definePageMeta({
  layout: 'super-admin',
  middleware: 'super-admin',
})

const toast = useToast()
const { confirm, ConfirmDialogComponent } = useConfirm()
const route = useRoute()
const shopId = route.params.id as string

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const shop = ref<any>(null)
const owner = ref<any>(null)
const stats = ref<any>(null)

// Tabs
const activeTab = ref('overview')
const tabs = [
  { key: 'overview', label: 'Overview', icon: 'lucide:layout-dashboard' },
  { key: 'staff', label: 'Staff', icon: 'lucide:users' },
  { key: 'bookings', label: 'Bookings', icon: 'lucide:calendar' },
  { key: 'subscription', label: 'Subscription', icon: 'lucide:credit-card' },
]

// Lazy-loaded tab data
const staffList = ref<any[]>([])
const staffLoading = ref(false)
const bookingsList = ref<any[]>([])
const bookingsLoading = ref(false)
const subscriptionHistory = ref<any[]>([])
const subscriptionLoading = ref(false)

// Action states
const isTogglingStatus = ref(false)
const isImpersonating = ref(false)
const isUpdatingPlan = ref(false)
const planExpiryDate = ref('')

// ─── Get Auth Token ────────────────────────────────
async function getAuthToken(): Promise<string | null> {
  const supabase = useSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

// ─── Fetch Shop Detail ────────────────────────────
async function fetchShop() {
  isLoading.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    const data = await $fetch(`/api/super-admin/shops/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    shop.value = data.shop || null
    owner.value = data.owner || null
    stats.value = data.stats || { totalBookings: 0, revenue: 0, staffCount: 0, servicesCount: 0 }
    subscriptionHistory.value = data.subscriptionHistory || []

    if (shop.value?.plan_end_date) {
      planExpiryDate.value = shop.value.plan_end_date.split('T')[0]
    }
  } catch (error: any) {
    toast.error('Failed to load shop details')
    console.error('Error fetching shop:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Fetch Staff (lazy) ───────────────────────────
async function fetchStaff() {
  staffLoading.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    const data = await $fetch(`/api/super-admin/shops/${shopId}/staff`, {
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    staffList.value = data.staff || []
  } catch (error: any) {
    toast.error('Failed to load staff')
    console.error('Error fetching staff:', error)
  } finally {
    staffLoading.value = false
  }
}

// ─── Fetch Bookings (lazy) ────────────────────────
async function fetchBookings() {
  bookingsLoading.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    const data = await $fetch(`/api/super-admin/shops/${shopId}/bookings`, {
      params: { limit: 50 },
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    bookingsList.value = data.bookings || []
  } catch (error: any) {
    toast.error('Failed to load bookings')
    console.error('Error fetching bookings:', error)
  } finally {
    bookingsLoading.value = false
  }
}

// ─── Fetch Subscription History (lazy) ────────────
// Subscription history is already loaded from the shop detail API,
// so we just set loading to false
async function fetchSubscriptionHistory() {
  subscriptionLoading.value = false
  // Data already loaded in fetchShop()
}

// ─── Tab Change Handler ───────────────────────────
function onTabChange(tab: string) {
  activeTab.value = tab
  if (tab === 'staff' && staffList.value.length === 0) {
    fetchStaff()
  } else if (tab === 'bookings' && bookingsList.value.length === 0) {
    fetchBookings()
  } else if (tab === 'subscription' && subscriptionHistory.value.length === 0) {
    fetchSubscriptionHistory()
  }
}

// ─── Toggle Shop Status ───────────────────────────
async function toggleShopStatus() {
  if (!shop.value) return
  const action = shop.value.is_active ? 'suspend' : 'reinstate'
  const ok = await confirm({ title: `${action === 'suspend' ? 'Suspend' : 'Reinstate'} Shop`, message: `Are you sure you want to ${action} this shop?`, confirmLabel: action === 'suspend' ? 'Suspend' : 'Reinstate', variant: 'warning' })
  if (!ok) return

  isTogglingStatus.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch(`/api/super-admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: { is_active: !shop.value.is_active },
    })

    toast.success(`Shop ${action}d successfully`)
    await fetchShop()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || `Failed to ${action} shop`
    toast.error(msg)
  } finally {
    isTogglingStatus.value = false
  }
}

// ─── Impersonate Shop Admin ───────────────────────
async function impersonateShop() {
  const ok = await confirm({ title: 'Login as Shop Admin', message: 'You will be redirected in a new tab. Continue?', confirmLabel: 'Login', variant: 'default' })
  if (!ok) return

  isImpersonating.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    const data = await $fetch(`/api/super-admin/shops/${shopId}/impersonate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    if (data.token) {
      window.open(`/admin/dashboard?impersonate=${data.token}`, '_blank')
      toast.success('Opened shop admin in new tab')
    }
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to impersonate'
    toast.error(msg)
  } finally {
    isImpersonating.value = false
  }
}

// ─── Update Plan ──────────────────────────────────
async function updatePlan(plan: 'basic' | 'upgraded') {
  const action = plan === 'upgraded' ? 'upgrade' : 'downgrade'
  const ok = await confirm({ title: `${action === 'upgrade' ? 'Upgrade' : 'Downgrade'} Plan`, message: `Are you sure you want to ${action} this shop to the ${plan} plan?`, confirmLabel: action === 'upgrade' ? 'Upgrade' : 'Downgrade', variant: 'warning' })
  if (!ok) return

  isUpdatingPlan.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch(`/api/super-admin/shops/${shopId}/subscription`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: { plan, plan_status: plan === 'upgraded' ? 'active' : undefined },
    })

    toast.success(`Shop ${action}d to ${plan} plan`)
    await fetchShop()
    fetchSubscriptionHistory()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || `Failed to ${action} plan`
    toast.error(msg)
  } finally {
    isUpdatingPlan.value = false
  }
}

// ─── Set Expiry Date ──────────────────────────────
async function setExpiryDate() {
  if (!planExpiryDate.value) {
    toast.error('Please select a date')
    return
  }

  isUpdatingPlan.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch(`/api/super-admin/shops/${shopId}/subscription`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: { plan_end_date: planExpiryDate.value },
    })

    toast.success('Expiry date updated')
    await fetchShop()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to update expiry date'
    toast.error(msg)
  } finally {
    isUpdatingPlan.value = false
  }
}

// ─── Helpers ───────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatPrice(price: number): string {
  return `₱${Number(price).toLocaleString()}`
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`
}

onMounted(() => {
  fetchShop()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <!-- Loading -->
    <div v-if="isLoading" class="space-y-6">
      <div class="card-design p-6">
        <div class="h-48 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
      </div>
    </div>

    <template v-else-if="shop">
      <!-- Header -->
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <NuxtLink to="/super-admin/shops" class="text-[var(--color-titanium)] hover:text-[var(--color-deep)]">
            <Icon name="lucide:arrow-left" class="h-5 w-5" />
          </NuxtLink>
          <div class="flex items-center gap-3">
            <div v-if="shop.logo_url" class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full">
              <img :src="shop.logo_url" :alt="shop.name" loading="lazy" class="h-full w-full object-cover" />
            </div>
            <div v-else class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-deep)] text-sm font-bold text-white">
              {{ shop.name ? shop.name.charAt(0).toUpperCase() : '?' }}
            </div>
            <div>
              <h1 class="text-xl font-bold text-[var(--color-deep)] sm:text-2xl">{{ shop.name }}</h1>
              <p class="text-xs text-[var(--color-titanium)]">{{ shop.slug }}</p>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="badge-pill inline-flex items-center font-medium"
            :class="shop.plan === 'upgraded'
              ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
              : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'"
          >
            {{ shop.plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
          </span>
          <StatusBadge :status="shop.is_active ? 'active' : 'inactive'" size="md" />
        </div>
      </div>

      <!-- Tabs -->
      <div class="card-design overflow-hidden">
        <div class="flex border-b border-[var(--color-silver)]/30">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors"
            :class="activeTab === tab.key
              ? 'border-b-2 border-[var(--color-deep)] text-[var(--color-deep)]'
              : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'"
            @click="onTabChange(tab.key)"
          >
            <Icon :name="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </div>

        <div class="p-4 lg:p-6">
          <!-- ===== OVERVIEW TAB ===== -->
          <div v-if="activeTab === 'overview'" class="space-y-6">
            <!-- Shop Info Card -->
            <div class="card-design p-6">
              <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Shop Information</h2>
              <div class="grid gap-6 sm:grid-cols-2">
                <!-- Logo & Name -->
                <div class="flex items-start gap-4">
                  <div v-if="shop.logo_url" class="h-20 w-20 flex-shrink-0 overflow-hidden rounded-btn">
                    <img :src="shop.logo_url" :alt="shop.name" loading="lazy" class="h-full w-full object-cover" />
                  </div>
                  <div v-else class="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-btn bg-[var(--color-deep)] text-2xl font-bold text-white">
                    {{ shop.name ? shop.name.charAt(0).toUpperCase() : '?' }}
                  </div>
                  <div>
                    <p class="font-semibold text-[var(--color-deep)]">{{ shop.name }}</p>
                    <p class="font-mono text-xs text-[var(--color-titanium)]">{{ shop.slug }}</p>
                    <p v-if="shop.description" class="mt-1 text-sm text-[var(--color-titanium)]">{{ shop.description }}</p>
                  </div>
                </div>
                <!-- Contact -->
                <div class="space-y-2">
                  <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Contact</p>
                  <div v-if="shop.email" class="flex items-center gap-2 text-sm text-[var(--color-deep)]">
                    <Icon name="lucide:mail" class="h-4 w-4 text-[var(--color-titanium)]" />
                    {{ shop.email }}
                  </div>
                  <div v-if="shop.phone" class="flex items-center gap-2 text-sm text-[var(--color-deep)]">
                    <Icon name="lucide:phone" class="h-4 w-4 text-[var(--color-titanium)]" />
                    {{ shop.phone }}
                  </div>
                  <div v-if="shop.address_street || shop.address_city" class="flex items-start gap-2 text-sm text-[var(--color-deep)]">
                    <Icon name="lucide:map-pin" class="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-titanium)]" />
                    <span>
                      {{ [shop.address_street, shop.address_city, shop.address_state, shop.address_zip].filter(Boolean).join(', ') }}
                    </span>
                  </div>
                </div>
              </div>
              <!-- Social Links -->
              <div v-if="shop.facebook_url || shop.instagram_url || shop.tiktok_url" class="mt-4 flex flex-wrap gap-3 border-t border-[var(--color-silver)]/30 pt-4">
                <p class="w-full text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Social</p>
                <a v-if="shop.facebook_url" :href="shop.facebook_url" target="_blank" class="inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20">
                  <Icon name="lucide:facebook" class="h-4 w-4" /> Facebook
                </a>
                <a v-if="shop.instagram_url" :href="shop.instagram_url" target="_blank" class="inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20">
                  <Icon name="lucide:instagram" class="h-4 w-4" /> Instagram
                </a>
                <a v-if="shop.tiktok_url" :href="shop.tiktok_url" target="_blank" class="inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20">
                  <Icon name="lucide:music-2" class="h-4 w-4" /> TikTok
                </a>
              </div>
            </div>

            <!-- Owner Info Card -->
            <div v-if="owner" class="card-design p-6">
              <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Owner</h2>
              <div class="grid gap-4 sm:grid-cols-3">
                <div>
                  <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Name</p>
                  <p class="mt-1 text-sm font-medium text-[var(--color-deep)]">{{ owner.display_name || '—' }}</p>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Email</p>
                  <p class="mt-1 text-sm text-[var(--color-deep)]">{{ owner.email || '—' }}</p>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Since</p>
                  <p class="mt-1 text-sm text-[var(--color-deep)]">{{ formatDate(owner.created_at) }}</p>
                </div>
              </div>
            </div>

            <!-- Stats Row -->
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div class="card-design p-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-info)]/10">
                    <Icon name="lucide:calendar" class="h-5 w-5 text-[var(--color-info)]" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold text-[var(--color-deep)]">{{ stats?.totalBookings ?? 0 }}</p>
                    <p class="text-xs text-[var(--color-titanium)]">Total Bookings</p>
                  </div>
                </div>
              </div>
              <div class="card-design p-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-success)]/10">
                    <Icon name="lucide:philippine-peso" class="h-5 w-5 text-[var(--color-success)]" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold text-[var(--color-deep)]">{{ formatPrice(stats?.revenue ?? 0) }}</p>
                    <p class="text-xs text-[var(--color-titanium)]">Revenue</p>
                  </div>
                </div>
              </div>
              <div class="card-design p-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-warning)]/10">
                    <Icon name="lucide:users" class="h-5 w-5 text-[var(--color-warning)]" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold text-[var(--color-deep)]">{{ stats?.staffCount ?? 0 }}</p>
                    <p class="text-xs text-[var(--color-titanium)]">Staff</p>
                  </div>
                </div>
              </div>
              <div class="card-design p-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-info)]/10">
                    <Icon name="lucide:scissors" class="h-5 w-5 text-[var(--color-info)]" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold text-[var(--color-deep)]">{{ stats?.servicesCount ?? 0 }}</p>
                    <p class="text-xs text-[var(--color-titanium)]">Services</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="card-design p-6">
              <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Actions</h2>
              <div class="flex flex-wrap gap-3">
                <button
                  v-if="shop.is_active"
                  class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-danger)] px-5 py-2.5 text-sm font-semibold text-[var(--color-danger)] transition-all hover:bg-[var(--color-danger)]/5 disabled:opacity-50"
                  :disabled="isTogglingStatus"
                  @click="toggleShopStatus"
                >
                  <Icon v-if="isTogglingStatus" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
                  <Icon v-else name="lucide:ban" class="h-4 w-4" />
                  Suspend Shop
                </button>
                <button
                  v-else
                  class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-success)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  :disabled="isTogglingStatus"
                  @click="toggleShopStatus"
                >
                  <Icon v-if="isTogglingStatus" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
                  <Icon v-else name="lucide:check-circle" class="h-4 w-4" />
                  Reinstate Shop
                </button>
                <button
                  class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  :disabled="isImpersonating"
                  @click="impersonateShop"
                >
                  <Icon v-if="isImpersonating" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
                  <Icon v-else name="lucide:log-in" class="h-4 w-4" />
                  Login as Shop Admin
                </button>
              </div>
            </div>
          </div>

          <!-- ===== STAFF TAB ===== -->
          <div v-else-if="activeTab === 'staff'" class="space-y-4">
            <!-- Loading -->
            <div v-if="staffLoading" class="space-y-3">
              <div v-for="n in 3" :key="n" class="h-12 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
            </div>

            <!-- Empty -->
            <div v-else-if="staffList.length === 0" class="py-8 text-center">
              <Icon name="lucide:users" class="mx-auto mb-3 h-12 w-12 text-[var(--color-silver)]" />
              <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">No Staff Found</h3>
              <p class="text-sm text-[var(--color-titanium)]">This shop has no staff members yet.</p>
            </div>

            <!-- Staff Table -->
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
                    <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Name</th>
                    <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Role</th>
                    <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Email</th>
                    <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Status</th>
                    <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="staff in staffList"
                    :key="staff.id"
                    class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
                  >
                    <td class="px-4 py-3 font-medium text-[var(--color-deep)]">
                      <div class="flex items-center gap-2">
                        <div class="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-deep)] text-[10px] font-bold text-white">
                          {{ (staff.display_name || '?').charAt(0).toUpperCase() }}
                        </div>
                        {{ staff.display_name || 'Unknown' }}
                      </div>
                    </td>
                    <td class="px-4 py-3 capitalize text-[var(--color-deep)]">{{ staff.role }}</td>
                    <td class="px-4 py-3 text-[var(--color-titanium)]">{{ staff.email }}</td>
                    <td class="px-4 py-3 text-center">
                      <StatusBadge :status="staff.is_active ? 'active' : 'inactive'" size="sm" />
                    </td>
                    <td class="px-4 py-3 text-[var(--color-titanium)]">{{ formatDate(staff.created_at) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ===== BOOKINGS TAB ===== -->
          <div v-else-if="activeTab === 'bookings'" class="space-y-4">
            <!-- Loading -->
            <div v-if="bookingsLoading" class="space-y-3">
              <div v-for="n in 3" :key="n" class="h-12 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
            </div>

            <!-- Empty -->
            <div v-else-if="bookingsList.length === 0" class="py-8 text-center">
              <Icon name="lucide:calendar-x" class="mx-auto mb-3 h-12 w-12 text-[var(--color-silver)]" />
              <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">No Bookings Found</h3>
              <p class="text-sm text-[var(--color-titanium)]">This shop has no bookings yet.</p>
            </div>

            <!-- Bookings Table -->
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
                    <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Ref</th>
                    <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Customer</th>
                    <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Service</th>
                    <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Date</th>
                    <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Status</th>
                    <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Payment</th>
                    <th class="px-4 py-3 text-right font-medium text-[var(--color-titanium)]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="booking in bookingsList"
                    :key="booking.id"
                    class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
                  >
                    <td class="px-4 py-3">
                      <span class="font-mono text-xs font-bold text-[var(--color-deep)]">{{ booking.booking_ref }}</span>
                    </td>
                    <td class="px-4 py-3 text-[var(--color-deep)]">{{ booking.customer_name || 'Guest' }}</td>
                    <td class="px-4 py-3 text-[var(--color-deep)]">{{ booking.service_name }}</td>
                    <td class="px-4 py-3">
                      <p class="text-[var(--color-deep)]">{{ formatDate(booking.date) }}</p>
                      <p v-if="booking.start_time" class="text-xs text-[var(--color-titanium)]">{{ formatTime(booking.start_time) }}</p>
                    </td>
                    <td class="px-4 py-3 text-center">
                      <StatusBadge :status="booking.status" size="sm" />
                    </td>
                    <td class="px-4 py-3 text-center">
                      <StatusBadge :status="booking.payment_status" size="sm" />
                    </td>
                    <td class="px-4 py-3 text-right font-medium text-[var(--color-deep)]">
                      {{ formatPrice(booking.payment_amount || booking.service_price) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ===== SUBSCRIPTION TAB ===== -->
          <div v-else-if="activeTab === 'subscription'" class="space-y-6">
            <!-- Current Plan Card -->
            <div class="card-design p-6">
              <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Current Plan</h2>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Plan</p>
                  <p class="mt-1">
                    <span
                      class="badge-pill inline-flex items-center font-medium"
                      :class="shop.plan === 'upgraded'
                        ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                        : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'"
                    >
                      {{ shop.plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
                    </span>
                  </p>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Plan Status</p>
                  <p class="mt-1">
                    <StatusBadge :status="shop.plan_status === 'active' ? 'active' : 'inactive'" size="sm" />
                  </p>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">Start Date</p>
                  <p class="mt-1 text-sm font-medium text-[var(--color-deep)]">{{ shop.plan_start_date ? formatDate(shop.plan_start_date) : '—' }}</p>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-titanium)]">End Date</p>
                  <p class="mt-1 text-sm font-medium text-[var(--color-deep)]">{{ shop.plan_end_date ? formatDate(shop.plan_end_date) : '—' }}</p>
                </div>
              </div>
            </div>

            <!-- Plan Actions -->
            <div class="card-design p-6">
              <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Plan Actions</h2>
              <div class="flex flex-wrap gap-3">
                <button
                  v-if="shop.plan === 'basic'"
                  class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-info)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  :disabled="isUpdatingPlan"
                  @click="updatePlan('upgraded')"
                >
                  <Icon v-if="isUpdatingPlan" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
                  <Icon v-else name="lucide:arrow-up-circle" class="h-4 w-4" />
                  Upgrade to Paid
                </button>
                <button
                  v-if="shop.plan === 'upgraded'"
                  class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-warning)] px-5 py-2.5 text-sm font-semibold text-[var(--color-warning)] transition-all hover:bg-[var(--color-warning)]/5 disabled:opacity-50"
                  :disabled="isUpdatingPlan"
                  @click="updatePlan('basic')"
                >
                  <Icon v-if="isUpdatingPlan" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
                  <Icon v-else name="lucide:arrow-down-circle" class="h-4 w-4" />
                  Downgrade to Basic
                </button>
              </div>

              <!-- Set Expiry Date -->
              <div class="mt-6 border-t border-[var(--color-silver)]/30 pt-4">
                <p class="mb-3 text-sm font-medium text-[var(--color-deep)]">Set Expiry Date</p>
                <div class="flex items-end gap-3">
                  <div class="flex-1">
                    <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Expiry Date</label>
                    <input
                      v-model="planExpiryDate"
                      type="date"
                      class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
                    />
                  </div>
                  <button
                    class="btn-design rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    :disabled="isUpdatingPlan || !planExpiryDate"
                    @click="setExpiryDate"
                  >
                    <Icon v-if="isUpdatingPlan" name="lucide:loader-2" class="mr-1 inline h-4 w-4 animate-spin" />
                    Save
                  </button>
                </div>
              </div>
            </div>

            <!-- Subscription History -->
            <div class="card-design overflow-hidden">
              <div class="p-4 lg:p-6">
                <h2 class="text-lg font-semibold text-[var(--color-deep)]">Subscription History</h2>
              </div>

              <!-- Loading -->
              <div v-if="subscriptionLoading" class="px-4 pb-4">
                <div v-for="n in 3" :key="n" class="mb-2 h-10 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
              </div>

              <!-- Empty -->
              <div v-else-if="subscriptionHistory.length === 0" class="px-4 pb-6 text-center">
                <p class="text-sm text-[var(--color-titanium)]">No subscription history found.</p>
              </div>

              <!-- History Table -->
              <div v-else class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-t border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
                      <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Date</th>
                      <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Action</th>
                      <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">From</th>
                      <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="log in subscriptionHistory"
                      :key="log.id"
                      class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
                    >
                      <td class="px-4 py-3 text-[var(--color-titanium)]">{{ formatDateTime(log.created_at) }}</td>
                      <td class="px-4 py-3">
                        <span
                          class="badge-pill inline-flex items-center font-medium"
                          :class="log.action === 'shop.upgraded'
                            ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                            : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'"
                        >
                          {{ log.action === 'shop.upgraded' ? 'Upgraded' : 'Downgraded' }}
                        </span>
                      </td>
                      <td class="px-4 py-3 capitalize text-[var(--color-deep)]">{{ log.old_value?.plan || '—' }}</td>
                      <td class="px-4 py-3 capitalize text-[var(--color-deep)]">{{ log.new_value?.plan || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Not Found -->
    <div v-else class="card-design p-8 text-center">
      <Icon name="lucide:store" class="mx-auto mb-3 h-12 w-12 text-[var(--color-silver)]" />
      <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Shop Not Found</h3>
      <NuxtLink to="/super-admin/shops" class="text-sm text-[var(--color-info)] hover:underline">Back to Shops</NuxtLink>
    </div>
    <ConfirmDialogComponent />
  </div>
</template>
