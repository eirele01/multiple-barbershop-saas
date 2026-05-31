<script setup lang="ts">
/**
 * ConfirmDialog — Modal confirmation dialog
 * Used via useConfirm() composable
 */
const props = defineProps<{
  modelValue: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

const confirmButtonClass = computed(() => {
  switch (props.variant) {
    case 'danger': return 'bg-[var(--color-danger)] text-white hover:opacity-90'
    case 'warning': return 'bg-[var(--color-warning)] text-white hover:opacity-90'
    default: return 'bg-[var(--color-deep)] text-white hover:bg-[var(--color-titanium)]'
  }
})

function handleConfirm() {
  emit('confirm')
  emit('update:modelValue', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
        @click.self="handleCancel"
      >
        <div class="card-design w-full max-w-md p-6">
          <!-- Icon -->
          <div class="mb-4 flex justify-center">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-full"
              :class="variant === 'danger' ? 'bg-[var(--color-danger)]/10' : variant === 'warning' ? 'bg-[var(--color-warning)]/10' : 'bg-[var(--color-info)]/10'"
            >
              <Icon
                :name="variant === 'danger' ? 'lucide:trash-2' : variant === 'warning' ? 'lucide:alert-triangle' : 'lucide:help-circle'"
                class="h-6 w-6"
                :class="variant === 'danger' ? 'text-[var(--color-danger)]' : variant === 'warning' ? 'text-[var(--color-warning)]' : 'text-[var(--color-info)]'"
              />
            </div>
          </div>

          <!-- Title -->
          <h3 class="text-center text-lg font-semibold text-[var(--color-deep)]">{{ title }}</h3>
          
          <!-- Message -->
          <p class="mt-2 text-center text-sm text-[var(--color-titanium)]">{{ message }}</p>

          <!-- Buttons -->
          <div class="mt-6 flex gap-3">
            <button
              class="btn-design flex-1 rounded-btn border border-[var(--color-silver)]/50 px-4 py-2.5 text-sm font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
              @click="handleCancel"
            >
              {{ cancelLabel || 'Cancel' }}
            </button>
            <button
              class="btn-design flex-1 rounded-btn px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              :class="confirmButtonClass"
              @click="handleConfirm"
            >
              {{ confirmLabel || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
