<script setup lang="ts">
/**
 * DashboardStatCard — Stat number + label + trend indicator
 * Used in admin dashboard as described in Section 10.
 */

interface Props {
  label: string
  value: string | number
  icon: string
  trend?: {
    value: number
    label: string
    isPositive: boolean
  }
  color?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

const props = withDefaults(defineProps<Props>(), {
  color: 'default',
})

const colorClasses = computed(() => {
  const colors = {
    default: 'bg-[var(--color-deep)]/5 text-[var(--color-deep)]',
    success: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
    info: 'bg-[var(--color-info)]/10 text-[var(--color-info)]',
  }
  return colors[props.color]
})
</script>

<template>
  <div class="card-design p-5">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-sm font-medium text-[var(--color-titanium)]">{{ label }}</p>
        <p class="mt-1 text-2xl font-bold text-[var(--color-deep)]">{{ value }}</p>
        <div v-if="trend" class="mt-2 flex items-center gap-1">
          <Icon
            :name="trend.isPositive ? 'lucide:trending-up' : 'lucide:trending-down'"
            class="h-3.5 w-3.5"
            :class="trend.isPositive ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'"
          />
          <span
            class="text-xs font-medium"
            :class="trend.isPositive ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'"
          >
            {{ trend.value > 0 ? '+' : '' }}{{ trend.value }}%
          </span>
          <span class="text-xs text-[var(--color-titanium)]">{{ trend.label }}</span>
        </div>
      </div>
      <div
        class="flex h-10 w-10 items-center justify-center rounded-btn"
        :class="colorClasses"
      >
        <Icon :name="icon" class="h-5 w-5" />
      </div>
    </div>
  </div>
</template>
