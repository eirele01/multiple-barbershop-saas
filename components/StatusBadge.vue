<script setup lang="ts">
/**
 * StatusBadge — Colored pill badge for booking/payment status
 * Used throughout admin panel as described in Section 10.
 */

interface Props {
  status: string
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
})

import { STATUS_CONFIG } from '~/constants/statuses'

const config = computed(() => STATUS_CONFIG[props.status] || {
  label: props.status,
  class: 'bg-[var(--color-silver)]/20 text-[var(--color-titanium)]',
})

const sizeClass = computed(() => {
  const sizes = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
    lg: 'px-4 py-1.5 text-sm',
  }
  return sizes[props.size]
})
</script>

<template>
  <span
    class="badge-pill inline-flex items-center font-medium"
    :class="[config.class, sizeClass]"
  >
    {{ config.label }}
  </span>
</template>
