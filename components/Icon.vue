<script setup lang="ts">
/**
 * Icon.vue — Global Icon Component
 * Wraps lucide-vue-next to support the `lucide:icon-name` format
 * used throughout the project.
 */
import * as LucideIcons from 'lucide-vue-next'

const props = defineProps<{
  name: string
  class?: any
  style?: any
}>()

const iconName = computed(() => {
  // Strip "lucide:" prefix and convert kebab-case to PascalCase
  const raw = props.name.replace(/^lucide:/, '')
  return raw
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
})

const iconComponent = computed(() => {
  const icons = LucideIcons as Record<string, any>
  return icons[iconName.value] || null
})
</script>

<template>
  <component
    :is="iconComponent"
    :class="$props.class"
    :style="$props.style"
    aria-hidden="true"
  />
</template>