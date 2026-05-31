<script setup lang="ts">
/**
 * Admin Settings — Payment & Email Tabs
 * Route: /admin/settings
 *
 * Phase 5+6: PayMongo Integration + Email Notification System
 *
 * Tab 1 — Payment: PayMongo settings (Upgraded only) + Manual QR
 * Tab 2 — Email: Resend API settings (Upgraded only)
 *
 * Permissions:
 *   Admin: full access to all settings
 *   Manager/Cashier/Barber: limited read-only access
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const toast = useToast()

// ─── Tab State ──────────────────────────────────────
const activeTab = ref<'payment' | 'email'>('payment')

// ─── Payment Settings State ──────────────────────────
const isPaymentLoading = ref(true)
const paymentLoadError = ref(false)
const isPaymentSaving = ref(false)
const isTestingConnection = ref(false)
const testResult = ref<{ valid: boolean; error?: string } | null>(null)

const paymongoEnabled = ref(false)
const manualPaymentEnabled = ref(true)
const paymongoPublicKey = ref('')
const paymongoSecretKey = ref('')
const paymongoTestMode = ref(true)
const paymongoWebhookSecret = ref('')
const gcashEnabled = ref(true)
const mayaEnabled = ref(true)
const instapayEnabled = ref(true)
const qrPhEnabled = ref(true)
const webhookUrl = ref('')
const shopSlug = ref('')
const shopPlan = ref<'basic' | 'upgraded'>('basic')

const hasSecretKeySaved = ref(false)
const hasWebhookSecretSaved = ref(false)
const secretKeyDirty = ref(false)
const webhookSecretDirty = ref(false)
const showSecretKey = ref(false)
const showWebhookSecret = ref(false)
const encryptionConfigured = ref(true)

// ─── Email Settings State ────────────────────────────
const isEmailLoading = ref(true)
const emailLoadError = ref(false)
const isEmailSaving = ref(false)
const isTestingResend = ref(false)
const resendTestResult = ref<{ sent: boolean; error?: string; email?: string } | null>(null)

const resendApiKey = ref('')
const senderEmail = ref('')
const senderName = ref('')
const emailConfirmation = ref(true)
const emailReminder = ref(true)
const reminderHoursFirst = ref(24)
const reminderHoursSecond = ref(2)

const hasResendKeySaved = ref(false)
const resendKeyDirty = ref(false)
const showResendKey = ref(false)
const shopOwnerEmail = ref('')

// ─── Computed ────────────────────────────────────────
const isAdmin = computed(() => authStore.role === 'admin')
const isUpgradedPlan = computed(() => shopPlan.value === 'upgraded')
const isBasicPlan = computed(() => shopPlan.value === 'basic')

const atLeastOnePayMongoMethod = computed(() =>
  gcashEnabled.value || mayaEnabled.value || instapayEnabled.value || qrPhEnabled.value
)

const atLeastOnePaymentMethod = computed(() =>
  paymongoEnabled.value || manualPaymentEnabled.value
)

const canTestConnection = computed(() => {
  const result = hasSecretKeySaved.value || (secretKeyDirty.value && paymongoSecretKey.value.trim() !== '')
  console.log('[canTestConnection] Computed:', { hasSecretKeySaved: hasSecretKeySaved.value, secretKeyDirty: secretKeyDirty.value, keyLength: paymongoSecretKey.value.trim().length, result })
  return result
})

const canTestResend = computed(() =>
  hasResendKeySaved.value || (resendKeyDirty.value && resendApiKey.value.trim() !== '')
)

// ─── Helper: Get auth token ─────────────────────────
function getAuthToken(): string | null {
  return authStore.accessToken
}

// ─── Fetch Payment Settings ──────────────────────────
async function fetchPaymentSettings() {
  isPaymentLoading.value = true
  paymentLoadError.value = false
  try {
    const token = getAuthToken()
    if (!token) {
      paymentLoadError.value = true
      return
    }

    const response = await $fetch('/api/admin/settings/payment', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    shopPlan.value = response.plan
    paymongoEnabled.value = response.paymongo_enabled
    manualPaymentEnabled.value = response.manual_payment_enabled
    paymongoPublicKey.value = response.paymongo_public_key || ''
    paymongoTestMode.value = response.paymongo_test_mode
    gcashEnabled.value = response.gcash_enabled
    mayaEnabled.value = response.maya_enabled
    instapayEnabled.value = response.instapay_enabled
    qrPhEnabled.value = response.qr_ph_enabled
    webhookUrl.value = response.paymongo_webhook_url || ''
    shopSlug.value = response.slug || ''

    hasSecretKeySaved.value = !!response.paymongo_secret_key
    paymongoSecretKey.value = ''
    hasWebhookSecretSaved.value = !!response.paymongo_webhook_secret
    paymongoWebhookSecret.value = ''
    secretKeyDirty.value = false
    webhookSecretDirty.value = false
    encryptionConfigured.value = response.encryption_configured ?? true
  } catch (error: any) {
    paymentLoadError.value = true
    toast.error('Failed to load payment settings')
    console.error('Error fetching payment settings:', error)
  } finally {
    isPaymentLoading.value = false
  }
}

// ─── Fetch Email Settings ────────────────────────────
async function fetchEmailSettings() {
  isEmailLoading.value = true
  emailLoadError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      emailLoadError.value = true
      return
    }

    const response = await $fetch('/api/admin/settings/email', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    // Update shopPlan if email route returns it (may be different from payment load)
    if (response.plan) shopPlan.value = response.plan

    hasResendKeySaved.value = !!response.resend_api_key
    resendApiKey.value = ''
    senderEmail.value = response.sender_email || ''
    senderName.value = response.sender_name || ''
    emailConfirmation.value = response.email_confirmation ?? true
    emailReminder.value = response.email_reminder ?? true

    const hours = response.reminder_hours || [24, 2]
    reminderHoursFirst.value = hours[0] || 24
    reminderHoursSecond.value = hours[1] || 2

    shopOwnerEmail.value = response.shop_owner_email || ''

    resendKeyDirty.value = false
  } catch (error: any) {
    emailLoadError.value = true
    toast.error('Failed to load email settings')
    console.error('Error fetching email settings:', error)
  } finally {
    isEmailLoading.value = false
  }
}

// ─── Test PayMongo Connection ────────────────────────
async function testConnection() {
  console.log('[testConnection] Button clicked!')
  console.log('[testConnection] secretKeyDirty:', secretKeyDirty.value)
  console.log('[testConnection] paymongoSecretKey:', `"${paymongoSecretKey.value}"`)
  console.log('[testConnection] hasSecretKeySaved:', hasSecretKeySaved.value)
  console.log('[testConnection] canTestConnection result:', canTestConnection.value)

  isTestingConnection.value = true
  testResult.value = null
  try {
    const token = getAuthToken()
    if (!token) {
      console.log('[testConnection] No auth token')
      testResult.value = { valid: false, error: 'Not authenticated — please log in again' }
      return
    }
    console.log('[testConnection] Got auth token, sending API request...')

    // If user has typed a new unsaved key, test THAT key instead of the saved one
    const useUnsavedKey = secretKeyDirty.value && paymongoSecretKey.value.trim() !== ''
    console.log('[testConnection] useUnsavedKey:', useUnsavedKey)

    console.log('[testConnection] Calling /api/admin/settings/test-paymongo...')
    const response = await $fetch('/api/admin/settings/test-paymongo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: useUnsavedKey
        ? { useUnsavedKey: true, secretKey: paymongoSecretKey.value.trim() }
        : {},
    }) as any
    console.log('[testConnection] API response received:', response)

    testResult.value = { valid: response.valid, error: response.error }
  } catch (error: any) {
    console.log('[testConnection] Error caught:', error)
    const serverMessage = error?.data?.statusMessage || error?.message || 'Connection test failed'
    testResult.value = { valid: false, error: serverMessage }
  } finally {
    isTestingConnection.value = false
    console.log('[testConnection] Finished (isTestingConnection set to false)')
  }
}

// ─── Test Resend Connection ──────────────────────────
async function testResendConnection() {
  isTestingResend.value = true
  resendTestResult.value = null
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const response = await $fetch('/api/admin/settings/test-resend', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    resendTestResult.value = { sent: response.sent, error: response.error, email: response.email }
  } catch (error: any) {
    resendTestResult.value = { sent: false, error: 'Test email failed' }
  } finally {
    isTestingResend.value = false
  }
}

// ─── Save Payment Settings ──────────────────────────
async function savePaymentSettings() {
  console.log('[savePaymentSettings] Button clicked!')

  if (isUpgradedPlan.value && !paymongoEnabled.value && !manualPaymentEnabled.value) {
    console.log('[savePaymentSettings] Validation failed: no payment method enabled')
    toast.error('At least one payment method must be enabled.')
    return
  }

  if (paymongoEnabled.value && !atLeastOnePayMongoMethod.value) {
    console.log('[savePaymentSettings] Validation failed: no PayMongo method')
    toast.error('At least one PayMongo payment method must be enabled when PayMongo is active.')
    return
  }

  isPaymentSaving.value = true
  console.log('[savePaymentSettings] isPaymentSaving set to true')

  try {
    const token = getAuthToken()
    if (!token) {
      console.log('[savePaymentSettings] No auth token — aborting')
      isPaymentSaving.value = false
      return
    }
    console.log('[savePaymentSettings] Got auth token')

    const payload: Record<string, any> = {
      paymongo_enabled: paymongoEnabled.value,
      manual_payment_enabled: manualPaymentEnabled.value,
      paymongo_public_key: paymongoPublicKey.value || null,
      gcash_enabled: gcashEnabled.value,
      maya_enabled: mayaEnabled.value,
      instapay_enabled: instapayEnabled.value,
      qr_ph_enabled: qrPhEnabled.value,
      paymongo_test_mode: paymongoTestMode.value,
    }

    if (secretKeyDirty.value && paymongoSecretKey.value.trim()) {
      payload.paymongo_secret_key = paymongoSecretKey.value.trim()
      console.log('[savePaymentSettings] Including secret key in payload')
    }

    if (webhookSecretDirty.value && paymongoWebhookSecret.value.trim()) {
      payload.paymongo_webhook_secret = paymongoWebhookSecret.value.trim()
      console.log('[savePaymentSettings] Including webhook secret in payload')
    }

    console.log('[savePaymentSettings] Sending PATCH /api/admin/settings/payment...', { ...payload, paymongo_secret_key: payload.paymongo_secret_key ? '[REDACTED]' : undefined })
    const response = await $fetch('/api/admin/settings/payment', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
    }) as any
    console.log('[savePaymentSettings] API response received:', response)

    toast.success('Payment settings saved successfully')

    if (secretKeyDirty.value && paymongoSecretKey.value.trim()) {
      hasSecretKeySaved.value = true
    }
    if (webhookSecretDirty.value && paymongoWebhookSecret.value.trim()) {
      hasWebhookSecretSaved.value = true
    }

    secretKeyDirty.value = false
    webhookSecretDirty.value = false
    paymongoSecretKey.value = ''
    paymongoWebhookSecret.value = ''
    testResult.value = null

    // Refresh payment settings from the just-saved data
    // (skip shopStore.loadCurrentShop() to avoid hanging on Supabase client)
    if (response.paymongo_enabled !== undefined) paymongoEnabled.value = response.paymongo_enabled
    if (response.manual_payment_enabled !== undefined) manualPaymentEnabled.value = response.manual_payment_enabled
    if (response.hasOwnProperty('paymongo_public_key')) paymongoPublicKey.value = response.paymongo_public_key || ''
    if (response.paymongo_test_mode !== undefined) paymongoTestMode.value = response.paymongo_test_mode
    if (response.gcash_enabled !== undefined) gcashEnabled.value = response.gcash_enabled
    if (response.maya_enabled !== undefined) mayaEnabled.value = response.maya_enabled
    if (response.instapay_enabled !== undefined) instapayEnabled.value = response.instapay_enabled
    if (response.qr_ph_enabled !== undefined) qrPhEnabled.value = response.qr_ph_enabled
    if (response.paymongo_webhook_url) webhookUrl.value = response.paymongo_webhook_url
    if (response.slug) shopSlug.value = response.slug
  } catch (error: any) {
    const message = error?.data?.statusMessage || error?.message || 'Failed to save payment settings'
    toast.error(message)
    console.error('Error saving payment settings:', error)
  } finally {
    isPaymentSaving.value = false
  }
}

// ─── Save Email Settings ────────────────────────────
async function saveEmailSettings() {
  isEmailSaving.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const payload: Record<string, any> = {
      sender_email: senderEmail.value || null,
      sender_name: senderName.value || null,
      email_confirmation: emailConfirmation.value,
      email_reminder: emailReminder.value,
      reminder_hours: [reminderHoursFirst.value, reminderHoursSecond.value].filter(h => h > 0),
    }

    if (resendKeyDirty.value && resendApiKey.value.trim()) {
      payload.resend_api_key = resendApiKey.value.trim()
    }

    await $fetch('/api/admin/settings/email', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
    })

    toast.success('Email settings saved successfully')

    if (resendKeyDirty.value && resendApiKey.value.trim()) {
      hasResendKeySaved.value = true
    }

    resendKeyDirty.value = false
    resendApiKey.value = ''
    resendTestResult.value = null

    await shopStore.loadCurrentShop()
  } catch (error: any) {
    const message = error?.data?.statusMessage || error?.message || 'Failed to save email settings'
    toast.error(message)
    console.error('Error saving email settings:', error)
  } finally {
    isEmailSaving.value = false
  }
}

// ─── Copy Webhook URL ────────────────────────────────
function copyWebhookUrl() {
  navigator.clipboard.writeText(webhookUrl.value)
  toast.success('Webhook URL copied to clipboard')
}

// ─── Initialize ──────────────────────────────────────
onMounted(() => {
  fetchPaymentSettings()
  fetchEmailSettings()
})
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Settings</h1>
        <p class="mt-1 text-sm text-[var(--color-titanium)]">Manage your shop's payment and notification settings</p>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="flex gap-1 rounded-btn bg-[var(--color-silver)]/10 p-1">
      <button
        class="flex-1 rounded-btn px-4 py-2.5 text-sm font-medium transition-colors"
        :class="activeTab === 'payment'
          ? 'bg-[var(--color-white)] text-[var(--color-deep)] shadow-sm'
          : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'"
        @click="activeTab = 'payment'"
      >
        <Icon name="lucide:credit-card" class="mr-1.5 inline h-4 w-4" />
        Payment
      </button>
      <button
        class="flex-1 rounded-btn px-4 py-2.5 text-sm font-medium transition-colors"
        :class="activeTab === 'email'
          ? 'bg-[var(--color-white)] text-[var(--color-deep)] shadow-sm'
          : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'"
        @click="activeTab = 'email'"
      >
        <Icon name="lucide:mail" class="mr-1.5 inline h-4 w-4" />
        Email
      </button>
    </div>

    <!-- ═══════════════════════════════════════════════ -->
    <!-- TAB 1 — PAYMENT SETTINGS                       -->
    <!-- ═══════════════════════════════════════════════ -->
    <template v-if="activeTab === 'payment'">

      <!-- Loading Skeleton -->
      <div v-if="isPaymentLoading" class="space-y-6">
        <div class="card-design p-6">
          <div class="flex items-center gap-3 mb-6">
            <div class="h-10 w-10 animate-pulse rounded-btn bg-[var(--color-silver)]/20" />
            <div class="space-y-2">
              <div class="h-5 w-48 animate-pulse rounded bg-[var(--color-silver)]/20" />
              <div class="h-4 w-72 animate-pulse rounded bg-[var(--color-silver)]/20" />
            </div>
          </div>
          <div class="space-y-4">
            <div class="h-16 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
            <div class="h-16 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
            <div class="h-10 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
          </div>
        </div>
        <div class="card-design p-6">
          <div class="flex items-center gap-3 mb-6">
            <div class="h-10 w-10 animate-pulse rounded-btn bg-[var(--color-silver)]/20" />
            <div class="space-y-2">
              <div class="h-5 w-40 animate-pulse rounded bg-[var(--color-silver)]/20" />
              <div class="h-4 w-64 animate-pulse rounded bg-[var(--color-silver)]/20" />
            </div>
          </div>
          <div class="h-16 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
        </div>
      </div>

      <!-- Error State with Retry -->
      <div v-else-if="paymentLoadError" class="card-design p-8 text-center">
        <Icon name="lucide:alert-circle" class="mx-auto mb-3 h-12 w-12 text-[var(--color-danger)]" />
        <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Failed to Load Payment Settings</h3>
        <p class="mb-4 text-sm text-[var(--color-titanium)]">
          Something went wrong while fetching your payment settings. Please try again.
        </p>
        <button
          class="btn-design bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-titanium)]"
          @click="fetchPaymentSettings"
        >
          <Icon name="lucide:refresh-cw" class="mr-1.5 inline h-4 w-4" />
          Retry
        </button>
      </div>

      <!-- Payment Settings Content -->
      <div v-else class="space-y-6">

        <!-- Encryption Not Configured Warning -->
        <div v-if="!encryptionConfigured" class="rounded-input bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 p-4">
          <div class="flex items-start gap-3">
            <Icon name="lucide:alert-triangle" class="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-danger)]" />
            <div>
              <p class="font-medium text-[var(--color-danger)]">Encryption Key Not Configured</p>
              <p class="mt-1 text-sm text-[var(--color-titanium)]">
                The <code class="rounded bg-[var(--color-silver)]/20 px-1">NUXT_ENCRYPTION_KEY</code> environment variable is missing or invalid. 
                Secret keys (PayMongo secret key, webhook secret) cannot be saved. 
                Add it to your <code class="rounded bg-[var(--color-silver)]/20 px-1">.env</code> file and restart the server.
              </p>
              <p class="mt-2 text-xs text-[var(--color-titanium)]">
                Generate one with: <code class="rounded bg-[var(--color-silver)]/20 px-1 py-0.5">openssl rand -base64 32</code>
              </p>
            </div>
          </div>
        </div>

        <!-- SECTION A — PayMongo (Upgraded Plan Only) -->
        <div class="card-design p-6">
          <div class="mb-4 flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-info)]/10">
              <Icon name="lucide:credit-card" class="h-5 w-5 text-[var(--color-info)]" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-[var(--color-deep)]">PayMongo Integration</h2>
              <p class="text-sm text-[var(--color-titanium)]">Accept online payments via GCash, Maya, InstaPay, and QR PH</p>
            </div>
          </div>

          <!-- Basic Plan — Upgrade Prompt -->
          <div v-if="isBasicPlan" class="rounded-input bg-[var(--color-info)]/5 border border-[var(--color-info)]/20 p-6 text-center">
            <Icon name="lucide:lock" class="mx-auto mb-3 h-10 w-10 text-[var(--color-info)]" />
            <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Upgrade to Enable PayMongo</h3>
            <p class="mb-4 text-sm text-[var(--color-titanium)]">
              PayMongo integration is available on the Upgraded plan. Accept online payments via GCash, Maya, InstaPay, and QR PH automatically — no manual verification needed.
            </p>
            <button class="btn-design bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-titanium)]">
              Upgrade Plan
            </button>
          </div>

          <!-- Manager/Cashier/Barber — Access Denied -->
          <div v-else-if="!isAdmin" class="rounded-input bg-[var(--color-silver)]/10 border border-[var(--color-silver)]/30 p-6 text-center">
            <Icon name="lucide:shield" class="mx-auto mb-3 h-10 w-10 text-[var(--color-titanium)]" />
            <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Admin Access Required</h3>
            <p class="text-sm text-[var(--color-titanium)]">
              PayMongo settings can only be configured by the shop admin. Contact your admin to update payment integration settings.
            </p>
          </div>

          <!-- Upgraded Plan — Full PayMongo Settings -->
          <div v-else class="space-y-5">
            <!-- Master Toggle -->
            <div class="flex items-center justify-between rounded-input bg-[var(--color-white)] p-4">
              <div>
                <p class="font-medium text-[var(--color-deep)]">Enable PayMongo</p>
                <p class="text-sm text-[var(--color-titanium)]">Accept online payments through PayMongo</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                :class="paymongoEnabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-silver)]'"
                @click="paymongoEnabled = !paymongoEnabled"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
                  :class="paymongoEnabled ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </div>

            <!-- PayMongo Detail Settings (only if enabled) -->
            <div v-if="paymongoEnabled" class="space-y-5">

              <!-- Test Mode Toggle -->
              <div class="rounded-input bg-[var(--color-white)] p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-medium text-[var(--color-deep)]">Test Mode</p>
                    <p class="text-sm text-[var(--color-titanium)]">Use test keys. Switch OFF before accepting real payments.</p>
                  </div>
                  <button
                    class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                    :class="paymongoTestMode ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-danger)]'"
                    @click="paymongoTestMode = !paymongoTestMode"
                  >
                    <span
                      class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
                      :class="paymongoTestMode ? 'translate-x-6' : 'translate-x-1'"
                    />
                  </button>
                </div>
                <div v-if="!paymongoTestMode" class="mt-3 flex items-center gap-2 rounded-input bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
                  <Icon name="lucide:alert-triangle" class="h-4 w-4 shrink-0" />
                  <span>Live Mode — Real payments will be charged</span>
                </div>
              </div>

              <!-- Public Key -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">PayMongo Public Key</label>
                <input
                  v-model="paymongoPublicKey"
                  type="text"
                  placeholder="pk_test_xxx"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
                />
              </div>

              <!-- Secret Key -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">PayMongo Secret Key</label>
                <div class="relative">
                  <input
                    v-model="paymongoSecretKey"
                    :type="showSecretKey ? 'text' : 'password'"
                    :placeholder="hasSecretKeySaved ? 'sk_live_***...*** (saved — click to change)' : 'sk_test_xxx'"
                    class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 pr-10 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
                    @input="secretKeyDirty = true"
                  />
                  <button
                    type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
                    @click="showSecretKey = !showSecretKey"
                  >
                    <Icon :name="showSecretKey ? 'lucide:eye-off' : 'lucide:eye'" class="h-4 w-4" />
                  </button>
                </div>
                <p class="mt-1 text-xs text-[var(--color-titanium)]">
                  {{ hasSecretKeySaved && !secretKeyDirty
                      ? 'A secret key is already saved. Enter a new one to update.'
                      : secretKeyDirty
                        ? 'Enter a new secret key to update.'
                        : 'No secret key configured yet.' }}
                </p>
              </div>

              <!-- Test Connection -->
              <div class="flex items-center gap-3">
                <button
                  class="btn-design flex items-center gap-2 rounded-btn border border-[var(--color-info)] px-4 py-2 text-sm font-medium text-[var(--color-info)] transition-colors hover:bg-[var(--color-info)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="isTestingConnection || !canTestConnection"
                  @click="testConnection"
                >
                  <Icon v-if="isTestingConnection" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
                  <Icon v-else name="lucide:plug" class="h-4 w-4" />
                  Test Connection
                </button>
                <div v-if="testResult" class="flex items-center gap-1.5 text-sm">
                  <template v-if="testResult.valid">
                    <Icon name="lucide:check-circle" class="h-4 w-4 text-[var(--color-success)]" />
                    <span class="text-[var(--color-success)]">Connected successfully</span>
                  </template>
                  <template v-else>
                    <Icon name="lucide:x-circle" class="h-4 w-4 text-[var(--color-danger)]" />
                    <span class="text-[var(--color-danger)]">{{ testResult.error || 'Invalid key — check your PayMongo dashboard' }}</span>
                  </template>
                </div>
              </div>

              <!-- Payment Method Checkboxes -->
              <div>
                <label class="mb-2 block text-sm font-medium text-[var(--color-deep)]">Payment Methods</label>
                <p class="mb-3 text-xs text-[var(--color-titanium)]">Select which PayMongo payment methods to offer. At least one must be enabled.</p>
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label
                    class="flex items-center gap-2 rounded-input border px-3 py-2.5 text-sm transition-colors cursor-pointer"
                    :class="gcashEnabled
                      ? 'border-[var(--color-success)] bg-[var(--color-success)]/5 text-[var(--color-deep)]'
                      : 'border-[var(--color-silver)]/50 bg-[var(--color-white)] text-[var(--color-titanium)]'"
                  >
                    <input type="checkbox" v-model="gcashEnabled" class="h-4 w-4 rounded accent-[var(--color-success)]" />
                    <span class="font-medium">GCash</span>
                  </label>
                  <label
                    class="flex items-center gap-2 rounded-input border px-3 py-2.5 text-sm transition-colors cursor-pointer"
                    :class="mayaEnabled
                      ? 'border-[var(--color-success)] bg-[var(--color-success)]/5 text-[var(--color-deep)]'
                      : 'border-[var(--color-silver)]/50 bg-[var(--color-white)] text-[var(--color-titanium)]'"
                  >
                    <input type="checkbox" v-model="mayaEnabled" class="h-4 w-4 rounded accent-[var(--color-success)]" />
                    <span class="font-medium">Maya</span>
                  </label>
                  <label
                    class="flex items-center gap-2 rounded-input border px-3 py-2.5 text-sm transition-colors cursor-pointer"
                    :class="instapayEnabled
                      ? 'border-[var(--color-success)] bg-[var(--color-success)]/5 text-[var(--color-deep)]'
                      : 'border-[var(--color-silver)]/50 bg-[var(--color-white)] text-[var(--color-titanium)]'"
                  >
                    <input type="checkbox" v-model="instapayEnabled" class="h-4 w-4 rounded accent-[var(--color-success)]" />
                    <span class="font-medium">InstaPay</span>
                  </label>
                  <label
                    class="flex items-center gap-2 rounded-input border px-3 py-2.5 text-sm transition-colors cursor-pointer"
                    :class="qrPhEnabled
                      ? 'border-[var(--color-success)] bg-[var(--color-success)]/5 text-[var(--color-deep)]'
                      : 'border-[var(--color-silver)]/50 bg-[var(--color-white)] text-[var(--color-titanium)]'"
                  >
                    <input type="checkbox" v-model="qrPhEnabled" class="h-4 w-4 rounded accent-[var(--color-success)]" />
                    <span class="font-medium">QR PH</span>
                  </label>
                </div>
                <p v-if="!atLeastOnePayMongoMethod" class="mt-2 text-xs text-[var(--color-danger)]">
                  At least one payment method must be checked when PayMongo is enabled.
                </p>
              </div>

              <!-- Webhook URL -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Webhook URL</label>
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    :value="webhookUrl"
                    type="text"
                    readonly
                    class="input-design flex-1 border border-[var(--color-silver)]/50 bg-[var(--color-white)] px-4 py-2.5 text-sm text-[var(--color-titanium)] outline-none"
                  />
                  <button
                    class="btn-design flex items-center justify-center gap-1.5 rounded-btn border border-[var(--color-silver)] px-3 py-2.5 text-sm font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20"
                    @click="copyWebhookUrl"
                  >
                    <Icon name="lucide:copy" class="h-4 w-4" />
                    Copy
                  </button>
                </div>
                <p class="mt-1.5 text-xs text-[var(--color-titanium)]">
                  Add this URL in <strong>PayMongo Dashboard &rarr; Developers &rarr; Webhooks</strong>. Subscribe to: <code class="rounded bg-[var(--color-silver)]/20 px-1">payment.paid</code> and <code class="rounded bg-[var(--color-silver)]/20 px-1">payment.failed</code>
                </p>
              </div>

              <!-- Webhook Secret -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Webhook Secret</label>
                <div class="relative">
                  <input
                    v-model="paymongoWebhookSecret"
                    :type="showWebhookSecret ? 'text' : 'password'"
                    :placeholder="hasWebhookSecretSaved ? 'whsec_*** (saved — click to change)' : 'whsec_xxx'"
                    class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 pr-10 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
                    @input="webhookSecretDirty = true"
                  />
                  <button
                    type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
                    @click="showWebhookSecret = !showWebhookSecret"
                  >
                    <Icon :name="showWebhookSecret ? 'lucide:eye-off' : 'lucide:eye'" class="h-4 w-4" />
                  </button>
                </div>
                <p class="mt-1 text-xs text-[var(--color-titanium)]">
                  {{ hasWebhookSecretSaved && !webhookSecretDirty
                      ? 'A webhook secret is already saved. Enter a new one to update.'
                      : webhookSecretDirty
                        ? 'Enter a new webhook secret to update.'
                        : 'No webhook secret configured yet.' }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION B — Manual QR Payment (always visible) -->
        <div class="card-design p-6">
          <div class="mb-4 flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-warning)]/10">
              <Icon name="lucide:qr-code" class="h-5 w-5 text-[var(--color-warning)]" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-[var(--color-deep)]">Manual QR Payment</h2>
              <p class="text-sm text-[var(--color-titanium)]">Customers send payment proof for manual verification</p>
            </div>
          </div>

          <!-- Basic Plan: always on, can't toggle -->
          <div v-if="isBasicPlan" class="space-y-3">
            <div class="flex items-center justify-between rounded-input bg-[var(--color-white)] p-4">
              <div>
                <p class="font-medium text-[var(--color-deep)]">Enable Manual QR</p>
                <p class="text-sm text-[var(--color-titanium)]">Manual QR is always enabled on the Basic plan.</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed items-center rounded-full bg-[var(--color-success)] opacity-60"
                disabled
              >
                <span class="inline-block h-4 w-4 translate-x-6 transform rounded-full bg-white" />
              </button>
            </div>
            <div class="flex items-center gap-2 rounded-input bg-[var(--color-info)]/5 border border-[var(--color-info)]/20 px-3 py-2 text-xs text-[var(--color-info)]">
              <Icon name="lucide:info" class="h-4 w-4 shrink-0" />
              <span>Manual QR is always enabled on the Basic plan. Upgrade to disable it.</span>
            </div>
          </div>

          <!-- Upgraded Plan: can toggle -->
          <div v-else class="space-y-3">
            <div class="flex items-center justify-between rounded-input bg-[var(--color-white)] p-4">
              <div>
                <p class="font-medium text-[var(--color-deep)]">Enable Manual QR</p>
                <p class="text-sm text-[var(--color-titanium)]">Allow customers to pay by sending QR payment proof</p>
              </div>
              <button
                v-if="isAdmin"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                :class="manualPaymentEnabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-silver)]'"
                @click="manualPaymentEnabled = !manualPaymentEnabled"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
                  :class="manualPaymentEnabled ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
              <button
                v-else
                class="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed items-center rounded-full"
                :class="manualPaymentEnabled ? 'bg-[var(--color-success)] opacity-60' : 'bg-[var(--color-silver)]'"
                disabled
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white"
                  :class="manualPaymentEnabled ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </div>
            <div class="flex items-center gap-2 rounded-input bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/20 px-3 py-2 text-xs text-[var(--color-warning)]">
              <Icon name="lucide:alert-triangle" class="h-4 w-4 shrink-0" />
              <span>At least one payment method must remain enabled.</span>
            </div>
          </div>
        </div>

        <!-- VALIDATION WARNING -->
        <div
          v-if="isUpgradedPlan && !atLeastOnePaymentMethod"
          class="rounded-input bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 p-4"
        >
          <div class="flex items-center gap-2 text-sm text-[var(--color-danger)]">
            <Icon name="lucide:alert-circle" class="h-5 w-5 shrink-0" />
            <span class="font-medium">At least one payment method must be enabled. Enable PayMongo or Manual QR to continue.</span>
          </div>
        </div>

        <!-- SAVE PAYMENT BUTTON (Admin Only) -->
        <div v-if="isAdmin" class="flex justify-end">
          <button
            class="btn-design flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isPaymentSaving || (isUpgradedPlan && !atLeastOnePaymentMethod)"
            @click="savePaymentSettings"
          >
            <Icon v-if="isPaymentSaving" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
            <Icon v-else name="lucide:save" class="h-4 w-4" />
            {{ isPaymentSaving ? 'Saving...' : 'Save Payment Settings' }}
          </button>
        </div>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════ -->
    <!-- TAB 2 — EMAIL SETTINGS                         -->
    <!-- ═══════════════════════════════════════════════ -->
    <template v-if="activeTab === 'email'">

      <!-- Loading Skeleton -->
      <div v-if="isEmailLoading" class="space-y-6">
        <div class="card-design p-6">
          <div class="flex items-center gap-3 mb-6">
            <div class="h-10 w-10 animate-pulse rounded-btn bg-[var(--color-silver)]/20" />
            <div class="space-y-2">
              <div class="h-5 w-48 animate-pulse rounded bg-[var(--color-silver)]/20" />
              <div class="h-4 w-72 animate-pulse rounded bg-[var(--color-silver)]/20" />
            </div>
          </div>
          <div class="space-y-4">
            <div class="h-16 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
            <div class="h-16 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
            <div class="h-10 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
          </div>
        </div>
      </div>

      <!-- Error State with Retry -->
      <div v-else-if="emailLoadError" class="card-design p-8 text-center">
        <Icon name="lucide:alert-circle" class="mx-auto mb-3 h-12 w-12 text-[var(--color-danger)]" />
        <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Failed to Load Email Settings</h3>
        <p class="mb-4 text-sm text-[var(--color-titanium)]">
          Something went wrong while fetching your email settings. Please try again.
        </p>
        <button
          class="btn-design bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-titanium)]"
          @click="fetchEmailSettings"
        >
          <Icon name="lucide:refresh-cw" class="mr-1.5 inline h-4 w-4" />
          Retry
        </button>
      </div>

      <!-- Email Settings Content -->
      <div v-else class="space-y-6">

        <!-- SECTION C — Email Notification Settings (Upgraded Plan Only) -->
        <div class="card-design p-6">
          <div class="mb-4 flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-success)]/10">
              <Icon name="lucide:mail" class="h-5 w-5 text-[var(--color-success)]" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-[var(--color-deep)]">Email Notifications</h2>
              <p class="text-sm text-[var(--color-titanium)]">Send automated email notifications via Resend</p>
            </div>
          </div>

          <!-- Basic Plan — Upgrade Prompt -->
          <div v-if="isBasicPlan" class="rounded-input bg-[var(--color-info)]/5 border border-[var(--color-info)]/20 p-6 text-center">
            <Icon name="lucide:lock" class="mx-auto mb-3 h-10 w-10 text-[var(--color-info)]" />
            <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Upgrade to Enable Email Notifications</h3>
            <p class="mb-4 text-sm text-[var(--color-titanium)]">
              Email notifications are available on the Upgraded plan. Send booking confirmations, appointment reminders, and more automatically.
            </p>
            <button class="btn-design bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-titanium)]">
              Upgrade Plan
            </button>
          </div>

          <!-- Manager/Cashier/Barber — Access Denied -->
          <div v-else-if="!isAdmin" class="rounded-input bg-[var(--color-silver)]/10 border border-[var(--color-silver)]/30 p-6 text-center">
            <Icon name="lucide:shield" class="mx-auto mb-3 h-10 w-10 text-[var(--color-titanium)]" />
            <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Admin Access Required</h3>
            <p class="text-sm text-[var(--color-titanium)]">
              Email settings can only be configured by the shop admin. Contact your admin to update email notification settings.
            </p>
          </div>

          <!-- Upgraded Plan — Full Email Settings -->
          <div v-else class="space-y-5">

            <!-- Resend API Key -->
            <div>
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Resend API Key</label>
              <div class="relative">
                <input
                  v-model="resendApiKey"
                  :type="showResendKey ? 'text' : 'password'"
                  placeholder="re_xxxxx"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 pr-10 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
                  @input="resendKeyDirty = true"
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
                  @click="showResendKey = !showResendKey"
                >
                  <Icon :name="showResendKey ? 'lucide:eye-off' : 'lucide:eye'" class="h-4 w-4" />
                </button>
              </div>
              <p class="mt-1 text-xs text-[var(--color-titanium)]">
                {{ hasResendKeySaved && !resendKeyDirty
                    ? 'An API key is already saved. Enter a new one to update.'
                    : resendKeyDirty
                      ? 'Enter a new API key to update.'
                      : 'No API key configured yet.' }}
              </p>
            </div>

            <!-- Test Resend Connection -->
            <div class="flex items-center gap-3">
              <button
                class="btn-design flex items-center gap-2 rounded-btn border border-[var(--color-success)] px-4 py-2 text-sm font-medium text-[var(--color-success)] transition-colors hover:bg-[var(--color-success)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isTestingResend || !canTestResend"
                @click="testResendConnection"
              >
                <Icon v-if="isTestingResend" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
                <Icon v-else name="lucide:send" class="h-4 w-4" />
                Test Connection
              </button>
              <div v-if="resendTestResult" class="flex items-center gap-1.5 text-sm">
                <template v-if="resendTestResult.sent">
                  <Icon name="lucide:check-circle" class="h-4 w-4 text-[var(--color-success)]" />
                  <span class="text-[var(--color-success)]">Test email sent to {{ resendTestResult.email }}</span>
                </template>
                <template v-else>
                  <Icon name="lucide:x-circle" class="h-4 w-4 text-[var(--color-danger)]" />
                  <span class="text-[var(--color-danger)]">{{ resendTestResult.error || 'Failed to send test email' }}</span>
                </template>
              </div>
            </div>

            <!-- Sender Name -->
            <div>
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Sender Name</label>
              <input
                v-model="senderName"
                type="text"
                placeholder="Kings Barbers"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
              />
              <p class="mt-1 text-xs text-[var(--color-titanium)]">The name that appears in the "From" field of emails.</p>
            </div>

            <!-- Sender Email -->
            <div>
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Sender Email</label>
              <input
                v-model="senderEmail"
                type="email"
                placeholder="hello@kingsbarbers.com"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
              />
              <p class="mt-1 text-xs text-[var(--color-titanium)]">
                Must be a verified domain in Resend. Use <code class="rounded bg-[var(--color-silver)]/20 px-1">onboarding@resend.dev</code> for testing.
              </p>
            </div>

            <!-- Notification Toggles -->
            <div class="space-y-3">
              <p class="text-sm font-medium text-[var(--color-deep)]">Notification Toggles</p>

              <!-- Booking Confirmation Toggle -->
              <div class="flex items-center justify-between rounded-input bg-[var(--color-white)] p-4">
                <div>
                  <p class="font-medium text-[var(--color-deep)]">Send booking confirmation emails</p>
                  <p class="text-sm text-[var(--color-titanium)]">Notify customers when their booking is confirmed</p>
                </div>
                <button
                  class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                  :class="emailConfirmation ? 'bg-[var(--color-success)]' : 'bg-[var(--color-silver)]'"
                  @click="emailConfirmation = !emailConfirmation"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
                    :class="emailConfirmation ? 'translate-x-6' : 'translate-x-1'"
                  />
                </button>
              </div>

              <!-- Appointment Reminder Toggle -->
              <div class="flex items-center justify-between rounded-input bg-[var(--color-white)] p-4">
                <div>
                  <p class="font-medium text-[var(--color-deep)]">Send appointment reminder emails</p>
                  <p class="text-sm text-[var(--color-titanium)]">Remind customers before their appointment</p>
                </div>
                <button
                  class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                  :class="emailReminder ? 'bg-[var(--color-success)]' : 'bg-[var(--color-silver)]'"
                  @click="emailReminder = !emailReminder"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
                    :class="emailReminder ? 'translate-x-6' : 'translate-x-1'"
                  />
                </button>
              </div>

              <!-- Reminder Timing -->
              <div v-if="emailReminder" class="rounded-input bg-[var(--color-info)]/5 border border-[var(--color-info)]/20 p-4">
                <p class="mb-3 text-sm font-medium text-[var(--color-deep)]">Reminder Timing</p>
                <p class="mb-3 text-xs text-[var(--color-titanium)]">Send reminders at two intervals before each appointment.</p>
                <div class="flex items-center gap-4">
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="reminderHoursFirst"
                      type="number"
                      min="1"
                      class="input-design w-20 border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-center text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
                    />
                    <span class="text-sm text-[var(--color-titanium)]">hours before</span>
                  </div>
                  <span class="text-sm font-medium text-[var(--color-titanium)]">AND</span>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="reminderHoursSecond"
                      type="number"
                      min="1"
                      class="input-design w-20 border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-center text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
                    />
                    <span class="text-sm text-[var(--color-titanium)]">hours before</span>
                  </div>
                </div>
                <p v-if="reminderHoursFirst <= 0 || reminderHoursSecond <= 0" class="mt-2 text-xs text-[var(--color-danger)]">
                  Both values must be greater than 0.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- SAVE EMAIL BUTTON (Admin Only) -->
        <div v-if="isAdmin && isUpgradedPlan" class="flex justify-end">
          <button
            class="btn-design flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isEmailSaving || (emailReminder && (reminderHoursFirst <= 0 || reminderHoursSecond <= 0))"
            @click="saveEmailSettings"
          >
            <Icon v-if="isEmailSaving" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
            <Icon v-else name="lucide:save" class="h-4 w-4" />
            {{ isEmailSaving ? 'Saving...' : 'Save Email Settings' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
