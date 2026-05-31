<script setup lang="ts">
/**
 * Admin Layout — Used for the admin panel
 * Includes AdminSidebar on the left, content area on the right.
 * Mobile: sidebar is hidden by default, accessible via hamburger.
 * Desktop: breadcrumb header bar provides page context.
 *
 * Also handles impersonation:
 * - Checks for ?impersonate= query param on mount
 * - Shows a persistent banner when impersonating a shop admin
 */

const authStore = useAuthStore()
const route = useRoute()

// Hydration guard: only render auth-dependent UI after client mount
// This prevents SSR/client hydration mismatches since SSR has no auth state
const isMounted = ref(false)

onMounted(async () => {
  isMounted.value = true
  const impersonateToken = route.query.impersonate as string | undefined
  if (impersonateToken) {
    try {
      await authStore.startImpersonation(impersonateToken)
    } catch (error) {
      console.error('Impersonation failed')
    }
  }
})

// ─── Breadcrumb computation ──────────────────────────
const breadcrumbs = computed(() => {
  const crumbs: { label: string; to?: string }[] = [
    { label: 'Admin', to: '/admin/dashboard' },
  ]

  const pathMap: Record<string, string> = {
    '/admin/dashboard': 'Dashboard',
    '/admin/bookings': 'Bookings',
    '/admin/calendar': 'Calendar',
    '/admin/payments/verification': 'Verifications',
    '/admin/payments/methods': 'Payment Methods',
    '/admin/services': 'Services',
    '/admin/staff': 'Team',
    '/admin/gallery': 'Gallery',
    '/admin/products': 'Products',
    '/admin/loyalty/settings': 'Loyalty Settings',
    '/admin/loyalty/rewards': 'Loyalty Rewards',
    '/admin/loyalty/members': 'Loyalty Members',
    '/admin/loyalty/transactions': 'Loyalty Transactions',
    '/admin/reports': 'Reports',
    '/admin/logs': 'Activity Logs',
    '/admin/settings': 'Settings',
  }

  const currentPath = route.path

  // Check for exact match first
  if (pathMap[currentPath]) {
    crumbs.push({ label: pathMap[currentPath] })
    return crumbs
  }

  // Check for nested detail routes (e.g., /admin/bookings/123)
  const segments = currentPath.split('/').filter(Boolean)
  // Try progressively shorter base paths
  for (let i = segments.length; i >= 2; i--) {
    const basePath = '/' + segments.slice(0, i).join('/')
    if (pathMap[basePath]) {
      crumbs.push({ label: pathMap[basePath], to: basePath })
      // Any deeper segments → "Details"
      if (currentPath.length > basePath.length) {
        crumbs.push({ label: 'Details' })
      }
      return crumbs
    }
  }

  return crumbs
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-[var(--color-white)]">
    <!-- Impersonation Banner (fixed overlay, higher z-index than sidebar) -->
    <div
      v-if="isMounted && authStore.isImpersonating"
      class="fixed left-0 right-0 top-0 z-[60] border-b border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-2"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon name="lucide:eye" class="h-4 w-4 text-[var(--color-warning)]" />
          <span class="text-sm font-medium text-[var(--color-deep)]">
            Viewing as <strong>{{ authStore.impersonatedShopName }}</strong>
          </span>
        </div>
        <button
          class="rounded-btn bg-[var(--color-danger)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
          @click="authStore.exitImpersonation()"
        >
          Exit Impersonation
        </button>
      </div>
    </div>

    <!-- Sidebar with top offset when impersonating -->
    <div class="shrink-0" :class="isMounted && authStore.isImpersonating ? 'mt-10' : ''">
      <AdminSidebar />
    </div>

    <!-- Main Content with top offset when impersonating -->
    <div class="flex flex-1 flex-col overflow-hidden" :class="isMounted && authStore.isImpersonating ? 'mt-10' : ''">
      <!-- Top bar (mobile) -->
      <header class="flex h-14 items-center justify-between border-b border-[var(--color-silver)]/30 bg-[var(--color-pure-white)] px-4 lg:hidden">
        <div class="flex items-center gap-2">
          <Icon name="lucide:scissors" class="h-5 w-5 text-[var(--color-deep)]" />
          <span class="text-sm font-semibold text-[var(--color-deep)]">Admin</span>
        </div>
      </header>

      <!-- Desktop breadcrumb header bar -->
      <header class="hidden border-b border-[var(--color-silver)]/20 bg-[var(--color-pure-white)] lg:block">
        <div class="flex h-14 items-center justify-between px-6">
          <!-- Breadcrumbs -->
          <div class="flex items-center gap-2">
            <template v-for="(crumb, idx) in breadcrumbs" :key="idx">
              <NuxtLink
                v-if="crumb.to && idx < breadcrumbs.length - 1"
                :to="crumb.to"
                class="text-sm text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
              >
                {{ crumb.label }}
              </NuxtLink>
              <span v-else class="text-sm font-semibold text-[var(--color-deep)]">
                {{ crumb.label }}
              </span>
              <Icon
                v-if="idx < breadcrumbs.length - 1"
                name="lucide:chevron-right"
                class="h-3.5 w-3.5 text-[var(--color-silver)]"
              />
            </template>
          </div>

          <!-- Right side: current date -->
          <div class="flex items-center gap-3">
            <span class="text-xs text-[var(--color-titanium)]">
              {{ new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) }}
            </span>
          </div>
        </div>
      </header>

      <!-- Page Content -->
      <main class="flex-1 overflow-y-auto p-4 lg:p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
