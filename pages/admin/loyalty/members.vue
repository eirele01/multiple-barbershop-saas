<script setup lang="ts">
/**
 * /admin/loyalty/members — Admin Loyalty Member View
 *
 * List all loyalty members with balance, tier, total earned.
 * Admin can adjust points for any member.
 * Admin-only. Upgraded plan required.
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
const members = ref<any[]>([])
const totalMembers = ref(0)
const page = ref(1)
const searchQuery = ref('')

// Adjust points modal
const showAdjustModal = ref(false)
const adjustMemberId = ref('')
const adjustMemberName = ref('')
const adjustPoints_val = ref(0)
const adjustNote = ref('')
const isAdjusting = ref(false)

// ─── Fetch Members ─────────────────────────────────
async function fetchMembers() {
  isLoading.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const response = await $fetch('/api/admin/loyalty/members', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      params: {
        page: page.value,
        limit: 20,
        search: searchQuery.value || undefined,
      },
    }) as any

    members.value = response.members || []
    totalMembers.value = response.total || 0
  } catch (error: any) {
    toast.error('Failed to load loyalty members')
    console.error('Error fetching members:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Open Adjust Modal ─────────────────────────────
function openAdjustModal(member: any) {
  adjustMemberId.value = member.id
  adjustMemberName.value = member.displayName || member.email
  adjustPoints_val.value = 0
  adjustNote.value = ''
  showAdjustModal.value = true
}

// ─── Submit Adjustment ─────────────────────────────
async function submitAdjustment() {
  if (adjustPoints_val.value === 0 || !adjustNote.value.trim()) {
    toast.error('Please enter points and a reason')
    return
  }

  isAdjusting.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    await $fetch(`/api/admin/loyalty/members/${adjustMemberId.value}/adjust`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        points: adjustPoints_val.value,
        note: adjustNote.value,
      },
    })

    toast.success(`Points adjusted for ${adjustMemberName.value}`)
    showAdjustModal.value = false
    await fetchMembers()
  } catch (error: any) {
    const message = error?.data?.statusMessage || error?.message || 'Failed to adjust points'
    toast.error(message)
  } finally {
    isAdjusting.value = false
  }
}

// ─── Helpers ───────────────────────────────────────
const tierBadgeClass = (tier: string) => {
  const map: Record<string, string> = {
    bronze: 'bg-amber-100 text-amber-800',
    silver: 'bg-gray-200 text-gray-700',
    gold: 'bg-yellow-100 text-yellow-800',
    platinum: 'bg-purple-100 text-purple-800',
  }
  return map[tier] || map.bronze
}

// ─── Search ────────────────────────────────────────
let searchTimeout: any = null
function onSearchInput() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    fetchMembers()
  }, 300)
}

onMounted(() => {
  if (isUpgraded.value) fetchMembers()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <NuxtLink to="/admin/loyalty" class="text-[var(--color-titanium)] hover:text-[var(--color-deep)]">
          <Icon name="lucide:arrow-left" class="h-5 w-5" />
        </NuxtLink>
        <div>
          <h1 class="text-2xl font-bold text-[var(--color-deep)]">Loyalty Members</h1>
          <p class="text-sm text-[var(--color-titanium)]">{{ totalMembers }} member{{ totalMembers !== 1 ? 's' : '' }}</p>
        </div>
      </div>
    </div>

    <!-- Search -->
    <div class="relative">
      <Icon name="lucide:search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-titanium)]" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search by name or email..."
        class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] py-2.5 pl-10 pr-4 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
        @input="onSearchInput"
      />
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-3">
      <div v-for="n in 5" :key="n" class="card-design p-4">
        <div class="h-12 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="members.length === 0" class="card-design p-8 text-center">
      <Icon name="lucide:users" class="mx-auto mb-3 h-12 w-12 text-[var(--color-silver)]" />
      <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">No Members Yet</h3>
      <p class="text-sm text-[var(--color-titanium)]">Customers will appear here once they earn their first loyalty points.</p>
    </div>

    <!-- Members Table (Desktop) -->
    <div v-else class="card-design overflow-hidden">
      <div class="hidden md:block">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5">
                <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Customer</th>
                <th class="px-4 py-3 text-left font-medium text-[var(--color-titanium)]">Tier</th>
                <th class="px-4 py-3 text-right font-medium text-[var(--color-titanium)]">Balance</th>
                <th class="px-4 py-3 text-right font-medium text-[var(--color-titanium)]">Total Earned</th>
                <th class="px-4 py-3 text-right font-medium text-[var(--color-titanium)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="member in members"
                :key="member.id"
                class="border-b border-[var(--color-silver)]/10 transition-colors hover:bg-[var(--color-silver)]/5"
              >
                <td class="px-4 py-3">
                  <p class="font-medium text-[var(--color-deep)]">{{ member.displayName }}</p>
                  <p class="text-xs text-[var(--color-titanium)]">{{ member.email }}</p>
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-block rounded-pill px-2.5 py-0.5 text-xs font-bold capitalize"
                    :class="tierBadgeClass(member.tier)"
                  >
                    {{ member.tier }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right font-bold text-[var(--color-deep)]">{{ member.balance }}</td>
                <td class="px-4 py-3 text-right text-[var(--color-titanium)]">{{ member.totalEarned }}</td>
                <td class="px-4 py-3 text-right">
                  <button
                    class="rounded-btn px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20"
                    @click="openAdjustModal(member)"
                  >
                    <Icon name="lucide:sliders" class="mr-1 inline h-3.5 w-3.5" /> Adjust
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mobile Card Layout -->
      <div class="md:hidden">
        <div
          v-for="member in members"
          :key="member.id"
          class="border-b border-[var(--color-silver)]/10 p-4 last:border-0"
        >
          <div class="mb-2 flex items-center justify-between">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-[var(--color-deep)]">{{ member.displayName }}</p>
              <p class="truncate text-xs text-[var(--color-titanium)]">{{ member.email }}</p>
            </div>
            <span
              class="ml-2 inline-block shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-bold capitalize"
              :class="tierBadgeClass(member.tier)"
            >
              {{ member.tier }}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex gap-4">
              <div>
                <p class="text-[10px] font-medium uppercase text-[var(--color-titanium)]">Balance</p>
                <p class="font-bold text-[var(--color-deep)]">{{ member.balance }}</p>
              </div>
              <div>
                <p class="text-[10px] font-medium uppercase text-[var(--color-titanium)]">Earned</p>
                <p class="text-[var(--color-titanium)]">{{ member.totalEarned }}</p>
              </div>
            </div>
            <button
              class="h-11 rounded-btn px-3 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20"
              @click="openAdjustModal(member)"
            >
              <Icon name="lucide:sliders" class="mr-1 inline h-3.5 w-3.5" /> Adjust
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalMembers > 20" class="flex flex-col gap-2 border-t border-[var(--color-silver)]/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs text-[var(--color-titanium)]">
          Showing {{ (page - 1) * 20 + 1 }}-{{ Math.min(page * 20, totalMembers) }} of {{ totalMembers }}
        </p>
        <div class="flex gap-2">
          <button
            class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page <= 1"
            @click="page--; fetchMembers()"
          >
            Previous
          </button>
          <button
            class="h-9 rounded-btn border border-[var(--color-silver)]/50 px-3 text-xs text-[var(--color-titanium)] disabled:opacity-50"
            :disabled="page >= Math.ceil(totalMembers / 20)"
            @click="page++; fetchMembers()"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Adjust Points Modal -->
    <div
      v-if="showAdjustModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="showAdjustModal = false"
    >
      <div class="card-design mx-4 w-full max-w-md p-6">
        <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">Adjust Points</h2>
        <p class="mb-4 text-sm text-[var(--color-titanium)]">
          Adjusting points for <strong>{{ adjustMemberName }}</strong>
        </p>

        <div class="space-y-4">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Points</label>
            <p class="mb-2 text-xs text-[var(--color-titanium)]">Positive to add, negative to deduct</p>
            <input
              v-model.number="adjustPoints_val"
              type="number"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Reason *</label>
            <textarea
              v-model="adjustNote"
              rows="2"
              placeholder="e.g., Compensation for service issue"
              class="input-design w-full resize-none border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            />
          </div>
        </div>

        <div class="mt-6 flex items-center justify-end gap-3">
          <button
            class="rounded-btn border border-[var(--color-silver)] px-4 py-2 text-sm font-medium text-[var(--color-titanium)]"
            @click="showAdjustModal = false"
          >
            Cancel
          </button>
          <button
            class="btn-design flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            :disabled="isAdjusting || adjustPoints_val === 0 || !adjustNote.trim()"
            @click="submitAdjustment"
          >
            <Icon v-if="isAdjusting" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
            {{ isAdjusting ? 'Processing...' : 'Adjust Points' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
