<script setup lang="ts">
/**
 * Privacy Policy — /privacy
 * Public route — no authentication required
 */

useHead({
  title: 'Privacy Policy — Reservation SaaS',
  meta: [
    {
      name: 'description',
      content: 'How Reservation SaaS collects, uses, and protects your personal data.',
    },
  ],
})

const lastUpdated = 'August 30, 2026'

const sections = [
  {
    title: '1. Information We Collect',
    items: [
      'Account information — name, email address, and phone number when you register as a customer or shop owner.',
      'Business information — shop name, address, contact details, and branding when you register a shop.',
      'Booking information — appointments, services booked, and payment status.',
      'Payment information — payments are processed by our payment provider (PayMongo). We do not store your full card details on our servers.',
      'Usage data — pages visited and interactions with the platform to help us improve the service.',
    ],
  },
  {
    title: '2. How We Use Your Information',
    items: [
      'To provide and maintain the booking platform.',
      'To process bookings, payments, and refunds.',
      'To send booking confirmations, reminders, and account-related notices (with your consent).',
      'To provide customer support.',
      'To detect, prevent, and address fraud or abuse of the platform.',
    ],
  },
  {
    title: '3. Data Sharing',
    items: [
      'We do not sell your personal data to third parties.',
      'Shop owners can only see booking information relevant to their own shop.',
      'Payment processing is handled by PayMongo under its own privacy policy.',
      'We may disclose data when required by law or to protect the rights and safety of the platform and its users.',
    ],
  },
  {
    title: '4. Data Retention',
    items: [
      'Account and booking data are retained while your account is active.',
      'You may request deletion of your account and associated personal data at any time by contacting us.',
    ],
  },
  {
    title: '5. Your Rights',
    items: [
      'Access — request a copy of the personal data we hold about you.',
      'Correction — request correction of inaccurate data.',
      'Deletion — request deletion of your account and personal data.',
      'These rights are consistent with the Philippine Data Privacy Act of 2012 (RA 10173).',
    ],
  },
  {
    title: '6. Contact Us',
    items: [
      'For any privacy concerns or data requests, contact us at support@reservationph.com.',
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
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Privacy Policy</h1>
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
