
<script setup lang="ts">
interface Props {
  plan: string
}

const props = defineProps<Props>()

const isUpgraded = computed(() => props.plan === 'upgraded')

const label = computed(() => isUpgraded.value ? 'Upgraded' : 'Basic')

const badgeClass = computed(() =>
  isUpgraded.value
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
