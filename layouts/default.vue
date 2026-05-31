<script setup lang="ts">
/**
 * Default Layout — Used for public-facing pages
 * Includes AppNavbar with glassmorphism effect
 */
</script>

<template>
  <div class="min-h-screen bg-[var(--color-white)]">
    <AppNavbar />
    <main class="pt-16">
      <slot />
    </main>
  </div>
</template>
