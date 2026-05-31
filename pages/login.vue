<script setup lang="ts">
/**
 * Unified Login / Register Page — /login
 *
 * Two-step flow:
 *   Step 1: Role selector (Shop Owner/Staff vs Customer)
 *   Step 2: Sign In or Create Account tab toggle
 *
 * Shop Owner/Staff + Sign In  → email/password login → /admin/dashboard (or role-based)
 * Shop Owner/Staff + Create   → redirect to /register
 * Customer + Sign In          → email/password login → /customer/dashboard
 * Customer + Create Account   → registration form → auto login → /customer/dashboard
 */
definePageMeta({
  layout: 'auth',
  middleware: 'guest',
})

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

// ─── Step state ──────────────────────────────────────
type Role = 'shop' | 'customer' | null
const selectedRole = ref<Role>(null)
type Tab = 'signin' | 'create'
const activeTab = ref<Tab>('signin')
const isLoading = ref(false)
const errorMessage = ref('')

// ─── Sign In form ────────────────────────────────────
const signInEmail = ref('')
const signInPassword = ref('')
const showPassword = ref(false)

// ─── Customer Create Account form ────────────────────
const regFirstName = ref('')
const regLastName = ref('')
const regEmail = ref('')
const regPhone = ref('')
const regPassword = ref('')
const regConfirmPassword = ref('')
const showRegPassword = ref(false)
const showRegConfirmPassword = ref(false)

// ─── Inline validation ──────────────────────────────
const signInEmailError = ref('')
const signInPasswordError = ref('')
const regFirstNameError = ref('')
const regLastNameError = ref('')
const regEmailError = ref('')
const regPhoneError = ref('')
const regPasswordError = ref('')
const regConfirmPasswordError = ref('')

// ─── Check URL params for pre-selected role ──────────
onMounted(() => {
  const roleParam = route.query.role as string
  if (roleParam === 'shop' || roleParam === 'customer') {
    selectedRole.value = roleParam
  }
  const tabParam = route.query.tab as string
  if (tabParam === 'create') {
    activeTab.value = 'create'
  }
})

// ─── Role selection ──────────────────────────────────
function selectRole(role: Role) {
  selectedRole.value = role
  activeTab.value = 'signin'
  errorMessage.value = ''
  clearAllErrors()
}

function goBack() {
  selectedRole.value = null
  activeTab.value = 'signin'
  errorMessage.value = ''
  clearAllErrors()
}

function clearAllErrors() {
  signInEmailError.value = ''
  signInPasswordError.value = ''
  regFirstNameError.value = ''
  regLastNameError.value = ''
  regEmailError.value = ''
  regPhoneError.value = ''
  regPasswordError.value = ''
  regConfirmPasswordError.value = ''
}

// ─── Sign In ─────────────────────────────────────────
function validateSignIn(): boolean {
  let valid = true
  if (!signInEmail.value.trim()) {
    signInEmailError.value = 'Email is required'
    valid = false
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signInEmail.value.trim())) {
    signInEmailError.value = 'Enter a valid email address'
    valid = false
  } else {
    signInEmailError.value = ''
  }
  if (!signInPassword.value) {
    signInPasswordError.value = 'Password is required'
    valid = false
  } else {
    signInPasswordError.value = ''
  }
  return valid
}

async function handleSignIn() {
  if (!validateSignIn()) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    await authStore.signIn(signInEmail.value.trim(), signInPassword.value)

    // Redirect based on role
    if (authStore.isSuperAdmin) {
      await router.push('/super-admin/dashboard')
    } else if (authStore.canAccessAdmin) {
      const redirect = route.query.redirect as string
      await router.push(redirect || '/admin/dashboard')
    } else if (authStore.isCustomer) {
      const redirect = route.query.redirect as string
      await router.push(redirect || '/customer/dashboard')
    } else {
      await router.push('/')
    }
  } catch (error: any) {
    errorMessage.value = error.message || 'Invalid email or password'
  } finally {
    isLoading.value = false
  }
}

// ─── Customer Registration ───────────────────────────
function validateRegistration(): boolean {
  let valid = true

  if (!regFirstName.value.trim()) {
    regFirstNameError.value = 'First name is required'
    valid = false
  } else if (regFirstName.value.trim().length < 2) {
    regFirstNameError.value = 'Must be at least 2 characters'
    valid = false
  } else {
    regFirstNameError.value = ''
  }

  if (!regLastName.value.trim()) {
    regLastNameError.value = 'Last name is required'
    valid = false
  } else if (regLastName.value.trim().length < 2) {
    regLastNameError.value = 'Must be at least 2 characters'
    valid = false
  } else {
    regLastNameError.value = ''
  }

  if (!regEmail.value.trim()) {
    regEmailError.value = 'Email is required'
    valid = false
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.value.trim())) {
    regEmailError.value = 'Enter a valid email address'
    valid = false
  } else {
    regEmailError.value = ''
  }

  if (!regPhone.value.trim()) {
    regPhoneError.value = 'Phone number is required'
    valid = false
  } else {
    regPhoneError.value = ''
  }

  if (!regPassword.value) {
    regPasswordError.value = 'Password is required'
    valid = false
  } else if (regPassword.value.length < 8) {
    regPasswordError.value = 'Must be at least 8 characters'
    valid = false
  } else {
    regPasswordError.value = ''
  }

  if (!regConfirmPassword.value) {
    regConfirmPasswordError.value = 'Please confirm your password'
    valid = false
  } else if (regConfirmPassword.value !== regPassword.value) {
    regConfirmPasswordError.value = 'Passwords do not match'
    valid = false
  } else {
    regConfirmPasswordError.value = ''
  }

  return valid
}

async function handleCustomerRegister() {
  if (!validateRegistration()) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    await $fetch('/api/customer/register', {
      method: 'POST',
      body: {
        first_name: regFirstName.value.trim(),
        last_name: regLastName.value.trim(),
        email: regEmail.value.trim(),
        phone: regPhone.value.trim(),
        password: regPassword.value,
      },
    })

    // Auto-login after registration
    await authStore.signIn(regEmail.value.trim(), regPassword.value)

    const redirect = route.query.redirect as string
    await router.push(redirect || '/customer/dashboard')
  } catch (error: any) {
    const data = error?.data
    if (data?.statusMessage) {
      errorMessage.value = data.statusMessage
    } else if (data?.message) {
      errorMessage.value = data.message
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
    <!-- ═══ STEP 1: Role Selector ═══ -->
    <template v-if="!selectedRole">
      <h2 class="mb-2 text-center text-[var(--color-deep)]">
        Welcome to BarberShop
      </h2>
      <p class="mb-8 text-center text-sm text-[var(--color-titanium)]">
        How would you like to continue?
      </p>

      <div class="space-y-4">
        <!-- Shop Owner / Staff card -->
        <button
          class="group w-full rounded-btn border-2 border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] p-5 text-left transition-all hover:border-[var(--color-deep)] hover:shadow-md"
          @click="selectRole('shop')"
        >
          <div class="flex items-start gap-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-btn bg-[var(--color-deep)]/10 transition-colors group-hover:bg-[var(--color-deep)]/20">
              <Icon name="lucide:scissors" class="h-6 w-6 text-[var(--color-deep)]" />
            </div>
            <div>
              <p class="text-sm font-semibold text-[var(--color-deep)]">Shop Owner or Staff</p>
              <p class="mt-0.5 text-xs text-[var(--color-titanium)]">
                Manage your barbershop, bookings, and team
              </p>
            </div>
            <Icon name="lucide:chevron-right" class="ml-auto h-5 w-5 text-[var(--color-silver)] transition-colors group-hover:text-[var(--color-deep)]" />
          </div>
        </button>

        <!-- Customer card -->
        <button
          class="group w-full rounded-btn border-2 border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] p-5 text-left transition-all hover:border-[var(--color-info)] hover:shadow-md"
          @click="selectRole('customer')"
        >
          <div class="flex items-start gap-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-btn bg-[var(--color-info)]/10 transition-colors group-hover:bg-[var(--color-info)]/20">
              <Icon name="lucide:user" class="h-6 w-6 text-[var(--color-info)]" />
            </div>
            <div>
              <p class="text-sm font-semibold text-[var(--color-deep)]">Customer</p>
              <p class="mt-0.5 text-xs text-[var(--color-titanium)]">
                Book appointments and track your visits
              </p>
            </div>
            <Icon name="lucide:chevron-right" class="ml-auto h-5 w-5 text-[var(--color-silver)] transition-colors group-hover:text-[var(--color-info)]" />
          </div>
        </button>
      </div>

      <!-- No account needed note for customers -->
      <p class="mt-6 text-center text-xs text-[var(--color-titanium)]">
        Customers can also book as a guest — no account needed.
        <br />
        Just visit your barbershop's page to book.
      </p>
    </template>

    <!-- ═══ STEP 2: Sign In / Create Account ═══ -->
    <template v-else>
      <!-- Back link -->
      <button
        class="mb-4 flex items-center gap-1 text-sm text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
        @click="goBack"
      >
        <Icon name="lucide:arrow-left" class="h-4 w-4" />
        Change
      </button>

      <!-- Role badge -->
      <div class="mb-4 flex items-center gap-2">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-full"
          :class="selectedRole === 'shop' ? 'bg-[var(--color-deep)]/10' : 'bg-[var(--color-info)]/10'"
        >
          <Icon
            :name="selectedRole === 'shop' ? 'lucide:scissors' : 'lucide:user'"
            class="h-4 w-4"
            :class="selectedRole === 'shop' ? 'text-[var(--color-deep)]' : 'text-[var(--color-info)]'"
          />
        </div>
        <span
          class="text-sm font-medium"
          :class="selectedRole === 'shop' ? 'text-[var(--color-deep)]' : 'text-[var(--color-info)]'"
        >
          {{ selectedRole === 'shop' ? 'Shop Owner / Staff' : 'Customer' }}
        </span>
      </div>

      <!-- Tab toggle -->
      <div class="mb-6 flex rounded-btn border border-[var(--color-silver)]/50 p-1">
        <button
          class="flex-1 rounded-btn px-4 py-2 text-sm font-medium transition-all"
          :class="activeTab === 'signin'
            ? 'bg-[var(--color-deep)] text-white shadow-sm'
            : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'"
          @click="activeTab = 'signin'; errorMessage = ''; clearAllErrors()"
        >
          Sign In
        </button>
        <button
          class="flex-1 rounded-btn px-4 py-2 text-sm font-medium transition-all"
          :class="activeTab === 'create'
            ? 'bg-[var(--color-deep)] text-white shadow-sm'
            : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'"
          @click="activeTab = 'create'; errorMessage = ''; clearAllErrors()"
        >
          Create Account
        </button>
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

      <!-- ═══ Shop Owner + Sign In ═══ -->
      <form
        v-if="selectedRole === 'shop' && activeTab === 'signin'"
        class="space-y-4"
        @submit.prevent="handleSignIn"
      >
        <div>
          <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Email Address</label>
          <input
            v-model="signInEmail"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
            :class="signInEmailError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
            @input="signInEmailError = ''"
          />
          <p v-if="signInEmailError" class="mt-1 text-xs text-[var(--color-danger)]">{{ signInEmailError }}</p>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Password</label>
          <div class="relative">
            <input
              v-model="signInPassword"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="current-password"
              placeholder="Enter your password"
              class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 pr-10 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              :class="signInPasswordError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
              @input="signInPasswordError = ''"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
              @click="showPassword = !showPassword"
            >
              <Icon :name="showPassword ? 'lucide:eye-off' : 'lucide:eye'" class="h-4 w-4" />
            </button>
          </div>
          <p v-if="signInPasswordError" class="mt-1 text-xs text-[var(--color-danger)]">{{ signInPasswordError }}</p>
        </div>
        <button
          type="submit"
          :disabled="isLoading"
          class="btn-design w-full rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span v-if="!isLoading">Sign In</span>
          <span v-else class="flex items-center justify-center gap-2">
            <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" />
            Signing In...
          </span>
        </button>
      </form>

      <!-- ═══ Shop Owner + Create Account (redirect to /register) ═══ -->
      <div v-if="selectedRole === 'shop' && activeTab === 'create'" class="text-center">
        <div class="mb-5 flex justify-center">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-deep)]/10">
            <Icon name="lucide:store" class="h-8 w-8 text-[var(--color-deep)]" />
          </div>
        </div>
        <p class="mb-2 text-sm font-medium text-[var(--color-deep)]">
          Register Your Barbershop
        </p>
        <p class="mb-6 text-sm text-[var(--color-titanium)]">
          To register your barbershop, use our dedicated registration page. You'll set up your account and shop in one simple flow.
        </p>
        <NuxtLink
          to="/register"
          class="btn-design inline-flex w-full items-center justify-center gap-2 rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-titanium)]"
        >
          <Icon name="lucide:arrow-right" class="h-4 w-4" />
          Register Your Barbershop
        </NuxtLink>
      </div>

      <!-- ═══ Customer + Sign In ═══ -->
      <form
        v-if="selectedRole === 'customer' && activeTab === 'signin'"
        class="space-y-4"
        @submit.prevent="handleSignIn"
      >
        <div>
          <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Email Address</label>
          <input
            v-model="signInEmail"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
            :class="signInEmailError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
            @input="signInEmailError = ''"
          />
          <p v-if="signInEmailError" class="mt-1 text-xs text-[var(--color-danger)]">{{ signInEmailError }}</p>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Password</label>
          <div class="relative">
            <input
              v-model="signInPassword"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="current-password"
              placeholder="Enter your password"
              class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 pr-10 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              :class="signInPasswordError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
              @input="signInPasswordError = ''"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
              @click="showPassword = !showPassword"
            >
              <Icon :name="showPassword ? 'lucide:eye-off' : 'lucide:eye'" class="h-4 w-4" />
            </button>
          </div>
          <p v-if="signInPasswordError" class="mt-1 text-xs text-[var(--color-danger)]">{{ signInPasswordError }}</p>
        </div>
        <button
          type="submit"
          :disabled="isLoading"
          class="btn-design w-full rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span v-if="!isLoading">Sign In</span>
          <span v-else class="flex items-center justify-center gap-2">
            <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" />
            Signing In...
          </span>
        </button>
        <p class="text-center text-xs text-[var(--color-titanium)]">
          Don't have an account?
          <button class="font-medium text-[var(--color-info)] hover:underline" @click="activeTab = 'create'; errorMessage = ''; clearAllErrors()">
            Switch to Create Account
          </button>
        </p>
      </form>

      <!-- ═══ Customer + Create Account ═══ -->
      <form
        v-if="selectedRole === 'customer' && activeTab === 'create'"
        class="space-y-4"
        @submit.prevent="handleCustomerRegister"
      >
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
              First Name <span class="text-[var(--color-danger)]">*</span>
            </label>
            <input
              v-model="regFirstName"
              type="text"
              required
              placeholder="Juan"
              class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              :class="regFirstNameError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
              @input="regFirstNameError = ''"
            />
            <p v-if="regFirstNameError" class="mt-1 text-xs text-[var(--color-danger)]">{{ regFirstNameError }}</p>
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
              Last Name <span class="text-[var(--color-danger)]">*</span>
            </label>
            <input
              v-model="regLastName"
              type="text"
              required
              placeholder="Dela Cruz"
              class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              :class="regLastNameError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
              @input="regLastNameError = ''"
            />
            <p v-if="regLastNameError" class="mt-1 text-xs text-[var(--color-danger)]">{{ regLastNameError }}</p>
          </div>
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
            Email <span class="text-[var(--color-danger)]">*</span>
          </label>
          <input
            v-model="regEmail"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
            :class="regEmailError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
            @input="regEmailError = ''"
          />
          <p v-if="regEmailError" class="mt-1 text-xs text-[var(--color-danger)]">{{ regEmailError }}</p>
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
            Phone <span class="text-[var(--color-danger)]">*</span>
          </label>
          <input
            v-model="regPhone"
            type="tel"
            required
            placeholder="+63 917 123 4567"
            class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
            :class="regPhoneError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
            @input="regPhoneError = ''"
          />
          <p v-if="regPhoneError" class="mt-1 text-xs text-[var(--color-danger)]">{{ regPhoneError }}</p>
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
            Password <span class="text-[var(--color-danger)]">*</span>
          </label>
          <div class="relative">
            <input
              v-model="regPassword"
              :type="showRegPassword ? 'text' : 'password'"
              required
              minlength="8"
              placeholder="Minimum 8 characters"
              class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 pr-10 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              :class="regPasswordError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
              @input="regPasswordError = ''"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
              @click="showRegPassword = !showRegPassword"
            >
              <Icon :name="showRegPassword ? 'lucide:eye-off' : 'lucide:eye'" class="h-4 w-4" />
            </button>
          </div>
          <p v-if="regPasswordError" class="mt-1 text-xs text-[var(--color-danger)]">{{ regPasswordError }}</p>
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
            Confirm Password <span class="text-[var(--color-danger)]">*</span>
          </label>
          <div class="relative">
            <input
              v-model="regConfirmPassword"
              :type="showRegConfirmPassword ? 'text' : 'password'"
              required
              placeholder="Re-enter your password"
              class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-2.5 pr-10 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              :class="regConfirmPasswordError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]'"
              @input="regConfirmPasswordError = ''"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
              @click="showRegConfirmPassword = !showRegConfirmPassword"
            >
              <Icon :name="showRegConfirmPassword ? 'lucide:eye-off' : 'lucide:eye'" class="h-4 w-4" />
            </button>
          </div>
          <p v-if="regConfirmPasswordError" class="mt-1 text-xs text-[var(--color-danger)]">{{ regConfirmPasswordError }}</p>
        </div>

        <button
          type="submit"
          :disabled="isLoading"
          class="btn-design w-full rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span v-if="!isLoading">Create Account</span>
          <span v-else class="flex items-center justify-center gap-2">
            <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" />
            Creating Account...
          </span>
        </button>

        <p class="text-center text-xs text-[var(--color-titanium)]">
          Already have an account?
          <button class="font-medium text-[var(--color-info)] hover:underline" @click="activeTab = 'signin'; errorMessage = ''; clearAllErrors()">
            Switch to Sign In
          </button>
        </p>
      </form>
    </template>
  </div>
</template>
