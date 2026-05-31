<script setup lang="ts">
/**
 * /customer/login — Redirect to unified /login page
 *
 * This page no longer exists as a separate entity.
 * All login/registration is now handled at /login.
 * This file exists solely to redirect old bookmarks/links.
 */
definePageMeta({
  layout: 'auth',
})

onMounted(() => {
  navigateTo('/login?role=customer', { replace: true })
})
</script>

<template>
  <div class="flex items-center justify-center py-12">
    <div class="flex items-center gap-2 text-sm text-[var(--color-titanium)]">
      <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" />
      Redirecting to login...
    </div>
  </div>
</template>
