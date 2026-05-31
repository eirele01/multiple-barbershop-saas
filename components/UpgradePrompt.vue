<script setup lang="ts">
/**
 * UpgradePrompt — Modal shown when Basic tier limit is hit
 * As per Section 4: "Show a modal with a friendly upgrade prompt, NOT a generic error."
 */

interface Props {
  isOpen: boolean
  resource: string
  currentCount: number
  limit: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  upgrade: []
}>()

const resourceLabel = computed(() => {
  const labels: Record<string, string> = {
    services: 'services',
    gallery: 'gallery images',
    products: 'products',
    staff: 'staff members',
  }
  return labels[props.resource] || props.resource
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        @click.self="emit('close')"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="scale-95 opacity-0"
          enter-to-class="scale-100 opacity-100"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="scale-100 opacity-100"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="isOpen"
            class="w-full max-w-md rounded-card bg-[var(--color-pure-white)] p-6 shadow-xl"
          >
            <!-- Icon -->
            <div
              class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-info)]/10"
            >
              <Icon name="lucide:sparkles" class="h-8 w-8 text-[var(--color-info)]" />
            </div>

            <!-- Title -->
            <h3 class="mb-2 text-center text-xl font-bold text-[var(--color-deep)]">
              Unlock Unlimited {{ resourceLabel }}
            </h3>

            <!-- Description -->
            <p class="mb-4 text-center text-sm text-[var(--color-titanium)]">
              You've reached the Basic plan limit of
              <span class="font-semibold text-[var(--color-deep)]">{{ limit }} {{ resourceLabel }}</span>.
              Upgrade to the Upgraded plan for unlimited {{ resourceLabel }} and more!
            </p>

            <!-- Upgrade benefits -->
            <div class="mb-6 space-y-2 rounded-input bg-[var(--color-white)] p-4">
              <div class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                <span>Unlimited {{ resourceLabel }}</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                <span>PayMongo integration</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                <span>Email notifications</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                <span>Loyalty program</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                <span>Advanced analytics</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-3">
              <button
                class="btn-design flex-1 rounded-btn border border-[var(--color-silver)] px-4 py-2.5 text-sm font-medium text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
                @click="emit('close')"
              >
                Maybe Later
              </button>
              <button
                class="btn-design flex-1 rounded-btn bg-[var(--color-deep)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)]"
                @click="emit('upgrade')"
              >
                Upgrade Now
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
