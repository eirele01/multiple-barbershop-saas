<script setup lang="ts">
/**
 * /shop/[slug] — Public Shop Landing Page
 * Premium barbershop landing page with all improvements:
 *
 * Bug Fixes: Sticky nav visibility, section fade fallback, merged onMounted, proper routing
 * Mobile: Responsive hero, services grid, team scroll, gallery masonry, floating CTA, touch targets
 * Desktop: Sticky nav (after hero), service grid 4-col, team grid with toggle
 * UX: Scroll offset, empty states, lightbox fix, gallery filter scroll, full address
 * Visual: Noise texture, letter-spacing, section accent lines, availability pulse, review avatars, footer
 * Performance: Lazy loading, deferred observers
 * Accessibility: ARIA labels, safeTextColor, tab roles
 */
import type { Shop, Service, Barber, GalleryImage, Product, WorkingHoursDay } from '~/types/database'

definePageMeta({
  layout: 'shop',
})

const route = useRoute()
const slug = route.params.slug as string
const config = useRuntimeConfig()
const googleMapsApiKey = config.public.googleMapsApiKey as string

// Fetch all shop data from the server API
const { data: shopData, error, pending } = await useFetch<{
  shop: Shop
  services: Service[]
  barbers: (Barber & { display_name: string; photo_url: string | null })[]
  gallery: GalleryImage[]
  products: Product[]
  reviews: any[]
  reviewStats: {
    total: number
    average: number
    breakdown: Record<number, number>
  }
  reviewPagination: {
    offset: number
    limit: number
    hasMore: boolean
  }
  lowestServicePrice: number
  nextAvailableSlot: string | null
  popularServices: string[]
  totalSlotsToday: number
}>(`/api/shops/${slug}`)

// If shop not found, show friendly 404
if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Shop not found',
  })
}

const shop = computed(() => shopData.value?.shop)
const services = computed(() => shopData.value?.services || [])
const barbers = computed(() => shopData.value?.barbers || [])
const gallery = computed(() => shopData.value?.gallery || [])
const products = computed(() => shopData.value?.products || [])
const reviewStats = computed(() => shopData.value?.reviewStats || { total: 0, average: 0, breakdown: {} })
const lowestServicePrice = computed(() => shopData.value?.lowestServicePrice || 0)
const nextAvailableSlot = computed(() => shopData.value?.nextAvailableSlot || null)
const popularServices = computed(() => shopData.value?.popularServices || [])
const totalSlotsToday = computed(() => shopData.value?.totalSlotsToday || 0)

// ── Shop theme colors — 3-color system ──
// primary_color = Brand/accent color (default: #C9A96E gold) — buttons, highlights, icons, active states
// accent_color = Surface/gradient color (default: #1a1a2e dark) — hero gradients, decorative backgrounds
// background_color = Page background (default: #0D0D0D) — main page bg, section alt bg, footer bg
const brandColor = computed(() => shop.value?.primary_color || '#C9A96E')
const bgColor = computed(() => shop.value?.accent_color || '#1a1a2e')
const pageBgColor = computed(() => shop.value?.background_color || '#0D0D0D')

// ── Computed RGB values for CSS rgba() usage ──
function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}
const brandRgb = computed(() => hexToRgb(brandColor.value))
const bgRgb = computed(() => hexToRgb(bgColor.value))
const pageBgRgb = computed(() => hexToRgb(pageBgColor.value))

// ── Is the page background dark or light? ──
const isPageDark = computed(() => {
  const { r, g, b } = pageBgRgb.value
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
})

// ── Derived text colors from page background ──
const textPrimary = computed(() => isPageDark.value ? '#F5F0E8' : '#1D1D1F')
const textSecondary = computed(() => isPageDark.value ? 'rgba(245,240,232,0.60)' : 'rgba(29,29,31,0.60)')
const textMuted = computed(() => isPageDark.value ? 'rgba(245,240,232,0.40)' : 'rgba(29,29,31,0.40)')
const textFaint = computed(() => isPageDark.value ? 'rgba(245,240,232,0.25)' : 'rgba(29,29,31,0.25)')

// ── Derived surface colors from page background ──
const surfaceAlt = computed(() => {
  const { r, g, b } = pageBgRgb.value
  if (isPageDark.value) {
    return `rgb(${Math.min(255, r + 8)},${Math.min(255, g + 8)},${Math.min(255, b + 8)})`
  }
  return `rgb(${Math.max(0, r - 8)},${Math.max(0, g - 8)},${Math.max(0, b - 8)})`
})
const surfaceDeep = computed(() => {
  const { r, g, b } = pageBgRgb.value
  if (isPageDark.value) {
    return `rgb(${Math.max(0, r - 5)},${Math.max(0, g - 5)},${Math.max(0, b - 5)})`
  }
  return `rgb(${Math.min(255, r + 5)},${Math.min(255, g + 5)},${Math.min(255, b + 5)})`
})

// ── Glass card colors derived from theme ──
const glassBg = computed(() => isPageDark.value ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
const glassBgHover = computed(() => isPageDark.value ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)')
const glassBorder = computed(() => isPageDark.value ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')
const glassBorderHover = computed(() => isPageDark.value ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)')

// ── Safe text color for contrast (Accessibility) ──
const safeTextColor = computed(() => {
  const { r, g, b } = brandRgb.value
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#1D1D1F' : '#FFFFFF'
})

// ── Keep backward-compat computed names ──
const primaryColor = brandColor
const accentColor = bgColor

// ── Shop initials (fallback for logo) ──
const shopInitials = computed(() => {
  if (!shop.value?.name) return ''
  return shop.value.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
})

// ── Review pagination state ──
const allReviews = ref<any[]>([])
const hasMoreReviews = ref(true)
const isLoadingMoreReviews = ref(false)

watch(shopData, (data) => {
  if (data?.reviews) {
    allReviews.value = [...data.reviews]
    hasMoreReviews.value = data.reviewPagination?.hasMore ?? false
  }
}, { immediate: true })

async function loadMoreReviews() {
  isLoadingMoreReviews.value = true
  try {
    const result = await $fetch<{
      reviews: any[]
      pagination: { offset: number; limit: number; total: number; hasMore: boolean }
    }>(`/api/shops/${slug}/reviews`, {
      params: {
        offset: allReviews.value.length,
        limit: 5,
      },
    })
    allReviews.value = [...allReviews.value, ...result.reviews]
    hasMoreReviews.value = result.pagination.hasMore
  } catch (err) {
    console.error('Failed to load more reviews:', err)
  } finally {
    isLoadingMoreReviews.value = false
  }
}

// ── Shop status (open/closed) ──
const workingHours = computed(() => shop.value?.working_hours as WorkingHoursDay[] | undefined)
const shopTimezone = computed(() => shop.value?.timezone || 'Asia/Manila')
const { isOpen, isClosingSoon, statusText, statusDetail, currentDayHours, closingTime, nextOpenTime, formattedNextOpen, statusColor } = useShopStatus(workingHours, shopTimezone)

// ── Gallery state ──
const isLightboxOpen = ref(false)
const lightboxIndex = ref(0)
// Step 4 — Fix: lightbox index relative to visibleGallery, not full gallery
const lightboxImages = computed(() =>
  visibleGallery.value.map((img) => ({
    url: img.url,
    caption: img.caption,
    thumbnail_url: img.thumbnail_url,
  }))
)

function openLightbox(index: number) {
  lightboxIndex.value = index
  isLightboxOpen.value = true
}

// ── Gallery filter & pagination ──
const galleryFilter = ref('all')
const galleryCategories = computed(() => {
  const cats = new Set(gallery.value.map(g => g.category).filter(Boolean) as string[])
  return ['all', ...Array.from(cats)]
})
const filteredGallery = computed(() => {
  if (galleryFilter.value === 'all') return gallery.value
  return gallery.value.filter(g => g.category === galleryFilter.value)
})
const galleryShowCount = ref(12)
const visibleGallery = computed(() => filteredGallery.value.slice(0, galleryShowCount.value))
const galleryTotalCount = computed(() => filteredGallery.value.length)

// Step 4 — Gallery filter: scroll to top position after filter change
watch(galleryFilter, () => {
  galleryShowCount.value = 12
  nextTick(() => {
    document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})

// ── Day display names ──
const dayDisplayNames: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

const dayShortNames: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

// ── Sorted working hours ──
const sortedHours = computed(() => {
  const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  if (!workingHours.value) return []
  return order
    .map((day) => workingHours.value.find((wh) => wh.day === day))
    .filter(Boolean) as WorkingHoursDay[]
})

// ── Format time (09:00 → 9:00 AM) ──
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

// ── Star rating display ──
function getStarArray(rating: number): ('full' | 'half' | 'empty')[] {
  const stars: ('full' | 'half' | 'empty')[] = []
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) stars.push('full')
    else if (rating >= i - 0.5) stars.push('half')
    else stars.push('empty')
  }
  return stars
}

// ── Service category labels ──
const categoryLabels: Record<string, string> = {
  haircut: 'Haircut', beard: 'Beard', shave: 'Shave',
  treatment: 'Treatment', package: 'Package', other: 'Other',
}

// ── Service category icons ──
const categoryIcons: Record<string, string> = {
  haircut: 'lucide:scissors', beard: 'lucide:user', shave: 'lucide:razor',
  treatment: 'lucide:sparkles', package: 'lucide:gift', other: 'lucide:star',
}

// ── Service category filter ──
const selectedCategory = ref('all')
const serviceCategories = computed(() => {
  const cats = new Set(services.value.map(s => s.category).filter(Boolean))
  return ['all', ...Array.from(cats)]
})
const filteredServices = computed(() => {
  if (selectedCategory.value === 'all') return services.value
  return services.value.filter(s => s.category === selectedCategory.value)
})

// ── Review filter ──
const reviewFilter = ref('all')
const filteredReviews = computed(() => {
  if (reviewFilter.value === 'all') return allReviews.value
  if (reviewFilter.value === '5' || reviewFilter.value === '4' || reviewFilter.value === '3') {
    return allReviews.value.filter((r: any) => r.rating === parseInt(reviewFilter.value))
  }
  return allReviews.value
})

// ── Relative time formatting ──
function relativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffSecs < 60) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffWeeks < 4) return `${diffWeeks}w ago`
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Review "Read more" state ──
const expandedReviews = ref<Set<string>>(new Set())
function toggleReviewExpand(id: string) {
  if (expandedReviews.value.has(id)) {
    expandedReviews.value.delete(id)
  } else {
    expandedReviews.value.add(id)
  }
}

// ── Share functionality ──
const shareCopied = ref(false)
async function shareShop() {
  const url = window.location.href
  const text = `Check out ${shop.value?.name} on Barbershop!`
  if (navigator.share) {
    try { await navigator.share({ title: shop.value?.name, text, url }) } catch {}
  } else {
    await navigator.clipboard.writeText(url)
    shareCopied.value = true
    setTimeout(() => { shareCopied.value = false }, 2000)
  }
}

// ── WhatsApp link ──
const whatsappUrl = computed(() => {
  if (!shop.value?.phone) return ''
  const phone = shop.value.phone.replace(/[^0-9]/g, '')
  return `https://wa.me/${phone.startsWith('0') ? '63' + phone.slice(1) : phone}`
})

// ── Google Maps directions URL ──
const directionsUrl = computed(() => {
  if (shop.value?.latitude && shop.value?.longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${shop.value.latitude},${shop.value.longitude}`
  }
  if (shop.value?.address_city) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${shop.value.address_street || ''} ${shop.value.address_city}`.trim())}`
  }
  return ''
})

// ── Step 1 Bug Fix: Sticky nav visibility ──
const showStickyNav = ref(false)

// ── Active section tracking ──
const activeSection = ref('')

// ── Mobile floating CTA visibility ──
const showFloatingCta = ref(false)

// ── Back to top ──
const showBackToTop = ref(false)

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Step 3: Team — show all barbers toggle ──
const showAllBarbers = ref(false)
const displayedBarbers = computed(() => {
  if (showAllBarbers.value || barbers.value.length <= 8) return barbers.value
  return barbers.value.slice(0, 8)
})

// ── Step 2: Team mobile scroll tracking ──
const teamScrollRef = ref<HTMLElement | null>(null)
const teamScrollProgress = ref(0)

// ── Step 1 Bug Fix 3: Single merged onMounted ──
onMounted(() => {
  // ── Hero IntersectionObserver for sticky nav ──
  const heroEl = document.querySelector('.shop-hero')
  if (heroEl) {
    const heroObserver = new IntersectionObserver(
      ([entry]) => {
        showStickyNav.value = !entry.isIntersecting
      },
      { threshold: 0 }
    )
    heroObserver.observe(heroEl)
  }

  // ── Active section tracking ──
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) activeSection.value = entry.target.id
      })
    },
    { rootMargin: '-20% 0px -70% 0px' }
  )

  setTimeout(() => {
    const sections = ['services', 'team', 'gallery', 'products', 'reviews', 'contact']
    sections.forEach((id) => {
      const el = document.getElementById(id)
      if (el) sectionObserver.observe(el)
    })
  }, 500)

  // ── Step 6: Deferred fade observer with requestIdleCallback ──
  const initFadeObserver = () => {
    const fadeObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
          }
        })
      },
      { rootMargin: '0px 0px -10% 0px' }
    )

    setTimeout(() => {
      document.querySelectorAll('.section-fade').forEach((el) => {
        fadeObserver.observe(el)
      })
    }, 300)
  }

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    requestIdleCallback(() => initFadeObserver())
  } else {
    setTimeout(() => initFadeObserver(), 200)
  }

  // ── Step 1 Bug Fix 2: 3-second fallback for section fade ──
  setTimeout(() => {
    document.querySelectorAll('.section-fade').forEach((el) => {
      el.classList.add('visible')
    })
  }, 3000)

  // ── Scroll listeners for floating CTA and back-to-top ──
  const handleScroll = () => {
    showFloatingCta.value = window.scrollY > 400
    showBackToTop.value = window.scrollY > 600
  }
  window.addEventListener('scroll', handleScroll, { passive: true })

  // ── Team mobile scroll tracking ──
  if (teamScrollRef.value) {
    const teamEl = teamScrollRef.value
    const handleTeamScroll = () => {
      const maxScroll = teamEl.scrollWidth - teamEl.clientWidth
      teamScrollProgress.value = maxScroll > 0 ? teamEl.scrollLeft / maxScroll : 0
    }
    teamEl.addEventListener('scroll', handleTeamScroll, { passive: true })
  }

  // ── Cleanup ──
  onUnmounted(() => {
    sectionObserver.disconnect()
    window.removeEventListener('scroll', handleScroll)
  })
})

// ── Urgency signals ──
const showUrgencySignal = computed(() => {
  return isOpen.value && totalSlotsToday.value > 0 && totalSlotsToday.value <= 3
})

// ── Team mobile scroll helpers ──
function scrollTeam(direction: 'left' | 'right') {
  if (!teamScrollRef.value) return
  const scrollAmount = 200
  teamScrollRef.value.scrollBy({
    left: direction === 'right' ? scrollAmount : -scrollAmount,
    behavior: 'smooth',
  })
}

// ── Dynamic SEO meta tags ──
watch(shop, (s) => {
  if (!s) return
  useHead({
    title: `${s.name} — Barbershop`,
    meta: [
      { name: 'description', content: s.description || `Book your appointment at ${s.name}. Professional barber services in ${s.address_city || 'the Philippines'}.` },
      { property: 'og:title', content: `${s.name} — Barbershop` },
      { property: 'og:description', content: s.description || `Book your appointment at ${s.name}.` },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: s.cover_image_url || s.logo_url || '' },
      { property: 'og:url', content: `/shop/${s.slug}` },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: s.name },
      { name: 'twitter:description', content: s.description || `Book your appointment at ${s.name}.` },
      { name: 'twitter:image', content: s.cover_image_url || s.logo_url || '' },
    ],
    script: [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'LocalBusiness',
          name: s.name,
          description: s.description || `Book your appointment at ${s.name}`,
          url: `${config.public.siteUrl || ''}/shop/${s.slug}`,
          telephone: s.phone || undefined,
          address: {
            '@type': 'PostalAddress',
            streetAddress: s.address_street || undefined,
            addressLocality: s.address_city || undefined,
            addressRegion: s.address_state || undefined,
            postalCode: s.address_zip || undefined,
            addressCountry: 'PH',
          },
          image: s.cover_image_url || s.logo_url || undefined,
          priceRange: '$$',
        }),
      },
    ],
  })
}, { immediate: true })

// ── Current day name for hours table highlighting ──
const currentDayName = computed(() => {
  if (!shop.value) return ''
  const tz = shop.value.timezone || 'Asia/Manila'
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' })
  const parts = formatter.formatToParts(new Date())
  return (parts.find(p => p.type === 'weekday')?.value || '').toLowerCase()
})
</script>

<template>
  <div class="themed-shop-page" :style="{
    '--brand': brandColor,
    '--brand-r': brandRgb.r,
    '--brand-g': brandRgb.g,
    '--brand-b': brandRgb.b,
    '--bg-accent': bgColor,
    '--bg-r': bgRgb.r,
    '--bg-g': bgRgb.g,
    '--bg-b': bgRgb.b,
    '--page-bg': pageBgColor,
    '--page-bg-r': pageBgRgb.r,
    '--page-bg-g': pageBgRgb.g,
    '--page-bg-b': pageBgRgb.b,
    '--brand-dark': `rgb(${Math.round(brandRgb.r * 0.8)},${Math.round(brandRgb.g * 0.8)},${Math.round(brandRgb.b * 0.8)})`,
    '--brand-light': `rgb(${Math.min(255, Math.round(brandRgb.r + (255 - brandRgb.r) * 0.3))},${Math.min(255, Math.round(brandRgb.g + (255 - brandRgb.g) * 0.3))},${Math.min(255, Math.round(brandRgb.b + (255 - brandRgb.b) * 0.3))})`,
    '--text-primary': textPrimary,
    '--text-secondary': textSecondary,
    '--text-muted': textMuted,
    '--text-faint': textFaint,
    '--surface-alt': surfaceAlt,
    '--surface-deep': surfaceDeep,
    '--glass-bg': glassBg,
    '--glass-bg-hover': glassBgHover,
    '--glass-border': glassBorder,
    '--glass-border-hover': glassBorderHover,
  }">
    <div v-if="route.name === 'shop-slug'">
      <!-- ══════════════════════════════════════════
         LOADING STATE — Dark Skeleton
         ══════════════════════════════════════════ -->
    <div v-if="pending" class="min-h-screen bg-[var(--page-bg)]">
      <!-- Hero skeleton -->
      <div class="h-[200px] animate-pulse bg-white/5 sm:h-72 md:h-[420px]" />
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="relative -mt-10 flex flex-col items-center gap-3 sm:-mt-12 sm:flex-row sm:items-end sm:gap-4">
          <div class="h-20 w-20 animate-pulse rounded-2xl bg-white/5 sm:h-24 sm:w-24" />
          <div class="flex-1 space-y-2 pb-1 text-center sm:text-left">
            <div class="h-7 w-48 animate-pulse rounded bg-white/5 mx-auto sm:mx-0" />
            <div class="h-4 w-32 animate-pulse rounded bg-white/5 mx-auto sm:mx-0" />
          </div>
        </div>
        <!-- Service skeleton cards -->
        <div class="mt-12 grid gap-4 grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3">
          <div v-for="n in 6" :key="n" class="h-56 animate-pulse rounded-2xl bg-white/5 border border-white/5" />
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════
         FRIENDLY 404 — Dark
         ══════════════════════════════════════════ -->
    <div v-else-if="!shop" class="flex min-h-screen items-center justify-center bg-[var(--page-bg)] px-4">
      <div class="text-center">
        <Icon name="lucide:search-x" class="mx-auto h-16 w-16 brand-text-50" />
        <h1 class="mt-6 text-2xl font-bold text-[var(--text-primary)] font-serif">This barbershop page doesn't exist.</h1>
        <p class="mt-3 max-w-md text-sm text-[var(--text-muted)] mx-auto">
          Looking for a specific shop? Check the URL and try again.
        </p>
        <NuxtLink
          to="/"
          class="gold-shimmer-btn mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold"
          :style="{ color: safeTextColor }"
        >
          <Icon name="lucide:home" class="h-4 w-4" />
          Go to Homepage
        </NuxtLink>
      </div>
    </div>

    <!-- ══════════════════════════════════════════
         SHOP PAGE — Dark Luxury
         ══════════════════════════════════════════ -->
    <div v-else class="min-h-screen pb-20 md:pb-0">

      <!-- ════════════════════════════════════════
           STICKY SHOP NAVBAR — Dark Glass
           ════════════════════════════════════════ -->
      <Transition
        enter-active-class="transition-all duration-300 cubic-bezier(0.34,1.56,0.64,1)"
        enter-from-class="-translate-y-full opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-full opacity-0"
      >
        <div
          v-if="showStickyNav"
          class="hidden md:block sticky top-0 z-40 bg-black/70 backdrop-blur-xl border-b brand-border-20"
        >
          <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 lg:px-8">
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border brand-border-40 bg-[var(--page-bg)]">
                <img v-if="shop.logo_url" :src="shop.logo_url" :alt="shop.name" class="h-full w-full object-cover" />
                <span v-else class="text-xs font-bold brand-text">{{ shopInitials }}</span>
              </div>
              <span class="text-sm font-semibold text-[var(--text-primary)]">{{ shop.name }}</span>
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold backdrop-blur-md"
                :class="isOpen ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'"
              >
                <span class="h-1.5 w-1.5 rounded-full" :class="isOpen ? 'bg-green-400 animate-pulse' : 'bg-red-400'" />
                {{ statusText }}
              </span>
            </div>
            <div class="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              <a v-if="services.length" href="#services" class="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all flex-shrink-0" :class="activeSection === 'services' ? '' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'" :style="activeSection === 'services' ? { backgroundColor: primaryColor, color: safeTextColor } : {}">Services</a>
              <a v-if="barbers.length" href="#team" class="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all flex-shrink-0" :class="activeSection === 'team' ? '' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'" :style="activeSection === 'team' ? { backgroundColor: primaryColor, color: safeTextColor } : {}">Team</a>
              <a v-if="gallery.length" href="#gallery" class="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all flex-shrink-0" :class="activeSection === 'gallery' ? '' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'" :style="activeSection === 'gallery' ? { backgroundColor: primaryColor, color: safeTextColor } : {}">Gallery</a>
              <a href="#reviews" class="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all flex-shrink-0" :class="activeSection === 'reviews' ? '' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'" :style="activeSection === 'reviews' ? { backgroundColor: primaryColor, color: safeTextColor } : {}">Reviews</a>
              <a href="#contact" class="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all flex-shrink-0" :class="activeSection === 'contact' ? '' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'" :style="activeSection === 'contact' ? { backgroundColor: primaryColor, color: safeTextColor } : {}">Contact</a>
            </div>
            <NuxtLink :to="`/shop/${slug}/book`" class="gold-shimmer-btn inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-semibold flex-shrink-0" :style="{ color: safeTextColor }">
              <Icon name="lucide:calendar-check" class="h-3.5 w-3.5" />
              Book Now
            </NuxtLink>
          </div>
        </div>
      </Transition>

      <!-- ════════════════════════════════════════
           SECTION 1: HERO — Cinematic Dark
           ════════════════════════════════════════ -->
      <section class="shop-hero relative">
        <div class="shop-hero-cover relative h-[380px] sm:h-[460px] md:h-[520px] overflow-hidden">
          <img v-if="shop.cover_image_url" :src="shop.cover_image_url" :alt="`${shop.name} cover`" class="h-full w-full object-cover ken-burns" />
          <div v-else class="h-full w-full" :style="{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)` }" />
          <!-- Dark gradient overlay -->
          <div class="absolute inset-0" :style="{ background: `linear-gradient(to top, var(--page-bg), rgba(var(--page-bg-r),var(--page-bg-g),var(--page-bg-b),0.6), rgba(var(--page-bg-r),var(--page-bg-g),var(--page-bg-b),0.3))` }" />
          <!-- Grain texture -->
          <div class="pointer-events-none absolute inset-0 z-[1] opacity-[0.03]" style="background-image: url(&quot;data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E&quot;);" />
          <!-- Status badge — glassmorphism -->
          <div class="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
            <span
              class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg backdrop-blur-md sm:px-5 sm:py-2.5 sm:text-sm border"
              :class="isOpen ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-white/10 text-white/70 border-white/20'"
            >
              <span class="h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5" :class="isOpen ? 'bg-green-400 animate-pulse-gold' : 'bg-gray-500'" />
              {{ statusDetail }}
            </span>
          </div>
          <!-- Hero content — centered over image -->
          <div class="absolute inset-0 z-10 flex flex-col items-center justify-end pb-8 sm:pb-12 md:pb-16 px-4 text-center">
            <div class="hero-text-animate flex flex-col items-center">
              <!-- Prominent shop logo — overlapping cover -->
              <div v-if="shop.logo_url" class="mb-4 sm:mb-5 hero-logo-animate">
                <div class="flex h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 items-center justify-center overflow-hidden rounded-2xl border-2 brand-border-50 bg-[var(--page-bg)] shadow-lg brand-shadow-color-10">
                  <img :src="shop.logo_url" :alt="shop.name" class="h-full w-full object-cover" />
                </div>
              </div>
              <h1 class="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-[var(--text-primary)] font-serif tracking-wide" style="letter-spacing: 0.04em">{{ shop.name }}</h1>
              <p v-if="shop.description" class="mt-3 max-w-xl mx-auto text-sm sm:text-base text-[var(--text-secondary)]">{{ shop.description }}</p>
              <p v-if="shop.address_street || shop.address_city" class="mt-2 text-xs sm:text-sm brand-text-80">
                <Icon name="lucide:map-pin" class="mr-1 inline-block h-3 w-3" />
                {{ [shop.address_street, shop.address_city, shop.address_state].filter(Boolean).join(', ') }}
              </p>
            </div>
            <div class="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center gap-3">
              <NuxtLink :to="`/shop/${slug}/book`" class="gold-shimmer-btn inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3.5 text-sm font-bold shadow-lg brand-shadow-color-20 transition-all hover-brand-shadow-color-40 hover:scale-[1.02]" :style="{ color: safeTextColor }">
                <Icon name="lucide:calendar-check" class="h-4 w-4" />
                Book Now
              </NuxtLink>
              <a v-if="directionsUrl" :href="directionsUrl" target="_blank" rel="noopener" class="inline-flex items-center justify-center gap-2 rounded-lg border brand-border-30 bg-white/5 backdrop-blur-md px-6 py-3.5 text-sm font-medium text-[var(--text-primary)] transition-all hover:bg-white/10 hover-brand-border-50">
                <Icon name="lucide:navigation" class="h-4 w-4 brand-text" /> Get Directions
              </a>
            </div>
          </div>
        </div>
        <!-- Below-hero info bar with logo overlap -->
        <div class="relative bg-[var(--page-bg)]">
          <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 pb-6">
            <!-- Quick actions -->
            <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center">
              <a v-if="shop.phone" :href="`tel:${shop.phone}`" class="dark-glass-pill inline-flex min-h-[44px] items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all hover-brand-text hover-brand-border-40">
                <Icon name="lucide:phone" class="h-3.5 w-3.5 brand-text" /> Call
              </a>
              <a v-if="directionsUrl" :href="directionsUrl" target="_blank" rel="noopener" class="dark-glass-pill inline-flex min-h-[44px] items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all hover-brand-text hover-brand-border-40">
                <Icon name="lucide:navigation" class="h-3.5 w-3.5 brand-text" /> Directions
              </a>
              <button aria-label="Share this shop" class="dark-glass-pill inline-flex min-h-[44px] items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all hover-brand-text hover-brand-border-40" @click="shareShop">
                <Icon v-if="shareCopied" name="lucide:check" class="h-3.5 w-3.5 text-green-400" />
                <Icon v-else name="lucide:share-2" class="h-3.5 w-3.5 brand-text" />
                {{ shareCopied ? 'Copied!' : 'Share' }}
              </button>
              <a v-if="shop.phone" :href="whatsappUrl" target="_blank" rel="noopener" class="dark-glass-pill inline-flex min-h-[44px] items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-400 border-green-500/20 hover:bg-green-500/10 hover:border-green-500/40">
                <Icon name="lucide:message-circle" class="h-3.5 w-3.5" /> Message
              </a>
            </div>
            <!-- Stats row -->
            <div class="mt-4 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm">
              <div v-if="reviewStats.average > 0" class="flex items-center gap-1.5">
                <div class="flex items-center gap-0.5">
                  <Icon v-for="(star, i) in getStarArray(reviewStats.average)" :key="i" :name="star === 'full' ? 'lucide:star' : star === 'half' ? 'lucide:star-half' : 'lucide:star'" class="h-4 w-4" :class="star !== 'empty' ? 'brand-text' : 'text-white/20'" />
                </div>
                <span class="font-semibold text-[var(--text-primary)]">{{ reviewStats.average }}</span>
                <span class="text-[var(--text-muted)]">({{ reviewStats.total }})</span>
              </div>
              <div v-if="services.length" class="flex items-center gap-1.5 text-[var(--text-muted)]">
                <Icon name="lucide:scissors" class="h-4 w-4 brand-text" />
                <span><strong class="text-[var(--text-primary)]">{{ services.length }}</strong> Services</span>
              </div>
              <div v-if="barbers.length" class="flex items-center gap-1.5 text-[var(--text-muted)]">
                <Icon name="lucide:users" class="h-4 w-4 brand-text" />
                <span><strong class="text-[var(--text-primary)]">{{ barbers.length }}</strong> Barbers</span>
              </div>
            </div>
            <div v-if="nextAvailableSlot || showUrgencySignal" class="mt-3 flex flex-wrap justify-center gap-2">
              <span v-if="nextAvailableSlot && isOpen" class="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 px-3 py-1 text-xs font-medium text-blue-400">
                <Icon name="lucide:calendar" class="h-3 w-3" /> Next available: {{ nextAvailableSlot }}
              </span>
              <span v-if="showUrgencySignal" class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
                <Icon name="lucide:zap" class="h-3 w-3" /> Only {{ totalSlotsToday }} slot{{ totalSlotsToday !== 1 ? 's' : '' }} left today!
              </span>
            </div>
            <!-- Social links (prominent) -->
            <div v-if="shop.facebook_url || shop.instagram_url || shop.tiktok_url" class="mt-4 flex items-center justify-center gap-2">
              <a v-if="shop.facebook_url" :href="shop.facebook_url" target="_blank" rel="noopener" class="flex h-9 w-9 items-center justify-center rounded-full border transition-all hover:scale-110" :style="{ background: 'rgba(var(--brand-r),var(--brand-g),var(--brand-b),0.1)', borderColor: 'rgba(var(--brand-r),var(--brand-g),var(--brand-b),0.2)', color: 'var(--brand)' }"><Icon name="lucide:facebook" class="h-4 w-4" /></a>
              <a v-if="shop.instagram_url" :href="shop.instagram_url" target="_blank" rel="noopener" class="flex h-9 w-9 items-center justify-center rounded-full border transition-all hover:scale-110" :style="{ background: 'rgba(var(--brand-r),var(--brand-g),var(--brand-b),0.1)', borderColor: 'rgba(var(--brand-r),var(--brand-g),var(--brand-b),0.2)', color: 'var(--brand)' }"><Icon name="lucide:instagram" class="h-4 w-4" /></a>
              <a v-if="shop.tiktok_url" :href="shop.tiktok_url" target="_blank" rel="noopener" class="flex h-9 w-9 items-center justify-center rounded-full border transition-all hover:scale-110" :style="{ background: 'rgba(var(--brand-r),var(--brand-g),var(--brand-b),0.1)', borderColor: 'rgba(var(--brand-r),var(--brand-g),var(--brand-b),0.2)', color: 'var(--brand)' }"><Icon name="lucide:music" class="h-4 w-4" /></a>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════════════════════════════════════
           SECTION 2: SERVICES — Dark Glass Cards
           ════════════════════════════════════════ -->
      <section v-if="services.length > 0" id="services" class="section-fade scroll-mt-[70px] bg-[var(--page-bg)] px-4 py-20 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-6xl">
          <!-- Section header with animated gold line -->
          <div class="mb-10 text-center">
            <div class="section-accent-line mx-auto mb-4 h-[2px] w-12 rounded-full brand-bg" />
            <h2 class="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] font-serif tracking-wide">Our Services</h2>
            <p class="mt-3 text-sm text-[var(--text-muted)]">Professional grooming services tailored for you</p>
          </div>
          <!-- ARIA tablist for category filter -->
          <div v-if="serviceCategories.length > 2" class="mb-8 flex flex-wrap items-center justify-center gap-2" role="tablist">
            <button v-for="cat in serviceCategories" :key="cat" role="tab" :aria-selected="selectedCategory === cat" class="min-h-[44px] rounded-full px-4 py-1.5 text-xs font-medium transition-all border" :class="selectedCategory === cat ? '' : 'bg-white/5 text-[var(--text-muted)] border-white/10 hover:bg-white/10 hover-brand-border-30'" :style="selectedCategory === cat ? { backgroundColor: primaryColor, color: safeTextColor, borderColor: primaryColor } : {}" @click="selectedCategory = cat">
              {{ cat === 'all' ? 'All' : (categoryLabels[cat] || cat) }}
            </button>
          </div>
          <!-- Service cards grid -->
          <div class="grid gap-4 grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3" :class="{ 'xl:grid-cols-4': services.length >= 4 }">
            <div v-for="(service, idx) in filteredServices" :key="service.id" class="dark-glass-card group relative flex flex-col overflow-hidden p-0 transition-all duration-300 hover:-translate-y-1 hover-brand-shadow-15 hover-brand-border-40">
              <!-- Gold left-border accent on hover -->
              <div class="absolute left-0 top-0 bottom-0 w-0.5 bg-transparent transition-colors duration-300 group-hover-brand-bg z-10" />
              <div class="relative h-32 overflow-hidden sm:h-40">
                <img v-if="service.image_url" :src="service.image_url" :alt="service.name" :loading="idx > 2 ? 'lazy' : undefined" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/5 to-white/[0.02]">
                  <Icon :name="categoryIcons[service.category] || 'lucide:scissors'" class="h-12 w-12 brand-text-40" />
                </div>
                <!-- Dark overlay on image -->
                <div class="absolute inset-0" :style="{ background: 'linear-gradient(to top, rgba(var(--page-bg-r),var(--page-bg-g),var(--page-bg-b),0.6), transparent)' }" />
                <span class="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm border border-white/10">
                  <Icon name="lucide:clock" class="h-3 w-3" /> {{ service.duration_mins }} min
                </span>
                <span v-if="popularServices.includes(service.id)" class="absolute top-3 left-3 flex items-center gap-1 rounded-full brand-bg-90 px-2.5 py-1 text-[10px] font-semibold text-[#0D0D0D]">Popular</span>
              </div>
              <div class="flex flex-1 flex-col p-4">
                <div class="flex items-start justify-between gap-2">
                  <h4 class="text-sm font-semibold text-[var(--text-primary)] group-hover-brand-text transition-colors">{{ service.name }}</h4>
                  <span v-if="service.category" class="flex-shrink-0 rounded-full brand-bg-10 px-2 py-0.5 text-[10px] brand-text border brand-border-20">{{ categoryLabels[service.category] || service.category }}</span>
                </div>
                <p v-if="service.description" class="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{{ service.description }}</p>
                <div class="mt-auto flex items-center justify-between pt-3">
                  <span class="text-base font-bold brand-text">
                    <span v-if="service.category === 'package'" class="text-xs font-normal text-[var(--text-muted)]">Starting from </span>
                    ₱{{ service.price.toLocaleString() }}
                  </span>
                  <NuxtLink :to="`/shop/${slug}/book?service=${service.id}`" class="inline-flex translate-y-1 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 group-hover:translate-y-0 hover:opacity-90 sm:ml-2 brand-text hover:text-[var(--text-primary)] hover-brand-bg">
                    Book Now <Icon name="lucide:arrow-right" class="h-3 w-3" />
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>
          <!-- Empty state -->
          <div v-if="filteredServices.length === 0" class="col-span-full py-12 text-center">
            <Icon name="lucide:scissors" class="mx-auto h-10 w-10 brand-text-30" />
            <p class="mt-3 text-sm text-[var(--text-muted)]">
              No {{ categoryLabels[selectedCategory] }} services available.
            </p>
            <button class="mt-3 text-xs font-medium brand-text hover:underline" @click="selectedCategory = 'all'">
              View all services
            </button>
          </div>
        </div>
      </section>

      <!-- ════════════════════════════════════════
           SECTION 3: TEAM — Dark Glass Barber Cards
           ════════════════════════════════════════ -->
      <section v-if="barbers.length > 0" id="team" class="section-fade scroll-mt-[70px] bg-[var(--surface-alt)] px-4 py-20 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-6xl">
          <!-- Section header -->
          <div class="mb-10 text-center">
            <div class="section-accent-line mx-auto mb-4 h-[2px] w-12 rounded-full brand-bg" />
            <h2 class="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] font-serif tracking-wide">Our Team</h2>
            <p class="mt-3 text-sm text-[var(--text-muted)]">Meet the skilled barbers behind the chair</p>
          </div>
          <!-- Mobile — horizontal scroll -->
          <div class="relative md:hidden">
            <button class="absolute left-0 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border brand-border-30 shadow-lg transition-all hover:bg-[var(--page-bg)]" :style="{ backgroundColor: 'rgba(var(--page-bg-r),var(--page-bg-g),var(--page-bg-b),0.9)' }" @click="scrollTeam('left')" aria-label="Previous barber">
              <Icon name="lucide:chevron-left" class="h-4 w-4 brand-text" />
            </button>
            <button class="absolute right-0 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border brand-border-30 shadow-lg transition-all hover:bg-[var(--page-bg)]" :style="{ backgroundColor: 'rgba(var(--page-bg-r),var(--page-bg-g),var(--page-bg-b),0.9)' }" @click="scrollTeam('right')" aria-label="Next barber">
              <Icon name="lucide:chevron-right" class="h-4 w-4 brand-text" />
            </button>
            <div ref="teamScrollRef" class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 scrollbar-hide">
              <NuxtLink v-for="(barber, bIdx) in barbers" :key="barber.id" :to="`/shop/${slug}/book?barber=${barber.id}`" class="dark-glass-card flex w-[180px] flex-shrink-0 snap-start flex-col items-center p-5 transition-all duration-300 hover-brand-border-40">
                <div class="relative mb-3">
                  <div class="flex h-[80px] w-[80px] items-center justify-center overflow-hidden rounded-full bg-white/5 border-2 border-white/10 transition-all duration-300 group-hover-brand-border">
                    <img v-if="barber.photo_url" :src="barber.photo_url" :alt="barber.display_name" :loading="bIdx > 3 ? 'lazy' : undefined" class="h-full w-full object-cover" />
                    <Icon v-else name="lucide:user" class="h-7 w-7 brand-text-40" />
                  </div>
                  <!-- Availability indicator with gold pulse -->
                  <span class="absolute bottom-0 right-0">
                    <span v-if="barber.is_available" class="relative flex h-4 w-4">
                      <span class="animate-ping-gold absolute inline-flex h-full w-full rounded-full brand-bg opacity-40" />
                      <span class="relative inline-flex h-4 w-4 rounded-full border-2 border-[var(--page-bg)] brand-bg" />
                    </span>
                    <span v-else class="inline-flex h-4 w-4 rounded-full border-2 border-[var(--page-bg)] bg-gray-600" />
                  </span>
                </div>
                <h4 class="text-sm font-semibold text-[var(--text-primary)]">{{ barber.display_name }}</h4>
                <p v-if="barber.experience_yrs" class="mt-0.5 text-xs text-[var(--text-muted)]">{{ barber.experience_yrs }}yr{{ barber.experience_yrs !== 1 ? 's' : '' }} exp</p>
                <div v-if="barber.rating > 0" class="mt-1 flex items-center gap-1">
                  <Icon name="lucide:star" class="h-3 w-3 brand-text" />
                  <span class="text-xs font-medium text-[var(--text-primary)]">{{ barber.rating.toFixed(1) }}</span>
                  <span class="text-xs text-[var(--text-muted)]">({{ barber.total_reviews }})</span>
                </div>
                <div v-if="barber.specialties?.length" class="mt-2 flex flex-wrap justify-center gap-1">
                  <span v-for="spec in barber.specialties.slice(0, 2)" :key="spec" class="rounded-full brand-bg-10 border brand-border-20 px-2 py-0.5 text-[10px] brand-text">{{ spec }}</span>
                  <span v-if="barber.specialties.length > 2" class="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-[var(--text-muted)]">+{{ barber.specialties.length - 2 }}</span>
                </div>
                <span class="mt-2 flex items-center gap-1 text-xs" :class="barber.is_available ? 'brand-text' : 'text-[var(--text-faint)]'">
                  <span class="h-1.5 w-1.5 rounded-full" :class="barber.is_available ? 'brand-bg' : 'bg-gray-600'" />
                  {{ barber.is_available ? 'Available Today' : 'Not Available' }}
                </span>
              </NuxtLink>
            </div>
            <!-- Scroll indicator dots -->
            <div class="mt-2 flex justify-center gap-1.5">
              <div v-for="(_, dIdx) in barbers" :key="dIdx" class="h-1.5 rounded-full transition-all duration-300" :class="Math.floor(teamScrollProgress * (barbers.length - 1) + 0.5) === dIdx ? 'w-4 brand-bg' : 'w-1.5 bg-white/20'" />
            </div>
          </div>
          <!-- Desktop team grid -->
          <div class="hidden gap-6 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <NuxtLink v-for="(barber, bIdx) in displayedBarbers" :key="barber.id" :to="`/shop/${slug}/book?barber=${barber.id}`" class="dark-glass-card group flex flex-col items-center p-6 transition-all duration-300 hover:-translate-y-1 hover-brand-shadow-15 hover-brand-border-40">
              <div class="relative mb-4">
                <div class="flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-full bg-white/5 border-2 border-white/10 transition-all duration-300 group-hover-brand-border group-hover-brand-glow-30">
                  <img v-if="barber.photo_url" :src="barber.photo_url" :alt="barber.display_name" :loading="bIdx > 3 ? 'lazy' : undefined" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <Icon v-else name="lucide:user" class="h-10 w-10 brand-text-40" />
                </div>
                <!-- Availability indicator with gold pulse -->
                <span class="absolute bottom-2 right-2">
                  <span v-if="barber.is_available" class="relative flex h-5 w-5">
                    <span class="animate-ping-gold absolute inline-flex h-full w-full rounded-full brand-bg opacity-40" />
                    <span class="relative inline-flex h-5 w-5 rounded-full border-2 border-[var(--page-bg)] brand-bg" />
                  </span>
                  <span v-else class="inline-flex h-5 w-5 rounded-full border-2 border-[var(--page-bg)] bg-gray-600" />
                </span>
              </div>
              <h4 class="text-sm font-semibold text-[var(--text-primary)] group-hover-brand-text transition-colors">{{ barber.display_name }}</h4>
              <p v-if="barber.experience_yrs" class="mt-0.5 text-xs text-[var(--text-muted)]">{{ barber.experience_yrs }} year{{ barber.experience_yrs !== 1 ? 's' : '' }} experience</p>
              <div v-if="barber.rating > 0" class="mt-2 flex items-center gap-1">
                <Icon name="lucide:star" class="h-3.5 w-3.5 brand-text" />
                <span class="text-sm font-medium text-[var(--text-primary)]">{{ barber.rating.toFixed(1) }}</span>
                <span class="text-xs text-[var(--text-muted)]">({{ barber.total_reviews }})</span>
              </div>
              <div v-if="barber.specialties?.length" class="mt-3 flex flex-wrap justify-center gap-1">
                <span v-for="spec in barber.specialties.slice(0, 2)" :key="spec" class="rounded-full brand-bg-10 border brand-border-20 px-2 py-0.5 text-[10px] brand-text">{{ spec }}</span>
                <span v-if="barber.specialties.length > 2" class="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-[var(--text-muted)]">+{{ barber.specialties.length - 2 }} more</span>
              </div>
              <span class="mt-3 flex items-center gap-1 text-xs" :class="barber.is_available ? 'brand-text' : 'text-[var(--text-faint)]'">
                <span class="h-1.5 w-1.5 rounded-full" :class="barber.is_available ? 'brand-bg' : 'bg-gray-600'" />
                {{ barber.is_available ? 'Available Today' : 'Not Available' }}
              </span>
              <p v-if="barber.bio" class="mt-3 line-clamp-2 text-center text-xs text-[var(--text-muted)]">{{ barber.bio }}</p>
              <span class="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90" :style="{ backgroundColor: primaryColor, color: safeTextColor }">
                <Icon name="lucide:calendar" class="h-3 w-3" /> Book with {{ barber.display_name.split(' ')[0] }}
              </span>
            </NuxtLink>
          </div>
          <!-- Show all barbers toggle -->
          <div v-if="barbers.length > 8" class="mt-8 flex justify-center">
            <button class="inline-flex items-center gap-2 rounded-lg border brand-border-30 bg-white/5 px-6 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-all hover:bg-white/10 hover-brand-border-50" @click="showAllBarbers = !showAllBarbers">
              <Icon :name="showAllBarbers ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="h-4 w-4 brand-text" />
              {{ showAllBarbers ? 'Show Less' : `Show All ${barbers.length} Barbers` }}
            </button>
          </div>
        </div>
      </section>

      <!-- ════════════════════════════════════════
           SECTION 4: GALLERY — Dark Grid
           ════════════════════════════════════════ -->
      <section v-if="gallery.length > 0" id="gallery" class="section-fade scroll-mt-[70px] bg-[var(--page-bg)] px-4 py-20 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-6xl">
          <!-- Section header -->
          <div class="mb-10 text-center">
            <div class="section-accent-line mx-auto mb-4 h-[2px] w-12 rounded-full brand-bg" />
            <h2 class="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] font-serif tracking-wide">Gallery</h2>
            <p class="mt-3 text-sm text-[var(--text-muted)]">See our work and style</p>
          </div>
          <!-- Gallery filter pills -->
          <div v-if="galleryCategories.length > 2" class="mb-8 flex flex-wrap items-center justify-center gap-2" role="tablist">
            <button v-for="cat in galleryCategories" :key="cat" role="tab" :aria-selected="galleryFilter === cat" class="min-h-[44px] rounded-full px-4 py-1.5 text-xs font-medium transition-all border" :class="galleryFilter === cat ? 'brand-bg text-[#0D0D0D] brand-border' : 'bg-white/5 text-[var(--text-muted)] border-white/10 hover:bg-white/10 hover-brand-border-30'" @click="galleryFilter = cat">{{ cat === 'all' ? 'All' : cat }}</button>
          </div>
          <!-- Gallery grid -->
          <div class="columns-1 gap-3 min-[400px]:columns-2 md:columns-3 md:gap-4">
            <button v-for="(image, idx) in visibleGallery" :key="image.id" :aria-label="`View image ${idx + 1}`" class="gallery-item mb-3 block w-full overflow-hidden rounded-xl border-2 border-transparent transition-all duration-300 hover-brand-border-50 hover-brand-shadow-15 md:mb-4" @click="openLightbox(idx)">
              <img :src="image.thumbnail_url || image.url" :alt="image.caption || 'Gallery image'" class="w-full object-cover transition-transform duration-500 hover:scale-105" :loading="idx > 5 ? 'lazy' : undefined" />
            </button>
          </div>
          <div v-if="galleryShowCount < galleryTotalCount" class="mt-8 flex justify-center">
            <button class="inline-flex items-center gap-2 rounded-lg border brand-border-30 bg-white/5 px-6 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-all hover:bg-white/10 hover-brand-border-50" @click="galleryShowCount += 12">
              <Icon name="lucide:image-plus" class="h-4 w-4 brand-text" /> Load More Photos
            </button>
          </div>
        </div>
        <GalleryLightbox v-model="isLightboxOpen" :images="lightboxImages" :initial-index="lightboxIndex" />
      </section>

      <!-- ════════════════════════════════════════
           SECTION 5: PRODUCTS — Dark Glass
           ════════════════════════════════════════ -->
      <section v-if="products.length > 0" id="products" class="section-fade scroll-mt-[70px] bg-[var(--surface-alt)] px-4 py-20 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-6xl">
          <!-- Section header -->
          <div class="mb-10 text-center">
            <div class="section-accent-line mx-auto mb-4 h-[2px] w-12 rounded-full brand-bg" />
            <h2 class="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] font-serif tracking-wide">Products</h2>
            <p class="mt-3 text-sm text-[var(--text-muted)]">Premium grooming products available in-shop</p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div v-for="product in products" :key="product.id" class="dark-glass-card overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover-brand-border-40">
              <div class="relative h-44 overflow-hidden bg-white/5">
                <img v-if="product.image_url" :src="product.image_url" :alt="product.name" loading="lazy" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div v-else class="flex h-full w-full items-center justify-center"><Icon name="lucide:package" class="h-10 w-10 brand-text-30" /></div>
                <div class="absolute inset-0" :style="{ background: 'linear-gradient(to top, rgba(var(--page-bg-r),var(--page-bg-g),var(--page-bg-b),0.6), transparent)' }" />
              </div>
              <div class="p-4">
                <h4 class="text-sm font-semibold text-[var(--text-primary)]">{{ product.name }}</h4>
                <p v-if="product.description" class="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{{ product.description }}</p>
                <p class="mt-2 text-base font-bold brand-text">₱{{ product.price.toLocaleString() }}</p>
                <div class="mt-3 flex items-center justify-between">
                  <p class="text-xs text-[var(--text-faint)]">Available in-shop only</p>
                  <a v-if="shop.phone" :href="`tel:${shop.phone}`" class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium transition-opacity hover:opacity-90" :style="{ backgroundColor: primaryColor + 'CC', color: safeTextColor }">
                    <Icon name="lucide:phone" class="h-3 w-3" /> Inquire
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════════════════════════════════════
           SECTION 6: REVIEWS — Dark Glass Cards with Gold Stars
           ════════════════════════════════════════ -->
      <section id="reviews" class="section-fade scroll-mt-[70px] bg-[var(--page-bg)] px-4 py-20 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-6xl">
          <!-- Section header -->
          <div class="mb-10 text-center">
            <div class="section-accent-line mx-auto mb-4 h-[2px] w-12 rounded-full brand-bg" />
            <h2 class="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] font-serif tracking-wide">Reviews <span v-if="reviewStats.total" class="text-lg font-normal text-[var(--text-muted)]">({{ reviewStats.total }})</span></h2>
            <p class="mt-3 text-sm text-[var(--text-muted)]">What our customers are saying</p>
          </div>
          <template v-if="reviewStats.total > 0">
            <div class="grid gap-8 lg:grid-cols-3">
              <!-- Review summary card -->
              <div class="dark-glass-card flex flex-col items-center justify-center p-8">
                <div class="text-5xl font-bold brand-text font-serif">{{ reviewStats.average }}</div>
                <div class="mt-2 flex items-center gap-1">
                  <Icon v-for="(star, i) in getStarArray(reviewStats.average)" :key="i" :name="star === 'full' ? 'lucide:star' : star === 'half' ? 'lucide:star-half' : 'lucide:star'" class="h-5 w-5" :class="star !== 'empty' ? 'brand-text' : 'text-white/20'" />
                </div>
                <p class="mt-1 text-sm text-[var(--text-muted)]">Based on {{ reviewStats.total }} review{{ reviewStats.total !== 1 ? 's' : '' }}</p>
                <div class="mt-4 w-full space-y-2">
                  <div v-for="star in [5, 4, 3, 2, 1]" :key="star" class="flex items-center gap-2 text-sm">
                    <span class="w-3 text-right text-xs text-[var(--text-muted)]">{{ star }}</span>
                    <Icon name="lucide:star" class="h-3 w-3 brand-text" />
                    <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div class="h-full rounded-full brand-bg transition-all" :style="{ width: reviewStats.total > 0 ? `${((reviewStats.breakdown[star] || 0) / reviewStats.total) * 100}%` : '0%' }" />
                    </div>
                    <span class="w-10 text-right text-[10px] text-[var(--text-muted)]">{{ reviewStats.total > 0 ? Math.round(((reviewStats.breakdown[star] || 0) / reviewStats.total) * 100) : 0 }}%</span>
                  </div>
                </div>
              </div>
              <!-- Reviews list -->
              <div class="space-y-4 lg:col-span-2">
                <!-- Review filter tabs -->
                <div class="flex flex-wrap gap-2" role="tablist">
                  <button v-for="opt in [{ val: 'all', label: 'All Stars' }, { val: '5', label: '5\u2605' }, { val: '4', label: '4\u2605' }, { val: '3', label: '3\u2605' }]" :key="opt.val" role="tab" :aria-selected="reviewFilter === opt.val" class="min-h-[44px] rounded-full px-3 py-1 text-xs font-medium transition-all border" :class="reviewFilter === opt.val ? '' : 'bg-white/5 text-[var(--text-muted)] border-white/10 hover:bg-white/10 hover-brand-border-30'" :style="reviewFilter === opt.val ? { backgroundColor: primaryColor, color: safeTextColor, borderColor: primaryColor } : {}" @click="reviewFilter = opt.val">{{ opt.label }}</button>
                </div>
                <!-- Individual review cards -->
                <div v-for="review in filteredReviews" :key="review.id" class="dark-glass-card p-5">
                  <div class="flex items-start justify-between">
                    <div class="flex items-start gap-3">
                      <!-- Review avatar with gold gradient -->
                      <div class="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-[#0D0D0D] flex-shrink-0 bg-gradient-to-br brand-from brand-to">
                        {{ (review.customer_name || review.comment || 'A')[0].toUpperCase() }}
                      </div>
                      <div>
                        <div class="flex items-center gap-0.5">
                          <Icon v-for="i in 5" :key="i" name="lucide:star" class="h-4 w-4" :class="i <= review.rating ? 'brand-text' : 'text-white/20'" />
                        </div>
                        <div class="mt-1 flex flex-wrap items-center gap-1">
                          <span v-if="review.service_name" class="rounded-full brand-bg-10 border brand-border-20 px-2 py-0.5 text-[10px] brand-text">{{ review.service_name }}</span>
                          <span v-if="review.barber_name" class="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] text-blue-400">{{ review.barber_name }}</span>
                          <span v-if="review.booking_id" class="inline-flex items-center gap-0.5 text-[10px] brand-text"><Icon name="lucide:badge-check" class="h-3 w-3" /> Verified</span>
                        </div>
                      </div>
                    </div>
                    <span class="flex-shrink-0 text-xs text-[var(--text-faint)]" :title="new Date(review.created_at).toLocaleDateString()">{{ relativeTime(review.created_at) }}</span>
                  </div>
                  <p v-if="review.comment" class="mt-3 text-sm text-[var(--text-secondary)]" :class="!expandedReviews.has(review.id) ? 'line-clamp-3' : ''">{{ review.comment }}</p>
                  <button v-if="review.comment && review.comment.length > 150" class="mt-1 text-xs font-medium brand-text hover:underline" @click="toggleReviewExpand(review.id)">{{ expandedReviews.has(review.id) ? 'Show less' : 'Read more' }}</button>
                  <!-- Shop reply -->
                  <div v-if="review.reply_message" class="mt-3 rounded-lg p-3 bg-white/[0.03] border border-white/5">
                    <div class="flex items-center gap-2 text-xs font-medium brand-text">
                      <div class="flex h-5 w-5 items-center justify-center rounded-full brand-bg-15"><Icon name="lucide:store" class="h-3 w-3 brand-text" /></div>
                      Reply from {{ shop.name }}
                    </div>
                    <p class="mt-1.5 text-xs text-[var(--text-muted)]">{{ review.reply_message }}</p>
                  </div>
                </div>
                <!-- Reviews empty state -->
                <div v-if="filteredReviews.length === 0" class="py-8 text-center">
                  <Icon name="lucide:filter-x" class="mx-auto h-8 w-8 brand-text-30" />
                  <p class="mt-2 text-sm text-[var(--text-muted)]">No reviews match this filter.</p>
                  <button class="mt-2 text-xs font-medium brand-text hover:underline" @click="reviewFilter = 'all'">Clear filter</button>
                </div>
                <!-- Load more reviews -->
                <div v-if="hasMoreReviews && reviewFilter === 'all'" class="flex justify-center pt-4">
                  <button :disabled="isLoadingMoreReviews" class="inline-flex items-center gap-2 rounded-lg border brand-border-30 bg-white/5 px-6 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-all hover:bg-white/10 hover-brand-border-50 disabled:cursor-not-allowed disabled:opacity-50" @click="loadMoreReviews">
                    <Icon v-if="isLoadingMoreReviews" name="lucide:loader-2" class="h-4 w-4 animate-spin brand-text" />
                    <Icon v-else name="lucide:chevron-down" class="h-4 w-4 brand-text" />
                    {{ isLoadingMoreReviews ? 'Loading...' : 'Load More Reviews' }}
                  </button>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="py-12 text-center">
            <Icon name="lucide:message-square" class="mx-auto h-12 w-12 brand-text-30" />
            <p class="mt-3 text-sm text-[var(--text-muted)]">No reviews yet. Be the first to leave a review after your visit!</p>
          </div>
        </div>
      </section>

      <!-- ════════════════════════════════════════
           SECTION 7: CONTACT & LOCATION — Dark Glass Panels
           ════════════════════════════════════════ -->
      <section id="contact" class="section-fade scroll-mt-[70px] bg-[var(--surface-alt)] px-4 py-20 sm:px-6 lg:px-8">
        <div class="mx-auto max-w-6xl">
          <!-- Section header -->
          <div class="mb-10 text-center">
            <div class="section-accent-line mx-auto mb-4 h-[2px] w-12 rounded-full brand-bg" />
            <h2 class="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] font-serif tracking-wide">Contact & Location</h2>
            <p class="mt-3 text-sm text-[var(--text-muted)]">Visit us or get in touch</p>
          </div>
          <div class="grid gap-8 lg:grid-cols-2">
            <div class="space-y-6">
              <!-- Contact info cards -->
              <div class="grid gap-3 sm:grid-cols-2">
                <a v-if="shop.address_street || shop.address_city" :href="directionsUrl || undefined" target="_blank" rel="noopener" class="dark-glass-card flex items-start gap-3 p-4 transition-all duration-300 hover:-translate-y-0.5 hover-brand-border-40">
                  <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full brand-bg-15 border brand-border-20"><Icon name="lucide:map-pin" class="h-4 w-4 brand-text" /></div>
                  <div><p class="text-xs text-[var(--text-muted)]">Address</p><p class="text-sm font-medium text-[var(--text-primary)]">{{ [shop.address_street, shop.address_city, shop.address_state].filter(Boolean).join(', ') }}</p></div>
                </a>
                <a v-if="shop.phone" :href="`tel:${shop.phone}`" class="dark-glass-card flex items-start gap-3 p-4 transition-all duration-300 hover:-translate-y-0.5 hover-brand-border-40">
                  <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full brand-bg-15 border brand-border-20"><Icon name="lucide:phone" class="h-4 w-4 brand-text" /></div>
                  <div><p class="text-xs text-[var(--text-muted)]">Phone</p><p class="text-sm font-medium text-[var(--text-primary)]">{{ shop.phone }}</p></div>
                </a>
                <a v-if="shop.email" :href="`mailto:${shop.email}`" class="dark-glass-card flex items-start gap-3 p-4 transition-all duration-300 hover:-translate-y-0.5 hover-brand-border-40">
                  <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full brand-bg-15 border brand-border-20"><Icon name="lucide:mail" class="h-4 w-4 brand-text" /></div>
                  <div><p class="text-xs text-[var(--text-muted)]">Email</p><p class="text-sm font-medium text-[var(--text-primary)]">{{ shop.email }}</p></div>
                </a>
              </div>
              <!-- Social links -->
              <div v-if="shop.facebook_url || shop.instagram_url || shop.tiktok_url" class="flex gap-3">
                <a v-if="shop.facebook_url" :href="shop.facebook_url" target="_blank" rel="noopener" class="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-white/10 brand-text transition-all hover-brand-bg hover:text-[#0D0D0D] hover-brand-border hover-brand-glow-30"><Icon name="lucide:facebook" class="h-5 w-5" /></a>
                <a v-if="shop.instagram_url" :href="shop.instagram_url" target="_blank" rel="noopener" class="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-white/10 brand-text transition-all hover-brand-bg hover:text-[#0D0D0D] hover-brand-border hover-brand-glow-30"><Icon name="lucide:instagram" class="h-5 w-5" /></a>
                <a v-if="shop.tiktok_url" :href="shop.tiktok_url" target="_blank" rel="noopener" class="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-white/10 brand-text transition-all hover-brand-bg hover:text-[#0D0D0D] hover-brand-border hover-brand-glow-30"><Icon name="lucide:music" class="h-5 w-5" /></a>
              </div>
              <!-- Working hours -->
              <div class="dark-glass-card p-6">
                <h3 class="mb-4 flex items-center gap-2 text-[var(--text-primary)]"><Icon name="lucide:clock" class="h-5 w-5 brand-text" /> Working Hours</h3>
                <div class="space-y-1">
                  <div v-for="hours in sortedHours" :key="hours.day" class="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors" :class="hours.day === currentDayName ? 'brand-bg-10' : ''" :style="hours.day === currentDayName ? { borderLeft: '2px solid ' + brandColor } : {}">
                    <span :class="hours.day === currentDayName ? 'brand-text font-medium' : 'text-[var(--text-muted)]'">{{ dayShortNames[hours.day] || dayDisplayNames[hours.day] }} <span v-if="hours.day === currentDayName" class="ml-1.5 text-[10px] font-semibold brand-text">Today</span></span>
                    <span v-if="hours.is_open" class="text-[var(--text-primary)]">{{ formatTime(hours.open) }} — {{ formatTime(hours.close) }}</span>
                    <span v-else class="text-[var(--text-faint)]">Closed</span>
                  </div>
                </div>
              </div>
            </div>
            <!-- Map -->
            <div class="dark-glass-card overflow-hidden">
              <div class="h-full min-h-[300px]">
                <iframe v-if="shop.latitude && shop.longitude && googleMapsApiKey" :src="`https://www.google.com/maps/embed/v1/place?key=${googleMapsApiKey}&q=${shop.latitude},${shop.longitude}&zoom=15`" width="100%" height="100%" style="border:0; min-height: 300px;" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade" class="h-full w-full" />
                <div v-else class="flex h-full min-h-[300px] items-center justify-center bg-white/[0.02]">
                  <div class="text-center"><Icon name="lucide:map" class="mx-auto h-12 w-12 brand-text-30" /><p class="mt-3 text-sm text-[var(--text-muted)]">{{ [shop.address_street, shop.address_city].filter(Boolean).join(', ') || 'Location not set' }}</p></div>
                </div>
              </div>
              <a v-if="directionsUrl" :href="directionsUrl" target="_blank" rel="noopener" class="flex items-center justify-center gap-2 p-3 text-sm font-medium transition-opacity hover:opacity-90" :style="{ backgroundColor: primaryColor, color: safeTextColor }">
                <Icon name="lucide:navigation" class="h-4 w-4" /> Get Directions
              </a>
            </div>
          </div>
        </div>
      </section>

      <!-- ════════════════════════════════════════
           FOOTER — Dark Luxury
           ════════════════════════════════════════ -->
      <footer class="bg-[var(--surface-deep)] border-t brand-border-15 px-4 py-14">
        <div class="mx-auto max-w-6xl">
          <div class="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <div class="flex items-center gap-3">
              <div v-if="shop.logo_url" class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border brand-border-30 bg-[var(--page-bg)]"><img :src="shop.logo_url" :alt="shop.name" loading="lazy" class="h-full w-full object-cover" /></div>
              <div v-else class="flex h-12 w-12 items-center justify-center rounded-xl border brand-border-30 brand-bg-10">
                <span class="text-sm font-bold brand-text">{{ shopInitials }}</span>
              </div>
              <div>
                <p class="text-sm font-semibold text-[var(--text-primary)]">{{ shop.name }}</p>
                <p v-if="shop.address_street || shop.address_city" class="text-xs text-[var(--text-faint)]">{{ [shop.address_street, shop.address_city, shop.address_state].filter(Boolean).join(', ') }}</p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
              <a v-if="services.length" href="#services" class="transition-colors hover-brand-text">Services</a>
              <a v-if="barbers.length" href="#team" class="transition-colors hover-brand-text">Team</a>
              <a v-if="gallery.length" href="#gallery" class="transition-colors hover-brand-text">Gallery</a>
              <a href="#reviews" class="transition-colors hover-brand-text">Reviews</a>
              <a href="#contact" class="transition-colors hover-brand-text">Contact</a>
            </div>
            <div class="flex flex-col items-center gap-3 sm:items-end">
              <div class="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                <a v-if="shop.phone" :href="`tel:${shop.phone}`" class="flex items-center gap-1 transition-colors hover-brand-text"><Icon name="lucide:phone" class="h-3 w-3" /> {{ shop.phone }}</a>
                <a v-if="shop.email" :href="`mailto:${shop.email}`" class="flex items-center gap-1 transition-colors hover-brand-text"><Icon name="lucide:mail" class="h-3 w-3" /> {{ shop.email }}</a>
              </div>
              <span class="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[10px] text-[var(--text-faint)]"><Icon name="lucide:zap" class="h-3 w-3" /> Powered by Barbershop SaaS</span>
            </div>
          </div>
        </div>
      </footer>

      <!-- ════════════════════════════════════════
           FLOATING BOOK BUTTON (Mobile) — Dark Glass
           ════════════════════════════════════════ -->
      <Transition enter-active-class="transition-all duration-300 cubic-bezier(0.34,1.56,0.64,1)" enter-from-class="translate-y-full" enter-to-class="translate-y-0" leave-active-class="transition-all duration-200 ease-in" leave-from-class="translate-y-0" leave-to-class="translate-y-full">
        <div v-if="showFloatingCta && shop" class="fixed bottom-0 left-0 right-0 z-30 backdrop-blur-xl border-t brand-border-20 px-4 py-3 md:hidden" :style="{ backgroundColor: 'rgba(var(--page-bg-r),var(--page-bg-g),var(--page-bg-b),0.9)', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border brand-border-30 bg-[var(--page-bg)]">
                <img v-if="shop.logo_url" :src="shop.logo_url" :alt="shop.name" class="h-full w-full object-cover" />
                <span v-else class="text-xs font-bold brand-text">{{ shopInitials }}</span>
              </div>
              <div><p class="text-sm font-semibold text-[var(--text-primary)] line-clamp-1">{{ shop.name }}</p><p v-if="lowestServicePrice" class="text-[10px] text-[var(--text-muted)]">Starting from ₱{{ lowestServicePrice.toLocaleString() }}</p></div>
            </div>
            <NuxtLink :to="`/shop/${slug}/book`" class="gold-shimmer-btn inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold shadow-lg brand-shadow-color-20" :style="{ color: safeTextColor }">
              <Icon name="lucide:calendar-check" class="h-4 w-4" /> Book Now
            </NuxtLink>
          </div>
        </div>
      </Transition>

      <!-- ════════════════════════════════════════
           BACK TO TOP BUTTON — Dark Gold
           ════════════════════════════════════════ -->
      <Transition enter-active-class="transition-all duration-300 cubic-bezier(0.34,1.56,0.64,1)" enter-from-class="translate-y-4 opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition-all duration-200 ease-in" leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-4 opacity-0">
        <button v-if="showBackToTop" aria-label="Back to top" class="fixed bottom-20 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--page-bg)] border brand-border-40 shadow-lg brand-shadow-color-10 transition-all hover-brand-border hover-brand-shadow-color-20 md:bottom-6" @click="scrollToTop">
          <Icon name="lucide:chevron-up" class="h-5 w-5 brand-text" />
        </button>
      </Transition>
    </div>
    </div>
    <NuxtPage />
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════════════
   Themed Shop Page — Complete Animation System
   All colors driven by CSS custom properties from admin
   ══════════════════════════════════════════════════ */

/* ── Page background ── */
.themed-shop-page {
  background-color: var(--page-bg);
}

/* ── Glassmorphism card (auto-adapts to dark/light) ── */
.dark-glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dark-glass-card:hover {
  background: var(--glass-bg-hover);
  border-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.3);
  box-shadow: 0 8px 32px rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.1);
}

/* ── Glass pill (quick actions) ── */
.dark-glass-pill {
  background: var(--glass-bg-hover);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--glass-border-hover);
  border-radius: 9999px;
}

/* ── Section fade-in with spring easing ── */
.section-fade {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
              transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.section-fade.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ── Section accent line animation ── */
.section-accent-line {
  width: 12px;
  transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.section-fade.visible .section-accent-line {
  width: 48px;
}

/* ── Ken Burns slow zoom for hero image ── */
.ken-burns {
  animation: kenBurns 20s ease-in-out infinite alternate;
}
@keyframes kenBurns {
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.08);
  }
}

/* ── Hero text entrance ── */
.hero-text-animate {
  animation: heroTextIn 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
}
@keyframes heroTextIn {
  0% {
    opacity: 0;
    transform: translateY(24px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── Hero logo entrance (scale + fade) ── */
.hero-logo-animate {
  animation: heroLogoIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
}
@keyframes heroLogoIn {
  0% {
    opacity: 0;
    transform: scale(0.6) translateY(12px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* ── Brand shimmer button ── */
.gold-shimmer-btn {
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand-light) 50%, var(--brand) 100%);
  background-size: 200% 100%;
  position: relative;
  overflow: hidden;
  border-radius: 10px;
}
.gold-shimmer-btn::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.3) 50%,
    transparent 100%
  );
  transition: none;
}
.gold-shimmer-btn:hover::after {
  animation: shimmerSweep 0.6s ease-out forwards;
}
@keyframes shimmerSweep {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}

/* ── Gold pulse for availability indicators ── */
.animate-ping-gold {
  animation: pingGold 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
}
@keyframes pingGold {
  75%, 100% {
    transform: scale(2);
    opacity: 0;
  }
}

.animate-pulse-gold {
  animation: pulseGold 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes pulseGold {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* ── Gallery item hover ── */
.gallery-item {
  position: relative;
}
.gallery-item::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 12px;
  border: 2px solid transparent;
  transition: border-color 0.3s ease;
  pointer-events: none;
}
.gallery-item:hover::after {
  border-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.5);
}

/* ── Staggered fade-up for child elements within sections ── */
.section-fade.visible .dark-glass-card,
.section-fade.visible > div > .dark-glass-card {
  animation: staggerFadeUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.section-fade.visible > div > div > .dark-glass-card:nth-child(1) { animation-delay: 0s; }
.section-fade.visible > div > div > .dark-glass-card:nth-child(2) { animation-delay: 0.1s; }
.section-fade.visible > div > div > .dark-glass-card:nth-child(3) { animation-delay: 0.2s; }
.section-fade.visible > div > div > .dark-glass-card:nth-child(4) { animation-delay: 0.3s; }
.section-fade.visible > div > div > .dark-glass-card:nth-child(5) { animation-delay: 0.4s; }
.section-fade.visible > div > div > .dark-glass-card:nth-child(6) { animation-delay: 0.5s; }

@keyframes staggerFadeUp {
  0% {
    opacity: 0;
    transform: translateY(16px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── Scrollbar hide for horizontal scroll ── */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

/* ── Serif font class for headings ── */
.font-serif {
  font-family: 'Georgia', 'Times New Roman', 'Playfair Display', serif;
}

/* ── Brand color utility classes (dynamic theming via CSS custom properties) ── */
.brand-text { color: var(--brand); }
.brand-text-30 { color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.3); }
.brand-text-40 { color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.4); }
.brand-text-50 { color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.5); }
.brand-text-80 { color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.8); }

.brand-bg { background-color: var(--brand); }
.brand-bg-10 { background-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.1); }
.brand-bg-15 { background-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.15); }
.brand-bg-90 { background-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.9); }

.brand-border { border-color: var(--brand); }
.brand-border-15 { border-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.15); }
.brand-border-20 { border-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.2); }
.brand-border-30 { border-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.3); }
.brand-border-40 { border-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.4); }
.brand-border-50 { border-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.5); }

.brand-shadow-color-10 { --tw-shadow-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.1); }
.brand-shadow-color-20 { --tw-shadow-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.2); }
.brand-shadow-15 { box-shadow: 0 8px 32px rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.15); }
.brand-glow-30 { box-shadow: 0 0 20px rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.3); }

.brand-from {
  --tw-gradient-from: var(--brand);
  --tw-gradient-from-position: 0%;
  --tw-gradient-to: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0);
  --tw-gradient-to-position: 100%;
  --tw-gradient-stops: var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position);
}
.brand-to {
  --tw-gradient-to: var(--brand-dark);
  --tw-gradient-to-position: 100%;
  --tw-gradient-stops: var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position);
}
.brand-gradient {
  background: linear-gradient(to bottom right, var(--brand), var(--brand-dark));
}

/* ── Hover state brand utilities ── */
.hover-brand-text:hover { color: var(--brand); }
.hover-brand-bg:hover { background-color: var(--brand); }
.hover-brand-border:hover { border-color: var(--brand); }
.hover-brand-border-30:hover { border-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.3); }
.hover-brand-border-40:hover { border-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.4); }
.hover-brand-border-50:hover { border-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.5); }
.hover-brand-shadow-color-20:hover { --tw-shadow-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.2); }
.hover-brand-shadow-color-40:hover { --tw-shadow-color: rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.4); }
.hover-brand-shadow-15:hover { box-shadow: 0 8px 32px rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.15); }
.hover-brand-glow-30:hover { box-shadow: 0 0 20px rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.3); }

/* ── Group-hover state brand utilities ── */
.group:hover .gh-brand-text { color: var(--brand); }
.group:hover .gh-brand-bg { background-color: var(--brand); }
.group:hover .gh-brand-border { border-color: var(--brand); }
.group:hover .gh-brand-glow-30 { box-shadow: 0 0 20px rgba(var(--brand-r), var(--brand-g), var(--brand-b), 0.3); }
</style>
