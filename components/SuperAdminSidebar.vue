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
  <!-- Mobile overlay -->
  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isMobileOpen"
      class="fixed inset-0 z-40 bg-black/50 lg:hidden"
      @click="toggleMobile"
    />
  </Transition>

  <!-- Mobile hamburger trigger -->
  <button
    class="fixed bottom-4 left-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-deep)] text-white shadow-lg lg:hidden"
    @click="toggleMobile"
  >
    <Icon name="lucide:menu" class="h-6 w-6" />
  </button>

  <!-- Sidebar -->
  <aside
    class="fixed left-0 top-0 z-50 flex h-full flex-col border-r border-[var(--color-silver)]/30 bg-[var(--color-pure-white)] transition-all duration-300 ease-in-out lg:relative lg:z-auto"
    :class="[
      isCollapsed ? 'w-[72px]' : 'w-64',
      isMobileOpen
        ? 'translate-x-0'
        : '-translate-x-full lg:translate-x-0',
    ]"
  >
    <!-- Header: Platform info -->
    <div class="flex items-center border-b border-[var(--color-silver)]/30 px-4 py-4" :class="isCollapsed ? 'justify-center' : 'gap-3'">
      <div
        class="gradient-metallic flex h-10 w-10 shrink-0 items-center justify-center rounded-btn"
      >
        <Icon name="lucide:shield" class="h-5 w-5 text-white" />
      </div>
      <div v-if="!isCollapsed" class="min-w-0 flex-1">
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

    <!-- Navigation Items -->
    <nav class="flex-1 overflow-y-auto px-3 py-4">
      <template v-for="(group, groupIdx) in navGroups" :key="group.label">
        <!-- Group divider (except first) -->
        <div v-if="groupIdx > 0" class="my-3" :class="isCollapsed ? 'mx-auto w-8 border-t border-[var(--color-silver)]/40' : 'border-t border-[var(--color-silver)]/40'" />

        <!-- Group label -->
        <p
          v-if="!isCollapsed"
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
                isCollapsed ? 'justify-center' : '',
              ]"
              :title="isCollapsed ? item.label : ''"
              @click="isMobileOpen = false"
            >
              <!-- Active left accent bar -->
              <span
                v-if="isActive(item.to)"
                class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--color-deep)]"
                :class="isCollapsed ? 'left-[-3px]' : ''"
              />

              <Icon
                :name="item.icon"
                class="h-5 w-5 shrink-0 transition-colors duration-200"
                :class="isActive(item.to) ? 'text-[var(--color-deep)]' : 'text-[var(--color-titanium)] group-hover:text-[var(--color-deep)]'"
              />
              <span v-if="!isCollapsed">{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </template>
    </nav>

    <!-- Footer: User info + collapse toggle -->
    <div class="border-t border-[var(--color-silver)]/30 p-3">
      <!-- User info -->
      <div
        class="flex items-center gap-3 rounded-input px-3 py-2"
        :class="isCollapsed ? 'justify-center' : ''"
      >
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-deep)] text-xs font-bold text-white ring-2 ring-[var(--color-silver)]/30"
        >
          {{ authStore.displayName?.charAt(0)?.toUpperCase() || 'S' }}
        </div>
        <div v-if="!isCollapsed" class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium text-[var(--color-deep)]">
            {{ authStore.displayName }}
          </p>
          <p class="truncate text-[10px] text-[var(--color-info)]">
            Super Admin
          </p>
        </div>
      </div>

      <!-- Collapse toggle (desktop only) -->
      <button
        class="mt-2 hidden w-full items-center gap-2 rounded-input px-3 py-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/15 hover:text-[var(--color-deep)] lg:flex"
        :class="isCollapsed ? 'justify-center' : ''"
        @click="toggleCollapse"
      >
        <Icon
          :name="isCollapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'"
          class="h-4 w-4"
        />
        <span v-if="!isCollapsed" class="text-xs">Collapse</span>
      </button>

      <!-- Sign out -->
      <button
        class="mt-1 flex w-full items-center gap-3 rounded-input px-3 py-2 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/8"
        :class="isCollapsed ? 'justify-center' : ''"
        @click="authStore.signOut()"
      >
        <Icon name="lucide:log-out" class="h-4 w-4 shrink-0" />
        <span v-if="!isCollapsed">Sign Out</span>
      </button>
    </div>
  </aside>
</template>
