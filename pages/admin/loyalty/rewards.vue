<script setup lang="ts">
/**
 * /admin/loyalty/rewards — Loyalty Rewards CMS
 *
 * Create, edit, and manage redeemable loyalty rewards.
 * Admin-only. Upgraded plan required.
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'
import type { LoyaltyReward, LoyaltyRewardType } from '~/types/database'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const toast = useToast()
const { confirm, ConfirmDialogComponent } = useConfirm()

const isUpgraded = computed(() => shopStore.isUpgradedPlan)

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const hasError = ref(false)
const rewards = ref<LoyaltyReward[]>([])

// Create/Edit form
const showForm = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const isSaving = ref(false)

const formName = ref('')
const formDescription = ref('')
const formType = ref<LoyaltyRewardType>('discount_fixed')
const formPointsRequired = ref(100)
const formDiscountValue = ref<number | null>(null)
const formDiscountPercent = ref<number | null>(null)
const formMaxValue = ref<number | null>(null)
const formIsActive = ref(true)

// Form validation errors
const formErrors = reactive({
  name: '',
  pointsRequired: '',
  discountValue: '',
  discountPercent: '',
})

function clearFormErrors() {
  formErrors.name = ''
  formErrors.pointsRequired = ''
  formErrors.discountValue = ''
  formErrors.discountPercent = ''
}

function validateForm(): boolean {
  clearFormErrors()
  let valid = true
  if (!formName.value.trim()) {
    formErrors.name = 'Reward name is required'
    valid = false
  }
  if (!formPointsRequired.value || formPointsRequired.value < 1) {
    formErrors.pointsRequired = 'Points required must be greater than 0'
    valid = false
  }
  if (['discount_fixed', 'free_service', 'free_product'].includes(formType.value)) {
    if (!formDiscountValue.value || formDiscountValue.value <= 0) {
      formErrors.discountValue = 'Discount value must be greater than 0'
      valid = false
    }
  }
  if (formType.value === 'discount_percent') {
    if (!formDiscountPercent.value || formDiscountPercent.value <= 0) {
      formErrors.discountPercent = 'Discount percent must be greater than 0'
      valid = false
    } else if (formDiscountPercent.value > 100) {
      formErrors.discountPercent = 'Discount percent cannot exceed 100'
      valid = false
    }
  }
  return valid
}

// ─── Fetch Rewards ─────────────────────────────────
async function fetchRewards() {
  isLoading.value = true
  hasError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const response = await $fetch('/api/admin/loyalty/rewards', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }) as LoyaltyReward[]

    rewards.value = response || []
  } catch (error: any) {
    hasError.value = true
    toast.error('Failed to load rewards')
    console.error('Error fetching rewards:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Reset Form ────────────────────────────────────
function resetForm() {
  formName.value = ''
  formDescription.value = ''
  formType.value = 'discount_fixed'
  formPointsRequired.value = 100
  formDiscountValue.value = null
  formDiscountPercent.value = null
  formMaxValue.value = null
  formIsActive.value = true
  isEditing.value = false
  editingId.value = null
  showForm.value = false
  clearFormErrors()
}

// ─── Open Create Form ──────────────────────────────
function openCreate() {
  resetForm()
  showForm.value = true
}

// ─── Open Edit Form ────────────────────────────────
function openEdit(reward: LoyaltyReward) {
  isEditing.value = true
  editingId.value = reward.id
  formName.value = reward.name
  formDescription.value = reward.description || ''
  formType.value = reward.type
  formPointsRequired.value = reward.points_required
  formDiscountValue.value = reward.discount_value
  formDiscountPercent.value = reward.discount_percent
  formMaxValue.value = reward.max_value
  formIsActive.value = reward.is_active
  showForm.value = true
}

// ─── Save Reward ───────────────────────────────────
async function saveReward() {
  if (!validateForm()) return
  isSaving.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const payload = {
      name: formName.value,
      description: formDescription.value || null,
      type: formType.value,
      points_required: formPointsRequired.value,
      discount_value: ['discount_fixed', 'free_service', 'free_product'].includes(formType.value) ? formDiscountValue.value : null,
      discount_percent: formType.value === 'discount_percent' ? formDiscountPercent.value : null,
      max_value: formMaxValue.value,
      is_active: formIsActive.value,
    }

    if (isEditing.value && editingId.value) {
      await $fetch(`/api/admin/loyalty/rewards/${editingId.value}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      })
      toast.success('Reward updated successfully')
    } else {
      await $fetch('/api/admin/loyalty/rewards', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      })
      toast.success('Reward created successfully')
    }

    resetForm()
    await fetchRewards()
  } catch (error: any) {
    const message = error?.data?.statusMessage || error?.message || 'Failed to save reward'
    toast.error(message)
    console.error('Error saving reward:', error)
  } finally {
    isSaving.value = false
  }
}

// ─── Delete Reward ─────────────────────────────────
async function deleteReward(reward: LoyaltyReward) {
  const ok = await confirm({ title: 'Delete Reward', message: `Delete "${reward.name}"? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' })
  if (!ok) return

  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    await $fetch(`/api/admin/loyalty/rewards/${reward.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    toast.success('Reward deleted')
    await fetchRewards()
  } catch (error: any) {
    toast.error('Failed to delete reward')
    console.error('Error deleting reward:', error)
  }
}

// ─── Helpers ───────────────────────────────────────
function formatRewardType(type: LoyaltyRewardType): string {
  const labels: Record<LoyaltyRewardType, string> = {
    discount_fixed: 'Fixed Discount',
    discount_percent: 'Percent Discount',
    free_service: 'Free Service',
    free_product: 'Free Product',
  }
  return labels[type] || type
}

function formatRewardValue(reward: LoyaltyReward): string {
  if (reward.type === 'discount_fixed' && reward.discount_value) {
    return `₱${reward.discount_value.toLocaleString()} off`
  }
  if (reward.type === 'discount_percent' && reward.discount_percent) {
    return `${reward.discount_percent}% off${reward.max_value ? ` (max ₱${reward.max_value})` : ''}`
  }
  if (reward.type === 'free_service') return 'Free service'
  if (reward.type === 'free_product') return 'Free product'
  return ''
}

onMounted(() => {
  if (isUpgraded.value) fetchRewards()
})
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <!-- Page Header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <NuxtLink to="/admin/loyalty" class="text-[var(--color-titanium)] hover:text-[var(--color-deep)]">
          <Icon name="lucide:arrow-left" class="h-5 w-5" />
        </NuxtLink>
        <div>
          <h1 class="text-2xl font-bold text-[var(--color-deep)]">Loyalty Rewards</h1>
          <p class="text-sm text-[var(--color-titanium)]">Create and manage redeemable rewards for your customers</p>
        </div>
      </div>
      <button
        v-if="isUpgraded && !showForm"
        class="btn-design flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-titanium)]"
        @click="openCreate"
      >
        <Icon name="lucide:plus" class="h-4 w-4" />
        Add Reward
      </button>
    </div>

    <!-- Upgrade Prompt -->
    <div v-if="!isUpgraded" class="card-design p-6 text-center">
      <Icon name="lucide:lock" class="mx-auto mb-3 h-10 w-10 text-[var(--color-info)]" />
      <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Upgrade to Manage Rewards</h3>
      <p class="mb-4 text-sm text-[var(--color-titanium)]">
        Loyalty rewards are available on the Upgraded plan.
      </p>
    </div>

    <!-- Create/Edit Form -->
    <div v-if="isUpgraded && showForm" class="card-design p-6">
      <h2 class="mb-4 text-lg font-semibold text-[var(--color-deep)]">
        {{ isEditing ? 'Edit Reward' : 'Create New Reward' }}
      </h2>

      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Reward Name *</label>
            <input
              v-model="formName"
              type="text"
              placeholder="e.g., ₱100 Off Coupon"
              class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
              :class="formErrors.name ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]/50'"
              @input="formErrors.name = ''"
            />
            <p v-if="formErrors.name" class="mt-1 text-xs text-[var(--color-danger)]">{{ formErrors.name }}</p>
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Points Required *</label>
            <input
              v-model.number="formPointsRequired"
              type="number"
              min="1"
              placeholder="100"
              class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
              :class="formErrors.pointsRequired ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]/50'"
              @input="formErrors.pointsRequired = ''"
            />
            <p v-if="formErrors.pointsRequired" class="mt-1 text-xs text-[var(--color-danger)]">{{ formErrors.pointsRequired }}</p>
          </div>
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Description</label>
          <textarea
            v-model="formDescription"
            rows="2"
            placeholder="Brief description of the reward..."
            class="input-design w-full resize-none border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
          />
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium text-[var(--color-deep)]">Reward Type</label>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              v-for="rt in ['discount_fixed', 'discount_percent', 'free_service', 'free_product']"
              :key="rt"
              class="rounded-input border p-3 text-center text-xs font-medium transition-colors"
              :class="formType === rt
                ? 'border-[var(--color-deep)] bg-[var(--color-deep)]/5 text-[var(--color-deep)]'
                : 'border-[var(--color-silver)]/50 text-[var(--color-titanium)] hover:border-[var(--color-deep)]/30'"
              @click="formType = rt as LoyaltyRewardType"
            >
              {{ formatRewardType(rt as LoyaltyRewardType) }}
            </button>
          </div>
        </div>

        <!-- Discount Value (for discount_fixed, free_service, free_product) -->
        <div v-if="['discount_fixed', 'free_service', 'free_product'].includes(formType)" class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Discount Value (₱)</label>
            <input
              v-model.number="formDiscountValue"
              type="number"
              min="0"
              step="0.01"
              placeholder="100.00"
              class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
              :class="formErrors.discountValue ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]/50'"
              @input="formErrors.discountValue = ''"
            />
            <p v-if="formErrors.discountValue" class="mt-1 text-xs text-[var(--color-danger)]">{{ formErrors.discountValue }}</p>
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Max Discount Value (₱)</label>
            <input
              v-model.number="formMaxValue"
              type="number"
              min="0"
              step="0.01"
              placeholder="No limit"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            />
          </div>
        </div>

        <!-- Discount Percent -->
        <div v-if="formType === 'discount_percent'" class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Discount (%)</label>
            <input
              v-model.number="formDiscountPercent"
              type="number"
              min="1"
              max="100"
              placeholder="10"
              class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
              :class="formErrors.discountPercent ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]/50'"
              @input="formErrors.discountPercent = ''"
            />
            <p v-if="formErrors.discountPercent" class="mt-1 text-xs text-[var(--color-danger)]">{{ formErrors.discountPercent }}</p>
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Max Discount Value (₱)</label>
            <input
              v-model.number="formMaxValue"
              type="number"
              min="0"
              step="0.01"
              placeholder="No limit"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            />
          </div>
        </div>

        <!-- Active Toggle -->
        <div class="flex items-center justify-between rounded-input bg-[var(--color-white)] p-4">
          <div>
            <p class="font-medium text-[var(--color-deep)]">Active</p>
            <p class="text-sm text-[var(--color-titanium)]">Make this reward available for redemption</p>
          </div>
          <button
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
            :class="formIsActive ? 'bg-[var(--color-success)]' : 'bg-[var(--color-silver)]'"
            @click="formIsActive = !formIsActive"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
              :class="formIsActive ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </div>
      </div>

      <!-- Form Actions -->
      <div class="mt-6 flex items-center justify-end gap-3">
        <button
          class="btn-design rounded-btn border border-[var(--color-silver)] px-4 py-2 text-sm font-medium text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
          @click="resetForm"
        >
          Cancel
        </button>
        <button
          class="btn-design flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isSaving || !formName.trim() || formPointsRequired < 1"
          @click="saveReward"
        >
          <Icon v-if="isSaving" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
          {{ isEditing ? 'Update Reward' : 'Create Reward' }}
        </button>
      </div>
    </div>

    <!-- Rewards List -->
    <div v-if="isUpgraded">
      <!-- Loading -->
      <div v-if="isLoading" class="space-y-3">
        <div v-for="n in 3" :key="n" class="card-design p-4">
          <div class="h-16 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
        </div>
      </div>

      <!-- Error State -->
      <ErrorState
        v-else-if="hasError"
        title="Failed to Load Rewards"
        message="Something went wrong while fetching loyalty rewards. Please try again."
        :retry-fn="fetchRewards"
      />

      <!-- Empty State -->
      <div v-else-if="rewards.length === 0 && !showForm" class="card-design p-8 text-center">
        <Icon name="lucide:gift" class="mx-auto mb-3 h-12 w-12 text-[var(--color-silver)]" />
        <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">No Rewards Yet</h3>
        <p class="mb-4 text-sm text-[var(--color-titanium)]">
          Create your first loyalty reward to give customers something to redeem with their points.
        </p>
        <button
          class="btn-design bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-titanium)]"
          @click="openCreate"
        >
          <Icon name="lucide:plus" class="mr-1.5 inline h-4 w-4" /> Add First Reward
        </button>
      </div>

      <!-- Rewards Grid -->
      <div v-else class="space-y-3">
        <div
          v-for="reward in rewards"
          :key="reward.id"
          class="card-design flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4"
          :class="{ 'opacity-50': !reward.is_active }"
        >
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-btn bg-[var(--color-warning)]/10">
            <Icon name="lucide:gift" class="h-6 w-6 text-[var(--color-warning)]" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="text-sm font-semibold text-[var(--color-deep)]">{{ reward.name }}</h4>
              <span
                class="badge-pill text-[10px]"
                :class="reward.is_active ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-silver)]/30 text-[var(--color-titanium)]'"
              >
                {{ reward.is_active ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <p class="break-words text-xs text-[var(--color-titanium)]">
              {{ formatRewardType(reward.type) }} — {{ formatRewardValue(reward) }}
            </p>
          </div>
          <div class="flex items-center justify-between gap-2 sm:flex-col sm:items-end sm:gap-1">
            <p class="text-sm font-bold text-[var(--color-deep)]">{{ reward.points_required }} pts</p>
            <div class="flex items-center gap-1">
              <button
                class="rounded-btn p-2.5 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]"
                @click="openEdit(reward)"
              >
                <Icon name="lucide:pencil" class="h-4 w-4" />
              </button>
              <button
                class="rounded-btn p-2.5 text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
                @click="deleteReward(reward)"
              >
                <Icon name="lucide:trash-2" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <ConfirmDialogComponent />
  </div>
</template>
