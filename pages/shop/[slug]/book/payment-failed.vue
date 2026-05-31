<script setup lang="ts">
/**
 * /shop/[slug]/book/payment-failed
 * PayMongo return URL for failed/cancelled payments.
 *
 * Reads bookingRef from query param, shows the booking ref
 * and a [Try Again] button that goes back to /shop/[slug]/book
 * with the service pre-selected.
 */
definePageMeta({
  layout: 'shop',
})

const route = useRoute()
const slug = route.params.slug as string
const bookingRef = route.query.bookingRef as string
const bookingId = route.query.bookingId as string
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[var(--color-white)] px-4">
    <div class="text-center">
      <div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-danger)]/10">
        <Icon name="lucide:x-circle" class="h-10 w-10 text-[var(--color-danger)]" />
      </div>
      <h1 class="mt-6 text-2xl font-bold text-[var(--color-deep)]">Payment Failed</h1>
      <p class="mt-3 max-w-md text-sm text-[var(--color-titanium)]">
        Your payment was not completed. This could be due to insufficient funds, a cancelled transaction, or a network error. No charge has been made.
      </p>
      <p class="mt-2 text-sm text-[var(--color-titanium)]">
        You can try booking again or choose a different payment method.
      </p>

      <p v-if="bookingRef" class="mt-4 text-base font-bold text-[var(--color-deep)]">
        Booking Ref: {{ bookingRef }}
      </p>

      <div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <NuxtLink
          :to="`/shop/${slug}/book`"
          class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-3 text-sm font-semibold text-white"
        >
          <Icon name="lucide:refresh-cw" class="h-4 w-4" />
          Try Again
        </NuxtLink>
        <NuxtLink
          :to="`/shop/${slug}`"
          class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-silver)] px-6 py-3 text-sm font-medium text-[var(--color-deep)]"
        >
          <Icon name="lucide:store" class="h-4 w-4" />
          Back to Shop
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
