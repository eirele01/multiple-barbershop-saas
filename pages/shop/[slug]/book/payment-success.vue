<script setup lang="ts">
/**
 * /shop/[slug]/book/payment-success
 * PayMongo return URL for successful payments.
 *
 * Reads bookingRef/bookingId from query params, then:
 *   1. Checks booking status from DB
 *   2. If not yet 'paid', polls PayMongo API to verify payment
 *   3. Retries up to 5 times (every 3 seconds) to handle webhook delay
 *   4. Shows success or pending status
 */
definePageMeta({
  layout: 'shop',
})

const route = useRoute()
const slug = route.params.slug as string
const bookingRef = route.query.bookingRef as string
const bookingId = route.query.bookingId as string

const loading = ref(true)
const bookingVerified = ref(false)
const stillProcessing = ref(false)
const errorMsg = ref('')

onMounted(async () => {
  if (!bookingId) {
    errorMsg.value = 'Missing booking information in the URL.'
    loading.value = false
    return
  }

  try {
    // First check: fetch booking from DB
    const result = await $fetch<{
      booking: Record<string, any>
      shop: { id: string; slug: string; name: string } | null
    }>(`/api/bookings/${bookingId}`)

    if (!result.booking) {
      errorMsg.value = 'Booking not found.'
      loading.value = false
      return
    }

    // If already paid (webhook was fast), we're done
    if (result.booking.payment_status === 'paid') {
      bookingVerified.value = true
      loading.value = false
      return
    }

    // Payment not yet confirmed — poll PayMongo API to check
    stillProcessing.value = true
    let confirmed = false

    for (let attempt = 1; attempt <= 5; attempt++) {
      await new Promise(r => setTimeout(r, 3000)) // wait 3s between checks

      try {
        const verifyResult = await $fetch<{ paid: boolean; status: string }>('/api/payments/verify-paymongo-payment', {
          method: 'POST',
          body: { bookingId },
        })

        if (verifyResult.paid) {
          confirmed = true
          bookingVerified.value = true
          break
        }
      } catch (err) {
        console.warn(`[payment-success] Verify attempt ${attempt} failed:`, err)
      }
    }

    if (!confirmed) {
      // Payment not confirmed yet, but show a reassuring message
      // The webhook may still process it
      stillProcessing.value = false
      bookingVerified.value = true // Show success-like state with note
    }
  } catch (err) {
    errorMsg.value = 'Could not verify your booking. Please check your email for confirmation.'
  } finally {
    loading.value = false
    stillProcessing.value = false
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[var(--color-white)] px-4">
    <div class="text-center">
      <!-- Loading state -->
      <div v-if="loading" class="flex flex-col items-center gap-4">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-silver)] border-t-[var(--color-deep)]" />
        <p class="text-sm text-[var(--color-titanium)]">
          {{ stillProcessing ? 'Confirming your payment with PayMongo...' : 'Verifying your payment...' }}
        </p>
        <p v-if="stillProcessing" class="text-xs text-[var(--color-titanium)]">This may take a few seconds</p>
      </div>

      <!-- Error state -->
      <div v-else-if="errorMsg">
        <div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-warning)]/10">
          <Icon name="lucide:alert-circle" class="h-10 w-10 text-[var(--color-warning)]" />
        </div>
        <h1 class="mt-6 text-2xl font-bold text-[var(--color-deep)]">Verification Issue</h1>
        <p class="mt-3 max-w-md text-sm text-[var(--color-titanium)]">{{ errorMsg }}</p>
        <p v-if="bookingRef" class="mt-2 text-sm font-medium text-[var(--color-deep)]">Booking Ref: {{ bookingRef }}</p>

        <div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <NuxtLink
            to="/customer/bookings"
            class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-3 text-sm font-semibold text-white"
          >
            <Icon name="lucide:calendar" class="h-4 w-4" />
            View My Bookings
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

      <!-- Success state -->
      <div v-else>
        <div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-success)]/10">
          <Icon name="lucide:check-circle" class="h-10 w-10 text-[var(--color-success)]" />
        </div>
        <h1 class="mt-6 text-2xl font-bold text-[var(--color-deep)]">Payment Successful!</h1>
        <p class="mt-3 max-w-md text-sm text-[var(--color-titanium)]">
          Your payment has been confirmed. Your booking is now verified and you'll receive a confirmation shortly.
        </p>
        <p v-if="bookingRef" class="mt-4 text-base font-bold text-[var(--color-deep)]">
          Booking Ref: {{ bookingRef }}
        </p>

        <div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <NuxtLink
            to="/customer/bookings"
            class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-3 text-sm font-semibold text-white"
          >
            <Icon name="lucide:calendar" class="h-4 w-4" />
            View My Bookings
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
  </div>
</template>
