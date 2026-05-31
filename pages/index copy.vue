<script setup lang="ts">
/**
 * Home Page — SaaS Marketing Homepage
 * Public route — no authentication required
 */

useHead({
  title: 'BarberShop SaaS — Online Booking for Barbershops in the Philippines',
  meta: [
    {
      name: 'description',
      content: 'Manage your barbershop with online bookings, payments, and loyalty rewards. Built for barbershops in the Philippines.',
    },
    { property: 'og:title', content: 'BarberShop SaaS — Online Booking for Barbershops' },
    { property: 'og:description', content: 'Manage your barbershop with online bookings, payments, and loyalty rewards.' },
    { property: 'og:image', content: '/og-default.png' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ],
})
</script>

<template>
  <div>
    <!-- Hero Section -->
    <section class="relative overflow-hidden bg-[var(--color-white)] px-4 pb-20 pt-32">
      <div class="pointer-events-none absolute inset-0">
        <div class="absolute -right-20 top-20 h-72 w-72 rounded-full bg-[var(--color-silver)]/20" />
        <div class="absolute bottom-10 left-10 h-48 w-48 rounded-full bg-[var(--color-silver)]/10" />
      </div>

      <div class="relative mx-auto max-w-4xl text-center">
        <h1 class="mb-6 text-[var(--color-deep)]">
          The Modern Barbershop
          <span class="gradient-metallic bg-clip-text text-transparent">
            Management Platform
          </span>
        </h1>
        <p class="mx-auto mb-8 max-w-2xl text-lg text-[var(--color-titanium)]">
          Launch your barbershop online in minutes. Accept bookings, manage payments,
          build loyalty — all in one beautiful platform.
        </p>
        <div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <NuxtLink
            to="/register"
            class="btn-design rounded-btn bg-[var(--color-deep)] px-8 py-3 text-base font-semibold text-white transition-all hover:bg-[var(--color-titanium)] hover:shadow-lg"
          >
            Get Started Free
          </NuxtLink>
          <NuxtLink
            to="#features"
            class="btn-design rounded-btn border border-[var(--color-silver)] px-8 py-3 text-base font-semibold text-[var(--color-deep)] transition-all hover:border-[var(--color-titanium)]"
          >
            Learn More
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="bg-[var(--color-pure-white)] px-4 py-20">
      <div class="mx-auto max-w-6xl">
        <h2 class="mb-12 text-center text-[var(--color-deep)]">
          Everything Your Barbershop Needs
        </h2>
        <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <!-- Feature cards -->
          <div class="card-design p-6">
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-btn bg-[var(--color-deep)]/10">
              <Icon name="lucide:calendar-check" class="h-6 w-6 text-[var(--color-deep)]" />
            </div>
            <h4 class="mb-2 text-[var(--color-deep)]">Online Booking</h4>
            <p class="text-sm text-[var(--color-titanium)]">
              Let customers book appointments 24/7. Smart scheduling with real-time availability.
            </p>
          </div>

          <div class="card-design p-6">
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-btn bg-[var(--color-success)]/10">
              <Icon name="lucide:credit-card" class="h-6 w-6 text-[var(--color-success)]" />
            </div>
            <h4 class="mb-2 text-[var(--color-deep)]">Flexible Payments</h4>
            <p class="text-sm text-[var(--color-titanium)]">
              Accept QR payments or integrate PayMongo for GCash, Maya, InstaPay, and more.
            </p>
          </div>

          <div class="card-design p-6">
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-btn bg-[var(--color-info)]/10">
              <Icon name="lucide:star" class="h-6 w-6 text-[var(--color-info)]" />
            </div>
            <h4 class="mb-2 text-[var(--color-deep)]">Loyalty Program</h4>
            <p class="text-sm text-[var(--color-titanium)]">
              Reward loyal customers with points, tiers, and redeemable rewards. Keep them coming back.
            </p>
          </div>

          <div class="card-design p-6">
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-btn bg-[var(--color-warning)]/10">
              <Icon name="lucide:mail" class="h-6 w-6 text-[var(--color-warning)]" />
            </div>
            <h4 class="mb-2 text-[var(--color-deep)]">Email Notifications</h4>
            <p class="text-sm text-[var(--color-titanium)]">
              Automated booking confirmations, reminders, and payment receipts via email.
            </p>
          </div>

          <div class="card-design p-6">
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-btn bg-[var(--color-danger)]/10">
              <Icon name="lucide:bar-chart-3" class="h-6 w-6 text-[var(--color-danger)]" />
            </div>
            <h4 class="mb-2 text-[var(--color-deep)]">Analytics Dashboard</h4>
            <p class="text-sm text-[var(--color-titanium)]">
              Track revenue, bookings, and staff performance with beautiful charts and reports.
            </p>
          </div>

          <div class="card-design p-6">
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-btn bg-[var(--color-titanium)]/10">
              <Icon name="lucide:globe" class="h-6 w-6 text-[var(--color-titanium)]" />
            </div>
            <h4 class="mb-2 text-[var(--color-deep)]">Custom Shop Page</h4>
            <p class="text-sm text-[var(--color-titanium)]">
              A beautiful landing page for your barbershop — services, team, gallery, and reviews.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Section -->
    <section id="pricing" class="bg-[var(--color-white)] px-4 py-20">
      <div class="mx-auto max-w-4xl">
        <h2 class="mb-12 text-center text-[var(--color-deep)]">
          Simple, Transparent Pricing
        </h2>
        <div class="grid gap-8 md:grid-cols-2">
          <!-- Basic Plan -->
          <div class="card-design p-8">
            <p class="text-sm font-semibold uppercase tracking-wider text-[var(--color-titanium)]">Basic</p>
            <div class="mt-4 flex items-baseline gap-1">
              <span class="text-4xl font-bold text-[var(--color-deep)]">Free</span>
              <span class="text-[var(--color-titanium)]">forever</span>
            </div>
            <p class="mt-2 text-sm text-[var(--color-titanium)]">
              Everything you need to get started.
            </p>
            <ul class="mt-6 space-y-3">
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Unlimited bookings
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Shop landing page
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Manual QR payment
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Up to 10 services
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Up to 5 staff members
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Up to 20 gallery images
              </li>
            </ul>
            <NuxtLink
              to="/register"
              class="btn-design mt-8 block w-full rounded-btn border border-[var(--color-deep)] py-3 text-center text-sm font-semibold text-[var(--color-deep)] transition-colors hover:bg-[var(--color-deep)] hover:text-white"
            >
              Start Free
            </NuxtLink>
          </div>

          <!-- Upgraded Plan -->
          <div class="relative card-design border-2 border-[var(--color-deep)] p-8">
            <div class="absolute -top-3 right-4">
              <span class="badge-pill bg-[var(--color-deep)] text-xs font-semibold text-white">
                Recommended
              </span>
            </div>
            <p class="text-sm font-semibold uppercase tracking-wider text-[var(--color-info)]">Upgraded</p>
            <div class="mt-4 flex items-baseline gap-1">
              <span class="text-4xl font-bold text-[var(--color-deep)]">Monthly</span>
            </div>
            <p class="mt-2 text-sm text-[var(--color-titanium)]">
              Unlock the full power of the platform.
            </p>
            <ul class="mt-6 space-y-3">
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Everything in Basic
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Unlimited services, gallery, products, staff
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                PayMongo integration
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Email notifications
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Loyalty program
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Advanced analytics
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Custom domain
              </li>
              <li class="flex items-center gap-2 text-sm">
                <Icon name="lucide:check" class="h-4 w-4 text-[var(--color-success)]" />
                Priority support
              </li>
            </ul>
            <NuxtLink
              to="/register"
              class="btn-design mt-8 block w-full rounded-btn bg-[var(--color-deep)] py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[var(--color-titanium)]"
            >
              Upgrade Now
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-[var(--color-silver)]/30 bg-[var(--color-pure-white)] px-4 py-12">
      <div class="mx-auto max-w-6xl text-center">
        <div class="flex items-center justify-center gap-2">
          <div class="gradient-metallic flex h-8 w-8 items-center justify-center rounded-btn">
            <Icon name="lucide:scissors" class="h-4 w-4 text-white" />
          </div>
          <span class="text-lg font-bold text-[var(--color-deep)]">BarberShop</span>
        </div>
        <p class="mt-4 text-sm text-[var(--color-titanium)]">
          The modern barbershop management platform.
        </p>
      </div>
    </footer>
  </div>
</template>
