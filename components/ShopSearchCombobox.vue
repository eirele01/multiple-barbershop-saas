<script setup lang="ts">
/**
 * ShopSearchCombobox — A searchable dropdown for finding barbershops.
 *
 * Behavior:
 * - On focus/click → shows dropdown with all shops (A-Z)
 * - On typing → filters list client-side by name, slug, or city
 * - On select (click or Enter) → populates input with shop name
 * - Click "Go" → navigates to /shop/{selected-slug}
 * - Keyboard: Arrow Up/Down, Enter, Escape
 * - Click outside → closes dropdown
 */

interface ShopItem {
  slug: string
  name: string
  city: string | null
  logo_url: string | null
}

const props = defineProps<{
  shops: ShopItem[]
}>()

const router = useRouter()

// ── State ──
const searchQuery = ref('')
const isDropdownOpen = ref(false)
const selectedIndex = ref(-1)
const selectedShop = ref<ShopItem | null>(null)
const comboboxRef = ref<HTMLElement | null>(null)

// ── Filtered shops ──
const filteredShops = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.shops

  return props.shops.filter((shop) => {
    const name = shop.name.toLowerCase()
    const slug = shop.slug.toLowerCase()
    const city = (shop.city || '').toLowerCase()
    return name.includes(q) || slug.includes(q) || city.includes(q)
  })
})

// ── Shop initials (fallback for logo) ──
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// ── Open dropdown ──
function openDropdown() {
  isDropdownOpen.value = true
  selectedIndex.value = -1
}

// ── Close dropdown ──
function closeDropdown() {
  isDropdownOpen.value = false
  selectedIndex.value = -1
}

// ── Select a shop ──
function selectShop(shop: ShopItem) {
  selectedShop.value = shop
  searchQuery.value = shop.name
  closeDropdown()
}

// ── Go to selected shop ──
function goToShop() {
  if (selectedShop.value) {
    router.push(`/shop/${selectedShop.value.slug}`)
  }
}

// ── Handle form submit (Go button or Enter) ──
function handleSubmit() {
  if (selectedShop.value) {
    router.push(`/shop/${selectedShop.value.slug}`)
  } else if (filteredShops.value.length === 1) {
    // If only one shop matches, go there directly
    router.push(`/shop/${filteredShops.value[0].slug}`)
  } else if (searchQuery.value.trim()) {
    // Fallback: try navigating by slug
    router.push(`/shop/${searchQuery.value.trim().toLowerCase().replace(/\s+/g, '-')}`)
  }
}

// ── Keyboard navigation ──
function handleKeydown(e: KeyboardEvent) {
  if (!isDropdownOpen.value) {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      openDropdown()
      e.preventDefault()
    }
    return
  }

  const count = filteredShops.value.length

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      selectedIndex.value = selectedIndex.value < count - 1 ? selectedIndex.value + 1 : 0
      scrollToSelected()
      break

    case 'ArrowUp':
      e.preventDefault()
      selectedIndex.value = selectedIndex.value > 0 ? selectedIndex.value - 1 : count - 1
      scrollToSelected()
      break

    case 'Enter':
      e.preventDefault()
      if (selectedIndex.value >= 0 && selectedIndex.value < count) {
        selectShop(filteredShops.value[selectedIndex.value])
      } else {
        handleSubmit()
      }
      break

    case 'Escape':
      closeDropdown()
      break
  }
}

// ── Scroll the selected item into view ──
function scrollToSelected() {
  nextTick(() => {
    const dropdown = comboboxRef.value?.querySelector('.combobox-dropdown')
    const selected = dropdown?.querySelector('.combobox-item-selected') as HTMLElement | null
    selected?.scrollIntoView({ block: 'nearest' })
  })
}

// ── Close on click outside ──
function handleClickOutside(e: MouseEvent) {
  if (comboboxRef.value && !comboboxRef.value.contains(e.target as Node)) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// ── Clear selected shop when user clears/changes the input ──
watch(searchQuery, (val) => {
  if (selectedShop.value && val !== selectedShop.value.name) {
    selectedShop.value = null
  }
  // Reset selected index when query changes
  selectedIndex.value = -1
  // Open dropdown when typing
  if (val.trim() && !isDropdownOpen.value) {
    isDropdownOpen.value = true
  }
})
</script>

<template>
  <div ref="comboboxRef" class="relative mx-auto max-w-md">
    <form
      class="flex overflow-hidden rounded-btn border border-[var(--color-silver)]/50 transition-colors focus-within:border-[var(--color-deep)]/40 focus-within:shadow-sm"
      @submit.prevent="handleSubmit"
    >
      <!-- Search icon -->
      <div class="flex items-center pl-3.5">
        <Icon name="lucide:search" class="h-4 w-4 text-[var(--color-titanium)]" />
      </div>

      <!-- Input -->
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search barbershops..."
        autocomplete="off"
        class="flex-1 border-0 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder-[var(--color-silver)] focus:outline-none focus:ring-0"
        @focus="openDropdown"
        @click="openDropdown"
        @keydown="handleKeydown"
      />

      <!-- Clear button -->
      <button
        v-if="searchQuery"
        type="button"
        class="flex items-center px-2 text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
        @click="searchQuery = ''; selectedShop = null"
      >
        <Icon name="lucide:x" class="h-3.5 w-3.5" />
      </button>

      <!-- Go button -->
      <button
        type="submit"
        class="flex items-center gap-1.5 bg-[var(--color-deep)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)]"
      >
        <Icon name="lucide:arrow-right" class="h-4 w-4" />
        Go
      </button>
    </form>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="isDropdownOpen && filteredShops.length > 0"
        class="combobox-dropdown absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-btn border border-[var(--color-silver)]/30 bg-[var(--color-pure-white)] shadow-lg"
      >
        <ul class="py-1">
          <li
            v-for="(shop, idx) in filteredShops"
            :key="shop.slug"
            class="combobox-item flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-[var(--color-silver)]/10"
            :class="{
              'combobox-item-selected bg-[var(--color-silver)]/10': selectedIndex === idx,
              'bg-[var(--color-deep)]/5': selectedShop?.slug === shop.slug,
            }"
            @click="selectShop(shop)"
            @mouseenter="selectedIndex = idx"
          >
            <!-- Shop logo or initials -->
            <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-silver)]/20">
              <img
                v-if="shop.logo_url"
                :src="shop.logo_url"
                :alt="shop.name"
                class="h-full w-full object-cover"
              />
              <span v-else class="text-[10px] font-bold text-[var(--color-titanium)]">{{ getInitials(shop.name) }}</span>
            </div>

            <!-- Shop info -->
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-[var(--color-deep)]">{{ shop.name }}</p>
              <p v-if="shop.city" class="truncate text-xs text-[var(--color-titanium)]">
                <Icon name="lucide:map-pin" class="mr-0.5 inline-block h-3 w-3" />
                {{ shop.city }}
              </p>
            </div>

            <!-- Checkmark if selected -->
            <Icon
              v-if="selectedShop?.slug === shop.slug"
              name="lucide:check"
              class="h-4 w-4 flex-shrink-0 text-[var(--color-success)]"
            />

            <!-- Arrow hint -->
            <Icon
              v-else
              name="lucide:chevron-right"
              class="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-silver)]"
            />
          </li>
        </ul>
      </div>
    </Transition>

    <!-- Empty state dropdown -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="isDropdownOpen && searchQuery.trim() && filteredShops.length === 0"
        class="absolute left-0 right-0 z-50 mt-1 rounded-btn border border-[var(--color-silver)]/30 bg-[var(--color-pure-white)] px-4 py-6 text-center shadow-lg"
      >
        <Icon name="lucide:search-x" class="mx-auto h-8 w-8 text-[var(--color-silver)]" />
        <p class="mt-2 text-sm text-[var(--color-titanium)]">No barbershops found for "{{ searchQuery }}"</p>
        <p class="mt-1 text-xs text-[var(--color-silver)]">Try a different name or city</p>
      </div>
    </Transition>
  </div>
</template>
