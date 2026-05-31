<script setup lang="ts">
/**
 * /admin/loyalty/settings — Loyalty Program Settings
 *
 * Configure loyalty program parameters:
 * - Enable/disable loyalty
 * - Earn rate & earn base
 * - Welcome bonus
 * - Points expiry months
 * - Tier system (enable/disable + tier thresholds)
 *
 * Admin-only. Upgraded plan required.
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'
import type { LoyaltyTiers } from '~/types/database'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const toast = useToast()

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const loadError = ref(false)
const isSaving = ref(false)

const loyaltyEnabled = ref(false)
const earnRate = ref(1)
const earnBase = ref(100)
const welcomeBonus = ref(50)
const expiryMonths = ref(12)
const tiersEnabled = ref(false)
const tiers = ref<LoyaltyTiers>({
  bronze: { min: 0, max: 499, multiplier: 1.0 },
  silver: { min: 500, max: 1499, multiplier: 1.2 },
  gold: { min: 1500, max: 2999, multiplier: 1.5 },
  platinum: { min: 3000, max: null, multiplier: 2.0 },
})

const isUpgraded = computed(() => shopStore.isUpgradedPlan)

// ─── Fetch Settings ────────────────────────────────
async function fetchSettings() {
  isLoading.value = true
  loadError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { loadError.value = true; return }

    const response = await $fetch('/api/admin/loyalty/settings', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    loyaltyEnabled.value = response.loyalty_enabled ?? false
    earnRate.value = response.loyalty_earn_rate ?? 1
    earnBase.value = response.loyalty_earn_base ?? 100
    welcomeBonus.value = response.loyalty_welcome_bonus ?? 50
    expiryMonths.value = response.loyalty_expiry_months ?? 12
    tiersEnabled.value = response.loyalty_tiers_enabled ?? false
    if (response.loyalty_tiers) {
      tiers.value = response.loyalty_tiers
    }
  } catch (error: any) {
    loadError.value = true
    toast.error('Failed to load loyalty settings')
    console.error('Error fetching loyalty settings:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Save Settings ─────────────────────────────────
async function saveSettings() {
  isSaving.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    await $fetch('/api/admin/loyalty/settings', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        loyalty_enabled: loyaltyEnabled.value,
        loyalty_earn_rate: earnRate.value,
        loyalty_earn_base: earnBase.value,
        loyalty_welcome_bonus: welcomeBonus.value,
        loyalty_expiry_months: expiryMonths.value,
        loyalty_tiers_enabled: tiersEnabled.value,
        loyalty_tiers: tiersEnabled.value ? tiers.value : undefined,
      },
    })

    toast.success('Loyalty settings saved successfully')
    await shopStore.loadCurrentShop()
  } catch (error: any) {
    const message = error?.data?.statusMessage || error?.message || 'Failed to save loyalty settings'
    toast.error(message)
    console.error('Error saving loyalty settings:', error)
  } finally {
    isSaving.value = false
  }
}

// ─── Navigation ────────────────────────────────────
const activeTab = ref<'settings' | 'rewards' | 'members' | 'transactions'>('settings')

onMounted(() => {
  fetchSettings()
})
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <!-- Page Header -->
    <div>
      <div class="flex items-center gap-3 mb-1">
        <NuxtLink to="/admin/loyalty" class="text-[var(--color-titanium)] hover:text-[var(--color-deep)]">
          <Icon name="lucide:arrow-left" class="h-5 w-5" />
        </NuxtLink>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Loyalty Settings</h1>
      </div>
      <p class="text-sm text-[var(--color-titanium)]">Configure your loyalty program rules and tier system</p>
    </div>

    <!-- Upgrade Prompt -->
    <div v-if="!isUpgraded" class="card-design p-6 text-center">
      <Icon name="lucide:lock" class="mx-auto mb-3 h-10 w-10 text-[var(--color-info)]" />
      <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Upgrade to Enable Loyalty</h3>
      <p class="mb-4 text-sm text-[var(--color-titanium)]">
        The loyalty program is available on the Upgraded plan. Reward your customers with points, tiers, and redeemable rewards.
      </p>
      <button class="btn-design bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-titanium)]">
        Upgrade Plan
      </button>
    </div>

    <!-- Loading -->
    <div v-else-if="isLoading" class="space-y-6">
      <div class="card-design p-6">
        <div class="space-y-4">
          <div class="h-16 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
          <div class="h-16 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
          <div class="h-16 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="card-design p-8 text-center">
      <Icon name="lucide:alert-circle" class="mx-auto mb-3 h-12 w-12 text-[var(--color-danger)]" />
      <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Failed to Load Settings</h3>
      <button class="btn-design bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white" @click="fetchSettings">
        <Icon name="lucide:refresh-cw" class="mr-1.5 inline h-4 w-4" /> Retry
      </button>
    </div>

    <!-- Settings Content -->
    <div v-else class="space-y-6">

      <!-- Master Toggle -->
      <div class="card-design p-6">
        <div class="flex items-center justify-between rounded-input bg-[var(--color-white)] p-4">
          <div>
            <p class="font-medium text-[var(--color-deep)]">Enable Loyalty Program</p>
            <p class="text-sm text-[var(--color-titanium)]">Allow customers to earn and redeem loyalty points</p>
          </div>
          <button
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
            :class="loyaltyEnabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-silver)]'"
            @click="loyaltyEnabled = !loyaltyEnabled"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
              :class="loyaltyEnabled ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </div>

        <div v-if="loyaltyEnabled" class="mt-5 space-y-5">
          <!-- Earn Rate -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Points Earn Rate</label>
            <p class="mb-2 text-xs text-[var(--color-titanium)]">How many points customers earn per earn base amount</p>
            <div class="flex flex-wrap items-center gap-3">
              <input
                v-model.number="earnRate"
                type="number"
                min="1"
                max="100"
                class="input-design w-24 border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)]"
              />
              <span class="text-sm text-[var(--color-titanium)]">points per</span>
              <input
                v-model.number="earnBase"
                type="number"
                min="1"
                class="input-design w-32 border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)]"
              />
              <span class="text-sm text-[var(--color-titanium)]">peso spent</span>
            </div>
            <p class="mt-1.5 text-xs text-[var(--color-titanium)]">
              Example: {{ earnRate }} point(s) per ₱{{ earnBase }} spent → A ₱{{ earnBase * 5 }} service earns {{ earnRate * 5 }} points
            </p>
          </div>

          <!-- Welcome Bonus -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Welcome Bonus</label>
            <p class="mb-2 text-xs text-[var(--color-titanium)]">Points awarded to new customers on their first booking</p>
            <div class="flex items-center gap-3">
              <input
                v-model.number="welcomeBonus"
                type="number"
                min="0"
                max="10000"
                class="input-design w-32 border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)]"
              />
              <span class="text-sm text-[var(--color-titanium)]">points</span>
            </div>
            <p class="mt-1.5 text-xs text-[var(--color-titanium)]">
              Set to 0 to disable the welcome bonus. Each customer only receives it once.
            </p>
          </div>

          <!-- Expiry -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Points Expiry</label>
            <p class="mb-2 text-xs text-[var(--color-titanium)]">Number of months before earned points expire (0 = never expire)</p>
            <div class="flex items-center gap-3">
              <input
                v-model.number="expiryMonths"
                type="number"
                min="0"
                max="120"
                class="input-design w-32 border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)]"
              />
              <span class="text-sm text-[var(--color-titanium)]">months</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tier System -->
      <div v-if="loyaltyEnabled" class="card-design p-6">
        <div class="mb-4 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-warning)]/10">
            <Icon name="lucide:trophy" class="h-5 w-5 text-[var(--color-warning)]" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-[var(--color-deep)]">Tier System</h2>
            <p class="text-sm text-[var(--color-titanium)]">Reward loyal customers with tier-based point multipliers</p>
          </div>
        </div>

        <div class="flex items-center justify-between rounded-input bg-[var(--color-white)] p-4">
          <div>
            <p class="font-medium text-[var(--color-deep)]">Enable Tiers</p>
            <p class="text-sm text-[var(--color-titanium)]">Higher tiers earn points faster with multipliers</p>
          </div>
          <button
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
            :class="tiersEnabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-silver)]'"
            @click="tiersEnabled = !tiersEnabled"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
              :class="tiersEnabled ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </div>

        <!-- Tier Configuration -->
        <div v-if="tiersEnabled" class="mt-5 space-y-4">
          <div
            v-for="(tier, key) in tiers"
            :key="key"
            class="rounded-input border border-[var(--color-silver)]/30 p-4"
          >
            <div class="flex items-center gap-2 mb-3">
              <span class="capitalize text-sm font-semibold text-[var(--color-deep)]">{{ key }}</span>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label class="mb-1 block text-xs text-[var(--color-titanium)]">Min Points</label>
                <input
                  v-model.number="tier.min"
                  type="number"
                  min="0"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs text-[var(--color-titanium)]">Max Points</label>
                <input
                  v-model.number="tier.max"
                  type="number"
                  :min="0"
                  :placeholder="tier.max === null ? 'No limit' : ''"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs text-[var(--color-titanium)]">Multiplier</label>
                <input
                  v-model.number="tier.multiplier"
                  type="number"
                  min="0.1"
                  step="0.1"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Save Button -->
      <div class="flex justify-end">
        <button
          class="btn-design flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isSaving"
          @click="saveSettings"
        >
          <Icon v-if="isSaving" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
          <Icon v-else name="lucide:save" class="h-4 w-4" />
          {{ isSaving ? 'Saving...' : 'Save Loyalty Settings' }}
        </button>
      </div>
    </div>
  </div>
</template>
