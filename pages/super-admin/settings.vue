<script setup lang="ts">
/**
 * /super-admin/settings — Platform Settings
 *
 * Allows the super admin to configure platform-wide settings:
 * - Platform Info (name, URL, support email)
 * - Pricing Config (monthly/yearly upgraded plan prices)
 * - Maintenance Mode (toggle + message)
 *
 * Super admin only access.
 */

definePageMeta({
  layout: 'super-admin',
  middleware: 'super-admin',
})

const toast = useToast()

// ─── State ─────────────────────────────────────────
const isLoading = ref(true)
const settings = ref({
  platform_name: '',
  platform_url: '',
  support_email: '',
  upgraded_monthly_price: '',
  upgraded_yearly_price: '',
  maintenance_mode: 'false',
  maintenance_message: '',
})
const isSaving = ref({
  platform: false,
  pricing: false,
  maintenance: false,
})

// ─── Get Auth Token ────────────────────────────────
async function getAuthToken(): Promise<string | null> {
  const supabase = useSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

// ─── Fetch Settings ────────────────────────────────
async function fetchSettings() {
  isLoading.value = true
  try {
    const token = await getAuthToken()
    if (!token) return

    const data = await $fetch('/api/super-admin/settings', {
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    if (data) {
      const s = data.settings || data
      settings.value.platform_name = s.platform_name || ''
      settings.value.platform_url = s.platform_url || ''
      settings.value.support_email = s.support_email || ''
      settings.value.upgraded_monthly_price = s.upgraded_monthly_price || ''
      settings.value.upgraded_yearly_price = s.upgraded_yearly_price || ''
      settings.value.maintenance_mode = s.maintenance_mode || 'false'
      settings.value.maintenance_message = s.maintenance_message || ''
    }
  } catch (error: any) {
    toast.error('Failed to load settings')
    console.error('Error fetching settings:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Save Platform Info ────────────────────────────
async function savePlatformInfo() {
  isSaving.value.platform = true
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch('/api/super-admin/settings', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        platform_name: settings.value.platform_name,
        platform_url: settings.value.platform_url,
        support_email: settings.value.support_email,
      },
    })

    toast.success('Platform info saved successfully')
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to save platform info'
    toast.error(msg)
  } finally {
    isSaving.value.platform = false
  }
}

// ─── Save Pricing Config ───────────────────────────
async function savePricingConfig() {
  isSaving.value.pricing = true
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch('/api/super-admin/settings', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        upgraded_monthly_price: settings.value.upgraded_monthly_price,
        upgraded_yearly_price: settings.value.upgraded_yearly_price,
      },
    })

    toast.success('Pricing config saved successfully')
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to save pricing config'
    toast.error(msg)
  } finally {
    isSaving.value.pricing = false
  }
}

// ─── Save Maintenance Mode ─────────────────────────
async function saveMaintenanceMode() {
  isSaving.value.maintenance = true
  try {
    const token = await getAuthToken()
    if (!token) return

    await $fetch('/api/super-admin/settings', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        maintenance_mode: settings.value.maintenance_mode,
        maintenance_message: settings.value.maintenance_message,
      },
    })

    toast.success('Maintenance settings saved successfully')
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to save maintenance settings'
    toast.error(msg)
  } finally {
    isSaving.value.maintenance = false
  }
}

// ─── Toggle Maintenance Mode ───────────────────────
function toggleMaintenanceMode() {
  settings.value.maintenance_mode = settings.value.maintenance_mode === 'true' ? 'false' : 'true'
}

onMounted(() => {
  fetchSettings()
})
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-deep)]">Platform Settings</h1>
      <p class="text-sm text-[var(--color-titanium)]">Manage platform-wide configuration</p>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-4">
      <div v-for="n in 3" :key="n" class="card-design p-6">
        <div class="h-48 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
      </div>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Section 1: Platform Info -->
      <div class="card-design p-6">
        <div class="mb-5">
          <h2 class="text-lg font-semibold text-[var(--color-deep)]">Platform Info</h2>
          <p class="text-sm text-[var(--color-titanium)]">Basic platform information and contact details</p>
        </div>

        <div class="space-y-4">
          <!-- Platform Name -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Platform Name</label>
            <input
              v-model="settings.platform_name"
              type="text"
              placeholder="e.g., ClipperHub"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            />
          </div>

          <!-- Platform URL -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Platform URL</label>
            <input
              v-model="settings.platform_url"
              type="text"
              placeholder="e.g., https://clipperhub.com"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            />
          </div>

          <!-- Support Email -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Support Email</label>
            <input
              v-model="settings.support_email"
              type="email"
              placeholder="e.g., support@clipperhub.com"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            />
          </div>

          <!-- Save Button -->
          <div class="flex justify-end pt-2">
            <button
              class="btn-design rounded-btn bg-[var(--color-deep)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              :disabled="isSaving.platform"
              @click="savePlatformInfo"
            >
              <Icon v-if="isSaving.platform" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
              Save
            </button>
          </div>
        </div>
      </div>

      <!-- Section 2: Pricing Config -->
      <div class="card-design p-6">
        <div class="mb-5">
          <h2 class="text-lg font-semibold text-[var(--color-deep)]">Pricing Config</h2>
          <p class="text-sm text-[var(--color-titanium)]">These are used for MRR calculation and shown on the public pricing page</p>
        </div>

        <div class="space-y-4">
          <!-- Monthly Price -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Upgraded Plan Monthly Price ₱</label>
            <input
              v-model="settings.upgraded_monthly_price"
              type="number"
              min="0"
              step="1"
              placeholder="e.g., 499"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            />
          </div>

          <!-- Yearly Price -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Upgraded Plan Yearly Price ₱</label>
            <input
              v-model="settings.upgraded_yearly_price"
              type="number"
              min="0"
              step="1"
              placeholder="e.g., 4990"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            />
          </div>

          <!-- Helper Text -->
          <p class="text-xs text-[var(--color-titanium)]">
            These are used for MRR calculation and shown on the public pricing page
          </p>

          <!-- Save Button -->
          <div class="flex justify-end pt-2">
            <button
              class="btn-design rounded-btn bg-[var(--color-deep)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              :disabled="isSaving.pricing"
              @click="savePricingConfig"
            >
              <Icon v-if="isSaving.pricing" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
              Save
            </button>
          </div>
        </div>
      </div>

      <!-- Section 3: Maintenance Mode -->
      <div class="card-design p-6">
        <div class="mb-5">
          <h2 class="text-lg font-semibold text-[var(--color-deep)]">Maintenance Mode</h2>
          <p class="text-sm text-[var(--color-titanium)]">Enable maintenance mode to temporarily disable access for shop owners and customers</p>
        </div>

        <div class="space-y-4">
          <!-- Toggle -->
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-[var(--color-deep)]">Maintenance Mode</p>
              <p class="text-xs text-[var(--color-titanium)]">
                When enabled, all shops show a maintenance page
              </p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span
                class="text-xs font-medium"
                :class="settings.maintenance_mode === 'true' ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'"
              >
                {{ settings.maintenance_mode === 'true' ? 'ON' : 'OFF' }}
              </span>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="settings.maintenance_mode === 'true' ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-success)]'"
                @click="toggleMaintenanceMode"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="settings.maintenance_mode === 'true' ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </div>
          </div>

          <!-- Maintenance Message (shown when mode is ON) -->
          <div v-if="settings.maintenance_mode === 'true'">
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Maintenance Message</label>
            <textarea
              v-model="settings.maintenance_message"
              rows="3"
              placeholder="e.g., We're performing scheduled maintenance. We'll be back shortly."
              class="input-design w-full resize-none border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            />
          </div>

          <!-- Warning when ON -->
          <div
            v-if="settings.maintenance_mode === 'true'"
            class="flex items-start gap-2 rounded-input border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 p-3"
          >
            <Icon name="lucide:alert-triangle" class="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            <p class="text-xs text-[var(--color-deep)]">
              <strong>Warning:</strong> Maintenance mode is currently enabled. All shops and booking pages will show the maintenance message instead of their normal content.
            </p>
          </div>

          <!-- Save Button -->
          <div class="flex justify-end pt-2">
            <button
              class="btn-design rounded-btn bg-[var(--color-deep)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              :disabled="isSaving.maintenance"
              @click="saveMaintenanceMode"
            >
              <Icon v-if="isSaving.maintenance" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
              Save
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
