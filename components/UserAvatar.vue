<script setup lang="ts">
/**
 * UserAvatar — Circular avatar with initial letter from display name
 *
 * Props:
 * - name: Display name to derive the initial letter
 * - size: Size preset (sm=24px, md=32px, lg=40px)
 * - showRing: Whether to show a ring border around the avatar
 */
interface Props {
  name?: string
  size?: 'sm' | 'md' | 'lg'
  showRing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  name: '',
  size: 'md',
  showRing: false,
})

const initial = computed(() => props.name?.charAt(0)?.toUpperCase() || 'U')

const sizeClass = computed(() => {
  const sizes = {
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-xs',
    lg: 'h-10 w-10 text-sm',
  }
  return sizes[props.size]
})
</script>

<template>
  <div
    class="flex items-center justify-center rounded-full bg-[var(--color-deep)] font-bold text-white shrink-0"
    :class="[sizeClass, showRing ? 'ring-2 ring-[var(--color-silver)]/30' : '']"
  >
    {{ initial }}
  </div>
</template>
