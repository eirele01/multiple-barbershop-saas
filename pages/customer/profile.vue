<script setup lang="ts">
/**
 * /customer/profile — Customer Profile
 *
 * Sections:
 *   - Personal info (name, phone — editable)
 *   - Email (read-only — shown but not editable)
 *   - Change Password (old + new + confirm)
 *
 * Save calls: PATCH /api/customer/profile
 *
 * Customer-only access.
 */
import { useAuthStore } from '~/stores/auth'

definePageMeta({
  layout: 'customer',
  middleware: ['auth', 'customer'],
})

const authStore = useAuthStore()
const toast = useToast()

// ─── Personal Info State ───────────────────────────
const displayName = ref('')
const phoneNumber = ref('')
const isSavingProfile = ref(false)

// ─── Password State ────────────────────────────────
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const isSavingPassword = ref(false)

// ─── Validation Errors ─────────────────────────────
const profileErrors = ref<Record<string, string>>({})
const passwordErrors = ref<Record<string, string>>({})

// ─── Initialize from auth store ────────────────────
function initForm() {
  if (authStore.user) {
    displayName.value = authStore.user.display_name || ''
    phoneNumber.value = authStore.user.phone_number || ''
  }
}

// ─── Save Profile ──────────────────────────────────
async function saveProfile() {
  profileErrors.value = {}

  // Validate
  if (!displayName.value.trim()) {
    profileErrors.value.display_name = 'Name is required'
    return
  }

  isSavingProfile.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const response = await $fetch('/api/customer/profile', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        display_name: displayName.value.trim(),
        phone_number: phoneNumber.value.trim() || null,
      },
    }) as any

    // Refresh auth store
    if (authStore.user) {
      authStore.user.display_name = displayName.value.trim()
      authStore.user.phone_number = phoneNumber.value.trim() || null
    }

    toast.success('Profile updated successfully')
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to update profile'
    toast.error(msg)
  } finally {
    isSavingProfile.value = false
  }
}

// ─── Change Password ───────────────────────────────
async function changePassword() {
  passwordErrors.value = {}

  // Validate
  if (!oldPassword.value) {
    passwordErrors.value.old_password = 'Current password is required'
    return
  }
  if (!newPassword.value || newPassword.value.length < 6) {
    passwordErrors.value.new_password = 'New password must be at least 6 characters'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordErrors.value.confirm_password = 'Passwords do not match'
    return
  }

  isSavingPassword.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    await $fetch('/api/customer/profile', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        old_password: oldPassword.value,
        new_password: newPassword.value,
      },
    })

    toast.success('Password changed successfully')
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to change password'
    toast.error(msg)
  } finally {
    isSavingPassword.value = false
  }
}

onMounted(() => {
  initForm()
})
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 px-4 py-8">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-deep)]">My Profile</h1>
      <p class="mt-1 text-sm text-[var(--color-titanium)]">Manage your personal information and password</p>
    </div>

    <!-- Personal Information -->
    <div class="card-design p-6">
      <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-titanium)]">Personal Information</h2>
      <div class="space-y-4">
        <!-- Display Name -->
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--color-deep)]">Full Name</label>
          <input
            v-model="displayName"
            type="text"
            class="input-design w-full rounded-input border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            :class="profileErrors.display_name ? 'border-[var(--color-danger)]' : ''"
            placeholder="Enter your full name"
          />
          <p v-if="profileErrors.display_name" class="mt-1 text-xs text-[var(--color-danger)]">
            {{ profileErrors.display_name }}
          </p>
        </div>

        <!-- Email (read-only) -->
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--color-deep)]">Email</label>
          <input
            :value="authStore.user?.email"
            type="email"
            disabled
            class="input-design w-full rounded-input border border-[var(--color-silver)]/30 bg-[var(--color-silver)]/5 px-3 py-2.5 text-sm text-[var(--color-titanium)]"
          />
          <p class="mt-1 text-xs text-[var(--color-titanium)]">Email cannot be changed. Contact support if you need to update it.</p>
        </div>

        <!-- Phone -->
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--color-deep)]">Phone Number</label>
          <input
            v-model="phoneNumber"
            type="tel"
            class="input-design w-full rounded-input border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            placeholder="e.g. 0917 123 4567"
          />
        </div>

        <!-- Save Profile -->
        <div class="flex justify-end pt-2">
          <button
            class="rounded-btn bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            :disabled="isSavingProfile"
            @click="saveProfile"
          >
            {{ isSavingProfile ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Change Password -->
    <div class="card-design p-6">
      <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-titanium)]">Change Password</h2>
      <div class="space-y-4">
        <!-- Current Password -->
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--color-deep)]">Current Password</label>
          <input
            v-model="oldPassword"
            type="password"
            class="input-design w-full rounded-input border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            :class="passwordErrors.old_password ? 'border-[var(--color-danger)]' : ''"
            placeholder="Enter your current password"
          />
          <p v-if="passwordErrors.old_password" class="mt-1 text-xs text-[var(--color-danger)]">
            {{ passwordErrors.old_password }}
          </p>
        </div>

        <!-- New Password -->
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--color-deep)]">New Password</label>
          <input
            v-model="newPassword"
            type="password"
            class="input-design w-full rounded-input border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            :class="passwordErrors.new_password ? 'border-[var(--color-danger)]' : ''"
            placeholder="Enter a new password (min. 6 characters)"
          />
          <p v-if="passwordErrors.new_password" class="mt-1 text-xs text-[var(--color-danger)]">
            {{ passwordErrors.new_password }}
          </p>
        </div>

        <!-- Confirm Password -->
        <div>
          <label class="mb-1 block text-sm font-medium text-[var(--color-deep)]">Confirm New Password</label>
          <input
            v-model="confirmPassword"
            type="password"
            class="input-design w-full rounded-input border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
            :class="passwordErrors.confirm_password ? 'border-[var(--color-danger)]' : ''"
            placeholder="Confirm your new password"
          />
          <p v-if="passwordErrors.confirm_password" class="mt-1 text-xs text-[var(--color-danger)]">
            {{ passwordErrors.confirm_password }}
          </p>
        </div>

        <!-- Change Password Button -->
        <div class="flex justify-end pt-2">
          <button
            class="rounded-btn bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            :disabled="isSavingPassword"
            @click="changePassword"
          >
            {{ isSavingPassword ? 'Changing...' : 'Change Password' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
