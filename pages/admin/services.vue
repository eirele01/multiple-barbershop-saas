<script setup lang="ts">
/**
 * Admin Services Page — Section 8.5 Services CMS
 * List view with add/edit slide-over panel, tier limit enforcement
 *
 * Accessible by: admin, manager (full CRUD)
 * Viewable by: cashier, barber (read-only)
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'
import type { Service, ServiceCategory } from '~/types/database'
import { TIER_LIMITS } from '~/types/database'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const toast = useToast()
const { confirm, ConfirmDialogComponent } = useConfirm()

// ─── State ────────────────────────────────────────
const services = ref<Service[]>([])
const barbers = ref<Array<{ id: string; name: string }>>([])
const isLoading = ref(true)
const fetchError = ref(false)

// Slide-over state
const isPanelOpen = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const isSaving = ref(false)

// Image upload state
const imageFile = ref<File | null>(null)
const imagePreview = ref<string | null>(null)
const isUploadingImage = ref(false)

// Upgrade prompt state
const showUpgradePrompt = ref(false)

// Form state
const form = ref({
  name: '',
  category: 'haircut' as ServiceCategory,
  description: '',
  duration_mins: 30,
  price: 0,
  deposit_amount: 0,
  barber_ids: [] as string[],
  is_active: true,
  image_url: '',
})

// ─── Tier limits ──────────────────────────────────
const tierLimit = computed(() => {
  if (shopStore.isUpgradedPlan) return Infinity
  return TIER_LIMITS.basic.services
})
const serviceCount = computed(() => services.value.length)
const isAtLimit = computed(() => serviceCount.value >= tierLimit.value)

// ─── Role check ──────────────────────────────────
const canManage = computed(() => {
  const role = authStore.role
  return role === 'admin' || role === 'manager'
})

// ─── Categories ──────────────────────────────────
const categories: Array<{ value: ServiceCategory; label: string; icon: string }> = [
  { value: 'haircut', label: 'Haircut', icon: 'lucide:scissors' },
  { value: 'beard', label: 'Beard', icon: 'lucide:user' },
  { value: 'shave', label: 'Shave', icon: 'lucide:razor' },
  { value: 'treatment', label: 'Treatment', icon: 'lucide:sparkles' },
  { value: 'package', label: 'Package', icon: 'lucide:package' },
  { value: 'other', label: 'Other', icon: 'lucide:more-horizontal' },
]

// ─── Auth token helper ──────────────────────────
async function getAuthToken(): Promise<string> {
  const supabase = useSupabase()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

// ─── Fetch services ──────────────────────────────
async function fetchServices() {
  isLoading.value = true
  fetchError.value = false
  try {
    const token = await getAuthToken()
    const response = await $fetch<{ data: Service[] }>('/api/admin/services', {
      headers: { Authorization: `Bearer ${token}` },
    })
    services.value = response.data || []
  } catch (err) {
    console.error('Error fetching services:', err)
    fetchError.value = true
  } finally {
    isLoading.value = false
  }
}

// ─── Fetch barbers for assignment ────────────────
async function fetchBarbers() {
  try {
    const token = await getAuthToken()
    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('barbers')
      .select('id, user:users(display_name)')
      .eq('shop_id', authStore.shopId)
      .eq('is_active', true)

    if (error) throw error
    barbers.value = (data || []).map((b: any) => ({
      id: b.id,
      name: b.user?.display_name || 'Unknown',
    }))
  } catch (err) {
    console.error('Error fetching barbers:', err)
  }
}

// ─── Open Add Panel ──────────────────────────────
function openAddPanel() {
  if (isAtLimit.value) {
    showUpgradePrompt.value = true
    return
  }
  isEditing.value = false
  editingId.value = null
  form.value = {
    name: '',
    category: 'haircut',
    description: '',
    duration_mins: 30,
    price: 0,
    deposit_amount: 0,
    barber_ids: [],
    is_active: true,
    image_url: '',
  }
  imageFile.value = null
  imagePreview.value = null
  isPanelOpen.value = true
}

// ─── Open Edit Panel ─────────────────────────────
function openEditPanel(service: Service) {
  isEditing.value = true
  editingId.value = service.id
  form.value = {
    name: service.name,
    category: service.category,
    description: service.description || '',
    duration_mins: service.duration_mins,
    price: service.price,
    deposit_amount: service.deposit_amount || 0,
    barber_ids: service.barber_ids || [],
    is_active: service.is_active,
    image_url: service.image_url || '',
  }
  imageFile.value = null
  imagePreview.value = service.image_url || null
  isPanelOpen.value = true
}

// ─── Image handling ──────────────────────────────
function handleImageSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPEG, PNG, and WebP images are allowed')
      return
    }
    imageFile.value = file
    imagePreview.value = URL.createObjectURL(file)
  }
}

function removeImage() {
  imageFile.value = null
  imagePreview.value = null
  form.value.image_url = ''
}

async function uploadImage(): Promise<string | null> {
  if (!imageFile.value) return form.value.image_url || null

  isUploadingImage.value = true
  try {
    const formData = new FormData()
    formData.append('file', imageFile.value)

    const response = await $fetch<{ url: string }>('/api/admin/services/upload-image', {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })

    return response.url
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to upload image')
    return null
  } finally {
    isUploadingImage.value = false
  }
}

// ─── Toggle barber assignment ────────────────────
function toggleBarber(barberId: string) {
  const idx = form.value.barber_ids.indexOf(barberId)
  if (idx === -1) {
    form.value.barber_ids.push(barberId)
  } else {
    form.value.barber_ids.splice(idx, 1)
  }
}

// ─── Save service ────────────────────────────────
async function saveService() {
  if (!form.value.name.trim()) {
    toast.error('Service name is required')
    return
  }
  if (!form.value.duration_mins || form.value.duration_mins < 5) {
    toast.error('Duration must be at least 5 minutes')
    return
  }
  if (!form.value.price || form.value.price <= 0) {
    toast.error('Price must be greater than 0')
    return
  }

  isSaving.value = true
  try {
    // Upload image first if selected
    let imageUrl = form.value.image_url
    if (imageFile.value) {
      const uploadedUrl = await uploadImage()
      if (imageFile.value && !uploadedUrl) {
        isSaving.value = false
        return
      }
      imageUrl = uploadedUrl || ''
    }

    const payload = {
      name: form.value.name.trim(),
      category: form.value.category,
      description: form.value.description.trim() || null,
      duration_mins: form.value.duration_mins,
      price: form.value.price,
      deposit_amount: form.value.deposit_amount > 0 ? form.value.deposit_amount : null,
      barber_ids: form.value.barber_ids,
      is_active: form.value.is_active,
      image_url: imageUrl || null,
    }

    if (isEditing.value && editingId.value) {
      await $fetch(`/api/admin/services/${editingId.value}`, {
        method: 'PATCH',
        body: payload,
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      })
      toast.success('Service updated successfully')
    } else {
      await $fetch('/api/admin/services', {
        method: 'POST',
        body: payload,
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      })
      toast.success('Service created successfully')
    }

    isPanelOpen.value = false
    await fetchServices()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to save service')
  } finally {
    isSaving.value = false
  }
}

// ─── Toggle Active ───────────────────────────────
async function toggleActive(service: Service) {
  try {
    await $fetch(`/api/admin/services/${service.id}`, {
      method: 'PATCH',
      body: { is_active: !service.is_active },
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    await fetchServices()
    toast.success(service.is_active ? 'Service deactivated' : 'Service activated')
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to toggle status')
  }
}

// ─── Delete ──────────────────────────────────────
async function deleteService(service: Service) {
  const ok = await confirm({
    title: 'Delete Service',
    message: `Are you sure you want to delete "${service.name}"? This action cannot be undone.`,
    confirmLabel: 'Delete',
    variant: 'danger',
  })
  if (!ok) return

  try {
    await $fetch(`/api/admin/services/${service.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    toast.success('Service deleted')
    await fetchServices()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to delete service')
  }
}

// ─── Helpers ─────────────────────────────────────
function getCategoryLabel(category: ServiceCategory): string {
  const cat = categories.find(c => c.value === category)
  return cat?.label || category
}

function getCategoryIcon(category: ServiceCategory): string {
  const cat = categories.find(c => c.value === category)
  return cat?.icon || 'lucide:more-horizontal'
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function formatPrice(price: number): string {
  return `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
}

// ─── Init ────────────────────────────────────────
onMounted(async () => {
  await Promise.all([fetchServices(), fetchBarbers()])
})
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <!-- Page Header -->
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Services</h1>
        <p class="mt-1 text-sm text-[var(--color-titanium)]">
          Manage the services your barbershop offers
        </p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Tier limit badge -->
        <span
          class="badge-pill text-[10px]"
          :class="isAtLimit
            ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
            : shopStore.isUpgradedPlan
              ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
              : 'bg-[var(--color-silver)]/30 text-[var(--color-titanium)]'"
        >
          {{ serviceCount }} / {{ tierLimit === Infinity ? '∞' : tierLimit }} services
          {{ shopStore.isUpgradedPlan ? '(Upgraded)' : '(Basic)' }}
        </span>
        <button
          v-if="canManage"
          class="btn-design flex items-center gap-2 bg-[var(--color-deep)] px-4 py-2.5 text-sm text-white hover:bg-[var(--color-deep)]/90"
          :disabled="isAtLimit"
          :class="isAtLimit ? 'cursor-not-allowed opacity-50' : ''"
          @click="openAddPanel"
        >
          <Icon name="lucide:plus" class="h-4 w-4" />
          Add Service
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="space-y-3">
      <div v-for="n in 6" :key="n" class="card-design p-4">
        <div class="flex items-center gap-4">
          <div class="h-12 w-12 animate-pulse rounded-lg bg-[var(--color-silver)]/10" />
          <div class="flex-1 space-y-2">
            <div class="h-4 w-1/3 animate-pulse rounded bg-[var(--color-silver)]/10" />
            <div class="h-3 w-1/4 animate-pulse rounded bg-[var(--color-silver)]/10" />
          </div>
          <div class="h-4 w-16 animate-pulse rounded bg-[var(--color-silver)]/10" />
        </div>
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="fetchError"
      title="Failed to Load Services"
      message="Something went wrong while fetching services. Please try again."
      :retry-fn="fetchServices"
    />

    <!-- Empty State -->
    <EmptyState
      v-else-if="services.length === 0"
      icon="lucide:scissors"
      title="No Services Yet"
      message="Add your first service so customers can book appointments."
      action-label="Add Service"
      :action-fn="canManage ? openAddPanel : undefined"
    />

    <!-- ─── Desktop Table ──────────────────────────── -->
    <div v-else>
      <!-- Desktop view (hidden on mobile) -->
      <div class="hidden overflow-hidden rounded-card border border-[var(--color-silver)]/30 md:block">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-[var(--color-silver)]/30 bg-[var(--color-white)]">
            <tr>
              <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Image</th>
              <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Name</th>
              <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Category</th>
              <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Duration</th>
              <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Price</th>
              <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Status</th>
              <th v-if="canManage" class="px-4 py-3 text-right font-medium text-[var(--color-titanium)]">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--color-silver)]/20">
            <tr
              v-for="service in services"
              :key="service.id"
              class="bg-[var(--color-pure-white)] transition-colors hover:bg-[var(--color-white)]"
              :class="{ 'opacity-50': !service.is_active }"
            >
              <!-- Image -->
              <td class="px-4 py-3">
                <div class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-[var(--color-white)]">
                  <img
                    v-if="service.image_url"
                    :src="service.image_url"
                    :alt="service.name"
                    loading="lazy"
                    class="h-10 w-10 object-cover"
                  />
                  <Icon
                    v-else
                    :name="getCategoryIcon(service.category)"
                    class="h-5 w-5 text-[var(--color-silver)]"
                  />
                </div>
              </td>
              <!-- Name -->
              <td class="px-4 py-3">
                <p class="font-medium text-[var(--color-deep)]">{{ service.name }}</p>
                <p v-if="service.description" class="mt-0.5 truncate max-w-[200px] text-xs text-[var(--color-titanium)]">
                  {{ service.description }}
                </p>
              </td>
              <!-- Category -->
              <td class="px-4 py-3">
                <span class="badge-pill bg-[var(--color-silver)]/20 text-[var(--color-titanium)] text-[10px]">
                  {{ getCategoryLabel(service.category) }}
                </span>
              </td>
              <!-- Duration -->
              <td class="px-4 py-3 text-[var(--color-deep)]">
                {{ formatDuration(service.duration_mins) }}
              </td>
              <!-- Price -->
              <td class="px-4 py-3 font-semibold text-[var(--color-deep)]">
                {{ formatPrice(service.price) }}
              </td>
              <!-- Status -->
              <td class="px-4 py-3">
                <StatusBadge :status="service.is_active ? 'active' : 'inactive'" size="sm" />
              </td>
              <!-- Actions -->
              <td v-if="canManage" class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <button
                    class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]"
                    title="Edit"
                    @click="openEditPanel(service)"
                  >
                    <Icon name="lucide:pencil" class="h-4 w-4" />
                  </button>
                  <button
                    class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
                    :class="service.is_active ? 'hover:text-[var(--color-warning)]' : 'hover:text-[var(--color-success)]'"
                    :title="service.is_active ? 'Deactivate' : 'Activate'"
                    @click="toggleActive(service)"
                  >
                    <Icon
                      :name="service.is_active ? 'lucide:eye-off' : 'lucide:eye'"
                      class="h-4 w-4"
                    />
                  </button>
                  <button
                    class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                    title="Delete"
                    @click="deleteService(service)"
                  >
                    <Icon name="lucide:trash-2" class="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile view (cards, hidden on desktop) -->
      <div class="space-y-3 md:hidden">
        <div
          v-for="service in services"
          :key="service.id"
          class="card-design flex flex-col gap-3 p-4"
          :class="{ 'opacity-50': !service.is_active }"
        >
          <!-- Top row: image + details -->
          <div class="flex items-start gap-3">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--color-white)]">
              <img
                v-if="service.image_url"
                :src="service.image_url"
                :alt="service.name"
                loading="lazy"
                class="h-12 w-12 object-cover"
              />
              <Icon
                v-else
                :name="getCategoryIcon(service.category)"
                class="h-6 w-6 text-[var(--color-silver)]"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-[var(--color-deep)]">{{ service.name }}</p>
                <StatusBadge :status="service.is_active ? 'active' : 'inactive'" size="sm" />
              </div>
              <p class="mt-0.5 text-xs text-[var(--color-titanium)]">
                <span class="badge-pill bg-[var(--color-silver)]/20 text-[10px] text-[var(--color-titanium)]">
                  {{ getCategoryLabel(service.category) }}
                </span>
              </p>
            </div>
          </div>

          <!-- Bottom row: meta + actions -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4 text-sm">
              <span class="flex items-center gap-1 text-[var(--color-titanium)]">
                <Icon name="lucide:clock" class="h-3.5 w-3.5" />
                {{ formatDuration(service.duration_mins) }}
              </span>
              <span class="font-semibold text-[var(--color-deep)]">{{ formatPrice(service.price) }}</span>
            </div>
            <div v-if="canManage" class="flex items-center gap-1">
              <button
                class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]"
                @click="openEditPanel(service)"
              >
                <Icon name="lucide:pencil" class="h-4 w-4" />
              </button>
              <button
                class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
                :class="service.is_active ? 'hover:text-[var(--color-warning)]' : 'hover:text-[var(--color-success)]'"
                @click="toggleActive(service)"
              >
                <Icon :name="service.is_active ? 'lucide:eye-off' : 'lucide:eye'" class="h-4 w-4" />
              </button>
              <button
                class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                @click="deleteService(service)"
              >
                <Icon name="lucide:trash-2" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Slide-over Panel (Add / Edit) ──────────── -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-transform duration-300 ease-out"
        enter-from-class="translate-x-full"
        enter-to-class="translate-x-0"
        leave-active-class="transition-transform duration-200 ease-in"
        leave-from-class="translate-x-0"
        leave-to-class="translate-x-full"
      >
        <div
          v-if="isPanelOpen"
          class="fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col border-l border-[var(--color-silver)]/30 bg-[var(--color-pure-white)] shadow-2xl"
        >
          <!-- Panel Header -->
          <div class="flex items-center justify-between border-b border-[var(--color-silver)]/30 px-6 py-4">
            <h2 class="text-lg font-semibold text-[var(--color-deep)]">
              {{ isEditing ? 'Edit Service' : 'Add Service' }}
            </h2>
            <button
              class="rounded-lg p-2 text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20"
              @click="isPanelOpen = false"
            >
              <Icon name="lucide:x" class="h-5 w-5" />
            </button>
          </div>

          <!-- Panel Body -->
          <div class="flex-1 overflow-y-auto px-6 py-6">
            <!-- Image Upload -->
            <div class="mb-5">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Service Image</label>
              <div v-if="imagePreview" class="relative mb-2 inline-block">
                <img :src="imagePreview" alt="Preview" loading="lazy" class="h-32 w-32 rounded-lg border border-[var(--color-silver)]/50 object-cover" />
                <button
                  class="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-danger)] text-white shadow"
                  @click="removeImage"
                >
                  <Icon name="lucide:x" class="h-3 w-3" />
                </button>
              </div>
              <label
                v-else
                class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-silver)]/50 p-6 text-center hover:border-[var(--color-deep)]/30"
              >
                <Icon name="lucide:upload" class="h-8 w-8 text-[var(--color-silver)]" />
                <span class="text-xs text-[var(--color-titanium)]">Click to upload image (JPG, PNG, WebP, max 5MB)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="handleImageSelect" />
              </label>
            </div>

            <!-- Service Name -->
            <div class="mb-4">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                Service Name <span class="text-[var(--color-danger)]">*</span>
              </label>
              <input
                v-model="form.name"
                type="text"
                placeholder="e.g., Classic Haircut"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              />
            </div>

            <!-- Category -->
            <div class="mb-4">
              <label class="mb-2 block text-sm font-medium text-[var(--color-deep)]">Category</label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="cat in categories"
                  :key="cat.value"
                  class="flex flex-col items-center gap-1 rounded-lg border-2 p-2.5 text-center transition-all"
                  :class="form.category === cat.value
                    ? 'border-[var(--color-deep)] bg-[var(--color-deep)]/5'
                    : 'border-[var(--color-silver)]/50 hover:border-[var(--color-silver)]'"
                  @click="form.category = cat.value"
                >
                  <Icon :name="cat.icon" class="h-4 w-4" :class="form.category === cat.value ? 'text-[var(--color-deep)]' : 'text-[var(--color-titanium)]'" />
                  <span class="text-[10px] font-medium" :class="form.category === cat.value ? 'text-[var(--color-deep)]' : 'text-[var(--color-titanium)]'">{{ cat.label }}</span>
                </button>
              </div>
            </div>

            <!-- Description -->
            <div class="mb-4">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                Description <span class="text-[var(--color-titanium)]">(optional)</span>
              </label>
              <textarea
                v-model="form.description"
                rows="3"
                placeholder="Brief description of the service..."
                class="input-design w-full resize-none border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              />
            </div>

            <!-- Duration & Price row -->
            <div class="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                  Duration (mins) <span class="text-[var(--color-danger)]">*</span>
                </label>
                <input
                  v-model.number="form.duration_mins"
                  type="number"
                  min="5"
                  step="5"
                  placeholder="30"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                  Price (₱) <span class="text-[var(--color-danger)]">*</span>
                </label>
                <input
                  v-model.number="form.price"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="250"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>
            </div>

            <!-- Deposit Amount -->
            <div class="mb-4">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                Deposit Amount (₱) <span class="text-[var(--color-titanium)]">(optional)</span>
              </label>
              <input
                v-model.number="form.deposit_amount"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              />
            </div>

            <!-- Barber Assignment -->
            <div v-if="barbers.length > 0" class="mb-4">
              <label class="mb-2 block text-sm font-medium text-[var(--color-deep)]">
                Assigned Barbers <span class="text-[var(--color-titanium)]">(optional)</span>
              </label>
              <div class="space-y-2 rounded-lg border border-[var(--color-silver)]/30 p-3">
                <label
                  v-for="barber in barbers"
                  :key="barber.id"
                  class="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 transition-colors hover:bg-[var(--color-silver)]/10"
                >
                  <input
                    type="checkbox"
                    :checked="form.barber_ids.includes(barber.id)"
                    class="h-4 w-4 rounded border-[var(--color-silver)] text-[var(--color-deep)] focus:ring-[var(--color-deep)]"
                    @change="toggleBarber(barber.id)"
                  />
                  <span class="text-sm text-[var(--color-deep)]">{{ barber.name }}</span>
                </label>
              </div>
            </div>

            <!-- Active Toggle -->
            <div class="mb-6 flex items-center justify-between">
              <label class="text-sm font-medium text-[var(--color-deep)]">Active</label>
              <button
                class="relative h-6 w-11 rounded-full transition-colors"
                :class="form.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-silver)]'"
                @click="form.is_active = !form.is_active"
              >
                <span
                  class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                  :class="form.is_active ? 'left-[22px]' : 'left-0.5'"
                />
              </button>
            </div>
          </div>

          <!-- Panel Footer -->
          <div class="border-t border-[var(--color-silver)]/30 px-6 py-4">
            <div class="flex gap-3">
              <button
                class="btn-design flex-1 rounded-lg border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm font-medium text-[var(--color-deep)] hover:bg-[var(--color-white)]"
                @click="isPanelOpen = false"
              >
                Cancel
              </button>
              <button
                class="btn-design flex-1 rounded-lg bg-[var(--color-deep)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-deep)]/90 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isSaving || isUploadingImage"
                @click="saveService"
              >
                <Icon v-if="isSaving || isUploadingImage" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
                {{ isEditing ? 'Update Service' : 'Save Service' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Overlay -->
      <Transition
        enter-active-class="transition-opacity duration-300"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isPanelOpen"
          class="fixed inset-0 z-50 bg-black/30"
          @click="isPanelOpen = false"
        />
      </Transition>
    </Teleport>

    <!-- ─── Upgrade Prompt Modal ───────────────────── -->
    <UpgradePrompt
      :is-open="showUpgradePrompt"
      resource="services"
      :current-count="serviceCount"
      :limit="tierLimit === Infinity ? 10 : (tierLimit as number)"
      @close="showUpgradePrompt = false"
      @upgrade="showUpgradePrompt = false; navigateTo('/admin/settings')"
    />

    <!-- ─── Confirm Dialog ─────────────────────────── -->
    <ConfirmDialogComponent />
  </div>
</template>
