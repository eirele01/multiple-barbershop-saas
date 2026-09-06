<script setup lang="ts">
/**
 * BrandLogo — consistent Reservation PH brand mark + wordmark.
 * Uses public/favicon.svg as the logo image inside the standard gradient box.
 *
 * Props:
 *  - text:     wordmark text (empty string to hide)
 *  - boxClass: classes for the brand box ('' = no box, just the logo image)
 *  - imgClass: classes for the logo <img>
 *  - textClass: classes for the wordmark
 *  - to:       destination route (null renders a plain div, e.g. sidebars)
 */
withDefaults(defineProps<{
  text?: string
  boxClass?: string
  imgClass?: string
  textClass?: string
  to?: string | null
}>(), {
  text: 'Reservation PH',
  boxClass: 'gradient-metallic flex h-9 w-9 items-center justify-center rounded-btn shrink-0',
  imgClass: 'h-5 w-5',
  textClass: 'text-lg font-bold text-[var(--color-deep)]',
  to: '/',
})
</script>

<template>
  <NuxtLink v-if="to" :to="to" class="flex items-center gap-2">
    <span v-if="boxClass" :class="boxClass">
      <img src="/favicon.svg" alt="Reservation PH" :class="imgClass" />
    </span>
    <span v-if="text" :class="textClass">{{ text }}</span>
  </NuxtLink>
  <div v-else class="flex items-center gap-2">
    <span v-if="boxClass" :class="boxClass">
      <img src="/favicon.svg" alt="Reservation PH" :class="imgClass" />
    </span>
    <span v-if="text" :class="textClass">{{ text }}</span>
  </div>
</template>