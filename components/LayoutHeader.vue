<script setup lang="ts">
/**
 * LayoutHeader — Shared header for admin layout pages
 *
 * Props:
 * - breadcrumbs: Array of { label, href } for breadcrumb navigation
 * - title: Page title text
 * - icon: Icon name (e.g. 'lucide:layout-dashboard')
 */
interface Breadcrumb {
  label: string
  href?: string
}

defineProps<{
  breadcrumbs: Breadcrumb[]
  title: string
  icon?: string
}>()
</script>

<template>
  <!-- Mobile breadcrumb bar -->
  <div class="border-b border-[var(--color-silver)]/30 bg-[var(--color-pearl)] md:hidden">
    <div class="flex items-center gap-2 px-4 py-2.5">
      <NuxtLink to="/" class="text-sm text-[var(--color-titanium)]">Home</NuxtLink>
      <Icon name="lucide:chevron-right" class="h-3 w-3 text-[var(--color-silver)]" />
      <NuxtLink to="/admin/dashboard" class="text-sm text-[var(--color-titanium)]">Dashboard</NuxtLink>
      <Icon name="lucide:chevron-right" class="h-3 w-3 text-[var(--color-silver)]" />
      <span class="text-sm font-medium text-[var(--color-deep)]">{{ title }}</span>
    </div>
  </div>

  <!-- Desktop header -->
  <div class="hidden md:flex md:items-center md:gap-4 md:mb-6">
    <Icon
      v-if="icon"
      :name="icon"
      class="h-6 w-6 text-[var(--color-titanium)]"
    />
    <h1 class="text-2xl font-bold text-[var(--color-deep)]">{{ title }}</h1>
  </div>
</template>
