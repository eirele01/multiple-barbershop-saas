<script setup lang="ts">
/**
 * Auth Layout — Used for login and register pages
 * Centered card with a subtle background.
 */
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[var(--color-white)] px-4">
    <!-- Background decoration -->
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        class="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-[var(--color-silver)]/20"
      />
      <div
        class="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-[var(--color-silver)]/10"
      />
    </div>

    <div class="relative z-10 w-full max-w-md">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <NuxtLink to="/" class="inline-flex items-center gap-2">
          <div class="gradient-metallic flex h-12 w-12 items-center justify-center rounded-btn">
            <Icon name="lucide:calendar" class="h-6 w-6 text-white" />
          </div>
          <span class="text-2xl font-bold text-[var(--color-deep)]">
            Reservation PH
          </span>
        </NuxtLink>
      </div>

      <!-- Auth Card -->
      <div class="card-design p-8">
        <slot />
      </div>
    </div>
  </div>
</template>
