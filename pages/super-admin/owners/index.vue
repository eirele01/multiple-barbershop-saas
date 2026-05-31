<script setup lang="ts">
/**
 * /super-admin/owners — Super Admin Shop Owners List
 *
 * Shows all shop owners on the platform with filters:
 * - Search (name, email)
 * - Status filter (active / suspended)
 *
 * Table columns: Name, Email, Shop Name, Plan, Registered, Last Login, Status, Actions
 * Pagination: 20 per page
 *
 * Actions: View Shop, Suspend/Reinstate, Reset Password (modal with reset link)
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
const owners = ref<any[]>([])
const totalOwners = ref(0)
const page = ref(1)
const perPage = 20

// Filters
const searchQuery = ref('')
const filterStatus = ref('')

// Action states
const isToggling = ref<string | null>(null)
const isResettingPassword = ref<string | null>(null)

// Reset Password Modal
const showResetModal = ref(false)
const resetLink = ref('')
const resetOwnerName = ref('')
const copiedToClipboard = ref(false)

// ─── Get Auth Token ────────────────────────────────
async function getAuthToken(): Promise<string | null> {
  const supabase = useSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

// ─── Fetch Owners ─────────────────────────────────
async function fetchOwners() {
  isLoading.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    const data = await $fetch('/api/super-admin/owners', {
      params: {
        search: searchQuery.value || undefined,
        status: filterStatus.value || undefined,
        page: page.value,
        limit: perPage,
      },
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    owners.value = data.owners || []
    totalOwners.value = data.total || 0
  } catch (error: any) {
    toast.error('Failed to load shop owners')
    console.error('Error fetching owners:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Toggle Owner Status ──────────────────────────
async function toggleOwnerStatus(ownerId: string, currentActive: boolean) {
  const action = currentActive ? 'suspend' : 'reinstate'
  const ok = await confirm({ title: `${action === 'suspend' ? 'Suspend' : 'Reinstate'} Owner`, message: `Are you sure you want to ${action} this owner?`, confirmLabel: action === 'suspend' ? 'Suspend' : 'Reinstate', variant: 'warning' })
  if (!ok) return

  isToggling.value = ownerId
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch(`/api/super-admin/owners/${ownerId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: { is_active: !currentActive },
    })

    toast.success(`Owner ${action}d successfully`)
    await fetchOwners()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || `Failed to ${action} owner`
    toast.error(msg)
  } finally {
    isToggling.value = null
  }
}

// ─── Reset Password ───────────────────────────────
async function resetPassword(ownerId: string, ownerName: string) {
  const ok = await confirm({ title: 'Generate Reset Link', message: `Generate a password reset link for ${ownerName}?`, confirmLabel: 'Generate', variant: 'default' })
  if (!ok) return

  isResettingPassword.value = ownerId
  copiedToClipboard.value = false
  try {
    const token = await getAuthToken()
    if (!token) return

    const data = await $fetch(`/api/super-admin/owners/${ownerId}/reset-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    resetLink.value = data.resetLink || data.reset_link || ''
    resetOwnerName.value = ownerName
    showResetModal.value = true
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to generate reset link'
    toast.error(msg)
  } finally {
    isResettingPassword.value = null
  }
}

// ─── Copy Reset Link ──────────────────────────────
async function copyResetLink() {
  try {
    await navigator.clipboard.writeText(resetLink.value)
    copiedToClipboard.value = true
    toast.success('Link copied to clipboard')
    setTimeout(() => { copiedToClipboard.value = false }, 3000)
  } catch {
    toast.error('Failed to copy link')
  }
}

// ─── Filter Actions ───────────────────────────────
function applyFilters() {
  page.value = 1
  fetchOwners()
}

function resetFilters() {
  searchQuery.value = ''
  filterStatus.value = ''
  page.value = 1
  fetchOwners()
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
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getInitial(name: string): string {
  return name ? name.charAt(0).toUpperCase() : '?'
}

const totalPages = computed(() => Math.ceil(totalOwners.value / perPage))

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

onMounted(() => {
  fetchOwners()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-deep)]">Shop Owners</h1>
      <p class="text-sm text-[var(--color-titanium)]">{{ totalOwners }} owner{{ totalOwners !== 1 ? 's' : '' }}</p>
    </div>

    <!-- Filters -->
    <div class="card-design p-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <!-- Search -->
        <div class="lg:col-span-2">
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Search</label>
          <div class="relative">
            <Icon name="lucide:search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-titanium)]" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search by name or email..."
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] py-2.5 pl-10 pr-4 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
              @keyup.enter="applyFilters"
            />
          </div>
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
    <div v-else-if="owners.length === 0" class="card-design p-8 text-center">
      <Icon name="lucide:users" class="mx-auto mb-3 h-12 w-12 text-[var(--color-silver)]" />
      <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">No Shop Owners Found</h3>
      <p class="text-sm text-[var(--color-titanium)]">No owners match your current filters. Try adjusting your search criteria.</p>
    </div>

    <!-- Owners Table -->
    <div v-else class="card-design overflow-hidden">
      <!-- Desktop Table -->
      <div class="hidden md:block">
        <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Name</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Email</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Shop</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Plan</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Registered</th>
              <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Last Login</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Status</th>
              <th class="px-4 py-3 text-center font-medium text-[var(--color-titanium)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="owner in owners"
              :key="owner.id"
              class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
            >
              <!-- Name with avatar -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <div class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-deep)] text-[10px] font-bold text-white">
                    {{ getInitial(owner.displayName || owner.display_name) }}
                  </div>
                  <span class="font-medium text-[var(--color-deep)]">{{ owner.displayName || owner.display_name || 'Unknown' }}</span>
                </div>
              </td>
              <!-- Email -->
              <td class="px-4 py-3 text-[var(--color-deep)]"><span class="truncate">{{ owner.email }}</span></td>
              <!-- Shop Name -->
              <td class="px-4 py-3">
                <NuxtLink
                  v-if="owner.shop"
                  :to="`/super-admin/shops/${owner.shop.id}`"
                  class="text-sm font-medium text-[var(--color-info)] hover:underline"
                >
                  {{ owner.shop.name || 'View Shop' }}
                </NuxtLink>
                <span v-else class="text-[var(--color-titanium)]">No shop</span>
              </td>
              <!-- Plan -->
              <td class="px-4 py-3 text-center">
                <span
                  v-if="owner.shop?.plan"
                  class="badge-pill inline-flex items-center font-medium"
                  :class="owner.shop.plan === 'upgraded'
                    ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                    : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'"
                >
                  {{ owner.shop.plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
                </span>
                <span v-else class="text-[var(--color-titanium)]">—</span>
              </td>
              <!-- Registered -->
              <td class="px-4 py-3 text-[var(--color-titanium)]">{{ formatDate(owner.createdAt || owner.created_at) }}</td>
              <!-- Last Login -->
              <td class="px-4 py-3 text-[var(--color-titanium)]">{{ formatDateTime(owner.lastLoginAt || owner.last_login_at) }}</td>
              <!-- Status -->
              <td class="px-4 py-3 text-center">
                <StatusBadge :status="(owner.isActive ?? owner.is_active) ? 'active' : 'inactive'" size="sm" />
              </td>
              <!-- Actions -->
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  <NuxtLink
                    v-if="owner.shop"
                    :to="`/super-admin/shops/${owner.shop.id}`"
                    class="rounded-btn px-2.5 py-1.5 text-xs font-medium text-[var(--color-info)] transition-colors hover:bg-[var(--color-info)]/10"
                  >
                    <Icon name="lucide:store" class="mr-1 inline h-3.5 w-3.5" /> View Shop
                  </NuxtLink>
                  <button
                    v-if="owner.is_active"
                    class="rounded-btn px-2.5 py-1.5 text-xs font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
                    :disabled="isToggling === owner.id"
                    @click="toggleOwnerStatus(owner.id, true)"
                  >
                    <Icon v-if="isToggling === owner.id" name="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
                    <Icon v-else name="lucide:ban" class="mr-1 inline h-3.5 w-3.5" />
                    Suspend
                  </button>
                  <button
                    v-else
                    class="rounded-btn px-2.5 py-1.5 text-xs font-medium text-[var(--color-success)] transition-colors hover:bg-[var(--color-success)]/10 disabled:opacity-50"
                    :disabled="isToggling === owner.id"
                    @click="toggleOwnerStatus(owner.id, false)"
                  >
                    <Icon v-if="isToggling === owner.id" name="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
                    <Icon v-else name="lucide:check-circle" class="mr-1 inline h-3.5 w-3.5" />
                    Reinstate
                  </button>
                  <button
                    class="rounded-btn px-2.5 py-1.5 text-xs font-medium text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)] disabled:opacity-50"
                    :disabled="isResettingPassword === owner.id"
                    @click="resetPassword(owner.id, owner.displayName || owner.display_name || owner.email)"
                  >
                    <Icon v-if="isResettingPassword === owner.id" name="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
                    <Icon v-else name="lucide:key-round" class="mr-1 inline h-3.5 w-3.5" />
                    Reset Password
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
          v-for="owner in owners"
          :key="owner.id"
          class="border-b border-[var(--color-silver)]/10 p-4 last:border-0"
        >
          <div class="mb-2 flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <div class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-deep)] text-[10px] font-bold text-white">
                {{ getInitial(owner.displayName || owner.display_name) }}
              </div>
              <div class="min-w-0">
                <p class="truncate font-medium text-[var(--color-deep)]">{{ owner.displayName || owner.display_name || 'Unknown' }}</p>
                <p class="truncate text-xs text-[var(--color-titanium)]">{{ owner.email }}</p>
              </div>
            </div>
            <StatusBadge :status="(owner.isActive ?? owner.is_active) ? 'active' : 'inactive'" size="sm" />
          </div>
          <div class="mt-1 flex items-center justify-between text-xs text-[var(--color-titanium)]">
            <div class="flex items-center gap-2">
              <NuxtLink
                v-if="owner.shop"
                :to="`/super-admin/shops/${owner.shop.id}`"
                class="truncate text-[var(--color-info)] hover:underline"
              >
                {{ owner.shop.name || 'View Shop' }}
              </NuxtLink>
              <span v-else>No shop</span>
              <span
                v-if="owner.shop?.plan"
                class="badge-pill text-[10px]"
                :class="owner.shop.plan === 'upgraded'
                  ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                  : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'"
              >
                {{ owner.shop.plan === 'upgraded' ? 'Upgraded' : 'Basic' }}
              </span>
            </div>
            <span>{{ formatDate(owner.createdAt || owner.created_at) }}</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            <button
              v-if="owner.is_active"
              class="h-9 rounded-btn px-2.5 text-xs font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
              :disabled="isToggling === owner.id"
              @click="toggleOwnerStatus(owner.id, true)"
            >
              <Icon v-if="isToggling === owner.id" name="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
              <Icon v-else name="lucide:ban" class="mr-1 inline h-3.5 w-3.5" />
              Suspend
            </button>
            <button
              v-else
              class="h-9 rounded-btn px-2.5 text-xs font-medium text-[var(--color-success)] transition-colors hover:bg-[var(--color-success)]/10 disabled:opacity-50"
              :disabled="isToggling === owner.id"
              @click="toggleOwnerStatus(owner.id, false)"
            >
              <Icon v-if="isToggling === owner.id" name="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
              <Icon v-else name="lucide:check-circle" class="mr-1 inline h-3.5 w-3.5" />
              Reinstate
            </button>
            <button
              class="h-9 rounded-btn px-2.5 text-xs font-medium text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)] disabled:opacity-50"
              :disabled="isResettingPassword === owner.id"
              @click="resetPassword(owner.id, owner.displayName || owner.display_name || owner.email)"
            >
              <Icon v-if="isResettingPassword === owner.id" name="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
              <Icon v-else name="lucide:key-round" class="mr-1 inline h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex flex-col gap-2 border-t border-[var(--color-silver)]/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs text-[var(--color-titanium)]">
          Showing {{ (page - 1) * perPage + 1 }}-{{ Math.min(page * perPage, totalOwners) }} of {{ totalOwners }}
        </p>
        <div class="flex gap-2">
          <button
            class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page <= 1"
            @click="page--; fetchOwners()"
          >
            Previous
          </button>
          <button
            class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page >= totalPages"
            @click="page++; fetchOwners()"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Reset Password Modal -->
    <div
      v-if="showResetModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="showResetModal = false"
    >
      <div class="card-design mx-4 w-full max-w-md p-6">
        <div class="mb-4 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-warning)]/10">
            <Icon name="lucide:key-round" class="h-5 w-5 text-[var(--color-warning)]" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-[var(--color-deep)]">Password Reset Link</h2>
            <p class="text-xs text-[var(--color-titanium)]">For {{ resetOwnerName }}</p>
          </div>
        </div>

        <p class="mb-4 text-sm text-[var(--color-titanium)]">
          Password reset link generated. Share this link with the owner to reset their password.
        </p>

        <div class="mb-4 rounded-btn border border-[var(--color-silver)]/50 bg-[var(--color-white)] p-3">
          <p class="break-all font-mono text-xs text-[var(--color-deep)]">{{ resetLink }}</p>
        </div>

        <div class="flex items-center justify-end gap-3">
          <button
            class="rounded-btn border border-[var(--color-silver)] px-4 py-2 text-sm font-medium text-[var(--color-titanium)]"
            @click="showResetModal = false"
          >
            Close
          </button>
          <button
            class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            @click="copyResetLink"
          >
            <Icon v-if="copiedToClipboard" name="lucide:check" class="h-4 w-4" />
            <Icon v-else name="lucide:copy" class="h-4 w-4" />
            {{ copiedToClipboard ? 'Copied!' : 'Copy Link' }}
          </button>
        </div>
      </div>
    </div>
    <ConfirmDialogComponent />
  </div>
</template>
