<script setup lang="ts">
/**
 * Home Page — SaaS Marketing Homepage
 * Public route — no authentication required
 */

useHead({
  title: 'Reservation SaaS — Online Booking for Businesses in the Philippines',
  meta: [
    {
      name: 'description',
      content: 'Manage your business with online bookings, payments, and loyalty rewards. Built for businesses in the Philippines.',
    },
    { property: 'og:title', content: 'Reservation SaaS — Online Booking for Businesses' },
    { property: 'og:description', content: 'Manage your business with online bookings, payments, and loyalty rewards.' },
    { property: 'og:image', content: '/og-default.png' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ],
})

const allShops = ref<{ slug: string; name: string; city: string | null; logo_url: string | null }[]>([])
const exampleShops = computed(() => allShops.value.slice(0, 6))

onMounted(async () => {
  try {
    const data = await $fetch('/api/shops')
    allShops.value = (data as any)?.data || []
  } catch {
    // Non-critical — fallback to empty list
  }
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
          The Modern Reservation
          <span class="gradient-metallic bg-clip-text text-transparent">
            Management Platform
          </span>
        </h1>
        <p class="mx-auto mb-8 max-w-2xl text-lg text-[var(--color-titanium)]">
          Launch your business online in minutes. Accept bookings, manage payments,
          build loyalty — all in one beautiful platform.
        </p>
        <div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <NuxtLink
            to="/register"
            class="btn-design rounded-btn bg-[var(--color-deep)] px-8 py-3 text-base font-semibold text-white transition-all hover:bg-[var(--color-titanium)] hover:shadow-lg"
          >
            Register Your Shop
          </NuxtLink>
          <NuxtLink
            to="#features"
            class="btn-design rounded-btn border border-[var(--color-silver)] px-8 py-3 text-base font-semibold text-[var(--color-deep)] transition-all hover:border-[var(--color-titanium)]"
          >
            Learn More
          </NuxtLink>
        </div>

        <!-- Customer note under hero CTA -->
        <div class="mt-6 flex flex-col items-center gap-2">
          <p class="text-sm text-[var(--color-titanium)]">
            Are you a customer looking to book an appointment?
          </p>
          <a href="#for-customers" class="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-info)] hover:underline">
            Find your business below
            <Icon name="lucide:arrow-down" class="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="bg-[var(--color-pure-white)] px-4 py-20">
      <div class="mx-auto max-w-6xl">
        <h2 class="mb-12 text-center text-[var(--color-deep)]">
          Everything Your Business Needs
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
              A beautiful landing page for your business — services, team, gallery, and reviews.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- For Customers Section -->
    <section id="for-customers" class="bg-[var(--color-white)] px-4 py-20">
      <div class="mx-auto max-w-4xl">
        <div class="mb-10 text-center">
          <div class="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-info)]/10 px-4 py-1.5">
            <Icon name="lucide:users" class="h-4 w-4 text-[var(--color-info)]" />
            <span class="text-sm font-medium text-[var(--color-info)]">For Customers</span>
          </div>
          <h2 class="mb-4 text-[var(--color-deep)]">
            Booking an Appointment is Easy
          </h2>
          <p class="mx-auto max-w-xl text-[var(--color-titanium)]">
            No app download needed. No account required to book. Just find your business and book in minutes.
          </p>
        </div>

        <!-- How it works steps -->
        <div class="mb-12 grid gap-6 sm:grid-cols-3">
          <div class="card-design p-6 text-center">
            <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-deep)]/10">
              <span class="text-lg font-bold text-[var(--color-deep)]">1</span>
            </div>
            <h4 class="mb-2 text-sm font-semibold text-[var(--color-deep)]">Visit Your Business</h4>
            <p class="text-xs text-[var(--color-titanium)]">
              Each business has its own page. Your service provider shares the link — on Facebook, Instagram, QR code, or Viber.
            </p>
          </div>
          <div class="card-design p-6 text-center">
            <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-deep)]/10">
              <span class="text-lg font-bold text-[var(--color-deep)]">2</span>
            </div>
            <h4 class="mb-2 text-sm font-semibold text-[var(--color-deep)]">Book as a Guest</h4>
            <p class="text-xs text-[var(--color-titanium)]">
              Pick a service, choose a barber, select a time, and pay — all without creating an account.
            </p>
          </div>
          <div class="card-design p-6 text-center">
            <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-deep)]/10">
              <span class="text-lg font-bold text-[var(--color-deep)]">3</span>
            </div>
            <h4 class="mb-2 text-sm font-semibold text-[var(--color-deep)]">Track & Manage</h4>
            <p class="text-xs text-[var(--color-titanium)]">
              Create a free account to track booking history, earn loyalty points, and cancel bookings online.
            </p>
          </div>
        </div>

        <!-- Find your shop -->
        <div class="card-design border-2 border-dashed border-[var(--color-silver)] p-8 text-center">
          <div class="mb-4 flex items-center justify-center gap-2">
            <Icon name="lucide:search" class="h-5 w-5 text-[var(--color-titanium)]" />
            <h4 class="text-[var(--color-deep)]">Find Your Business</h4>
          </div>
          <p class="mb-5 text-sm text-[var(--color-titanium)]">
            Search for your business by name or city, then click Go to book an appointment.
          </p>

          <!-- Search combobox -->
          <div class="mb-6">
            <ShopSearchCombobox :shops="allShops" />
          </div>

          <!-- Example shop links -->
          <p v-if="exampleShops.length" class="mb-3 text-xs font-medium text-[var(--color-titanium)]">Popular shops:</p>
          <div v-if="exampleShops.length" class="flex flex-wrap items-center justify-center gap-2">
            <NuxtLink
              v-for="shop in exampleShops"
              :key="shop.slug"
              :to="`/shop/${shop.slug}`"
              class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-silver)]/50 px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:border-[var(--color-deep)] hover:bg-[var(--color-deep)]/5"
            >
              <Icon name="lucide:scissors" class="h-3 w-3" />
              {{ shop.name }}
            </NuxtLink>
          </div>
        </div>

        <!-- Customer account callout -->
        <div class="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <div class="flex items-center gap-3 rounded-btn bg-[var(--color-pure-white)] px-5 py-3 shadow-sm">
            <Icon name="lucide:user" class="h-5 w-5 text-[var(--color-info)]" />
            <div class="text-left">
              <p class="text-sm font-medium text-[var(--color-deep)]">Already have a customer account?</p>
              <NuxtLink to="/login?role=customer" class="text-xs font-medium text-[var(--color-info)] hover:underline">
                Log in to track your bookings &rarr;
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Section -->
    <section id="pricing" class="bg-[var(--color-pure-white)] px-4 py-20">
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
          <span class="text-lg font-bold text-[var(--color-deep)]">Reservation</span>
        </div>
        <p class="mt-4 text-sm text-[var(--color-titanium)]">
          The modern business management platform.
        </p>
      </div>
    </footer>
  </div>
</template>
