<script setup lang="ts">
interface Props {
  plan: string
}

const props = defineProps<Props>()

/**
 * Label = capitalized plan code. Works for ANY plan created in the Tier
 * Maker (basic → Basic, upgraded → Upgraded, pro → Pro, …) — no hardcoded
 * plan list to drift out of sync.
 */
const label = computed(() => {
  const code = props.plan || 'basic'
  return code.charAt(0).toUpperCase() + code.slice(1)
})

/** 'basic' is the canonical free/default plan code; everything else is paid. */
const isPaid = computed(() => !!props.plan && props.plan !== 'basic')

const badgeClass = computed(() =>
  isPaid.value
    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
)
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="badgeClass"
  >
    {{ label }}
  </span>
</template>
