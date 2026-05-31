<script setup lang="ts">
/**
 * Registration Page — Multi-step shop registration form
 * Section 8.1: Steps 1–3
 *
 * Features:
 * - 3-step wizard (Account → Shop Info → Confirm)
 * - Real-time slug uniqueness validation via /api/shops/check-slug
 * - Server-side registration via /api/shops/register (atomic)
 * - On success: redirect to /admin/dashboard with onboarding query param
 */
definePageMeta({
  layout: 'auth',
  middleware: 'guest',
})

const router = useRouter()

const currentStep = ref(1)
const isLoading = ref(false)
const errorMessage = ref('')

// Step 1: Account Setup
const fullName = ref('')
const emailAddress = ref('')
const passwordValue = ref('')
const confirmPassword = ref('')

// Step 2: Shop Information
const shopName = ref('')
const shopSlug = ref('')
const phoneNumber = ref('')
const city = ref('')
const description = ref('')
const agreeToTerms = ref(false)

// Inline validation errors
const fullNameError = ref('')
const emailError = ref('')
const passwordError = ref('')
const confirmPasswordError = ref('')
const shopNameError = ref('')

// Validate functions
function validateFullName() {
  const val = fullName.value.trim()
  if (!val) { fullNameError.value = 'Full name is required'; return false }
  if (val.length < 2) { fullNameError.value = 'Full name must be at least 2 characters'; return false }
  fullNameError.value = ''; return true
}

function validateEmail() {
  const val = emailAddress.value.trim()
  if (!val) { emailError.value = 'Email address is required'; return false }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { emailError.value = 'Enter a valid email address'; return false }
  emailError.value = ''; return true
}

function validatePassword() {
  const val = passwordValue.value
  if (!val) { passwordError.value = 'Password is required'; return false }
  if (val.length < 8) { passwordError.value = 'Password must be at least 8 characters'; return false }
  passwordError.value = ''; return true
}

function validateConfirmPassword() {
  const val = confirmPassword.value
  if (!val) { confirmPasswordError.value = 'Please confirm your password'; return false }
  if (val !== passwordValue.value) { confirmPasswordError.value = 'Passwords do not match'; return false }
  confirmPasswordError.value = ''; return true
}

function validateShopName() {
  const val = shopName.value.trim()
  if (!val) { shopNameError.value = 'Shop name is required'; return false }
  if (val.length < 3) { shopNameError.value = 'Shop name must be at least 3 characters'; return false }
  shopNameError.value = ''; return true
}

// Slug validation state
const slugStatus = ref<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
const slugMessage = ref('')
let slugDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Auto-generate slug from shop name
watch(shopName, (val) => {
  const generated = val
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
  shopSlug.value = generated
  validateSlugDebounced(generated)
})

// Also validate when slug is manually edited
watch(shopSlug, (val) => {
  validateSlugDebounced(val)
})

function validateSlugDebounced(slug: string) {
  if (slugDebounceTimer) clearTimeout(slugDebounceTimer)

  // Quick client-side validation
  if (!slug || slug.length < 3) {
    slugStatus.value = 'invalid'
    slugMessage.value = 'Slug must be at least 3 characters'
    return
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    slugStatus.value = 'invalid'
    slugMessage.value = 'Only lowercase letters, numbers, and hyphens'
    return
  }

  slugStatus.value = 'checking'
  slugMessage.value = 'Checking availability...'

  slugDebounceTimer = setTimeout(async () => {
    try {
      const result = await $fetch<{ available: boolean; message: string }>(
        '/api/shops/check-slug',
        { params: { slug } }
      )
      if (result.available) {
        slugStatus.value = 'available'
        slugMessage.value = result.message
      } else {
        slugStatus.value = 'taken'
        slugMessage.value = result.message
      }
    } catch {
      slugStatus.value = 'idle'
      slugMessage.value = ''
    }
  }, 400)
}

const isSlugValid = computed(() => slugStatus.value === 'available')

const steps = [
  { number: 1, label: 'Account' },
  { number: 2, label: 'Shop Info' },
  { number: 3, label: 'Confirm' },
]

function canProceedToStep2(): boolean {
  // Run all Step 1 validations
  const nameOk = validateFullName()
  const emailOk = validateEmail()
  const passOk = validatePassword()
  const confirmOk = validateConfirmPassword()
  return nameOk && emailOk && passOk && confirmOk
}

function canProceedToStep3(): boolean {
  // Run shop name validation
  const shopOk = validateShopName()
  if (!shopOk) return false
  if (!shopSlug.value || !phoneNumber.value || !city.value) return false
  if (!isSlugValid.value) return false
  return true
}

function nextStep() {
  if (currentStep.value === 1 && canProceedToStep2()) {
    currentStep.value = 2
  } else if (currentStep.value === 2 && canProceedToStep3()) {
    currentStep.value = 3
  }
}

function prevStep() {
  if (currentStep.value > 1) currentStep.value--
}

async function handleRegister() {
  if (!agreeToTerms.value) {
    errorMessage.value = 'Please agree to the Terms of Service'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const result = await $fetch<{
      success: boolean
      data: {
        user: { id: string; email: string; displayName: string; role: string; shopId: string }
        shop: { id: string; name: string; slug: string; plan: string; planStatus: string }
      }
    }>('/api/shops/register', {
      method: 'POST',
      body: {
        email: emailAddress.value,
        password: passwordValue.value,
        displayName: fullName.value,
        shopName: shopName.value,
        slug: shopSlug.value,
        phone: phoneNumber.value,
        city: city.value,
        description: description.value || undefined,
      },
    })

    if (result.success) {
      // Redirect to verify-email page (email_confirm is false)
      await router.push(`/auth/verify-email?email=${encodeURIComponent(emailAddress.value)}`)
    }
  } catch (error: any) {
    const data = error?.data
    if (data?.message) {
      errorMessage.value = data.message
    } else if (data?.data) {
      // Zod validation errors
      const fieldErrors = data.data
      const firstError = Object.values(fieldErrors).flat()[0]
      errorMessage.value = firstError || 'Validation failed. Please check your inputs.'
    } else {
      errorMessage.value = error?.message || 'Registration failed. Please try again.'
    }
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div>
    <h2 class="mb-2 text-center text-[var(--color-deep)]">
      Create Your Shop
    </h2>
    <p class="mb-6 text-center text-sm text-[var(--color-titanium)]">
      Get your barbershop online in minutes
    </p>

    <!-- Step Progress -->
    <div class="mb-8 flex items-center justify-center gap-2">
      <div
        v-for="(step, idx) in steps"
        :key="step.number"
        class="flex items-center gap-2"
      >
        <div class="flex items-center gap-2">
          <!-- Completed check or step number -->
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors"
            :class="
              currentStep > step.number
                ? 'bg-[var(--color-success)] text-white'
                : currentStep >= step.number
                  ? 'bg-[var(--color-deep)] text-white'
                  : 'bg-[var(--color-silver)]/30 text-[var(--color-titanium)]'
            "
          >
            <Icon v-if="currentStep > step.number" name="lucide:check" class="h-4 w-4" />
            <span v-else>{{ step.number }}</span>
          </div>
          <span
            class="hidden text-xs font-medium sm:inline"
            :class="
              currentStep >= step.number
                ? 'text-[var(--color-deep)]'
                : 'text-[var(--color-titanium)]'
            "
          >
            {{ step.label }}
          </span>
        </div>
        <div
          v-if="idx < steps.length - 1"
          class="mx-1 h-px w-6 bg-[var(--color-silver)] sm:w-12"
          :class="currentStep > step.number ? 'bg-[var(--color-success)]' : ''"
        />
      </div>
    </div>

    <!-- Error Message -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="errorMessage"
        class="mb-4 flex items-center gap-2 rounded-input bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]"
      >
        <Icon name="lucide:alert-circle" class="h-4 w-4 flex-shrink-0" />
        {{ errorMessage }}
      </div>
    </Transition>

    <!-- Step 1: Account Setup -->
    <form v-if="currentStep === 1" class="space-y-4" @submit.prevent="nextStep">
      <div>
        <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Full Name</label>
        <input
          v-model="fullName"
          type="text"
          required
          placeholder="Juan Dela Cruz"
          class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
          :class="fullNameError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
          @blur="validateFullName"
          @input="fullNameError && (fullNameError = '')"
        />
        <p v-if="fullNameError" class="mt-1 text-xs text-[var(--color-danger)]">{{ fullNameError }}</p>
      </div>
      <div>
        <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Email Address</label>
        <input
          v-model="emailAddress"
          type="email"
          required
          placeholder="you@example.com"
          class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
          :class="emailError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
          @blur="validateEmail"
          @input="emailError && (emailError = '')"
        />
        <p v-if="emailError" class="mt-1 text-xs text-[var(--color-danger)]">{{ emailError }}</p>
      </div>
      <div>
        <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Password</label>
        <input
          v-model="passwordValue"
          type="password"
          required
          minlength="8"
          placeholder="Minimum 8 characters"
          class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
          :class="passwordError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
          @blur="validatePassword"
          @input="passwordError && (passwordError = '')"
        />
        <p v-if="passwordError" class="mt-1 text-xs text-[var(--color-danger)]">{{ passwordError }}</p>
      </div>
      <div>
        <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Confirm Password</label>
        <input
          v-model="confirmPassword"
          type="password"
          required
          placeholder="Re-enter your password"
          class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
          :class="confirmPasswordError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
          @blur="validateConfirmPassword"
          @input="confirmPasswordError && (confirmPasswordError = '')"
        />
        <p v-if="confirmPasswordError" class="mt-1 text-xs text-[var(--color-danger)]">{{ confirmPasswordError }}</p>
      </div>
      <button
        type="submit"
        :disabled="!canProceedToStep2()"
        class="btn-design w-full rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--color-titanium)]"
      >
        Continue
      </button>
    </form>

    <!-- Step 2: Shop Information -->
    <form v-if="currentStep === 2" class="space-y-4" @submit.prevent="nextStep">
      <div>
        <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Shop Name</label>
        <input
          v-model="shopName"
          type="text"
          required
          placeholder="King's Barbers"
          class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
          :class="shopNameError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
          @blur="validateShopName"
          @input="shopNameError && (shopNameError = '')"
        />
        <p v-if="shopNameError" class="mt-1 text-xs text-[var(--color-danger)]">{{ shopNameError }}</p>
      </div>
      <div>
        <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Shop Slug (URL)</label>
        <div class="relative">
          <input
            v-model="shopSlug"
            type="text"
            required
            placeholder="kings-barbers"
            class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 pr-10 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
            :class="[
              slugStatus === 'available' ? 'border-[var(--color-success)]' :
              slugStatus === 'taken' || slugStatus === 'invalid' ? 'border-[var(--color-danger)]' :
              'border-[var(--color-silver)]'
            ]"
          />
          <!-- Status icon -->
          <div class="absolute right-3 top-1/2 -translate-y-1/2">
            <Icon
              v-if="slugStatus === 'checking'"
              name="lucide:loader-2"
              class="h-4 w-4 animate-spin text-[var(--color-titanium)]"
            />
            <Icon
              v-else-if="slugStatus === 'available'"
              name="lucide:check-circle"
              class="h-4 w-4 text-[var(--color-success)]"
            />
            <Icon
              v-else-if="slugStatus === 'taken' || slugStatus === 'invalid'"
              name="lucide:x-circle"
              class="h-4 w-4 text-[var(--color-danger)]"
            />
          </div>
        </div>
        <p class="mt-1 text-xs text-[var(--color-titanium)]">
          Your shop URL: yourdomain.com/shop/<span class="font-medium text-[var(--color-deep)]">{{ shopSlug || '...' }}</span>
        </p>
        <p
          v-if="slugMessage"
          class="mt-0.5 text-xs"
          :class="[
            slugStatus === 'available' ? 'text-[var(--color-success)]' :
            slugStatus === 'taken' || slugStatus === 'invalid' ? 'text-[var(--color-danger)]' :
            'text-[var(--color-titanium)]'
          ]"
        >
          {{ slugMessage }}
        </p>
      </div>
      <div>
        <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Phone Number</label>
        <input
          v-model="phoneNumber"
          type="tel"
          required
          placeholder="+63 917 123 4567"
          class="input-design w-full border border-[var(--color-silver)] bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
        />
      </div>
      <div>
        <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">City / Location</label>
        <input
          v-model="city"
          type="text"
          required
          placeholder="Makati City"
          class="input-design w-full border border-[var(--color-silver)] bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
        />
      </div>
      <div>
        <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Short Description</label>
        <textarea
          v-model="description"
          maxlength="200"
          rows="2"
          placeholder="Tell customers about your barbershop..."
          class="input-design w-full resize-none border border-[var(--color-silver)] bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
        />
        <p class="mt-1 text-right text-xs text-[var(--color-titanium)]">
          {{ 200 - description.length }} characters remaining
        </p>
      </div>
      <div class="flex gap-3">
        <button
          type="button"
          class="btn-design flex-1 rounded-btn border border-[var(--color-silver)] py-3 text-sm font-semibold text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
          @click="prevStep"
        >
          Back
        </button>
        <button
          type="submit"
          :disabled="!canProceedToStep3()"
          class="btn-design flex-1 rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--color-titanium)]"
        >
          Continue
        </button>
      </div>
    </form>

    <!-- Step 3: Confirmation -->
    <div v-if="currentStep === 3" class="space-y-4">
      <div class="rounded-input bg-[var(--color-white)] p-4">
        <h4 class="mb-3 text-sm font-semibold text-[var(--color-deep)]">Account Details</h4>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-[var(--color-titanium)]">Name</span>
            <span class="font-medium text-[var(--color-deep)]">{{ fullName }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--color-titanium)]">Email</span>
            <span class="font-medium text-[var(--color-deep)]">{{ emailAddress }}</span>
          </div>
        </div>
      </div>

      <div class="rounded-input bg-[var(--color-white)] p-4">
        <h4 class="mb-3 text-sm font-semibold text-[var(--color-deep)]">Shop Details</h4>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-[var(--color-titanium)]">Shop Name</span>
            <span class="font-medium text-[var(--color-deep)]">{{ shopName }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--color-titanium)]">Shop URL</span>
            <span class="font-medium text-[var(--color-deep)]">/shop/{{ shopSlug }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--color-titanium)]">Phone</span>
            <span class="font-medium text-[var(--color-deep)]">{{ phoneNumber }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--color-titanium)]">City</span>
            <span class="font-medium text-[var(--color-deep)]">{{ city }}</span>
          </div>
          <div v-if="description" class="flex justify-between">
            <span class="text-[var(--color-titanium)]">Description</span>
            <span class="max-w-[200px] truncate font-medium text-[var(--color-deep)]">{{ description }}</span>
          </div>
        </div>
      </div>

      <!-- Plan info -->
      <div class="rounded-input border border-[var(--color-info)]/20 bg-[var(--color-info)]/5 p-4">
        <div class="flex items-center gap-2">
          <Icon name="lucide:info" class="h-4 w-4 text-[var(--color-info)]" />
          <span class="text-sm font-medium text-[var(--color-info)]">Starting with Basic Plan — Free forever</span>
        </div>
        <p class="mt-1 text-xs text-[var(--color-titanium)]">
          You can upgrade anytime to unlock PayMongo, email notifications, loyalty program, and more.
        </p>
      </div>

      <div class="flex items-start gap-2">
        <input
          id="terms"
          v-model="agreeToTerms"
          type="checkbox"
          class="mt-1 h-4 w-4 rounded border-[var(--color-silver)]"
        />
        <label for="terms" class="text-xs text-[var(--color-titanium)]">
          I agree to the Terms of Service and Privacy Policy
        </label>
      </div>

      <div class="flex gap-3">
        <button
          type="button"
          class="btn-design flex-1 rounded-btn border border-[var(--color-silver)] py-3 text-sm font-semibold text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
          @click="prevStep"
        >
          Back
        </button>
        <button
          type="button"
          :disabled="isLoading || !agreeToTerms"
          class="btn-design flex-1 rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--color-titanium)]"
          @click="handleRegister"
        >
          <span v-if="!isLoading">Create My Shop</span>
          <span v-else class="flex items-center justify-center gap-2">
            <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" />
            Creating...
          </span>
        </button>
      </div>
    </div>

    <p class="mt-6 text-center text-sm text-[var(--color-titanium)]">
      Already have an account?
      <NuxtLink to="/login" class="font-medium text-[var(--color-info)] hover:underline">
        Sign in
      </NuxtLink>
    </p>

    <!-- Customer note -->
    <div class="mt-4 border-t border-[var(--color-silver)]/30 pt-4 text-center">
      <p class="text-xs text-[var(--color-titanium)]">
        Looking to book an appointment, not open a shop?
        <br />
        Visit your barbershop's page directly —
        <NuxtLink to="/#for-customers" class="font-medium text-[var(--color-info)] hover:underline">find your barbershop</NuxtLink>.
      </p>
    </div>
  </div>
</template>
