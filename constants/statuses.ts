/**
 * Status badge configuration mapping
 * Used by StatusBadge.vue and any code that needs status→label/class mapping.
 */

export const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
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
