<script setup lang="ts">
/**
 * Customer Layout — Used for the customer portal
 * Simple top navbar with customer navigation.
 */
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()

// Hydration guard: only render auth-dependent UI after client mount
const isMounted = ref(false)

onMounted(() => {
  isMounted.value = true
})
</script>

<template>
  <div class="min-h-screen bg-[var(--color-white)]">
    <!-- Customer Navbar -->
    <nav class="glass fixed left-0 right-0 top-0 z-50 border-b border-[var(--color-silver)]/30">
      <div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <!-- Logo -->
        <NuxtLink to="/customer/dashboard" class="flex items-center gap-2">
          <div class="gradient-metallic flex h-8 w-8 items-center justify-center rounded-btn">
            <Icon name="lucide:scissors" class="h-4 w-4 text-white" />
          </div>
          <span class="text-sm font-bold text-[var(--color-deep)]">
            My Account
          </span>
        </NuxtLink>

        <!-- Customer Nav Links -->
        <div class="flex items-center gap-4">
          <NuxtLink
            to="/customer/bookings"
            class="text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
          >
            Bookings
          </NuxtLink>
          <NuxtLink
            to="/customer/loyalty"
            class="text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
          >
            Loyalty
          </NuxtLink>
          <NuxtLink
            to="/customer/profile"
            class="text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
          >
            Profile
          </NuxtLink>

          <!-- User Avatar — only render after mount to avoid hydration mismatch -->
          <button
            v-if="isMounted"
            class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-deep)] text-xs font-bold text-white"
            @click="authStore.signOut()"
          >
            {{ authStore.displayName?.charAt(0)?.toUpperCase() || 'U' }}
          </button>
          <div v-else class="h-8 w-8 rounded-full bg-[var(--color-deep)]" />
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="mx-auto max-w-5xl px-4 pt-20 pb-8">
      <slot />
    </main>
  </div>
</template>
