<script setup lang="ts">
/**
 * Super Admin Layout — Used for the super admin panel
 * Includes SuperAdminSidebar on the left, content area on the right.
 * Mobile: sidebar is hidden by default, accessible via hamburger.
 * Desktop: breadcrumb header bar provides page context.
 */

const route = useRoute()

// Hydration guard: only render auth-dependent UI after client mount
const isMounted = ref(false)

onMounted(() => {
  isMounted.value = true
})

// ─── Breadcrumb computation ──────────────────────────
const breadcrumbs = computed(() => {
  const crumbs: { label: string; to?: string }[] = [
    { label: 'Super Admin', to: '/super-admin/dashboard' },
  ]

  const pathMap: Record<string, string> = {
    '/super-admin/dashboard': 'Dashboard',
    '/super-admin/shops': 'Shops',
    '/super-admin/owners': 'Owners',
    '/super-admin/subscriptions': 'Subscriptions',
    '/super-admin/analytics': 'Analytics',
    '/super-admin/settings': 'Settings',
  }

  // Match current path to a known page
  const currentPath = route.path

  // Check for exact match first
  if (pathMap[currentPath]) {
    crumbs.push({ label: pathMap[currentPath] })
    return crumbs
  }

  // Check for nested routes (e.g., /super-admin/shops/123)
  const basePath = '/' + currentPath.split('/').slice(1, 4).join('/')
  if (pathMap[basePath]) {
    crumbs.push({ label: pathMap[basePath], to: basePath })

    // Add detail page crumb
    if (currentPath.length > basePath.length) {
      const detailSegment = currentPath.replace(basePath + '/', '')
      if (detailSegment) {
        // Check if it's a detail page (e.g., a shop ID)
        crumbs.push({ label: 'Details' })
      }
    }
  }

  return crumbs
})

// Current page title (last breadcrumb without link)
const pageTitle = computed(() => {
  const last = breadcrumbs.value[breadcrumbs.value.length - 1]
  return last?.label || ''
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-[var(--color-white)]">
    <!-- Sidebar -->
    <SuperAdminSidebar />

    <!-- Main Content -->
    <div class="flex flex-1 flex-col">
      <!-- Top bar (mobile) -->
      <header class="flex h-14 items-center justify-between border-b border-[var(--color-silver)]/30 bg-[var(--color-pure-white)] px-4 lg:hidden">
        <div class="flex items-center gap-2">
          <div class="gradient-metallic flex h-8 w-8 items-center justify-center rounded-btn">
            <Icon name="lucide:shield" class="h-4 w-4 text-white" />
          </div>
          <span class="text-sm font-semibold text-[var(--color-deep)]">Super Admin</span>
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
