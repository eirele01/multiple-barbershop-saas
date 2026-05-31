<template>
  <!-- Toast Container — Renders all active toasts -->
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" style="max-width: 360px;">
      <TransitionGroup
        enter-active-class="transition-all duration-300"
        enter-from-class="translate-x-8 opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition-all duration-200"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-8 opacity-0"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg"
          :class="{
            'border-[var(--color-success)]/20 bg-[var(--color-success)]/10 text-[var(--color-deep)]': toast.type === 'success',
            'border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 text-[var(--color-deep)]': toast.type === 'error',
            'border-[var(--color-info)]/20 bg-[var(--color-info)]/10 text-[var(--color-deep)]': toast.type === 'info',
            'border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10 text-[var(--color-deep)]': toast.type === 'warning',
          }"
        >
          <Icon
            :name="{
              success: 'lucide:check-circle',
              error: 'lucide:alert-circle',
              info: 'lucide:info',
              warning: 'lucide:alert-triangle',
            }[toast.type]"
            class="mt-0.5 h-4 w-4 shrink-0"
            :class="{
              'text-[var(--color-success)]': toast.type === 'success',
              'text-[var(--color-danger)]': toast.type === 'error',
              'text-[var(--color-info)]': toast.type === 'info',
              'text-[var(--color-warning)]': toast.type === 'warning',
            }"
          />
          <p class="flex-1 text-sm">{{ toast.message }}</p>
          <button
            class="shrink-0 text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
            @click="remove(toast.id)"
          >
            <Icon name="lucide:x" class="h-3.5 w-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const { toasts, remove } = useToast()
</script>
