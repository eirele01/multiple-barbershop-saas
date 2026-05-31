<script setup lang="ts">
/**
 * /admin/payments/verification — Payment Verification Queue
 *
 * Full verification queue with:
 * - Tabs (Pending, Verified, Rejected, More Info) with live counts
 * - Filter panel (date range, payment method)
 * - Action buttons: Verify, Reject, Request Info
 * - Inline confirmation bars and slide-down forms (NOT modals)
 * - Proof image lightbox with Verify/Reject buttons
 * - Real-time updates via Supabase Realtime
 * - Relative time display with auto-refresh
 *
 * Accessible by: admin, manager, cashier
 */

import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'
import type { VerificationStatus } from '~/types/database'

definePageMeta({
  layout: 'admin',
  middleware: [
    'auth',
    (to, from) => roleMiddleware('admin', 'manager', 'cashier'),
  ],
})

const authStore = useAuthStore()
const shopStore = useShopStore()

// ─── Role check ──────────────────────────────────────
const canVerify = computed(() => {
  const role = authStore.role
  return role === 'admin' || role === 'manager' || role === 'cashier'
})

onMounted(async () => {
  if (!canVerify.value) {
    navigateTo('/admin/dashboard')
    return
  }
  
  // Wait for auth session to be ready
  // before fetching data
  const supabase = useSupabase()
  const { data } = await supabase.auth.getSession()
  
  if (!data.session) {
    navigateTo('/login')
    return
  }
  
  fetchVerifications()
  setupRealtime()
})

onUnmounted(() => {
  teardownRealtime()
})

// ─── State ────────────────────────────────────────────
interface EnrichedVerification {
  id: string
  shop_id: string
  booking_id: string
  customer_id: string
  payment_method_id: string
  amount: number
  proof_image_url: string
  reference_number: string | null
  status: VerificationStatus
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  info_request_msg: string | null
  created_at: string
  updated_at: string
  // Enriched fields
  booking_ref: string
  service_name: string
  service_price: number
  customer_name: string
  customer_phone: string
  payment_method_name: string
  reviewed_by_name: string | null
}

const verifications = ref<EnrichedVerification[]>([])
const isLoading = ref(true)
const activeTab = ref<VerificationStatus | 'all'>('pending')

// Counts for tabs
const counts = ref({
  pending: 0,
  verified: 0,
  rejected: 0,
  more_info: 0,
})

// Filters
const showFilters = ref(false)
const filterDateFrom = ref('')
const filterDateTo = ref('')
const filterMethodId = ref('')
const paymentMethodOptions = ref<{ id: string; name: string }[]>([])

// Pagination
const currentPage = ref(1)
const totalPages = ref(1)
const totalItems = ref(0)
const limit = 20

// Action states (per verification card)
const verifyConfirmId = ref<string | null>(null)
const rejectFormId = ref<string | null>(null)
const rejectReason = ref('')
const infoFormId = ref<string | null>(null)
const infoMessage = ref('')
const isActioning = ref(false)

// Lightbox
const lightboxOpen = ref(false)
const lightboxImageUrl = ref('')
const lightboxVerificationId = ref<string | null>(null)
const lightboxZoom = ref(1)

// Toast
const toast = useToast()

// Realtime subscription
let realtimeChannel: any = null

// ─── Fetch verifications ─────────────────────────────
async function getAuthToken(): Promise<string> {
  const supabase = useSupabase()
  
  // Try current session first
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) {
    return data.session.access_token
  }
  
  // Session expired — try to refresh
  const { data: refreshed } = await supabase.auth.refreshSession()
  if (refreshed.session?.access_token) {
    return refreshed.session.access_token
  }
  
  // No session at all — redirect to login
  navigateTo('/login')
  return ''
}

async function fetchVerifications(page = 1) {
  isLoading.value = true
  try {
    const params = new URLSearchParams()
    if (activeTab.value !== 'all') params.set('status', activeTab.value)
    if (filterDateFrom.value) params.set('dateFrom', filterDateFrom.value)
    if (filterDateTo.value) params.set('dateTo', filterDateTo.value)
    if (filterMethodId.value) params.set('methodId', filterMethodId.value)
    params.set('page', page.toString())
    params.set('limit', limit.toString())

    const response = await $fetch<any>(`/api/admin/payment-verifications?${params.toString()}`, {
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })

    verifications.value = response.data || []
    counts.value = response.counts || { pending: 0, verified: 0, rejected: 0, more_info: 0 }
    currentPage.value = response.pagination?.page || 1
    totalPages.value = response.pagination?.totalPages || 1
    totalItems.value = response.pagination?.total || 0
  } catch (e: any) {
    toast.error('Failed to load verifications')
  } finally {
    isLoading.value = false
  }
}

// Fetch payment method options for filter dropdown
async function fetchPaymentMethodOptions() {
  try {
    const response = await $fetch<any>('/api/admin/payment-methods', {
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    paymentMethodOptions.value = (response.data || []).map((m: any) => ({ id: m.id, name: m.name }))
  } catch { /* ignore */ }
}

// ─── Tab switch ──────────────────────────────────────
function switchTab(tab: VerificationStatus | 'all') {
  activeTab.value = tab
  currentPage.value = 1
  fetchVerifications(1)
}

// ─── Filters ─────────────────────────────────────────
function applyFilters() {
  currentPage.value = 1
  fetchVerifications(1)
}

function resetFilters() {
  filterDateFrom.value = ''
  filterDateTo.value = ''
  filterMethodId.value = ''
  currentPage.value = 1
  fetchVerifications(1)
}

// ─── Load More ───────────────────────────────────────
function loadMore() {
  if (currentPage.value < totalPages.value) {
    fetchVerifications(currentPage.value + 1)
  }
}

// ─── Relative time ──────────────────────────────────
function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
}

function isNew(dateStr: string): boolean {
  const diff = Date.now() - new Date(dateStr).getTime()
  return diff < 5 * 60 * 1000 // 5 minutes
}

// Auto-refresh relative times every 30s
let timeRefreshInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timeRefreshInterval = setInterval(() => {
    // Force re-render by touching a reactive value
    verifications.value = [...verifications.value]
  }, 30000)
})
onUnmounted(() => {
  if (timeRefreshInterval) clearInterval(timeRefreshInterval)
})

// ─── Verify Action ──────────────────────────────────
function showVerifyConfirm(id: string) {
  verifyConfirmId.value = id
  rejectFormId.value = null
  infoFormId.value = null
}

function cancelVerify() {
  verifyConfirmId.value = null
}

async function confirmVerify(id: string) {
  isActioning.value = true
  try {
    await $fetch(`/api/admin/payment-verifications/${id}/verify`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    toast.success('Payment verified successfully')
    // Animate out by removing from list
    verifications.value = verifications.value.filter((v) => v.id !== id)
    counts.value.pending = Math.max(0, counts.value.pending - 1)
    counts.value.verified += 1
    verifyConfirmId.value = null
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to verify payment')
  } finally {
    isActioning.value = false
  }
}

// ─── Reject Action ──────────────────────────────────
function showRejectForm(id: string) {
  rejectFormId.value = id
  rejectReason.value = ''
  verifyConfirmId.value = null
  infoFormId.value = null
}

function cancelReject() {
  rejectFormId.value = null
  rejectReason.value = ''
}

async function confirmReject(id: string) {
  if (!rejectReason.value.trim()) {
    toast.error('Rejection reason is required')
    return
  }
  isActioning.value = true
  try {
    await $fetch(`/api/admin/payment-verifications/${id}/reject`, {
      method: 'PATCH',
      body: { rejection_reason: rejectReason.value },
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    toast.success('Payment rejected')
    verifications.value = verifications.value.filter((v) => v.id !== id)
    counts.value.pending = Math.max(0, counts.value.pending - 1)
    counts.value.rejected += 1
    rejectFormId.value = null
    rejectReason.value = ''
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to reject payment')
  } finally {
    isActioning.value = false
  }
}

// ─── Request Info Action ─────────────────────────────
function showInfoForm(id: string) {
  infoFormId.value = id
  infoMessage.value = ''
  verifyConfirmId.value = null
  rejectFormId.value = null
}

function cancelInfo() {
  infoFormId.value = null
  infoMessage.value = ''
}

async function confirmInfo(id: string) {
  if (!infoMessage.value.trim()) {
    toast.error('Message is required')
    return
  }
  isActioning.value = true
  try {
    await $fetch(`/api/admin/payment-verifications/${id}/request-info`, {
      method: 'PATCH',
      body: { info_request_msg: infoMessage.value },
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    toast.success('Info request sent to customer')
    // Move to More Info tab
    verifications.value = verifications.value.filter((v) => v.id !== id)
    counts.value.pending = Math.max(0, counts.value.pending - 1)
    counts.value.more_info += 1
    infoFormId.value = null
    infoMessage.value = ''
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to request info')
  } finally {
    isActioning.value = false
  }
}

// ─── Lightbox ───────────────────────────────────────
function openLightbox(url: string, verificationId: string) {
  lightboxImageUrl.value = url
  lightboxVerificationId.value = verificationId
  lightboxZoom.value = 1
  lightboxOpen.value = true
}

function closeLightbox() {
  lightboxOpen.value = false
  lightboxImageUrl.value = ''
  lightboxVerificationId.value = null
}

function handleLightboxWheel(e: WheelEvent) {
  e.preventDefault()
  if (e.deltaY < 0) {
    lightboxZoom.value = Math.min(5, lightboxZoom.value + 0.2)
  } else {
    lightboxZoom.value = Math.max(0.5, lightboxZoom.value - 0.2)
  }
}

function lightboxVerify() {
  if (lightboxVerificationId.value) {
    closeLightbox()
    confirmVerify(lightboxVerificationId.value)
  }
}

function lightboxReject() {
  if (lightboxVerificationId.value) {
    closeLightbox()
    showRejectForm(lightboxVerificationId.value)
  }
}

// ─── Real-time Updates ───────────────────────────────
function setupRealtime() {
  const supabase = useSupabase()
  const shopId = authStore.shopId
  if (!shopId) return

  // Unique channel name per shop to avoid "already subscribed" errors
  const channelName = `payment-verifications-queue-${shopId}`

  // Pre-cleanup: remove any existing channel with this name
  // (handles remount after navigation)
  const existing = supabase.getChannels().find(
    (c) => c.topic === `realtime:${channelName}`
  )
  if (existing) {
    supabase.removeChannel(existing)
  }

  realtimeChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'payment_verifications',
        filter: `shop_id=eq.${shopId}`,
      },
      (payload: any) => {
        // New verification arrived
        toast.info('New payment to verify!')
        counts.value.pending += 1
        // If on pending tab, refresh
        if (activeTab.value === 'pending') {
          fetchVerifications(currentPage.value)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'payment_verifications',
        filter: `shop_id=eq.${shopId}`,
      },
      (payload: any) => {
        // Verification status changed — refresh counts
        fetchVerifications(currentPage.value)
      }
    )
    .subscribe()
}

function teardownRealtime() {
  if (realtimeChannel) {
    const supabase = useSupabase()
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
}

// Fetch method options on mount
onMounted(() => {
  fetchPaymentMethodOptions()
})

// Format currency
function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
}
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Payment Verification</h1>
        <p class="mt-1 text-sm text-[var(--color-titanium)]">
          Review and verify customer payment proofs
        </p>
      </div>
      <button
        class="btn-design flex items-center gap-2 rounded-lg border border-[var(--color-silver)]/50 px-4 py-2.5 text-sm font-medium text-[var(--color-deep)] hover:bg-[var(--color-white)]"
        @click="showFilters = !showFilters"
      >
        <Icon name="lucide:filter" class="h-4 w-4" />
        Filter
        <Icon name="lucide:chevron-down" class="h-3 w-3 transition-transform" :class="showFilters ? 'rotate-180' : ''" />
      </button>
    </div>

    <!-- Filter Panel (collapsible) -->
    <Transition
      enter-active-class="transition-all duration-200 overflow-hidden"
      enter-from-class="max-h-0 opacity-0"
      enter-to-class="max-h-60 opacity-100"
      leave-active-class="transition-all duration-200 overflow-hidden"
      leave-from-class="max-h-60 opacity-100"
      leave-to-class="max-h-0 opacity-0"
    >
      <div v-if="showFilters" class="card-design mb-6 p-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label class="mb-1.5 block text-xs font-medium text-[var(--color-titanium)]">From Date</label>
            <input
              v-model="filterDateFrom"
              type="date"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-medium text-[var(--color-titanium)]">To Date</label>
            <input
              v-model="filterDateTo"
              type="date"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-medium text-[var(--color-titanium)]">Payment Method</label>
            <select
              v-model="filterMethodId"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
            >
              <option value="">All Methods</option>
              <option v-for="pm in paymentMethodOptions" :key="pm.id" :value="pm.id">{{ pm.name }}</option>
            </select>
          </div>
        </div>
        <div class="mt-4 flex gap-3">
          <button
            class="btn-design rounded-lg bg-[var(--color-deep)] px-4 py-2 text-sm text-white hover:bg-[var(--color-deep)]/90"
            @click="applyFilters"
          >
            Apply Filters
          </button>
          <button
            class="btn-design rounded-lg border border-[var(--color-silver)]/50 px-4 py-2 text-sm text-[var(--color-deep)]"
            @click="resetFilters"
          >
            Reset
          </button>
        </div>
      </div>
    </Transition>

    <!-- Tabs -->
    <div class="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-silver)]/30">
      <button
        v-for="tab in ([
          { key: 'pending', label: 'Pending', count: counts.pending },
          { key: 'verified', label: 'Verified', count: counts.verified },
          { key: 'rejected', label: 'Rejected', count: counts.rejected },
          { key: 'more_info', label: 'More Info', count: counts.more_info },
        ] as const)"
        :key="tab.key"
        class="relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors"
        :class="activeTab === tab.key
          ? 'text-[var(--color-deep)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[var(--color-deep)]'
          : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
        <span
          class="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
          :class="tab.key === 'pending' && tab.count > 0
            ? 'bg-[var(--color-danger)] text-white'
            : 'bg-[var(--color-silver)]/30 text-[var(--color-titanium)]'"
        >
          {{ tab.count }}
        </span>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <Icon name="lucide:loader-2" class="h-8 w-8 animate-spin text-[var(--color-titanium)]" />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="verifications.length === 0"
      class="rounded-card border border-dashed border-[var(--color-silver)] p-12 text-center"
    >
      <Icon name="lucide:check-circle" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
      <h3 class="mt-4 text-lg font-semibold text-[var(--color-deep)]">
        {{ activeTab === 'pending' ? 'All caught up!' : `No ${activeTab.replace('_', ' ')} verifications` }}
      </h3>
      <p class="mt-2 text-sm text-[var(--color-titanium)]">
        {{ activeTab === 'pending' ? 'No pending payments to verify right now.' : 'No verifications match this filter.' }}
      </p>
    </div>

    <!-- Verification Cards -->
    <div v-else class="space-y-4">
      <div
        v-for="v in verifications"
        :key="v.id"
        class="card-design overflow-hidden transition-all duration-300"
      >
        <div class="p-5">
          <!-- Top row: NEW badge + Booking ref + Time -->
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span
                v-if="isNew(v.created_at) && v.status === 'pending'"
                class="badge-pill bg-[var(--color-danger)] text-[10px] text-white animate-pulse"
              >
                NEW
              </span>
              <span class="text-sm font-bold text-[var(--color-deep)]">
                #{{ v.booking_ref }}
              </span>
            </div>
            <span class="text-xs text-[var(--color-titanium)]">
              {{ timeAgo(v.created_at) }}
            </span>
          </div>

          <!-- Details Grid -->
          <div class="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span class="text-[var(--color-titanium)]">Customer</span>
              <p class="font-medium text-[var(--color-deep)]">{{ v.customer_name }}</p>
              <p v-if="v.customer_phone" class="text-xs text-[var(--color-titanium)]">{{ v.customer_phone }}</p>
            </div>
            <div>
              <span class="text-[var(--color-titanium)]">Service</span>
              <p class="font-medium text-[var(--color-deep)]">{{ v.service_name }}</p>
              <p class="text-xs text-[var(--color-titanium)]">{{ formatCurrency(v.service_price) }}</p>
            </div>
            <div>
              <span class="text-[var(--color-titanium)]">Payment Method</span>
              <p class="font-medium text-[var(--color-deep)]">{{ v.payment_method_name }}</p>
            </div>
            <div>
              <span class="text-[var(--color-titanium)]">Amount Sent</span>
              <p class="font-medium text-[var(--color-deep)]">{{ formatCurrency(v.amount) }}</p>
            </div>
            <div v-if="v.reference_number">
              <span class="text-[var(--color-titanium)]">Reference #</span>
              <p class="font-medium text-[var(--color-deep)]">{{ v.reference_number }}</p>
            </div>
          </div>

          <!-- Payment Proof Thumbnail -->
          <div v-if="v.proof_image_url" class="mb-4">
            <span class="mb-1.5 block text-xs text-[var(--color-titanium)]">Payment Proof</span>
            <img
              :src="v.proof_image_url"
              alt="Payment proof"
              loading="lazy"
              class="h-20 w-20 cursor-pointer rounded-lg border border-[var(--color-silver)]/50 object-cover transition-opacity hover:opacity-80"
              @click="openLightbox(v.proof_image_url, v.id)"
            />
          </div>

          <!-- PayMongo Payment Badge (no proof image needed) -->
          <div v-else-if="v.reference_number?.startsWith('PayMongo')" class="mb-4">
            <span class="mb-1.5 block text-xs text-[var(--color-titanium)]">Payment Method</span>
            <div class="inline-flex items-center gap-2 rounded-lg bg-[var(--color-info)]/10 px-3 py-2 text-sm">
              <Icon name="lucide:credit-card" class="h-4 w-4 text-[var(--color-info)]" />
              <span class="font-medium text-[var(--color-info)]">{{ v.reference_number }}</span>
              <span v-if="v.status === 'verified'" class="rounded-full bg-[var(--color-success)]/20 px-2 py-0.5 text-[10px] font-bold text-[var(--color-success)]">AUTO-VERIFIED</span>
              <span v-else-if="v.status === 'pending'" class="rounded-full bg-[var(--color-warning)]/20 px-2 py-0.5 text-[10px] font-bold text-[var(--color-warning)]">AWAITING PAYMENT</span>
            </div>
          </div>

          <!-- ─── PENDING TAB: Action Buttons ──────────── -->
          <div v-if="v.status === 'pending' || v.status === 'more_info'" class="flex gap-2">
            <button
              class="btn-design flex items-center gap-1.5 rounded-lg bg-[var(--color-success)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-success)]/90"
              @click="showVerifyConfirm(v.id)"
            >
              <Icon name="lucide:check" class="h-4 w-4" />
              Verify
            </button>
            <button
              class="btn-design flex items-center gap-1.5 rounded-lg bg-[var(--color-danger)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-danger)]/90"
              @click="showRejectForm(v.id)"
            >
              <Icon name="lucide:x" class="h-4 w-4" />
              Reject
            </button>
            <button
              class="btn-design flex items-center gap-1.5 rounded-lg border border-[var(--color-info)] bg-[var(--color-info)]/10 px-4 py-2 text-sm font-medium text-[var(--color-info)] hover:bg-[var(--color-info)]/20"
              @click="showInfoForm(v.id)"
            >
              <Icon name="lucide:clock" class="h-4 w-4" />
              Request Info
            </button>
          </div>

          <!-- ─── NON-PENDING TABS: Reviewer Info ──────── -->
          <div v-if="v.status !== 'pending'" class="mt-3 space-y-2 border-t border-[var(--color-silver)]/20 pt-3">
            <div class="flex items-center gap-2 text-xs text-[var(--color-titanium)]">
              <Icon name="lucide:user" class="h-3 w-3" />
              Reviewed by: <span class="font-medium text-[var(--color-deep)]">{{ v.reviewed_by_name || 'Unknown' }}</span>
              &middot;
              {{ v.reviewed_at ? new Date(v.reviewed_at).toLocaleString() : '' }}
            </div>
            <div v-if="v.rejection_reason" class="rounded-lg bg-[var(--color-danger)]/5 p-3 text-sm text-[var(--color-danger)]">
              <span class="font-medium">Rejection reason:</span> {{ v.rejection_reason }}
            </div>
            <div v-if="v.info_request_msg" class="rounded-lg bg-[var(--color-info)]/5 p-3 text-sm text-[var(--color-info)]">
              <span class="font-medium">Message sent:</span> {{ v.info_request_msg }}
            </div>
          </div>
        </div>

        <!-- ─── Inline Verify Confirmation Bar ──────── -->
        <Transition
          enter-active-class="transition-all duration-200"
          enter-from-class="max-h-0 opacity-0"
          enter-to-class="max-h-20 opacity-100"
          leave-active-class="transition-all duration-150"
          leave-from-class="max-h-20 opacity-100"
          leave-to-class="max-h-0 opacity-0"
        >
          <div
            v-if="verifyConfirmId === v.id"
            class="border-t border-[var(--color-success)]/20 bg-[var(--color-success)]/5 px-5 py-3"
          >
            <p class="mb-2 text-sm text-[var(--color-deep)]">
              Confirm payment of <strong>{{ formatCurrency(v.amount) }}</strong> from <strong>{{ v.customer_name }}</strong>?
            </p>
            <div class="flex gap-2">
              <button
                class="btn-design rounded-lg bg-[var(--color-success)] px-4 py-2 text-sm font-medium text-white"
                :disabled="isActioning"
                @click="confirmVerify(v.id)"
              >
                <Icon v-if="isActioning" name="lucide:loader-2" class="mr-1 inline h-3 w-3 animate-spin" />
                Yes, Verify
              </button>
              <button
                class="btn-design rounded-lg border border-[var(--color-silver)]/50 px-4 py-2 text-sm text-[var(--color-deep)]"
                @click="cancelVerify"
              >
                Cancel
              </button>
            </div>
          </div>
        </Transition>

        <!-- ─── Slide-down Reject Form ────────────────── -->
        <Transition
          enter-active-class="transition-all duration-200"
          enter-from-class="max-h-0 opacity-0"
          enter-to-class="max-h-60 opacity-100"
          leave-active-class="transition-all duration-150"
          leave-from-class="max-h-60 opacity-100"
          leave-to-class="max-h-0 opacity-0"
        >
          <div
            v-if="rejectFormId === v.id"
            class="border-t border-[var(--color-danger)]/20 bg-[var(--color-danger)]/5 px-5 py-4"
          >
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
              Reason for rejection <span class="text-[var(--color-titanium)]">(shown to customer)</span> *
            </label>
            <textarea
              v-model="rejectReason"
              rows="3"
              maxlength="500"
              placeholder="Explain why the payment was rejected..."
              class="input-design w-full resize-none rounded-lg border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-danger)] focus:outline-none"
            />
            <div class="mt-3 flex gap-2">
              <button
                class="btn-design rounded-lg bg-[var(--color-danger)] px-4 py-2 text-sm font-medium text-white"
                :disabled="isActioning"
                @click="confirmReject(v.id)"
              >
                <Icon v-if="isActioning" name="lucide:loader-2" class="mr-1 inline h-3 w-3 animate-spin" />
                Confirm Rejection
              </button>
              <button
                class="btn-design rounded-lg border border-[var(--color-silver)]/50 px-4 py-2 text-sm text-[var(--color-deep)]"
                @click="cancelReject"
              >
                Cancel
              </button>
            </div>
          </div>
        </Transition>

        <!-- ─── Slide-down Request Info Form ───────────── -->
        <Transition
          enter-active-class="transition-all duration-200"
          enter-from-class="max-h-0 opacity-0"
          enter-to-class="max-h-60 opacity-100"
          leave-active-class="transition-all duration-150"
          leave-from-class="max-h-60 opacity-100"
          leave-to-class="max-h-0 opacity-0"
        >
          <div
            v-if="infoFormId === v.id"
            class="border-t border-[var(--color-info)]/20 bg-[var(--color-info)]/5 px-5 py-4"
          >
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
              Message to customer *
            </label>
            <textarea
              v-model="infoMessage"
              rows="3"
              maxlength="500"
              placeholder="Ask the customer for more information..."
              class="input-design w-full resize-none rounded-lg border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-info)] focus:outline-none"
            />
            <div class="mt-3 flex gap-2">
              <button
                class="btn-design rounded-lg bg-[var(--color-info)] px-4 py-2 text-sm font-medium text-white"
                :disabled="isActioning"
                @click="confirmInfo(v.id)"
              >
                <Icon v-if="isActioning" name="lucide:loader-2" class="mr-1 inline h-3 w-3 animate-spin" />
                Send Request
              </button>
              <button
                class="btn-design rounded-lg border border-[var(--color-silver)]/50 px-4 py-2 text-sm text-[var(--color-deep)]"
                @click="cancelInfo"
              >
                Cancel
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Load More -->
      <div v-if="currentPage < totalPages" class="py-4 text-center">
        <button
          class="btn-design rounded-lg border border-[var(--color-silver)]/50 px-6 py-2.5 text-sm font-medium text-[var(--color-deep)] hover:bg-[var(--color-white)]"
          @click="loadMore"
        >
          Load More
        </button>
      </div>
    </div>

    <!-- ─── Lightbox ────────────────────────────────── -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="lightboxOpen"
          class="fixed inset-0 z-[80] flex flex-col bg-black/90"
          @keydown.esc="closeLightbox"
        >
          <!-- Top bar -->
          <div class="flex items-center justify-between p-4">
            <span class="text-sm text-white/70">Payment Proof</span>
            <div class="flex items-center gap-2">
              <button
                v-if="canVerify"
                class="btn-design flex items-center gap-1.5 rounded-lg bg-[var(--color-success)] px-3 py-2 text-sm text-white"
                @click="lightboxVerify"
              >
                <Icon name="lucide:check" class="h-4 w-4" />
                Verify
              </button>
              <button
                v-if="canVerify"
                class="btn-design flex items-center gap-1.5 rounded-lg bg-[var(--color-danger)] px-3 py-2 text-sm text-white"
                @click="lightboxReject"
              >
                <Icon name="lucide:x" class="h-4 w-4" />
                Reject
              </button>
              <button
                class="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
                @click="closeLightbox"
              >
                <Icon name="lucide:x" class="h-5 w-5" />
              </button>
            </div>
          </div>

          <!-- Image area -->
          <div class="flex flex-1 items-center justify-center overflow-auto" @wheel="handleLightboxWheel">
            <img
              :src="lightboxImageUrl"
              alt="Payment proof full view"
              loading="lazy"
              class="max-h-[80vh] max-w-[90vw] object-contain transition-transform"
              :style="{ transform: `scale(${lightboxZoom})` }"
            />
          </div>

          <!-- Zoom controls -->
          <div class="flex items-center justify-center gap-4 p-4">
            <button
              class="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
              @click="lightboxZoom = Math.max(0.5, lightboxZoom - 0.3)"
            >
              <Icon name="lucide:zoom-out" class="h-5 w-5" />
            </button>
            <span class="text-sm text-white/70">{{ Math.round(lightboxZoom * 100) }}%</span>
            <button
              class="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
              @click="lightboxZoom = Math.min(5, lightboxZoom + 0.3)"
            >
              <Icon name="lucide:zoom-in" class="h-5 w-5" />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
