<script setup lang="ts">
/**
 * Customer Layout — Used for the customer portal
 * Simple top navbar with customer navigation.
 */
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()

// Hydration guard: only render auth-dependent UI after client mount
const isMounted = ref(false)

// ── Navigation ──
// Primary portal sections live here. Account-level actions (Profile, Sign Out)
// live in the avatar menu — no duplication across the two.
const navItems = [
  { to: '/customer/dashboard', label: 'Dashboard', icon: 'lucide:layout-dashboard' },
  { to: '/customer/bookings', label: 'Bookings', icon: 'lucide:calendar-check' },
  { to: '/customer/loyalty', label: 'Loyalty', icon: 'lucide:star' },
]

const route = useRoute()
const isActive = (target: string) => route.path === target

// Mobile menu state
const isMobileOpen = ref(false)
const mobileMenuRef = ref<HTMLElement | null>(null)

// User dropdown menu state
const isUserMenuOpen = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)

onMounted(() => {
  isMounted.value = true
})

// Close a menu when clicking outside it
function onClickOutside(event: MouseEvent) {
  if (userMenuRef.value && !userMenuRef.value.contains(event.target as Node)) {
    isUserMenuOpen.value = false
  }
  if (mobileMenuRef.value && !mobileMenuRef.value.contains(event.target as Node)) {
    isMobileOpen.value = false
  }
}

// Close menus when pressing Escape
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    isUserMenuOpen.value = false
    isMobileOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
})

function closeAllMenus() {
  isUserMenuOpen.value = false
  isMobileOpen.value = false
}

async function handleSignOut() {
  closeAllMenus()
  await authStore.signOut()
}
</script>

<template>
  <div class="min-h-screen bg-[var(--color-white)]">
    <!-- Customer Navbar -->
    <nav class="glass fixed left-0 right-0 top-0 z-50 border-b border-[var(--color-silver)]/30">
      <div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <!-- Logo -->
        <BrandLogo
          to="/customer/dashboard"
          text="My Account"
          box-class="gradient-metallic flex h-8 w-8 items-center justify-center rounded-btn shrink-0"
          img-class="h-4 w-4"
          text-class="text-sm font-bold text-[var(--color-deep)]"
        />

        <!-- Desktop Nav Links + Account (md and up) -->
        <div class="hidden items-center gap-5 md:flex">
          <nav class="flex items-center gap-5" aria-label="Customer navigation">
            <NuxtLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-[var(--color-deep)]"
              :class="isActive(item.to) ? 'text-[var(--color-deep)]' : 'text-[var(--color-titanium)]'"
            >
              <Icon :name="item.icon" class="h-4 w-4" />
              {{ item.label }}
            </NuxtLink>
          </nav>
<!-- User menu (desktop) -->
          <div v-if="isMounted" ref="userMenuRef" class="relative">
            <button
              type="button"
              aria-haspopup="menu"
              :aria-expanded="isUserMenuOpen"
              aria-label="Account menu"
              class="flex items-center gap-1.5 rounded-btn p-1 transition-colors hover:bg-[var(--color-silver)]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)]"
              @click="isUserMenuOpen = !isUserMenuOpen"
            >
              <UserAvatar :name="authStore.displayName" size="md" />
              <span class="hidden text-sm font-medium text-[var(--color-deep)] lg:inline">
                {{ authStore.displayName.split(' ')[0] }}
              </span>
              <Icon
                name="lucide:chevron-down"
                class="h-4 w-4 text-[var(--color-titanium)] transition-transform"
                :class="isUserMenuOpen ? 'rotate-180' : ''"
              />
            </button>

            <Transition
              enter-active-class="transition-all duration-150 ease-out"
              enter-from-class="opacity-0 -translate-y-1"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition-all duration-100 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 -translate-y-1"
            >
              <div
                v-if="isUserMenuOpen"
                role="menu"
                class="glass absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-btn border border-[var(--color-silver)]/30 shadow-lg"
              >
                <div class="flex items-center gap-3 border-b border-[var(--color-silver)]/30 px-4 py-3">
                  <UserAvatar :name="authStore.displayName" size="lg" />
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-[var(--color-deep)]">
                      {{ authStore.displayName }}
                    </p>
                    <p class="truncate text-xs capitalize text-[var(--color-titanium)]">
                      {{ authStore.role }}
                    </p>
                  </div>
                </div>

                <div class="p-1.5">
                  <NuxtLink
                    to="/customer/profile"
                    role="menuitem"
                    class="flex items-center gap-2.5 rounded-input px-3 py-2 text-sm font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20"
                    @click="closeAllMenus"
                  >
                    <Icon name="lucide:user" class="h-4 w-4 text-[var(--color-titanium)]" />
                    Profile
                  </NuxtLink>
                </div>

                <div class="border-t border-[var(--color-silver)]/30 p-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    class="flex w-full items-center gap-2.5 rounded-input px-3 py-2 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
                    @click="handleSignOut"
                  >
                    <Icon name="lucide:log-out" class="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            </Transition>
          </div>
          <div v-else class="h-8 w-8 rounded-full bg-[var(--color-deep)]" />
        </div>

        <!-- Mobile controls (below md) -->
        <div ref="mobileMenuRef" class="flex items-center gap-2 md:hidden">
          <button
            v-if="isMounted"
            type="button"
            aria-label="Toggle account menu"
            aria-haspopup="menu"
            :aria-expanded="isUserMenuOpen"
            class="flex h-9 w-9 items-center justify-center rounded-btn transition-colors hover:bg-[var(--color-silver)]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)]"
            @click="isUserMenuOpen = !isUserMenuOpen"
          >
            <UserAvatar :name="authStore.displayName" size="sm" />
          </button>

          <button
            type="button"
            aria-label="Open navigation menu"
            :aria-expanded="isMobileOpen"
            class="flex h-9 w-9 items-center justify-center rounded-btn text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)]"
                        @click.stop="isMobileOpen = !isMobileOpen"
          >
            <Icon :name="isMobileOpen ? 'lucide:x' : 'lucide:menu'" class="h-5 w-5" />
          </button>
        </div>
      </div>
<!-- Mobile navigation overlay -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="isMobileOpen" class="glass border-t border-[var(--color-silver)]/30 md:hidden">
          <div class="space-y-1 px-4 py-3">
            <p class="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-titanium)]">
              Menu
            </p>
            <NuxtLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2.5 rounded-input px-3 py-2.5 text-sm font-medium transition-colors"
              :class="isActive(item.to)
                ? 'bg-[var(--color-silver)]/20 text-[var(--color-deep)]'
                : 'text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]'"
              @click="closeAllMenus"
            >
              <Icon :name="item.icon" class="h-4 w-4" />
              {{ item.label }}
            </NuxtLink>

            <div class="my-2 border-t border-[var(--color-silver)]/30" />

            <NuxtLink
              to="/customer/profile"
              class="flex items-center gap-2.5 rounded-input px-3 py-2.5 text-sm font-medium text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]"
              @click="closeAllMenus"
            >
              <Icon name="lucide:user" class="h-4 w-4" />
              Profile
            </NuxtLink>
            <button
              type="button"
              class="flex w-full items-center gap-2.5 rounded-input px-3 py-2.5 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
              @click="handleSignOut"
            >
              <Icon name="lucide:log-out" class="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </Transition>

      <!-- Mobile account dropdown (below md) -->
      <Transition
        enter-active-class="transition-all duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="isUserMenuOpen && !isMobileOpen"
          role="menu"
          class="glass border-t border-[var(--color-silver)]/30 px-4 py-3 md:hidden"
        >
          <div class="mb-2 flex items-center gap-3 border-b border-[var(--color-silver)]/30 pb-3">
            <UserAvatar :name="authStore.displayName" size="lg" />
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-[var(--color-deep)]">
                {{ authStore.displayName }}
              </p>
              <p class="truncate text-xs capitalize text-[var(--color-titanium)]">
                {{ authStore.role }}
              </p>
            </div>
          </div>
          <NuxtLink
            to="/customer/profile"
            role="menuitem"
            class="flex items-center gap-2.5 rounded-input px-3 py-2.5 text-sm font-medium text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]"
            @click="closeAllMenus"
          >
            <Icon name="lucide:user" class="h-4 w-4" />
            Profile
          </NuxtLink>
          <button
            type="button"
            role="menuitem"
            class="mt-1 flex w-full items-center gap-2.5 rounded-input px-3 py-2.5 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
            @click="handleSignOut"
          >
            <Icon name="lucide:log-out" class="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </Transition>
    </nav>

    <!-- Main Content -->
    <main class="mx-auto max-w-5xl px-4 pt-20 pb-8 sm:px-6">
      <slot />
    </main>
  </div>
</template>