<script setup lang="ts">
/**
 * /auth/reset-password — Password recovery landing page
 *
 * Target of Supabase "recovery" links (guest booking set-password emails,
 * forgot-password emails, super-admin resets).
 *
 * Flow:
 *   1. User clicks the recovery link → Supabase redirect with tokens in URL
 *   2. detectSessionInUrl (in useSupabase client) exchanges tokens for session
 *   3. This page detects the session → shows "set your password" form
 *   4. supabase.auth.updateUser({ password }) → success → link to bookings
 *
 * NOTE: intentionally does NOT use the 'guest' middleware — the recovery
 * link authenticates the user, so they arrive already logged in.
 */
definePageMeta({
  layout: 'auth',
})

const supabase = useSupabase()

type Mode = 'checking' | 'form' | 'success' | 'expired'
const mode = ref<Mode>('checking')

const password = ref('')
const confirmPassword = ref('')
const passwordError = ref('')
const confirmError = ref('')
const isSaving = ref(false)
const saveError = ref('')

// detectSessionInUrl exchanges the recovery tokens for a session shortly
// after page load. Poll a few times to catch it regardless of timing.
onMounted(async () => {
  for (const delay of [0, 500, 1500, 3000]) {
    await new Promise(resolve => setTimeout(resolve, delay))
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        mode.value = 'form'
        return
      }
    } catch {
      // keep polling
    }
  }
  mode.value = 'expired'
})

function validatePassword(): boolean {
  if (!password.value) {
    passwordError.value = 'Password is required'
    return false
  }
  if (password.value.length < 8) {
    passwordError.value = 'Must be at least 8 characters'
    return false
  }
  passwordError.value = ''
  return true
}

function validateConfirm(): boolean {
  if (confirmPassword.value !== password.value) {
    confirmError.value = 'Passwords do not match'
    return false
  }
  confirmError.value = ''
  return true
}

async function handleSave() {
  const v1 = validatePassword()
  const v2 = validateConfirm()
  if (!v1 || !v2) return

  isSaving.value = true
  saveError.value = ''
  try {
    const { error } = await supabase.auth.updateUser({ password: password.value })
    if (error) {
      saveError.value = error.message || 'Failed to update password.'
    } else {
      mode.value = 'success'
    }
  } catch {
    saveError.value = 'Something went wrong. Please try again.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div>
    <!-- ═══ Checking for recovery session ═══ -->
    <div v-if="mode === 'checking'" class="py-8 text-center">
      <Icon name="lucide:loader-2" class="mx-auto h-8 w-8 animate-spin text-[var(--color-deep)]" />
      <p class="mt-4 text-sm text-[var(--color-titanium)]">Verifying your secure link...</p>
    </div>

    <!-- ═══ Link expired / invalid ═══ -->
    <div v-else-if="mode === 'expired'" class="py-4 text-center">
      <div class="mb-6 flex justify-center">
        <div class="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-danger)]/10">
          <Icon name="lucide:link-2-off" class="h-8 w-8 text-[var(--color-danger)]" />
        </div>
      </div>
      <h2 class="mb-2 text-[var(--color-deep)]">Link Expired</h2>
      <p class="mb-6 text-sm text-[var(--color-titanium)]">
        This password link is invalid or has expired.
        Request a new one from the login page using "Forgot password?".
      </p>
      <NuxtLink
        to="/login"
        class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-3 text-sm font-semibold text-white min-h-[44px]"
      >
        <Icon name="lucide:arrow-left" class="h-4 w-4" />
        Back to Login
      </NuxtLink>
    </div>

    <!-- ═══ Set new password form ═══ -->
    <div v-else-if="mode === 'form'">
      <div class="mb-6 flex justify-center">
        <div class="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-info)]/10">
          <Icon name="lucide:key-round" class="h-8 w-8 text-[var(--color-info)]" />
        </div>
      </div>

      <h2 class="mb-2 text-center text-[var(--color-deep)]">Set Your Password</h2>
      <p class="mb-6 text-center text-sm text-[var(--color-titanium)]">
        Choose a password for your account so you can log in and track your bookings anytime.
      </p>

      <div class="space-y-4">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">New Password</label>
          <input
            v-model="password"
            type="password"
            placeholder="At least 8 characters"
            autocomplete="new-password"
            class="input-design w-full rounded-btn border bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none transition-colors focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)] min-h-[44px]"
            :class="passwordError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]/50'"
            @input="passwordError = ''"
            @keyup.enter="handleSave"
          />
          <p v-if="passwordError" class="mt-1 text-xs text-[var(--color-danger)]">{{ passwordError }}</p>
        </div>

        <div>
          <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">Confirm Password</label>
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="Re-enter your password"
            autocomplete="new-password"
            class="input-design w-full rounded-btn border bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none transition-colors focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)] min-h-[44px]"
            :class="confirmError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]/50'"
            @input="confirmError = ''"
            @keyup.enter="handleSave"
          />
          <p v-if="confirmError" class="mt-1 text-xs text-[var(--color-danger)]">{{ confirmError }}</p>
        </div>

        <p v-if="saveError" class="text-xs text-[var(--color-danger)]">{{ saveError }}</p>

        <button
          :disabled="isSaving"
          class="btn-design w-full rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
          @click="handleSave"
        >
          <Icon v-if="isSaving" name="lucide:loader-2" class="mr-1 inline h-4 w-4 animate-spin" />
          {{ isSaving ? 'Saving...' : 'Save Password' }}
        </button>
      </div>
    </div>

    <!-- ═══ Success ═══ -->
    <div v-else-if="mode === 'success'" class="py-4 text-center">
      <div class="mb-6 flex justify-center">
        <div class="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success)]/10">
          <Icon name="lucide:check-circle-2" class="h-8 w-8 text-[var(--color-success)]" />
        </div>
      </div>

      <h2 class="mb-2 text-[var(--color-deep)]">Password Saved!</h2>
      <p class="mb-6 text-sm text-[var(--color-titanium)]">
        Your account is ready. You can now log in anytime to track your bookings and rewards.
      </p>

      <div class="flex flex-col gap-3">
        <NuxtLink
          to="/customer/bookings"
          class="btn-design inline-flex items-center justify-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-3 text-sm font-semibold text-white min-h-[44px]"
        >
          <Icon name="lucide:calendar" class="h-4 w-4" />
          View My Bookings
        </NuxtLink>
        <NuxtLink
          to="/login"
          class="btn-design inline-flex items-center justify-center gap-2 rounded-btn border border-[var(--color-silver)] px-6 py-3 text-sm font-medium text-[var(--color-deep)] min-h-[44px]"
        >
          Go to Login
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
