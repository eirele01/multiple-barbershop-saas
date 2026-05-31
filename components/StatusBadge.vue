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

const statusConfig: Record<string, { label: string; class: string }> = {
  // Booking statuses
  pending: { label: 'Pending', class: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' },
  pending_payment: { label: 'Pending Payment', class: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' },
  confirmed: { label: 'Confirmed', class: 'bg-[var(--color-success)]/10 text-[var(--color-success)]' },
  in_progress: { label: 'In Progress', class: 'bg-[var(--color-info)]/10 text-[var(--color-info)]' },
  completed: { label: 'Completed', class: 'bg-[var(--color-success)]/10 text-[var(--color-success)]' },
  cancelled: { label: 'Cancelled', class: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' },
  no_show: { label: 'No Show', class: 'bg-[var(--color-titanium)]/10 text-[var(--color-titanium)]' },

  // Payment statuses
  paid: { label: 'Paid', class: 'bg-[var(--color-success)]/10 text-[var(--color-success)]' },
  verified: { label: 'Verified', class: 'bg-[var(--color-success)]/10 text-[var(--color-success)]' },
  pending_verification: { label: 'Verifying', class: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' },
  rejected: { label: 'Rejected', class: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' },
  refunded: { label: 'Refunded', class: 'bg-[var(--color-info)]/10 text-[var(--color-info)]' },
  failed: { label: 'Failed', class: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' },

  // Verification statuses
  more_info: { label: 'More Info Needed', class: 'bg-[var(--color-info)]/10 text-[var(--color-info)]' },

  // General
  active: { label: 'Active', class: 'bg-[var(--color-success)]/10 text-[var(--color-success)]' },
  inactive: { label: 'Inactive', class: 'bg-[var(--color-titanium)]/10 text-[var(--color-titanium)]' },
}

const config = computed(() => statusConfig[props.status] || {
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
