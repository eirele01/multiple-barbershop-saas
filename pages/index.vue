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

// ── Pricing section (dynamic — plans DB / Tier Maker is the source of truth) ──
const pricingInterval = ref<'monthly' | 'yearly'>('monthly')
const pricingTrack = ref<HTMLElement | null>(null)
const pricingIndex = ref(0)
const pricingOverflow = ref(false)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function updatePricingScroll() {
  const el = pricingTrack.value
  if (!el) return
  pricingOverflow.value = el.scrollWidth > el.clientWidth + 4
  canScrollLeft.value = el.scrollLeft > 4
  canScrollRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 4
  // Active card = the one nearest the track's visual center
  const center = el.scrollLeft + el.clientWidth / 2
  let best = 0
  let bestDist = Infinity
  Array.from(el.children).forEach((child, i) => {
    const c = child as HTMLElement
    const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  pricingIndex.value = best
}

function scrollPricing(dir: -1 | 1) {
  const el = pricingTrack.value
  if (!el) return
  const next = Math.min(Math.max(pricingIndex.value + dir, 0), el.children.length - 1)
  ;(el.children[next] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}

function goToPricing(i: number) {
  const child = pricingTrack.value?.children[i] as HTMLElement | undefined
  child?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}

// NOTE: lifecycle hooks must be registered synchronously (before the first
// top-level await below) or Vue drops them in async setup components.
const scrollListenerAttached = ref(false)
function attachPricingListeners() {
  if (scrollListenerAttached.value || !pricingTrack.value) return
  pricingTrack.value.addEventListener('scroll', updatePricingScroll, { passive: true })
  scrollListenerAttached.value = true
}

onMounted(() => {
  attachPricingListeners()
  nextTick(updatePricingScroll)
  window.addEventListener('resize', updatePricingScroll)
})
onBeforeUnmount(() => {
  pricingTrack.value?.removeEventListener('scroll', updatePricingScroll)
  window.removeEventListener('resize', updatePricingScroll)
})

// The track renders only once plans resolve (skeleton → track swap), so
// (re)attach listeners and measure whenever the plan list first appears.
// Declared after `pricingPlans` (below) to avoid a TDZ reference.

const { data: plansResponse } = await useFetch('/api/billing/plans')

interface PricingCard {
  code: string
  name: string
  description: string
  priceMonthly: number
  priceYearly: number
  monthlyLabel: string
  yearlyLabel: string
  features: string[]
  recommended: boolean
}

function formatCentavos(c: number): string {
  return `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const pricingPlans = computed<PricingCard[]>(() => {
  const raw = (plansResponse.value as any)?.plans || []
  const cards: PricingCard[] = raw.map((p: any) => {
    const limits = p.limits || {}
    const feats: string[] = []
    const limitDefs: [string, string][] = [
      ['services', 'service'],
      ['gallery', 'gallery image'],
      ['products', 'product'],
      ['staff', 'staff member'],
    ]
    for (const [key, label] of limitDefs) {
      const v = Number(limits[key])
      if (v === -1 || !Number.isFinite(v)) feats.push(`Unlimited ${label}s`)
      else if (v > 0) feats.push(`Up to ${v} ${label}${v === 1 ? '' : 's'}`)
    }
    for (const f of p.features || []) feats.push(f)
    return {
      code: p.code,
      name: p.name,
      description: p.description || '',
      priceMonthly: p.priceMonthly || 0,
      priceYearly: p.priceYearly || 0,
      monthlyLabel: p.priceMonthlyLabel || formatCentavos(p.priceMonthly || 0),
      yearlyLabel: p.priceYearlyLabel || formatCentavos(p.priceYearly || 0),
      features: feats,
      recommended: false,
    }
  })
  // "Recommended" = second-highest paid tier (the classic SaaS sweet spot).
  const paid = cards
    .filter(c => c.priceMonthly > 0 || c.priceYearly > 0)
    .sort((a, b) => b.priceMonthly - a.priceMonthly)
  if (paid.length >= 2) paid[1].recommended = true
  else if (paid.length === 1) paid[0].recommended = true
  return cards
})

// The track renders only once plans resolve (skeleton → track swap), so
// (re)attach listeners and re-measure whenever the plan list appears.
watch(pricingPlans, (v) => {
  if (v.length) {
    attachPricingListeners()
    nextTick(updatePricingScroll)
  }
}, { immediate: false })

const pricingYearlyBadge = computed<string | null>(() => {
  let best = 0
  for (const p of pricingPlans.value) {
    if (!p.priceMonthly || !p.priceYearly) continue
    const full = p.priceMonthly * 12
    if (p.priceYearly < full) best = Math.max(best, Math.round(((full - p.priceYearly) / full) * 100))
  }
  return best > 0 ? `Save ${best}%` : null
})

function pricingDisplayPrice(plan: PricingCard): { amount: string; note: string } {
  const isFree = !plan.priceMonthly && !plan.priceYearly
  if (isFree) return { amount: 'Free', note: 'forever' }
  if (pricingInterval.value === 'yearly' && plan.priceYearly) {
    return { amount: plan.yearlyLabel, note: 'per year' }
  }
  return { amount: plan.monthlyLabel, note: 'per month' }
}

const { data: shopsResponse, error: shopsError } = await useFetch('/api/shops')
// allShops — alphabetical (API order); feeds the search combobox
const allShops = computed(() => (shopsResponse.value as any)?.data || [])
// exampleShops — "Popular shops" chips sorted by real booking counts
// (total_bookings provided by the API; cancelled/no-show excluded).
// JS sort is stable, so ties keep the API's alphabetical order.
const exampleShops = computed(() =>
  [...(shopsResponse.value as any)?.data || []]
    .sort((a: any, b: any) => (b.total_bookings || 0) - (a.total_bookings || 0))
    .slice(0, 6)
)
const shopsLoadError = shopsError.value

// ── Footer platform config ────────────────────────────────
// Centralized so official handles / numbers can be swapped in one place.
const currentYear = new Date().getFullYear()

const platformContact = {
  email: 'support@reservationph.com',
  phone: '+63 948 538 8916', // TODO: replace with official number
  phoneHref: '+639485388916', // TODO: replace with official number
  address: 'Mandaluyong City, Metro Manila, Philippines',
}

const socialLinks = [
  { icon: 'lucide:facebook', label: 'Facebook', href: 'https://facebook.com/reservationph' },
  { icon: 'lucide:instagram', label: 'Instagram', href: 'https://instagram.com' },
  { icon: 'lucide:music', label: 'TikTok', href: 'https://tiktok.com/' },
]

// Newsletter subscribe (decorative for now — wire to your ESP / API later)
const newsletterEmail = ref('')
const newsletterDone = ref(false)

function onNewsletterSubmit() {
  if (!newsletterEmail.value || !/^\S+@\S+\.\S+$/.test(newsletterEmail.value)) return
  newsletterDone.value = true
}

function goToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
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
          <div v-if="shopsLoadError" class="rounded-input bg-[var(--color-danger)]/10 p-4 text-sm text-[var(--color-danger)]">
            <Icon name="lucide:alert-circle" class="mr-2 inline h-4 w-4" />
            Unable to load shops. Please try again later.
          </div>
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

    <!-- Pricing Section (dynamic — plans DB / Tier Maker) -->
    <section id="pricing" class="bg-[var(--color-pure-white)] px-4 py-20">
      <div class="mx-auto max-w-6xl">
        <h2 class="text-center text-[var(--color-deep)]">
          Simple, Transparent Pricing
        </h2>

        <!-- Billing cycle toggle -->
        <div class="mt-6 flex items-center justify-center">
          <div class="inline-flex items-center rounded-full bg-[var(--color-silver)]/15 p-1">
            <button
              class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              :class="pricingInterval === 'monthly' ? 'bg-[var(--color-pure-white)] text-[var(--color-deep)] shadow-sm' : 'text-[var(--color-titanium)]'"
              @click="pricingInterval = 'monthly'"
            >
              Monthly
            </button>
            <button
              class="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              :class="pricingInterval === 'yearly' ? 'bg-[var(--color-pure-white)] text-[var(--color-deep)] shadow-sm' : 'text-[var(--color-titanium)]'"
              @click="pricingInterval = 'yearly'"
            >
              Yearly
              <span
                v-if="pricingYearlyBadge"
                class="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                :class="pricingInterval === 'yearly' ? 'bg-[var(--color-success)] text-white' : 'bg-[var(--color-success)]/15 text-[var(--color-success)]'"
              >
                {{ pricingYearlyBadge }}
              </span>
            </button>
          </div>
        </div>

        <!-- Loading skeleton -->
        <div v-if="!pricingPlans.length" class="mt-12 grid gap-8 md:grid-cols-3">
          <div v-for="n in 3" :key="n" class="card-design p-8">
            <div class="mx-auto h-5 w-20 animate-pulse rounded bg-[var(--color-silver)]/10" />
            <div class="mx-auto mt-4 h-9 w-24 animate-pulse rounded bg-[var(--color-silver)]/10" />
            <div class="mt-6 space-y-3">
              <div v-for="i in 5" :key="i" class="h-4 w-full animate-pulse rounded bg-[var(--color-silver)]/10" />
            </div>
          </div>
        </div>
        <!-- Plans carousel / grid (Apple-style snap track) -->
        <div v-else class="relative mt-12">
          <!-- Arrows (only when the track overflows) -->
          <button
            v-if="pricingOverflow"
            class="absolute -left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--color-pure-white)] shadow-md ring-1 ring-[var(--color-silver)]/40 transition hover:bg-[var(--color-silver)]/10 md:flex"
            :class="canScrollLeft ? 'opacity-100' : 'pointer-events-none opacity-30'"
            aria-label="Previous plans"
            @click="scrollPricing(-1)"
          >
            <Icon name="lucide:chevron-left" class="h-5 w-5 text-[var(--color-deep)]" />
          </button>
          <button
            v-if="pricingOverflow"
            class="absolute -right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--color-pure-white)] shadow-md ring-1 ring-[var(--color-silver)]/40 transition hover:bg-[var(--color-silver)]/10 md:flex"
            :class="canScrollRight ? 'opacity-100' : 'pointer-events-none opacity-30'"
            aria-label="Next plans"
            @click="scrollPricing(1)"
          >
            <Icon name="lucide:chevron-right" class="h-5 w-5 text-[var(--color-deep)]" />
          </button>

          <!-- Snap track: renders like a grid when plans fit, swipeable carousel when they don't -->
          <div
            ref="pricingTrack"
            class="no-scrollbar flex snap-x snap-mandatory justify-start gap-6 overflow-x-auto pb-2 md:justify-center py-4"
          >
            <div
              v-for="plan in pricingPlans"
              :key="plan.code"
              class="card-design relative flex w-[85vw] max-w-[360px] flex-shrink-0 snap-center flex-col p-8 sm:w-[340px]"
            >
              <!-- Recommended badge -->
              <div
                v-if="plan.recommended"
                class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-deep)] px-3 py-1 text-xs font-medium text-white"
              >
                Recommended
              </div>

              <h3 class="text-center text-lg font-bold text-[var(--color-deep)]">{{ plan.name }}</h3>
              <div class="mt-3 text-center">
                <span class="text-3xl font-bold text-[var(--color-deep)]">{{ pricingDisplayPrice(plan).amount }}</span>
                <span class="ml-1 text-xs text-[var(--color-titanium)]">{{ pricingDisplayPrice(plan).note }}</span>
              </div>
              <p class="mt-2 text-center text-sm text-[var(--color-titanium)]">{{ plan.description }}</p>

              <ul class="mt-6 flex-1 space-y-3">
                <li v-for="f in plan.features" :key="f" class="flex items-start gap-2 text-sm">
                  <Icon name="lucide:check" class="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" />
                  <span class="text-[var(--color-deep)]">{{ f }}</span>
                </li>
              </ul>

              <NuxtLink
                to="/register"
                class="btn-design mt-8 block w-full rounded-btn py-3 text-center text-sm font-semibold transition-colors"
                :class="plan.recommended
                  ? 'bg-[var(--color-deep)] text-white hover:bg-[var(--color-titanium)]'
                  : 'border border-[var(--color-deep)] text-[var(--color-deep)] hover:bg-[var(--color-deep)] hover:text-white'"
              >
                {{ plan.priceMonthly > 0 || plan.priceYearly > 0 ? 'Get Started' : 'Start Free' }}
              </NuxtLink>
            </div>
          </div>

          <!-- Dot indicators (only when the track overflows) -->
          <div v-if="pricingOverflow" class="mt-6 flex items-center justify-center gap-2">
            <button
              v-for="(plan, i) in pricingPlans"
              :key="`dot-${plan.code}`"
              class="h-2 rounded-full transition-all"
              :class="pricingIndex === i ? 'w-6 bg-[var(--color-deep)]' : 'w-2 bg-[var(--color-silver)]/50 hover:bg-[var(--color-silver)]'"
              :aria-label="`Go to ${plan.name}`"
              @click="goToPricing(i)"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-[var(--color-silver)]/30 bg-[var(--color-white)]">
      <!-- Metallic hairline signature accent -->
      <div class="gradient-metallic h-0.5 w-full" />

      <div class="mx-auto max-w-6xl px-4 pt-16 pb-8">
        <!-- CTA band -->
        <div class="card-design mb-14 flex flex-col items-center justify-between gap-6 border-2 border-[var(--color-deep)] p-8 text-center lg:flex-row lg:text-left">
          <div>
            <h3 class="mb-2 text-2xl font-bold text-[var(--color-deep)]">Ready to modernize your business?</h3>
            <p class="max-w-xl text-sm text-[var(--color-titanium)]">
              Get your own booking page with payments, loyalty, and email notifications — set up in minutes.
            </p>
          </div>
          <div class="flex flex-col gap-3 sm:flex-row">
            <NuxtLink to="/register" class="btn-design rounded-btn bg-[var(--color-deep)] px-7 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--color-titanium)] hover:shadow-lg">
              Register Your Shop
            </NuxtLink>
            <a href="#for-customers" class="btn-design rounded-btn border border-[var(--color-silver)] px-7 py-3 text-sm font-semibold text-[var(--color-deep)] transition-all hover:border-[var(--color-titanium)]">
              Book an Appointment
            </a>
          </div>
        </div>

        <!-- Main grid -->
        <div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <!-- Brand column -->
          <div>
            <div class="flex items-center gap-2">
              <div class="gradient-metallic flex h-9 w-9 items-center justify-center rounded-btn">
                <Icon name="lucide:calendar" class="h-4 w-4 text-white" />
              </div>
              <span class="text-lg font-bold text-[var(--color-deep)]">Reservation</span>
            </div>
            <p class="mt-4 max-w-xs text-sm text-[var(--color-titanium)]">
              The modern booking and business management platform, built for modern businesses.
            </p>

            <!-- Social links -->
            <div class="mt-5 flex items-center gap-3">
              <a
                v-for="social in socialLinks"
                :key="social.label"
                :href="social.href"
                target="_blank"
                rel="noopener"
                :aria-label="social.label"
                class="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-deep)]/5 text-[var(--color-titanium)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-deep)] hover:text-white"
              >
                <Icon :name="social.icon" class="h-4 w-4" />
              </a>
            </div>
          </div>

          <!-- Product links -->
          <div>
            <h5 class="text-sm font-semibold text-[var(--color-deep)]">Product</h5>
            <ul class="mt-4 space-y-2.5 text-sm text-[var(--color-titanium)]">
              <li><a href="#features" class="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-deep)]"><Icon name="lucide:sparkles" class="h-3.5 w-3.5" /> Features</a></li>
              <li><a href="#pricing" class="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-deep)]"><Icon name="lucide:tag" class="h-3.5 w-3.5" /> Pricing</a></li>
              <li><NuxtLink to="/register" class="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-deep)]"><Icon name="lucide:store" class="h-3.5 w-3.5" /> Register Your Shop</NuxtLink></li>
              <li><a href="#for-customers" class="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-deep)]"><Icon name="lucide:users" class="h-3.5 w-3.5" /> For Customers</a></li>
            </ul>
          </div>

          <!-- Company links -->
          <div>
            <h5 class="text-sm font-semibold text-[var(--color-deep)]">Company</h5>
            <ul class="mt-4 space-y-2.5 text-sm text-[var(--color-titanium)]">
              <li><NuxtLink to="/privacy" class="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-deep)]"><Icon name="lucide:shield" class="h-3.5 w-3.5" /> Privacy Policy</NuxtLink></li>
              <li><NuxtLink to="/terms" class="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-deep)]"><Icon name="lucide:file-text" class="h-3.5 w-3.5" /> Terms of Service</NuxtLink></li>
              <li><NuxtLink to="/login?role=customer" class="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--color-deep)]"><Icon name="lucide:log-in" class="h-3.5 w-3.5" /> Customer Login</NuxtLink></li>
            </ul>
          </div>

          <!-- Contact -->
          <div>
            <h5 class="text-sm font-semibold text-[var(--color-deep)]">Contact</h5>
            <ul class="mt-4 space-y-2.5 text-sm text-[var(--color-titanium)]">
              <li>
                <a :href="`mailto:${platformContact.email}`" class="flex items-center gap-2 transition-colors hover:text-[var(--color-deep)]">
                  <Icon name="lucide:mail" class="h-3.5 w-3.5 flex-shrink-0" />
                  {{ platformContact.email }}
                </a>
              </li>
              <li>
                <a :href="`tel:${platformContact.phoneHref}`" class="flex items-center gap-2 transition-colors hover:text-[var(--color-deep)]">
                  <Icon name="lucide:phone" class="h-3.5 w-3.5 flex-shrink-0" />
                  {{ platformContact.phone }}
                </a>
              </li>
              <li class="flex items-start gap-2">
                <Icon name="lucide:map-pin" class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{{ platformContact.address }}</span>
              </li>
            </ul>
<!-- Newsletter -->
            <form v-if="!newsletterDone" class="mt-5" @submit.prevent="onNewsletterSubmit">
              <label for="footer-newsletter" class="mb-2 block text-xs font-medium text-[var(--color-titanium)]">Get product updates</label>
              <div class="flex gap-2">
                <input
                  id="footer-newsletter"
                  v-model="newsletterEmail"
                  type="email"
                  required
                  placeholder="you@email.com"
                  class="w-full min-w-0 flex-1 rounded-btn border border-[var(--color-silver)]/70 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none transition-colors placeholder:text-[var(--color-titanium)]/60 focus:border-[var(--color-info)]"
                />
                <button type="submit" aria-label="Subscribe" class="btn-design rounded-btn bg-[var(--color-deep)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-titanium)]">
                  <Icon name="lucide:send" class="h-4 w-4" />
                </button>
              </div>
            </form>
            <p v-else class="mt-5 flex items-center gap-1.5 text-sm font-medium text-[var(--color-success)]">
              <Icon name="lucide:check-circle" class="h-4 w-4" /> You're in! Thanks for subscribing.
            </p>
          </div>
        </div>

        <!-- Bottom bar -->
        <div class="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[var(--color-silver)]/30 pt-6 sm:flex-row">
          <p class="text-xs text-[var(--color-titanium)]">&copy; {{ currentYear }} Reservation PH. All rights reserved.</p>
          <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-[var(--color-titanium)]">
            <NuxtLink to="/privacy" class="transition-colors hover:text-[var(--color-deep)]">Privacy</NuxtLink>
            <NuxtLink to="/terms" class="transition-colors hover:text-[var(--color-deep)]">Terms</NuxtLink>
            <button type="button" class="inline-flex items-center gap-1 transition-colors hover:text-[var(--color-deep)]" @click="goToTop">
              <Icon name="lucide:arrow-up" class="h-3 w-3" /> Back to top
            </button>
          </div>
          <p class="text-xs text-[var(--color-titanium)]">Made for Modern businesses</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Hide the carousel scrollbar while keeping it scrollable (all browsers) */
.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
