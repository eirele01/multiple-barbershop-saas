<script setup lang="ts">
/**
 * Admin Shop Profile — Logo, Cover Image & Shop Info Editor
 * Route: /admin/shop-profile
 *
 * Allows admins/managers to:
 * - Upload/change shop logo (circular preview)
 * - Upload/change cover image (banner preview)
 * - Edit shop name, description, contact info
 * - Edit address, social links, theme colors
 *
 * Responsive: mobile-first, works on all screen sizes
 * Uses the Apple/iPhone Pro design system from the admin layout
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const toast = useToast()

// ─── State ──────────────────────────────────────────
const isLoading = ref(true)
const loadError = ref(false)
const isSaving = ref(false)

// Shop profile fields
const shopName = ref('')
const shopSlug = ref('')
const shopDescription = ref('')
const shopPhone = ref('')
const shopEmail = ref('')
const addressStreet = ref('')
const addressCity = ref('')
const addressState = ref('')
const addressZip = ref('')
const facebookUrl = ref('')
const instagramUrl = ref('')
const tiktokUrl = ref('')
const primaryColor = ref('#C9A96E')
const accentColor = ref('#1a1a2e')
const backgroundColor = ref('#0D0D0D')
const timezone = ref('Asia/Manila')
const plan = ref<'basic' | 'upgraded'>('basic')

// Logo & Cover state
const logoUrl = ref<string | null>(null)
const coverUrl = ref<string | null>(null)
const isUploadingLogo = ref(false)
const isUploadingCover = ref(false)

// Local preview (before upload)
const logoPreview = ref<string | null>(null)
const coverPreview = ref<string | null>(null)

// Hidden file input refs
const logoInputRef = ref<HTMLInputElement | null>(null)
const coverInputRef = ref<HTMLInputElement | null>(null)

// ─── Computed ────────────────────────────────────────
const isAdmin = computed(() => authStore.role === 'admin')

const displayLogoUrl = computed(() => logoPreview.value || logoUrl.value)
const displayCoverUrl = computed(() => coverPreview.value || coverUrl.value)

// ─── Helper: Get auth token ─────────────────────────
function getAuthToken(): string | null {
  return authStore.accessToken
}

// ─── Fetch Shop Profile ────────────────────────────
async function fetchProfile() {
  isLoading.value = true
  loadError.value = false
  try {
    const token = getAuthToken()
    if (!token) {
      loadError.value = true
      return
    }

    const response = await $fetch('/api/admin/shop/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    shopName.value = response.name || ''
    shopSlug.value = response.slug || ''
    shopDescription.value = response.description || ''
    shopPhone.value = response.phone || ''
    shopEmail.value = response.email || ''
    addressStreet.value = response.address_street || ''
    addressCity.value = response.address_city || ''
    addressState.value = response.address_state || ''
    addressZip.value = response.address_zip || ''
    facebookUrl.value = response.facebook_url || ''
    instagramUrl.value = response.instagram_url || ''
    tiktokUrl.value = response.tiktok_url || ''
    primaryColor.value = response.primary_color || '#C9A96E'
    accentColor.value = response.accent_color || '#1a1a2e'
    backgroundColor.value = response.background_color || '#0D0D0D'
    timezone.value = response.timezone || 'Asia/Manila'
    plan.value = response.plan || 'basic'
    logoUrl.value = response.logo_url || null
    coverUrl.value = response.cover_image_url || null
  } catch (error: any) {
    loadError.value = true
    toast.error('Failed to load shop profile')
    console.error('Error fetching shop profile:', error)
  } finally {
    isLoading.value = false
  }
}

// ─── Logo Upload ────────────────────────────────────
function onLogoClick() {
  logoInputRef.value?.click()
}

function onLogoFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // Validate type
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast.error('Only JPG, PNG, and WebP images are accepted')
    input.value = ''
    return
  }

  // Validate size (2MB)
  if (file.size > 2 * 1024 * 1024) {
    toast.error('Logo image must be under 2MB')
    input.value = ''
    return
  }

  // Show local preview
  logoPreview.value = URL.createObjectURL(file)
}

async function uploadLogo() {
  const input = logoInputRef.value
  const file = input?.files?.[0]
  if (!file) return

  isUploadingLogo.value = true
  try {
    const token = getAuthToken()
    if (!token) return

    const formData = new FormData()
    formData.append('file', file)

    const response = await $fetch('/api/admin/shop/upload-logo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }) as any

    logoUrl.value = response.url
    logoPreview.value = null
    toast.success('Logo updated successfully')

    // Refresh shop store
    await shopStore.loadCurrentShop()
  } catch (error: any) {
    const message = error?.data?.statusMessage || error?.message || 'Failed to upload logo'
    toast.error(message)
  } finally {
    isUploadingLogo.value = false
    // Reset input so the same file can be re-selected
    if (input) input.value = ''
  }
}

function removeLogo() {
  logoPreview.value = null
  logoUrl.value = null
  if (logoInputRef.value) logoInputRef.value.value = ''
}

// ─── Cover Upload ───────────────────────────────────
function onCoverClick() {
  coverInputRef.value?.click()
}

function onCoverFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // Validate type
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast.error('Only JPG, PNG, and WebP images are accepted')
    input.value = ''
    return
  }

  // Validate size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    toast.error('Cover image must be under 5MB')
    input.value = ''
    return
  }

  // Show local preview
  coverPreview.value = URL.createObjectURL(file)
}

async function uploadCover() {
  const input = coverInputRef.value
  const file = input?.files?.[0]
  if (!file) return

  isUploadingCover.value = true
  try {
    const token = getAuthToken()
    if (!token) return

    const formData = new FormData()
    formData.append('file', file)

    const response = await $fetch('/api/admin/shop/upload-cover', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }) as any

    coverUrl.value = response.url
    coverPreview.value = null
    toast.success('Cover image updated successfully')

    // Refresh shop store
    await shopStore.loadCurrentShop()
  } catch (error: any) {
    const message = error?.data?.statusMessage || error?.message || 'Failed to upload cover image'
    toast.error(message)
  } finally {
    isUploadingCover.value = false
    if (input) input.value = ''
  }
}

function removeCover() {
  coverPreview.value = null
  coverUrl.value = null
  if (coverInputRef.value) coverInputRef.value.value = ''
}

// ─── Save Profile ───────────────────────────────────
async function saveProfile() {
  if (!shopName.value.trim()) {
    toast.error('Shop name is required')
    return
  }

  isSaving.value = true
  try {
    const token = getAuthToken()
    if (!token) return

    const payload: Record<string, any> = {
      name: shopName.value.trim(),
      description: shopDescription.value.trim() || null,
      phone: shopPhone.value.trim() || null,
      email: shopEmail.value.trim() || null,
      address_street: addressStreet.value.trim() || null,
      address_city: addressCity.value.trim() || null,
      address_state: addressState.value.trim() || null,
      address_zip: addressZip.value.trim() || null,
      facebook_url: facebookUrl.value.trim() || null,
      instagram_url: instagramUrl.value.trim() || null,
      tiktok_url: tiktokUrl.value.trim() || null,
      primary_color: primaryColor.value,
      accent_color: accentColor.value,
      background_color: backgroundColor.value,
      logo_url: logoUrl.value,
      cover_image_url: coverUrl.value,
    }

    await $fetch('/api/admin/shop/profile', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
    })

    toast.success('Shop profile saved successfully')

    // Refresh shop store
    await shopStore.loadCurrentShop()
  } catch (error: any) {
    const message = error?.data?.statusMessage || error?.message || 'Failed to save shop profile'
    toast.error(message)
    console.error('Error saving shop profile:', error)
  } finally {
    isSaving.value = false
  }
}

// ─── Color picker helper ────────────────────────────
function onColorInput(field: 'primary' | 'accent' | 'background', event: Event) {
  const input = event.target as HTMLInputElement
  if (field === 'primary') {
    primaryColor.value = input.value
  } else if (field === 'accent') {
    accentColor.value = input.value
  } else {
    backgroundColor.value = input.value
  }
}

// ── Derived contrast colors for preview ──
function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

const bgRgb = computed(() => hexToRgb(backgroundColor.value))

const textPrimary = computed(() => {
  const { r, g, b } = bgRgb.value
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#1D1D1F' : '#F5F0E8'
})

const surfaceAlt = computed(() => {
  const { r, g, b } = bgRgb.value
  const isDark = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
  if (isDark) {
    return `rgb(${Math.min(255, r + 8)},${Math.min(255, g + 8)},${Math.min(255, b + 8)})`
  }
  return `rgb(${Math.max(0, r - 8)},${Math.max(0, g - 8)},${Math.max(0, b - 8)})`
})

const surfaceDeep = computed(() => {
  const { r, g, b } = bgRgb.value
  const isDark = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
  if (isDark) {
    return `rgb(${Math.max(0, r - 5)},${Math.max(0, g - 5)},${Math.max(0, b - 5)})`
  }
  return `rgb(${Math.min(255, r + 5)},${Math.min(255, g + 5)},${Math.min(255, b + 5)})`
})

// ─── Initialize ──────────────────────────────────────
onMounted(() => {
  fetchProfile()
})

// Cleanup blob URLs on unmount
onUnmounted(() => {
  if (logoPreview.value) URL.revokeObjectURL(logoPreview.value)
  if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
})
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Shop Profile</h1>
        <p class="mt-1 text-sm text-[var(--color-titanium)]">Customize your shop's branding, logo, and information</p>
      </div>
      <a
        v-if="shopSlug"
        :href="`/shop/${shopSlug}`"
        target="_blank"
        rel="noopener"
        class="btn-design hidden items-center gap-1.5 rounded-btn border border-[var(--color-silver)] px-4 py-2 text-sm font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10 sm:inline-flex"
      >
        <Icon name="lucide:external-link" class="h-4 w-4" />
        View Shop
      </a>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="isLoading" class="space-y-6">
      <!-- Cover skeleton -->
      <div class="card-design overflow-hidden">
        <div class="h-48 animate-pulse bg-[var(--color-silver)]/10 sm:h-56 md:h-64" />
        <div class="relative px-4 pb-4 sm:px-6">
          <div class="-mt-12 flex items-end gap-4 sm:-mt-14">
            <div class="h-20 w-20 animate-pulse rounded-2xl border-4 border-white bg-[var(--color-silver)]/20 sm:h-24 sm:w-24" />
            <div class="flex-1 space-y-2 pb-2">
              <div class="h-6 w-48 animate-pulse rounded bg-[var(--color-silver)]/20" />
              <div class="h-4 w-32 animate-pulse rounded bg-[var(--color-silver)]/10" />
            </div>
          </div>
        </div>
      </div>
      <div class="card-design p-6">
        <div class="space-y-4">
          <div class="h-14 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
          <div class="h-14 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
          <div class="h-14 animate-pulse rounded-input bg-[var(--color-silver)]/10" />
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="loadError" class="card-design p-8 text-center">
      <Icon name="lucide:alert-circle" class="mx-auto mb-3 h-12 w-12 text-[var(--color-danger)]" />
      <h3 class="mb-2 text-lg font-semibold text-[var(--color-deep)]">Failed to Load Shop Profile</h3>
      <p class="mb-4 text-sm text-[var(--color-titanium)]">
        Something went wrong while fetching your shop profile. Please try again.
      </p>
      <button
        class="btn-design bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-titanium)]"
        @click="fetchProfile"
      >
        <Icon name="lucide:refresh-cw" class="mr-1.5 inline h-4 w-4" />
        Retry
      </button>
    </div>

    <!-- Profile Editor -->
    <template v-else>

      <!-- ═══════════════════════════════════════════════ -->
      <!-- SECTION 1: COVER & LOGO                        -->
      <!-- ═══════════════════════════════════════════════ -->
      <div class="card-design overflow-hidden">
        <!-- Cover Image Banner -->
        <div class="group relative h-44 sm:h-56 md:h-64">
          <!-- Cover image or placeholder -->
          <img
            v-if="displayCoverUrl"
            :src="displayCoverUrl"
            alt="Shop cover"
            class="h-full w-full object-cover"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center"
            :style="{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)` }"
          >
            <div class="text-center">
              <Icon name="lucide:image" class="mx-auto h-10 w-10 text-white/40 sm:h-12 sm:w-12" />
              <p class="mt-2 text-sm text-white/50">Add a cover image</p>
            </div>
          </div>

          <!-- Cover overlay — always visible on touch, hover on desktop -->
          <div class="absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
            <div class="flex gap-2">
              <button
                class="btn-design flex items-center gap-1.5 rounded-btn bg-white/90 px-4 py-2 text-sm font-medium text-[var(--color-deep)] transition-colors hover:bg-white min-h-[44px]"
                @click="onCoverClick"
              >
                <Icon name="lucide:camera" class="h-4 w-4" />
                {{ coverUrl ? 'Change Cover' : 'Upload Cover' }}
              </button>
              <button
                v-if="displayCoverUrl && !coverPreview"
                class="btn-design flex items-center gap-1.5 rounded-btn bg-red-500/90 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 min-h-[44px]"
                @click="removeCover"
              >
                <Icon name="lucide:trash-2" class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Upload progress overlay -->
          <div
            v-if="isUploadingCover"
            class="absolute inset-0 z-10 flex items-center justify-center bg-black/50"
          >
            <div class="flex items-center gap-2 rounded-btn bg-white/90 px-4 py-2 text-sm font-medium text-[var(--color-deep)]">
              <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" />
              Uploading...
            </div>
          </div>
        </div>

        <!-- Cover preview actions (shown when new file selected) -->
        <div
          v-if="coverPreview"
          class="flex items-center justify-between border-t border-[var(--color-silver)]/20 bg-blue-50 px-4 py-2.5 sm:px-6"
        >
          <p class="text-xs text-[var(--color-info)]">
            <Icon name="lucide:info" class="mr-1 inline h-3 w-3" />
            New cover image selected. Upload to apply.
          </p>
          <div class="flex gap-2">
            <button
              class="btn-design rounded-btn bg-[var(--color-info)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-info)]/90"
              :disabled="isUploadingCover"
              @click="uploadCover"
            >
              {{ isUploadingCover ? 'Uploading...' : 'Upload' }}
            </button>
            <button
              class="rounded-btn border border-[var(--color-silver)] px-3 py-1.5 text-xs font-medium text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/10"
              @click="coverPreview = null"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Logo & Name Row -->
        <div class="relative px-4 pb-4 sm:px-6 pointer-events-none">
          <div class="-mt-12 flex items-end gap-3 sm:-mt-14 sm:gap-4">
            <!-- Logo circle -->
            <div class="group/logo relative flex-shrink-0">
              <div
                class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-[var(--color-white)] shadow-md transition-shadow group-hover/logo:shadow-lg sm:h-24 sm:w-24"
              >
                <img
                  v-if="displayLogoUrl"
                  :src="displayLogoUrl"
                  alt="Shop logo"
                  class="h-full w-full object-cover"
                />
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center"
                  :style="{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)` }"
                >
                  <span class="text-xl font-bold text-white sm:text-2xl">
                    {{ shopName ? shopName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?' }}
                  </span>
                </div>
              </div>
              <!-- Logo edit overlay -->
              <button
                class="pointer-events-auto absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 transition-opacity group-hover/logo:opacity-100"
                @click="onLogoClick"
              >
                <Icon name="lucide:camera" class="h-5 w-5 text-white sm:h-6 sm:w-6" />
              </button>
              <!-- Upload spinner -->
              <div
                v-if="isUploadingLogo"
                class="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50"
              >
                <Icon name="lucide:loader-2" class="h-6 w-6 animate-spin text-white" />
              </div>
            </div>
            <!-- Name & slug -->
            <div class="min-w-0 flex-1 pb-1">
              <h3 class="truncate text-lg font-bold text-[var(--color-deep)]">{{ shopName || 'Your Shop' }}</h3>
              <p class="truncate text-sm text-[var(--color-titanium)]">
                <Icon name="lucide:map-pin" class="mr-1 inline h-3 w-3" />
                {{ [addressCity, addressState].filter(Boolean).join(', ') || 'Set your location' }}
              </p>
            </div>
          </div>

          <!-- Logo preview actions -->
          <div
            v-if="logoPreview"
            class="pointer-events-auto mt-3 flex items-center justify-between rounded-input bg-blue-50 px-3 py-2"
          >
            <p class="text-xs text-[var(--color-info)]">
              <Icon name="lucide:info" class="mr-1 inline h-3 w-3" />
              New logo selected. Upload to apply.
            </p>
            <div class="flex gap-2">
              <button
                class="btn-design rounded-btn bg-[var(--color-info)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-info)]/90"
                :disabled="isUploadingLogo"
                @click="uploadLogo"
              >
                {{ isUploadingLogo ? 'Uploading...' : 'Upload' }}
              </button>
              <button
                class="rounded-btn border border-[var(--color-silver)] px-3 py-1.5 text-xs font-medium text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/10"
                @click="logoPreview = null"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- Logo/cover quick actions (no preview) -->
          <div v-if="!logoPreview && !coverPreview" class="pointer-events-auto mt-3 flex flex-wrap gap-2">
            <button
              class="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--color-silver)]/10 px-3 py-1 text-xs font-medium text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]"
              @click="onLogoClick"
            >
              <Icon name="lucide:image" class="h-3 w-3" />
              {{ logoUrl ? 'Change Logo' : 'Add Logo' }}
            </button>
            <button
              v-if="logoUrl"
              class="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-100"
              @click="removeLogo"
            >
              <Icon name="lucide:trash-2" class="h-3 w-3" />
              Remove Logo
            </button>
            <button
              class="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--color-silver)]/10 px-3 py-1 text-xs font-medium text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]"
              @click="onCoverClick"
            >
              <Icon name="lucide:image" class="h-3 w-3" />
              {{ coverUrl ? 'Change Cover' : 'Add Cover' }}
            </button>
            <button
              v-if="coverUrl"
              class="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-100"
              @click="removeCover"
            >
              <Icon name="lucide:trash-2" class="h-3 w-3" />
              Remove Cover
            </button>
          </div>
        </div>

        <!-- Hidden file inputs -->
        <input
          ref="logoInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="hidden"
          @change="onLogoFileSelected"
        />
        <input
          ref="coverInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="hidden"
          @change="onCoverFileSelected"
        />
      </div>

      <!-- ═══════════════════════════════════════════════ -->
      <!-- SECTION 2: SHOP INFORMATION                    -->
      <!-- ═══════════════════════════════════════════════ -->
      <div class="card-design p-5 sm:p-6">
        <div class="mb-5 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-info)]/10">
            <Icon name="lucide:store" class="h-5 w-5 text-[var(--color-info)]" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-[var(--color-deep)]">Shop Information</h2>
            <p class="text-sm text-[var(--color-titanium)]">Basic details about your barbershop</p>
          </div>
        </div>

        <div class="space-y-4">
          <!-- Shop Name -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
              Shop Name <span class="text-[var(--color-danger)]">*</span>
            </label>
            <input
              v-model="shopName"
              type="text"
              placeholder="e.g., Classic Cuts Barbershop"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
            />
          </div>

          <!-- Description -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Description</label>
            <textarea
              v-model="shopDescription"
              rows="3"
              placeholder="Tell customers about your barbershop..."
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20 resize-none"
            />
            <p class="mt-1 text-right text-xs text-[var(--color-titanium)]">{{ shopDescription.length }}/500</p>
          </div>

          <!-- Phone & Email (side by side on desktop) -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Phone</label>
              <input
                v-model="shopPhone"
                type="tel"
                placeholder="+63 917 123 4567"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Email</label>
              <input
                v-model="shopEmail"
                type="email"
                placeholder="shop@example.com"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
              />
            </div>
          </div>


        </div>
      </div>

      <!-- ═══════════════════════════════════════════════ -->
      <!-- SECTION 3: ADDRESS                             -->
      <!-- ═══════════════════════════════════════════════ -->
      <div class="card-design p-5 sm:p-6">
        <div class="mb-5 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-success)]/10">
            <Icon name="lucide:map-pin" class="h-5 w-5 text-[var(--color-success)]" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-[var(--color-deep)]">Address</h2>
            <p class="text-sm text-[var(--color-titanium)]">Where customers can find you</p>
          </div>
        </div>

        <div class="space-y-4">
          <!-- Street -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Street Address</label>
            <input
              v-model="addressStreet"
              type="text"
              placeholder="123 Main Street, Brgy. Poblacion"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
            />
          </div>

          <!-- City, State, Zip -->
          <div class="grid gap-4 grid-cols-2 sm:grid-cols-3">
            <div class="col-span-2 sm:col-span-1">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">City</label>
              <input
                v-model="addressCity"
                type="text"
                placeholder="Makati City"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">State/Province</label>
              <input
                v-model="addressState"
                type="text"
                placeholder="Metro Manila"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Zip Code</label>
              <input
                v-model="addressZip"
                type="text"
                placeholder="1200"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════ -->
      <!-- SECTION 4: SOCIAL LINKS                        -->
      <!-- ═══════════════════════════════════════════════ -->
      <div class="card-design p-5 sm:p-6">
        <div class="mb-5 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-blue-500/10">
            <Icon name="lucide:share-2" class="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-[var(--color-deep)]">Social Links</h2>
            <p class="text-sm text-[var(--color-titanium)]">Connect your social media pages</p>
          </div>
        </div>

        <div class="space-y-4">
          <!-- Facebook -->
          <div>
            <label class="mb-1.5 flex items-center gap-2 text-sm font-medium text-[var(--color-deep)]">
              <Icon name="lucide:facebook" class="h-4 w-4 text-blue-600" />
              Facebook
            </label>
            <input
              v-model="facebookUrl"
              type="url"
              placeholder="https://facebook.com/yourshop"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
            />
          </div>

          <!-- Instagram -->
          <div>
            <label class="mb-1.5 flex items-center gap-2 text-sm font-medium text-[var(--color-deep)]">
              <Icon name="lucide:instagram" class="h-4 w-4 text-pink-500" />
              Instagram
            </label>
            <input
              v-model="instagramUrl"
              type="url"
              placeholder="https://instagram.com/yourshop"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
            />
          </div>

          <!-- TikTok -->
          <div>
            <label class="mb-1.5 flex items-center gap-2 text-sm font-medium text-[var(--color-deep)]">
              <Icon name="lucide:music" class="h-4 w-4 text-[var(--color-deep)]" />
              TikTok
            </label>
            <input
              v-model="tiktokUrl"
              type="url"
              placeholder="https://tiktok.com/@yourshop"
              class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20"
            />
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════ -->
      <!-- SECTION 5: THEME COLORS                        -->
      <!-- ═══════════════════════════════════════════════ -->
      <div class="card-design p-5 sm:p-6">
        <div class="mb-5 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-btn bg-[var(--color-warning)]/10">
            <Icon name="lucide:palette" class="h-5 w-5 text-[var(--color-warning)]" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-[var(--color-deep)]">Theme Colors</h2>
            <p class="text-sm text-[var(--color-titanium)]">Control your shop page's entire look & feel</p>
          </div>
        </div>

        <div class="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <!-- Brand Color (primary_color) -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Brand Color</label>
            <p class="mb-2 text-xs text-[var(--color-titanium)]">Buttons, highlights, icons, active states</p>
            <div class="flex items-center gap-3">
              <input
                type="color"
                :value="primaryColor"
                class="h-10 w-10 cursor-pointer rounded-btn border border-[var(--color-silver)]/50 p-0.5"
                @input="onColorInput('primary', $event)"
              />
              <input
                v-model="primaryColor"
                type="text"
                placeholder="#C9A96E"
                class="input-design flex-1 border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-xs text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20 font-mono"
              />
            </div>
          </div>

          <!-- Surface Color (accent_color) -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Surface Color</label>
            <p class="mb-2 text-xs text-[var(--color-titanium)]">Hero gradients, decorative backgrounds</p>
            <div class="flex items-center gap-3">
              <input
                type="color"
                :value="accentColor"
                class="h-10 w-10 cursor-pointer rounded-btn border border-[var(--color-silver)]/50 p-0.5"
                @input="onColorInput('accent', $event)"
              />
              <input
                v-model="accentColor"
                type="text"
                placeholder="#1a1a2e"
                class="input-design flex-1 border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-xs text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20 font-mono"
              />
            </div>
          </div>

          <!-- Page Background (background_color) -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Page Background</label>
            <p class="mb-2 text-xs text-[var(--color-titanium)]">Main page background, cards, footer</p>
            <div class="flex items-center gap-3">
              <input
                type="color"
                :value="backgroundColor"
                class="h-10 w-10 cursor-pointer rounded-btn border border-[var(--color-silver)]/50 p-0.5"
                @input="onColorInput('background', $event)"
              />
              <input
                v-model="backgroundColor"
                type="text"
                placeholder="#0D0D0D"
                class="input-design flex-1 border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-xs text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] focus:ring-2 focus:ring-[var(--color-info)]/20 font-mono"
              />
            </div>
          </div>
        </div>

        <!-- Quick preset themes -->
        <div class="mt-4">
          <p class="mb-2 text-xs font-medium text-[var(--color-titanium)]">Quick Presets</p>
          <div class="flex flex-wrap gap-2">
            <button
              class="flex items-center gap-2 rounded-full border border-[var(--color-silver)]/30 px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
              @click="primaryColor = '#C9A96E'; accentColor = '#1a1a2e'; backgroundColor = '#0D0D0D'"
            >
              <span class="flex gap-0.5">
                <span class="h-3 w-3 rounded-full bg-[#C9A96E]" />
                <span class="h-3 w-3 rounded-full bg-[#1a1a2e]" />
                <span class="h-3 w-3 rounded-full bg-[#0D0D0D] border border-gray-300" />
              </span>
              Dark Luxury
            </button>
            <button
              class="flex items-center gap-2 rounded-full border border-[var(--color-silver)]/30 px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
              @click="primaryColor = '#D4A574'; accentColor = '#2C1810'; backgroundColor = '#1A120B'"
            >
              <span class="flex gap-0.5">
                <span class="h-3 w-3 rounded-full bg-[#D4A574]" />
                <span class="h-3 w-3 rounded-full bg-[#2C1810]" />
                <span class="h-3 w-3 rounded-full bg-[#1A120B] border border-gray-300" />
              </span>
              Warm Espresso
            </button>
            <button
              class="flex items-center gap-2 rounded-full border border-[var(--color-silver)]/30 px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
              @click="primaryColor = '#8B5CF6'; accentColor = '#1E1B4B'; backgroundColor = '#0F0B2E'"
            >
              <span class="flex gap-0.5">
                <span class="h-3 w-3 rounded-full bg-[#8B5CF6]" />
                <span class="h-3 w-3 rounded-full bg-[#1E1B4B]" />
                <span class="h-3 w-3 rounded-full bg-[#0F0B2E] border border-gray-300" />
              </span>
              Purple Night
            </button>
            <button
              class="flex items-center gap-2 rounded-full border border-[var(--color-silver)]/30 px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
              @click="primaryColor = '#E53E3E'; accentColor = '#1A1A1A'; backgroundColor = '#111111'"
            >
              <span class="flex gap-0.5">
                <span class="h-3 w-3 rounded-full bg-[#E53E3E]" />
                <span class="h-3 w-3 rounded-full bg-[#1A1A1A]" />
                <span class="h-3 w-3 rounded-full bg-[#111111] border border-gray-300" />
              </span>
              Classic Red
            </button>
            <button
              class="flex items-center gap-2 rounded-full border border-[var(--color-silver)]/30 px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
              @click="primaryColor = '#2563EB'; accentColor = '#0C1A3A'; backgroundColor = '#0A0F1E'"
            >
              <span class="flex gap-0.5">
                <span class="h-3 w-3 rounded-full bg-[#2563EB]" />
                <span class="h-3 w-3 rounded-full bg-[#0C1A3A]" />
                <span class="h-3 w-3 rounded-full bg-[#0A0F1E] border border-gray-300" />
              </span>
              Ocean Blue
            </button>
            <button
              class="flex items-center gap-2 rounded-full border border-[var(--color-silver)]/30 px-3 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
              @click="primaryColor = '#059669'; accentColor = '#0A2E1F'; backgroundColor = '#0B1A14'"
            >
              <span class="flex gap-0.5">
                <span class="h-3 w-3 rounded-full bg-[#059669]" />
                <span class="h-3 w-3 rounded-full bg-[#0A2E1F]" />
                <span class="h-3 w-3 rounded-full bg-[#0B1A14] border border-gray-300" />
              </span>
              Forest Green
            </button>
          </div>
        </div>

        <!-- Shop page preview (simulates the actual themed shop page) -->
        <div class="mt-5">
          <p class="mb-2 text-xs font-medium text-[var(--color-titanium)]">Live Preview</p>
          <div class="overflow-hidden rounded-btn border border-[var(--color-silver)]/30" :style="{ backgroundColor: backgroundColor }">
            <!-- Simulated cover/hero -->
            <div class="relative h-24">
              <div class="h-full w-full" :style="{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)` }" />
              <div class="absolute inset-0" :style="{ background: `linear-gradient(to top, ${backgroundColor}, ${backgroundColor}99 60%, ${backgroundColor}4D 30%)` }" />
            </div>
            <!-- Simulated logo + name -->
            <div class="relative px-4 pb-3">
              <div class="-mt-6 flex items-end gap-3">
                <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border-2" :style="{ backgroundColor: backgroundColor, borderColor: textPrimary }">
                  <div v-if="displayLogoUrl" class="h-full w-full overflow-hidden">
                    <img :src="displayLogoUrl" alt="Logo" class="h-full w-full object-cover" />
                  </div>
                  <span v-else class="text-sm font-bold" :style="{ color: primaryColor }">{{ shopName ? shopName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?' }}</span>
                </div>
                <div>
                  <p class="text-sm font-bold" :style="{ color: textPrimary }">{{ shopName || 'Your Shop' }}</p>
                  <p class="text-[10px]" :style="{ color: textPrimary, opacity: 0.4 }">{{ shopDescription ? shopDescription.slice(0, 40) + '...' : 'Shop description' }}</p>
                </div>
              </div>
            </div>
            <!-- Simulated service cards -->
            <div class="px-4 pb-4">
              <div class="grid grid-cols-3 gap-2">
                <div v-for="n in 3" :key="n" class="rounded-lg border p-2" :style="{ borderColor: primaryColor + '20', background: 'rgba(255,255,255,0.03)' }">
                  <div class="h-6 rounded" :style="{ background: primaryColor + '10' }" />
                  <p class="mt-1.5 text-[8px] font-medium" :style="{ color: textPrimary, opacity: 0.6 }">Service</p>
                  <p class="text-[9px] font-bold" :style="{ color: primaryColor }">₱250</p>
                </div>
              </div>
              <!-- Simulated Book Now button -->
              <div class="mt-3 flex justify-center">
                <div class="rounded-lg px-6 py-1.5 text-[10px] font-bold" :style="{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}CC 100%)`, color: (0.299 * parseInt(primaryColor.slice(1,3),16) + 0.587 * parseInt(primaryColor.slice(3,5),16) + 0.114 * parseInt(primaryColor.slice(5,7),16)) / 255 > 0.5 ? '#1D1D1F' : '#FFFFFF' }">
                  Book Now
                </div>
              </div>
            </div>
            <!-- Simulated alt section -->
            <div class="px-4 py-3" :style="{ backgroundColor: surfaceAlt }">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="h-3 w-3 rounded-full" :style="{ backgroundColor: primaryColor }" />
                  <span class="text-[8px] font-medium" :style="{ color: textPrimary, opacity: 0.5 }">Contact info row</span>
                </div>
                <div class="flex gap-1">
                  <div v-for="n in 3" :key="n" class="h-4 w-4 rounded-full border" :style="{ borderColor: primaryColor + '30', backgroundColor: primaryColor + '10' }" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════ -->
      <!-- SAVE BUTTON                                    -->
      <!-- ═══════════════════════════════════════════════ -->
      <div class="flex items-center justify-between gap-4 pb-8">
        <a
          v-if="shopSlug"
          :href="`/shop/${shopSlug}`"
          target="_blank"
          rel="noopener"
          class="btn-design inline-flex items-center gap-1.5 rounded-btn border border-[var(--color-silver)] px-4 py-2.5 text-sm font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10 sm:hidden"
        >
          <Icon name="lucide:external-link" class="h-4 w-4" />
          View Shop
        </a>
        <div v-else />
        <button
          class="btn-design flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isSaving"
          @click="saveProfile"
        >
          <Icon v-if="isSaving" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
          <Icon v-else name="lucide:save" class="h-4 w-4" />
          {{ isSaving ? 'Saving...' : 'Save Changes' }}
        </button>
      </div>

    </template>
  </div>
</template>
