<script setup lang="ts">
// Shop layout — clean, no app navbar
// Adds smooth page transitions and global shop page styles
</script>

<template>
  <div class="shop-layout min-h-screen bg-black">
    <slot />
  </div>
</template>

<style>
/* Global styles for shop pages */
.shop-layout {
  scroll-behavior: smooth;
}

/* Override default focus ring for shop pages to use primary color */
.shop-layout :focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

/* iOS momentum scrolling for horizontal scroll containers */
.shop-layout .overflow-x-auto {
  -webkit-overflow-scrolling: touch;
}
</style>
