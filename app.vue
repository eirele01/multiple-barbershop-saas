<script setup lang="ts">
/**
 * App.vue — Root component
 * Initializes auth store and loads current shop.
 *
 * Auth initialization only runs on the client side because
 * Supabase stores sessions in localStorage (not available during SSR).
 * The middleware handles this by skipping auth redirects during SSR.
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'

const authStore = useAuthStore()
const shopStore = useShopStore()

// Initialize auth listener on client only
// During SSR, the store's initialize() returns immediately
onMounted(async () => {
  await authStore.initialize()

  // If authenticated and has a shop, load it
  if (authStore.isAuthenticated && authStore.shopId) {
    await shopStore.loadCurrentShop()
  }
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
  </NuxtLayout>
  <ToastContainer />
</template>