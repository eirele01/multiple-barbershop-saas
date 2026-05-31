<script setup lang="ts">
/**
 * AppNavbar — Top navigation with glassmorphism effect
 * Used on all public pages as described in Section 10.
 *
 * Features:
 * - Glassmorphism effect (backdrop blur + semi-transparent bg)
 * - Mobile-first responsive design
 * - Hamburger menu on mobile
 * - Shows auth state (login/register vs user menu)
 */

const authStore = useAuthStore()
const isMobileMenuOpen = ref(false)
const route = useRoute()

const isHomePage = computed(() => route.path === '/')

function toggleMobileMenu() {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

function closeMobileMenu() {
  isMobileMenuOpen.value = false
}

async function handleSignOut() {
  await authStore.signOut()
  closeMobileMenu()
}
</script>

<template>
  <nav
    class="glass fixed top-0 left-0 right-0 z-50 border-b border-[var(--color-silver)]/30"
  >
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex h-16 items-center justify-between">
        <!-- Logo / Brand -->
        <div class="flex items-center gap-2">
          <NuxtLink to="/" class="flex items-center gap-2" @click="closeMobileMenu">
            <div class="gradient-metallic flex h-9 w-9 items-center justify-center rounded-btn">
              <Icon name="lucide:scissors" class="h-5 w-5 text-white" />
            </div>
            <span class="text-lg font-bold text-[var(--color-deep)]">
              BarberShop
            </span>
          </NuxtLink>
        </div>

        <!-- Desktop Navigation -->
        <div class="hidden items-center gap-6 md:flex">
          <template v-if="!authStore.isAuthenticated">
            <NuxtLink
              to="/"
              class="text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
              :class="{ 'text-[var(--color-deep)]': isHomePage }"
            >
              Home
            </NuxtLink>
            <NuxtLink
              to="/login"
              class="btn-design rounded-btn px-4 py-2 text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
            >
              Log In
            </NuxtLink>
            <NuxtLink
              to="/register"
              class="btn-design rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)]"
            >
              Register Your Shop
            </NuxtLink>
          </template>

          <template v-else>
            <!-- Authenticated user nav -->
            <NuxtLink
              v-if="authStore.canAccessAdmin"
              to="/admin/dashboard"
              class="text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
            >
              Dashboard
            </NuxtLink>
            <NuxtLink
              v-if="authStore.isSuperAdmin"
              to="/super-admin/dashboard"
              class="text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
            >
              Super Admin
            </NuxtLink>
            <NuxtLink
              v-if="authStore.isCustomer"
              to="/customer/dashboard"
              class="text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
            >
              My Bookings
            </NuxtLink>

            <!-- User Menu -->
            <div class="relative">
              <button
                class="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-[var(--color-silver)]/20"
                @click="toggleMobileMenu"
              >
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-deep)] text-xs font-bold text-white"
                >
                  {{ authStore.displayName?.charAt(0)?.toUpperCase() || 'U' }}
                </div>
                <span class="hidden text-sm font-medium text-[var(--color-deep)] lg:block">
                  {{ authStore.displayName }}
                </span>
              </button>
            </div>
          </template>
        </div>

        <!-- Mobile Hamburger -->
        <button
          class="flex items-center justify-center rounded-btn p-2 md:hidden"
          @click="toggleMobileMenu"
        >
          <Icon
            :name="isMobileMenuOpen ? 'lucide:x' : 'lucide:menu'"
            class="h-6 w-6 text-[var(--color-deep)]"
          />
        </button>
      </div>
    </div>

    <!-- Mobile Menu -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="isMobileMenuOpen"
        class="glass border-t border-[var(--color-silver)]/30 md:hidden"
      >
        <div class="space-y-1 px-4 py-3">
          <template v-if="!authStore.isAuthenticated">
            <NuxtLink
              to="/"
              class="block rounded-input px-3 py-2 text-sm font-medium text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20"
              @click="closeMobileMenu"
            >
              Home
            </NuxtLink>
            <NuxtLink
              to="/login"
              class="block rounded-input px-3 py-2 text-sm font-medium text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20"
              @click="closeMobileMenu"
            >
              Log In
            </NuxtLink>
            <NuxtLink
              to="/register"
              class="block rounded-input bg-[var(--color-deep)] px-3 py-2 text-center text-sm font-medium text-white"
              @click="closeMobileMenu"
            >
              Register Your Shop
            </NuxtLink>
          </template>

          <template v-else>
            <div class="mb-2 flex items-center gap-3 border-b border-[var(--color-silver)]/30 pb-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-deep)] text-sm font-bold text-white"
              >
                {{ authStore.displayName?.charAt(0)?.toUpperCase() || 'U' }}
              </div>
              <div>
                <p class="text-sm font-medium text-[var(--color-deep)]">
                  {{ authStore.displayName }}
                </p>
                <p class="text-xs text-[var(--color-titanium)]">
                  {{ authStore.role }}
                </p>
              </div>
            </div>

            <NuxtLink
              v-if="authStore.canAccessAdmin"
              to="/admin/dashboard"
              class="block rounded-input px-3 py-2 text-sm font-medium text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20"
              @click="closeMobileMenu"
            >
              Dashboard
            </NuxtLink>
            <NuxtLink
              v-if="authStore.isSuperAdmin"
              to="/super-admin/dashboard"
              class="block rounded-input px-3 py-2 text-sm font-medium text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20"
              @click="closeMobileMenu"
            >
              Super Admin
            </NuxtLink>
            <NuxtLink
              v-if="authStore.isCustomer"
              to="/customer/dashboard"
              class="block rounded-input px-3 py-2 text-sm font-medium text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20"
              @click="closeMobileMenu"
            >
              My Bookings
            </NuxtLink>

            <button
              class="block w-full rounded-input px-3 py-2 text-left text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
              @click="handleSignOut"
            >
              Sign Out
            </button>
          </template>
        </div>
      </div>
    </Transition>
  </nav>
</template>
