<script setup lang="ts">
/**
 * ErrorState — Reusable error display
 * Props: title, message, retryFn (optional callback)
 */
const props = defineProps<{
  title?: string
  message?: string
  retryFn?: () => Promise<void> | void
}>()

const isRetrying = ref(false)

async function handleRetry() {
  if (!props.retryFn) return
  isRetrying.value = true
  try {
    await props.retryFn()
  } finally {
    isRetrying.value = false
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 text-center">
    <div class="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-danger)]/10">
      <Icon name="lucide:alert-triangle" class="h-8 w-8 text-[var(--color-danger)]" />
    </div>
    <h3 class="mt-4 text-lg font-semibold text-[var(--color-deep)]">{{ title || 'Something went wrong' }}</h3>
    <p class="mt-2 max-w-md text-sm text-[var(--color-titanium)]">{{ message || 'An unexpected error occurred. Please try again.' }}</p>
    <button
      v-if="retryFn"
      class="btn-design mt-6 inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)]"
      :disabled="isRetrying"
      @click="handleRetry"
    >
      <Icon v-if="isRetrying" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
      <Icon v-else name="lucide:refresh-cw" class="h-4 w-4" />
      {{ isRetrying ? 'Retrying...' : 'Try Again' }}
    </button>
  </div>
</template>
