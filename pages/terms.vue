<script setup lang="ts">
/**
 * Terms of Service — /terms
 * Public route — no authentication required
 */

useHead({
  title: 'Terms of Service — Reservation SaaS',
  meta: [
    {
      name: 'description',
      content: 'The terms governing your use of the Reservation SaaS platform.',
    },
  ],
})

const lastUpdated = 'August 30, 2026'

const sections = [
  {
    title: '1. Acceptance of Terms',
    items: [
      'By accessing or using Reservation SaaS, you agree to be bound by these Terms of Service.',
      'If you do not agree to these terms, do not use the platform.',
    ],
  },
  {
    title: '2. The Platform',
    items: [
      'Reservation SaaS provides online booking, payment, and loyalty tools for barbershops and service businesses in the Philippines.',
      'We host shop pages under our domain, but each shop is independently owned and operated.',
      'Shop owners are responsible for the accuracy of their services, pricing, availability, and staff schedules.',
    ],
  },
  {
    title: '3. Bookings & Cancellations',
    items: [
      'Bookings made through the platform are agreements between the customer and the shop.',
      'Each shop sets its own cancellation and no-show policy, shown at booking time.',
      'Customers should contact the shop directly for changes or disputes about a specific appointment.',
    ],
  },
  {
    title: '4. Payments',
    items: [
      'Online payments are processed securely through PayMongo. We do not store full card or e-wallet credentials.',
      'Deposits and payment methods (GCash, Maya, QR Ph, cards) are configured per shop.',
      'Refunds, where applicable, are handled according to the shop\'s policy and Philippine consumer law.',
    ],
  },
  {
    title: '5. Shop Owner Obligations',
    items: [
      'Provide accurate business information and honor confirmed bookings.',
      'Keep subscription payments current to retain access to paid plan features.',
      'Do not use the platform for unlawful activities or to mislead customers.',
    ],
  },
  {
    title: '6. Subscriptions & Billing',
    items: [
      'Plans are billed monthly or yearly as selected at checkout.',
      'Upgrades take effect immediately after successful payment.',
      'Downgrades to the free plan take effect immediately; no refund is issued for the unused portion of a paid period.',
      'We may adjust plan pricing with reasonable advance notice to active subscribers.',
    ],
  },
  {
    title: '7. Limitation of Liability',
    items: [
      'The platform is provided "as is" without warranties of any kind.',
      'We are not liable for indirect or consequential damages arising from the use of the platform, including missed appointments or shop-side errors.',
      'Our total liability for any claim is limited to the amount you paid us in the preceding 12 months.',
    ],
  },
  {
    title: '8. Changes to These Terms',
    items: [
      'We may update these terms from time to time. Continued use of the platform after changes are posted constitutes acceptance of the updated terms.',
    ],
  },
  {
    title: '9. Contact Us',
    items: [
      'Questions about these terms? Contact us at support@reservationph.com.',
    ],
  },
]
</script>

<template>
  <div class="min-h-screen bg-[var(--color-pearl)]">
    <!-- ═══ Header ═══ -->
    <header class="border-b border-[var(--color-silver)]/20 bg-white">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold text-[var(--color-deep)]">
          <Icon name="lucide:scissors" class="h-5 w-5" />
          Reservation SaaS
        </NuxtLink>
        <NuxtLink
          to="/"
          class="text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
        >
          ← Back to Home
        </NuxtLink>
      </div>
    </header>

    <!-- ═══ Content ═══ -->
    <main class="mx-auto max-w-3xl px-4 py-10">
      <div class="card-design p-8">
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Terms of Service</h1>
        <p class="mt-1 text-sm text-[var(--color-titanium)]">Last updated: {{ lastUpdated }}</p>

        <div class="mt-8 space-y-8">
          <section v-for="section in sections" :key="section.title">
            <h2 class="text-base font-semibold text-[var(--color-deep)]">{{ section.title }}</h2>
            <ul class="mt-3 space-y-2">
              <li
                v-for="(item, i) in section.items"
                :key="i"
                class="flex gap-2.5 text-sm leading-relaxed text-[var(--color-titanium)]"
              >
                <Icon name="lucide:dot" class="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-silver)]" />
                <span>{{ item }}</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>
