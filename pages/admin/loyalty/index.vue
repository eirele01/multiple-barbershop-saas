<script setup lang="ts">
/**
 * /admin/loyalty — Redirects to /admin/loyalty/settings
 */
definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const shopStore = useShopStore()

// If not upgraded, redirect to settings with upgrade prompt
if (!shopStore.isUpgradedPlan) {
  navigateTo('/admin/settings', { redirectCode: 302 })
} else {
  navigateTo('/admin/loyalty/settings', { redirectCode: 302 })
}
</script>

<template>
  <div />
</template>
