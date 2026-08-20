<script setup lang="ts">
/**
 * BaseSidebar — Shared sidebar shell for admin and super-admin panels
 *
 * Handles the common chrome:
 * - Mobile overlay + hamburger trigger
 * - Collapsible aside shell (width + translate transitions)
 * - Footer with user info, collapse toggle, and sign out
 *
 * Exposes slots:
 * - header: Top header area (shop info, platform info, etc.)
 * - nav: Navigation content (menu items, groups, etc.)
 *
 * Props:
 * - collapsed: Whether sidebar is in collapsed (icon-only) mode
 * - mobileOpen: Whether mobile slide-in is active
 * - displayName: User display name for footer avatar
 * - roleLabel: Role text shown under name in footer
 * - roleLabelClass: Tailwind class for the role label color
 */
interface Props {
  collapsed: boolean
  mobileOpen: boolean
  displayName: string
  roleLabel: string
  roleLabelClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  roleLabelClass: 'text-[var(--color-titanium)]',
})

const emit = defineEmits<{
  'toggle-collapse': []
  'toggle-mobile': []
  'link-click': []
  'sign-out': []
}>()

function toggleCollapse() {
  emit('toggle-collapse')
}

function toggleMobile() {
  emit('toggle-mobile')
}

function handleSignOut() {
  emit('sign-out')
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
      v-if="mobileOpen"
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

  <!-- Sidebar shell -->
  <aside
    class="fixed left-0 top-0 z-50 flex h-full flex-col border-r border-[var(--color-silver)]/30 bg-[var(--color-pure-white)] transition-all duration-300 ease-in-out lg:relative lg:z-auto"
    :class="[
      collapsed ? 'w-[72px]' : 'w-64',
      mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
    ]"
  >
    <!-- Header slot -->
    <slot name="header" :collapsed="collapsed" />

    <!-- Nav slot -->
    <nav class="flex-1 overflow-y-auto px-3 py-4">
      <slot name="nav" :collapsed="collapsed" @link-click="emit('link-click')" />
    </nav>

    <!-- Footer: User info + collapse toggle + sign out -->
    <div class="border-t border-[var(--color-silver)]/30 p-3">
      <!-- User info -->
      <div
        class="flex items-center gap-3 rounded-input px-3 py-2"
        :class="collapsed ? 'justify-center' : ''"
      >
        <UserAvatar :name="displayName" size="md" show-ring />
        <div v-if="!collapsed" class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium text-[var(--color-deep)]">
            {{ displayName }}
          </p>
          <p class="truncate text-[10px] capitalize" :class="roleLabelClass">
            {{ roleLabel }}
          </p>
        </div>
      </div>

      <!-- Collapse toggle (desktop only) -->
      <button
        class="mt-2 hidden w-full items-center gap-2 rounded-input px-3 py-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/15 hover:text-[var(--color-deep)] lg:flex"
        :class="collapsed ? 'justify-center' : ''"
        @click="toggleCollapse"
      >
        <Icon
          :name="collapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'"
          class="h-4 w-4"
        />
        <span v-if="!collapsed" class="text-xs">Collapse</span>
      </button>

      <!-- Sign out -->
      <button
        class="mt-1 flex w-full items-center gap-3 rounded-input px-3 py-2 text-sm font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/8"
        :class="collapsed ? 'justify-center' : ''"
        @click="handleSignOut"
      >
        <Icon name="lucide:log-out" class="h-4 w-4 shrink-0" />
        <span v-if="!collapsed">Sign Out</span>
      </button>
    </div>
  </aside>
</template>
