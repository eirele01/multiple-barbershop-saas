<script setup lang="ts">
/**
 * EmptyState — Reusable empty state display
 * Props: icon, title, message, actionLabel, actionFn (optional)
 */
defineProps<{
  icon?: string
  title: string
  message?: string
  actionLabel?: string
  actionFn?: () => void
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-silver)]/10">
      <Icon :name="icon || 'lucide:inbox'" class="h-7 w-7 text-[var(--color-silver)]" />
    </div>
    <h3 class="mt-4 text-base font-semibold text-[var(--color-deep)]">{{ title }}</h3>
    <p v-if="message" class="mt-1.5 max-w-sm text-sm text-[var(--color-titanium)]">{{ message }}</p>
    <button
      v-if="actionLabel && actionFn"
      class="btn-design mt-5 inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)]"
      @click="actionFn"
    >
      <Icon name="lucide:plus" class="h-4 w-4" />
      {{ actionLabel }}
    </button>
  </div>
</template>
