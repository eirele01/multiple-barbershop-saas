<script setup lang="ts">
/**
 * /auth/verify-email — Email verification page
 *
 * Shown after registration when email_confirm is false.
 * Tells the user to check their inbox for a verification link.
 * After Supabase confirms the email, the user is redirected to
 * /admin/dashboard?onboarding=1 (configured in Supabase Auth settings).
 */
definePageMeta({
  layout: 'auth',
  middleware: 'guest',
})

const route = useRoute()
const email = ref((route.query.email as string) || '')
const isResending = ref(false)
const resendMessage = ref('')
const supabase = useSupabase()

async function resendVerification() {
  if (!email.value) {
    resendMessage.value = 'No email address found. Please register again.'
    return
  }

  isResending.value = true
  resendMessage.value = ''

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.value,
      options: {
        emailRedirectTo: `${window.location.origin}/admin/dashboard?onboarding=1`,
      },
    })

    if (error) {
      resendMessage.value = error.message || 'Failed to resend verification email.'
    } else {
      resendMessage.value = 'Verification email sent! Check your inbox.'
    }
  } catch {
    resendMessage.value = 'Something went wrong. Please try again.'
  } finally {
    isResending.value = false
  }
}
</script>

<template>
  <div>
    <!-- Icon -->
    <div class="mb-6 flex justify-center">
      <div class="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-info)]/10">
        <Icon name="lucide:mail-check" class="h-8 w-8 text-[var(--color-info)]" />
      </div>
    </div>

    <!-- Title -->
    <h2 class="mb-2 text-center text-[var(--color-deep)]">
      Check Your Email
    </h2>

    <p class="mb-6 text-center text-sm text-[var(--color-titanium)]">
      We've sent a verification link to
      <span v-if="email" class="font-semibold text-[var(--color-deep)]">{{ email }}</span>
      <span v-else>your email address</span>.
      Please click the link to verify your account and access your dashboard.
    </p>

    <!-- Info box -->
    <div class="mb-6 rounded-input border border-[var(--color-info)]/20 bg-[var(--color-info)]/5 p-4">
      <div class="flex items-start gap-2">
        <Icon name="lucide:info" class="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-info)]" />
        <div class="text-xs text-[var(--color-titanium)]">
          <p>The verification link will expire in 24 hours.</p>
          <p class="mt-1">After verifying, you'll be redirected to your dashboard automatically.</p>
          <p class="mt-1">Don't forget to check your spam folder!</p>
        </div>
      </div>
    </div>

    <!-- Resend -->
    <div class="mb-4 text-center">
      <p class="mb-2 text-xs text-[var(--color-titanium)]">Didn't receive the email?</p>
      <button
        :disabled="isResending"
        class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-silver)] px-4 py-2 text-sm font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10 disabled:cursor-not-allowed disabled:opacity-50"
        @click="resendVerification"
      >
        <Icon v-if="isResending" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
        <Icon v-else name="lucide:refresh-cw" class="h-4 w-4" />
        {{ isResending ? 'Sending...' : 'Resend Verification Email' }}
      </button>
      <p v-if="resendMessage" class="mt-2 text-xs" :class="resendMessage.includes('sent') ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'">
        {{ resendMessage }}
      </p>
    </div>

    <!-- Back to login -->
    <p class="text-center text-sm text-[var(--color-titanium)]">
      Already verified?
      <NuxtLink to="/login" class="font-medium text-[var(--color-info)] hover:underline">
        Sign in
      </NuxtLink>
    </p>
  </div>
</template>
