<script setup lang="ts">
/**
 * SuperAdminSidebar — Left navigation sidebar for the super admin panel
 *
 * Features:
 * - No role-based filtering (super admin sees all)
 * - No shop-specific info (platform-level only)
 * - Collapsible on desktop with smooth transitions
 * - Mobile slide-in/out with overlay
 * - Active route highlighting with left accent border
 * - Grouped navigation sections with headers
 * - Platform status indicator in header
 * - User info + sign out in footer
 * - Collapsed state shows icons only with section dividers
 */

import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
const route = useRoute()

const isCollapsed = ref(false)
const isMobileOpen = ref(false)

// ─── Navigation groups (super admin sees all) ──────────
const navGroups = [
  {
    label: 'Overview',
    items: [
      {
        label: 'Dashboard',
        icon: 'lucide:layout-dashboard',
        to: '/super-admin/dashboard',
      },
      {
        label: 'Analytics',
        icon: 'lucide:bar-chart-3',
        to: '/super-admin/analytics',
      },
    ],
  },
  {
    label: 'Management',
    items: [
      {
        label: 'Shops',
        icon: 'lucide:store',
        to: '/super-admin/shops',
      },
      {
        label: 'Owners',
        icon: 'lucide:users',
        to: '/super-admin/owners',
      },
      {
        label: 'Subscriptions',
        icon: 'lucide:credit-card',
        to: '/super-admin/subscriptions',
      },
      {
        label: 'Plans',
        icon: 'lucide:layers',
        to: '/super-admin/plans',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'Settings',
        icon: 'lucide:settings',
        to: '/super-admin/settings',
      },
    ],
  },
]

// Flatten all items for breadcrumb lookup
const allMenuItems = navGroups.flatMap(g => g.items)

// Check if a menu item is active
function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}

// Get current page label
const currentPageLabel = computed(() => {
  const match = allMenuItems.find(item => isActive(item.to))
  return match?.label || ''
})

// Get current group label
const currentGroupLabel = computed(() => {
  for (const group of navGroups) {
    if (group.items.some(item => isActive(item.to))) {
      return group.label
    }
  }
  return ''
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function toggleMobile() {
  isMobileOpen.value = !isMobileOpen.value
}

// Persist collapsed state in localStorage
onMounted(() => {
  const saved = localStorage.getItem('superadmin-sidebar-collapsed')
  if (saved !== null) {
    isCollapsed.value = saved === 'true'
  }
})

watch(isCollapsed, (val) => {
  localStorage.setItem('superadmin-sidebar-collapsed', String(val))
})
</script>

<template>
  <BaseSidebar
    :collapsed="isCollapsed"
    :mobile-open="isMobileOpen"
    :display-name="authStore.displayName"
    role-label="Super Admin"
    role-label-class="text-[var(--color-info)]"
    @toggle-collapse="toggleCollapse"
    @toggle-mobile="toggleMobile"
    @link-click="isMobileOpen = false"
    @sign-out="authStore.signOut()"
  >
    <template #header="{ collapsed }">
      <!-- Header: Platform info -->
      <div class="flex items-center border-b border-[var(--color-silver)]/30 px-4 py-4" :class="collapsed ? 'justify-center' : 'gap-3'">
        <div
          class="gradient-metallic flex h-10 w-10 shrink-0 items-center justify-center rounded-btn"
        >
          <Icon name="lucide:shield" class="h-5 w-5 text-white" />
        </div>
        <div v-if="!collapsed" class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-[var(--color-deep)]">
            Super Admin
          </p>
          <div class="mt-1 flex items-center gap-1.5">
            <span class="relative flex h-2 w-2">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-success)] opacity-75" />
              <span class="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-success)]" />
            </span>
            <span class="text-[10px] font-medium text-[var(--color-success)]">Platform Online</span>
          </div>
        </div>
      </div>
    </template>

    <template #nav="{ collapsed }">
      <template v-for="(group, groupIdx) in navGroups" :key="group.label">
        <!-- Group divider (except first) -->
        <div v-if="groupIdx > 0" class="my-3" :class="collapsed ? 'mx-auto w-8 border-t border-[var(--color-silver)]/40' : 'border-t border-[var(--color-silver)]/40'" />

        <!-- Group label -->
        <p
          v-if="!collapsed"
          class="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-titanium)]"
        >
          {{ group.label }}
        </p>

        <!-- Group items -->
        <ul class="space-y-1">
          <li v-for="item in group.items" :key="item.label">
            <NuxtLink
              :to="item.to"
              class="group relative flex items-center gap-3 rounded-input px-3 py-2.5 text-sm font-medium transition-all duration-200"
              :class="[
                isActive(item.to)
                  ? 'bg-[var(--color-deep)]/8 text-[var(--color-deep)]'
                  : 'text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/15 hover:text-[var(--color-deep)]',
                collapsed ? 'justify-center' : '',
              ]"
              :title="collapsed ? item.label : ''"
              @click="isMobileOpen = false"
            >
              <!-- Active left accent bar -->
              <span
                v-if="isActive(item.to)"
                class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--color-deep)]"
                :class="collapsed ? 'left-[-3px]' : ''"
              />

              <Icon
                :name="item.icon"
                class="h-5 w-5 shrink-0 transition-colors duration-200"
                :class="isActive(item.to) ? 'text-[var(--color-deep)]' : 'text-[var(--color-titanium)] group-hover:text-[var(--color-deep)]'"
              />
              <span v-if="!collapsed">{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </template>
    </template>
  </BaseSidebar>
</template>
