<script setup lang="ts">
/**
 * AdminSidebar — Left navigation sidebar with role-based menu items
 *
 * Features:
 * - Role-based visibility (menu items shown/hidden based on user role)
 * - Grouped navigation sections with headers (Overview, Operations, Business, Insights, System)
 * - Collapsible on desktop with smooth transitions + localStorage persistence
 * - Mobile slide-in/out with overlay
 * - Active state highlighting with left accent border
 * - Shop name, plan badge, and shop status indicator in header
 * - Live pending verification count badge (real-time via Supabase)
 * - Collapsible dropdown sections (Payments, Loyalty)
 * - upgradedOnly gating with PRO badge
 * - User info + sign out in footer
 */

import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'

const authStore = useAuthStore()
const shopStore = useShopStore()
const route = useRoute()

// Expose role to template scope (needed for child menu role checks)
const role = computed(() => authStore.role)

const isCollapsed = ref(false)
const isMobileOpen = ref(false)
const isPaymentsExpanded = ref(false)
const isLoyaltyExpanded = ref(false)

// ─── Live pending verification count ─────────────────
const pendingCount = ref(0)
let realtimeChannel: any = null

async function fetchPendingCount() {
  const supabase = useSupabase()
  const shopId = authStore.shopId
  if (!shopId) return

  const { count, error } = await supabase
    .from('payment_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('status', 'pending')

  if (!error && count !== null) {
    pendingCount.value = count
  }
}

function setupRealtimeSubscription() {
  const supabase = useSupabase()
  const shopId = authStore.shopId
  if (!shopId) return

  // Unique channel name per shop to avoid "already subscribed" errors
  const channelName = `payment-verifications-sidebar-${shopId}`

  // Pre-cleanup: remove any existing channel with this name
  // (handles remount after navigation)
  const existing = supabase.getChannels().find(
    (c) => c.topic === `realtime:${channelName}`
  )
  if (existing) {
    supabase.removeChannel(existing)
  }

  realtimeChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'payment_verifications',
        filter: `shop_id=eq.${shopId}`,
      },
      () => {
        // Re-fetch count on any change
        fetchPendingCount()
      }
    )
    .subscribe()
}

function teardownRealtime() {
  if (realtimeChannel) {
    const supabase = useSupabase()
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
}

onMounted(() => {
  if (authStore.isShopStaff) {
    fetchPendingCount()
    setupRealtimeSubscription()
  }

  // Persist collapsed state
  const saved = localStorage.getItem('admin-sidebar-collapsed')
  if (saved !== null) {
    isCollapsed.value = saved === 'true'
  }
})

onUnmounted(() => {
  teardownRealtime()
})

// Watch for auth changes
watch(() => authStore.shopId, (newShopId) => {
  teardownRealtime()
  if (newShopId) {
    fetchPendingCount()
    setupRealtimeSubscription()
  } else {
    pendingCount.value = 0
  }
})

// Persist collapsed state in localStorage
watch(isCollapsed, (val) => {
  localStorage.setItem('admin-sidebar-collapsed', String(val))
})

// ─── Navigation groups with role-based visibility ────
const navGroups = computed(() => {
  const role = authStore.role

  const groups = [
    {
      label: 'Overview',
      items: [
        {
          label: 'Dashboard',
          icon: 'lucide:layout-dashboard',
          to: '/admin/dashboard',
          roles: ['admin', 'manager', 'cashier', 'barber'],
        },
        {
          label: 'Calendar',
          icon: 'lucide:calendar',
          to: '/admin/calendar',
          roles: ['admin', 'manager', 'cashier', 'barber'],
        },
      ],
    },
    {
      label: 'Operations',
      items: [
        {
          label: 'Bookings',
          icon: 'lucide:calendar-check',
          to: '/admin/bookings',
          roles: ['admin', 'manager', 'cashier', 'barber'],
        },
        {
          label: 'Payments',
          icon: 'lucide:credit-card',
          roles: ['admin', 'manager', 'cashier'],
          children: [
            {
              label: 'Verifications',
              icon: 'lucide:check-circle',
              to: '/admin/payments/verification',
              roles: ['admin', 'manager', 'cashier'],
              badge: pendingCount,
            },
            {
              label: 'Payment Methods',
              icon: 'lucide:credit-card',
              to: '/admin/payments/methods',
              roles: ['admin', 'manager'],
            },
          ],
        },
        {
          label: 'Services',
          icon: 'lucide:scissors',
          to: '/admin/services',
          roles: ['admin', 'manager'],
        },
        {
          label: 'Team',
          icon: 'lucide:users',
          to: '/admin/staff',
          roles: ['admin', 'manager'],
        },
      ],
    },
    {
      label: 'Business',
      items: [
        {
          label: 'Shop Profile',
          icon: 'lucide:store',
          to: '/admin/shop-profile',
          roles: ['admin', 'manager'],
        },
        {
          label: 'Gallery',
          icon: 'lucide:image',
          to: '/admin/gallery',
          roles: ['admin', 'manager'],
        },
        {
          label: 'Products',
          icon: 'lucide:package',
          to: '/admin/products',
          roles: ['admin', 'manager', 'cashier'],
        },
        {
          label: 'Loyalty',
          icon: 'lucide:star',
          roles: ['admin'],
          upgradedOnly: true,
          children: [
            {
              label: 'Settings',
              icon: 'lucide:settings',
              to: '/admin/loyalty/settings',
              roles: ['admin'],
            },
            {
              label: 'Rewards',
              icon: 'lucide:gift',
              to: '/admin/loyalty/rewards',
              roles: ['admin'],
            },
            {
              label: 'Members',
              icon: 'lucide:users',
              to: '/admin/loyalty/members',
              roles: ['admin'],
            },
            {
              label: 'Transactions',
              icon: 'lucide:receipt',
              to: '/admin/loyalty/transactions',
              roles: ['admin'],
            },
          ],
        },
      ],
    },
    {
      label: 'Insights',
      items: [
        {
          label: 'Reports',
          icon: 'lucide:bar-chart-3',
          to: '/admin/reports',
          roles: ['admin', 'manager', 'cashier'],
        },
        {
          label: 'Activity Logs',
          icon: 'lucide:file-text',
          to: '/admin/logs',
          roles: ['admin', 'manager'],
        },
      ],
    },
    {
      label: 'System',
      items: [
        {
          label: 'Settings',
          icon: 'lucide:settings',
          to: '/admin/settings',
          roles: ['admin', 'manager'],
        },
      ],
    },
  ]

  // Filter items within each group based on role + plan, then filter out empty groups
  return groups
    .map(group => ({
      ...group,
      items: group.items.filter((item: any) => {
        if (item.roles && !item.roles.includes(role!)) return false
        if (item.upgradedOnly && !shopStore.isUpgradedPlan) return false
        return true
      }),
    }))
    .filter(group => group.items.length > 0)
})

// Check if a menu item is active
function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}

// Check if a parent menu item has an active child
function isActiveParent(item: any): boolean {
  if (!item.children) return false
  return item.children.some((child: any) => isActive(child.to))
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function toggleMobile() {
  isMobileOpen.value = !isMobileOpen.value
}

function getExpandedState(item: any): boolean {
  if (item.label === 'Payments') return isPaymentsExpanded.value
  if (item.label === 'Loyalty') return isLoyaltyExpanded.value
  return false
}

function toggleExpand(item: any) {
  if (item.label === 'Payments') isPaymentsExpanded.value = !isPaymentsExpanded.value
  else if (item.label === 'Loyalty') isLoyaltyExpanded.value = !isLoyaltyExpanded.value
}

// Helper to safely access child badge value (TypeScript strict mode compatibility)
function childBadge(child: any): number {
  return child.badge ?? 0
}
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
    <!-- Header: Shop info -->
    <div class="flex items-center border-b border-[var(--color-silver)]/30 px-4 py-4" :class="isCollapsed ? 'justify-center' : 'gap-3'">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-[var(--color-deep)] text-white"
      >
        <Icon name="lucide:scissors" class="h-5 w-5" />
      </div>
      <div v-if="!isCollapsed" class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-[var(--color-deep)]">
          {{ shopStore.name || 'My Shop' }}
        </p>
        <div class="mt-1 flex items-center gap-2">
          <span
            class="badge-pill text-[10px]"
            :class="
              shopStore.isUpgradedPlan
                ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                : 'bg-[var(--color-silver)]/30 text-[var(--color-titanium)]'
            "
          >
            {{ shopStore.isUpgradedPlan ? 'Upgraded' : 'Basic' }}
          </span>
          <span class="relative flex h-2 w-2">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-success)] opacity-75" />
            <span class="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-success)]" />
          </span>
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
            <!-- Single item (no children) -->
            <NuxtLink
              v-if="!item.children"
              :to="item.to!"
              class="group relative flex items-center gap-3 rounded-input px-3 py-2.5 text-sm font-medium transition-all duration-200"
              :class="[
                isActive(item.to!)
                  ? 'bg-[var(--color-deep)]/8 text-[var(--color-deep)]'
                  : 'text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/15 hover:text-[var(--color-deep)]',
                isCollapsed ? 'justify-center' : '',
              ]"
              :title="isCollapsed ? item.label : ''"
              @click="isMobileOpen = false"
            >
              <!-- Active left accent bar -->
              <span
                v-if="isActive(item.to!)"
                class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--color-deep)]"
                :class="isCollapsed ? 'left-[-3px]' : ''"
              />

              <Icon
                :name="item.icon!"
                class="h-5 w-5 shrink-0 transition-colors duration-200"
                :class="isActive(item.to!) ? 'text-[var(--color-deep)]' : 'text-[var(--color-titanium)] group-hover:text-[var(--color-deep)]'"
              />
              <span v-if="!isCollapsed">{{ item.label }}</span>
              <!-- PRO badge for upgradedOnly items -->
              <span
                v-if="item.upgradedOnly && !isCollapsed"
                class="badge-pill bg-[var(--color-info)]/10 text-[10px] text-[var(--color-info)]"
              >
                PRO
              </span>
            </NuxtLink>

            <!-- Item with children (dropdown) -->
            <div v-else>
              <button
                class="group relative flex w-full items-center gap-3 rounded-input px-3 py-2.5 text-sm font-medium transition-all duration-200"
                :class="[
                  isActiveParent(item)
                    ? 'bg-[var(--color-deep)]/5 text-[var(--color-deep)]'
                    : 'text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/15 hover:text-[var(--color-deep)]',
                  isCollapsed ? 'justify-center' : '',
                ]"
                @click="toggleExpand(item)"
              >
                <!-- Active left accent bar (when child is active) -->
                <span
                  v-if="isActiveParent(item)"
                  class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--color-deep)]"
                  :class="isCollapsed ? 'left-[-3px]' : ''"
                />

                <Icon
                  :name="item.icon!"
                  class="h-5 w-5 shrink-0 transition-colors duration-200"
                  :class="isActiveParent(item) ? 'text-[var(--color-deep)]' : 'text-[var(--color-titanium)] group-hover:text-[var(--color-deep)]'"
                />
                <span v-if="!isCollapsed" class="flex-1 text-left">{{ item.label }}</span>
                <!-- PRO badge for upgradedOnly parent items -->
                <span
                  v-if="item.upgradedOnly && !isCollapsed"
                  class="badge-pill bg-[var(--color-info)]/10 text-[10px] text-[var(--color-info)]"
                >
                  PRO
                </span>
                <!-- Pending count badge on parent -->
                <span
                  v-if="!isCollapsed && pendingCount > 0 && item.label === 'Payments'"
                  class="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-danger)] px-1.5 text-[10px] font-bold text-white"
                >
                  {{ pendingCount > 99 ? '99+' : pendingCount }}
                </span>
                <Icon
                  v-if="!isCollapsed"
                  name="lucide:chevron-down"
                  class="h-4 w-4 transition-transform"
                  :class="getExpandedState(item) ? 'rotate-180' : ''"
                />
              </button>

              <!-- Children -->
              <Transition
                enter-active-class="transition-all duration-200 overflow-hidden"
                enter-from-class="max-h-0 opacity-0"
                enter-to-class="max-h-60 opacity-100"
                leave-active-class="transition-all duration-150 overflow-hidden"
                leave-from-class="max-h-60 opacity-100"
                leave-to-class="max-h-0 opacity-0"
              >
                <ul v-if="!isCollapsed && getExpandedState(item)" class="ml-8 mt-1 space-y-1">
                  <li v-for="child in item.children" :key="child.label">
                    <NuxtLink
                      v-if="child.roles.includes(role!)"
                      :to="child.to"
                      class="group/child flex items-center gap-2 rounded-input px-3 py-2 text-sm transition-colors"
                      :class="[
                        isActive(child.to)
                          ? 'bg-[var(--color-deep)]/10 font-medium text-[var(--color-deep)]'
                          : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]',
                      ]"
                      @click="isMobileOpen = false"
                    >
                      <Icon v-if="child.icon" :name="child.icon" class="h-4 w-4" />
                      <span>{{ child.label }}</span>
                      <!-- Live badge for Verifications -->
                      <span
                        v-if="childBadge(child) > 0"
                        class="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[9px] font-bold text-white"
                      >
                        {{ childBadge(child) > 99 ? '99+' : childBadge(child) }}
                      </span>
                    </NuxtLink>
                  </li>
                </ul>
              </Transition>
            </div>
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
          {{ authStore.displayName?.charAt(0)?.toUpperCase() || 'U' }}
        </div>
        <div v-if="!isCollapsed" class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium text-[var(--color-deep)]">
            {{ authStore.displayName }}
          </p>
          <p class="truncate text-[10px] capitalize text-[var(--color-titanium)]">
            {{ authStore.role }}
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
