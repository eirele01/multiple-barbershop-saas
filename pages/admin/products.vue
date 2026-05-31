<script setup lang="ts">
/**
 * /admin/products — Products CMS Page
 *
 * Table view with add/edit slide-over panel.
 * Tier limit: Basic = 10 products, Upgraded = unlimited.
 *
 * Accessible by: admin, manager, cashier (read-only + stock updates)
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'
import { checkTierLimit } from '~/utils/tierLimits'
import type { Product } from '~/types/database'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const toast = useToast()
const { confirm, ConfirmDialogComponent } = useConfirm()

// ─── State ────────────────────────────────────────────
const products = ref<Product[]>([])
const isLoading = ref(true)
const hasError = ref(false)

// Slide-over panel state
const isPanelOpen = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const isSaving = ref(false)

// Form state
const form = ref({
  name: '',
  description: '',
  category: '',
  sku: '',
  price: 0,
  cost_price: null as number | null,
  stock: 0,
  low_stock_threshold: 5,
  is_active: true,
})

const formImageFiles = ref<File[]>([])
const formImagePreviews = ref<string[]>([])
const formExistingImageUrls = ref<string[]>([])
const isUploadingImages = ref(false)

// ─── Computed ─────────────────────────────────────────
const canManage = computed(() => {
  const role = authStore.role
  return role === 'admin' || role === 'manager'
})

const canDelete = computed(() => authStore.role === 'admin')

const tierCheck = computed(() => {
  const plan = shopStore.plan || 'basic'
  return checkTierLimit(plan, 'products', products.value.length)
})

const isAtLimit = computed(() => !tierCheck.value.allowed)

const countLabel = computed(() => {
  const plan = shopStore.plan || 'basic'
  const isBasic = plan === 'basic'
  const limit = isBasic ? '10' : '∞'
  const planLabel = isBasic ? 'Basic' : 'Upgraded'
  return `${products.value.length} / ${limit} products (${planLabel})`
})

// ─── Auth helper ──────────────────────────────────────
async function getAuthToken(): Promise<string> {
  const supabase = useSupabase()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

// ─── Fetch products ───────────────────────────────────
async function fetchProducts() {
  isLoading.value = true
  hasError.value = false
  try {
    const data = await $fetch('/api/admin/products', {
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    products.value = (data as any)?.data || []
  } catch {
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

// ─── Open Add Panel ───────────────────────────────────
function openAddPanel() {
  if (isAtLimit.value) {
    toast.error(tierCheck.value.message)
    return
  }
  isEditing.value = false
  editingId.value = null
  form.value = {
    name: '',
    description: '',
    category: '',
    sku: '',
    price: 0,
    cost_price: null,
    stock: 0,
    low_stock_threshold: 5,
    is_active: true,
  }
  formImageFiles.value = []
  formImagePreviews.value = []
  formExistingImageUrls.value = []
  isPanelOpen.value = true
}

// ─── Open Edit Panel ──────────────────────────────────
function openEditPanel(product: Product) {
  isEditing.value = true
  editingId.value = product.id
  form.value = {
    name: product.name,
    description: product.description || '',
    category: product.category || '',
    sku: product.sku || '',
    price: product.price,
    cost_price: product.cost_price,
    stock: product.stock,
    low_stock_threshold: product.low_stock_threshold,
    is_active: product.is_active,
  }
  formImageFiles.value = []
  formImagePreviews.value = []
  formExistingImageUrls.value = [...(product.image_urls || [])]
  isPanelOpen.value = true
}

// ─── Image handling ───────────────────────────────────
function handleImageSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files) return

  for (const file of Array.from(input.files)) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(`"${file.name}" is not a valid image type`)
      continue
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`"${file.name}" exceeds the 5MB size limit`)
      continue
    }
    formImageFiles.value.push(file)
    formImagePreviews.value.push(URL.createObjectURL(file))
  }
  input.value = ''
}

function removeNewImage(index: number) {
  formImageFiles.value.splice(index, 1)
  formImagePreviews.value.splice(index, 1)
}

function removeExistingImage(index: number) {
  formExistingImageUrls.value.splice(index, 1)
}

// ─── Save (create or update) ──────────────────────────
async function saveProduct() {
  if (!form.value.name.trim()) {
    toast.error('Product name is required')
    return
  }
  if (form.value.price < 0) {
    toast.error('Price must be 0 or greater')
    return
  }

  isSaving.value = true

  try {
    if (formImageFiles.value.length > 0) {
      // Use multipart form data for file uploads
      const formData = new FormData()

      const payload = {
        name: form.value.name,
        description: form.value.description || null,
        category: form.value.category || null,
        price: form.value.price,
        cost_price: form.value.cost_price,
        sku: form.value.sku || null,
        stock: form.value.stock,
        low_stock_threshold: form.value.low_stock_threshold,
        is_active: form.value.is_active,
        image_urls: formExistingImageUrls.value,
      }

      // Auto-generate SKU for new products if blank
      if (!isEditing.value && (!payload.sku || payload.sku.trim() === '')) {
        payload.sku = `PRD-${Date.now()}`
      }

      formData.append('data', JSON.stringify(payload))
      for (const file of formImageFiles.value) {
        formData.append('files', file)
      }

      if (isEditing.value && editingId.value) {
        await $fetch(`/api/admin/products/${editingId.value}`, {
          method: 'PATCH',
          body: formData,
          headers: { Authorization: `Bearer ${await getAuthToken()}` },
        })
        toast.success('Product updated')
      } else {
        await $fetch('/api/admin/products', {
          method: 'POST',
          body: formData,
          headers: { Authorization: `Bearer ${await getAuthToken()}` },
        })
        toast.success('Product created')
      }
    } else {
      // No files — use JSON body
      const payload = {
        name: form.value.name,
        description: form.value.description || null,
        category: form.value.category || null,
        price: form.value.price,
        cost_price: form.value.cost_price,
        sku: form.value.sku || null,
        stock: form.value.stock,
        low_stock_threshold: form.value.low_stock_threshold,
        is_active: form.value.is_active,
        image_urls: formExistingImageUrls.value,
      }

      if (!isEditing.value && (!payload.sku || payload.sku.trim() === '')) {
        payload.sku = `PRD-${Date.now()}`
      }

      if (isEditing.value && editingId.value) {
        await $fetch(`/api/admin/products/${editingId.value}`, {
          method: 'PATCH',
          body: payload,
          headers: { Authorization: `Bearer ${await getAuthToken()}` },
        })
        toast.success('Product updated')
      } else {
        await $fetch('/api/admin/products', {
          method: 'POST',
          body: payload,
          headers: { Authorization: `Bearer ${await getAuthToken()}` },
        })
        toast.success('Product created')
      }
    }

    isPanelOpen.value = false
    await fetchProducts()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to save product')
  } finally {
    isSaving.value = false
  }
}

// ─── Toggle Active ────────────────────────────────────
async function toggleActive(product: Product) {
  try {
    await $fetch(`/api/admin/products/${product.id}`, {
      method: 'PATCH',
      body: { is_active: !product.is_active },
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    await fetchProducts()
    toast.success(product.is_active ? 'Product deactivated' : 'Product activated')
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to toggle status')
  }
}

// ─── Delete ───────────────────────────────────────────
async function deleteProduct(product: Product) {
  const ok = await confirm({
    title: 'Delete Product',
    message: `Delete "${product.name}"? This action cannot be undone.`,
    confirmLabel: 'Delete',
    variant: 'danger',
  })
  if (!ok) return

  try {
    await $fetch(`/api/admin/products/${product.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    toast.success('Product deleted')
    await fetchProducts()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to delete product')
  }
}

// ─── Helpers ──────────────────────────────────────────
function formatPrice(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function isLowStock(product: Product): boolean {
  return product.stock <= product.low_stock_threshold
}

// ─── Lifecycle ────────────────────────────────────────
onMounted(() => {
  fetchProducts()
})
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div>
          <h1 class="text-2xl font-bold text-[var(--color-deep)]">Products</h1>
          <p class="mt-1 text-sm text-[var(--color-titanium)]">
            Manage your shop's retail products
          </p>
        </div>
        <span class="badge-pill bg-[var(--color-deep)]/10 text-xs font-medium text-[var(--color-deep)]">
          {{ countLabel }}
        </span>
      </div>
      <button
        v-if="canManage"
        class="btn-design flex items-center gap-2 bg-[var(--color-deep)] px-4 py-2.5 text-sm text-white hover:bg-[var(--color-deep)]/90"
        :disabled="isAtLimit"
        @click="openAddPanel"
      >
        <Icon name="lucide:plus" class="h-4 w-4" />
        Add Product
      </button>
    </div>

    <!-- Tier Limit Warning -->
    <div v-if="isAtLimit && shopStore.isBasicPlan" class="mb-6">
      <UpgradePrompt
        feature="unlimited products"
        :current-count="products.length"
        :limit="10"
      />
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="space-y-3">
      <div v-for="n in 5" :key="n" class="card-design p-4">
        <div class="flex items-center gap-4">
          <div class="h-12 w-12 animate-pulse rounded-lg bg-[var(--color-silver)]/20" />
          <div class="flex-1 space-y-2">
            <div class="h-4 w-1/3 animate-pulse rounded bg-[var(--color-silver)]/20" />
            <div class="h-3 w-1/4 animate-pulse rounded bg-[var(--color-silver)]/10" />
          </div>
        </div>
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="hasError"
      title="Failed to Load Products"
      message="Something went wrong while fetching products. Please try again."
      :retry-fn="fetchProducts"
    />

    <!-- Empty State -->
    <div
      v-else-if="products.length === 0"
      class="rounded-card border border-dashed border-[var(--color-silver)] p-12 text-center"
    >
      <Icon name="lucide:package" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
      <h3 class="mt-4 text-lg font-semibold text-[var(--color-deep)]">No products yet</h3>
      <p class="mt-2 text-sm text-[var(--color-titanium)]">
        Add your first product to start managing inventory.
      </p>
      <button
        v-if="canManage"
        class="btn-design mt-6 bg-[var(--color-deep)] px-4 py-2.5 text-sm text-white hover:bg-[var(--color-deep)]/90"
        @click="openAddPanel"
      >
        <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
        Add Product
      </button>
    </div>

    <!-- Products Table -->
    <div v-else class="overflow-x-auto rounded-card border border-[var(--color-silver)]/30 bg-[var(--color-pure-white)]">
      <table class="w-full min-w-[700px] text-left text-sm">
        <thead class="border-b border-[var(--color-silver)]/30 bg-[var(--color-white)]">
          <tr>
            <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Image</th>
            <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Name</th>
            <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">SKU</th>
            <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Price ₱</th>
            <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Cost ₱</th>
            <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Stock</th>
            <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Status</th>
            <th class="px-4 py-3 font-medium text-[var(--color-titanium)]">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-silver)]/20">
          <tr
            v-for="product in products"
            :key="product.id"
            class="transition-colors hover:bg-[var(--color-white)]/50"
            :class="{ 'opacity-50': !product.is_active }"
          >
            <!-- Image -->
            <td class="px-4 py-3">
              <img
                v-if="product.image_url"
                :src="product.image_url"
                :alt="product.name"
                loading="lazy"
                class="h-10 w-10 rounded-lg object-cover"
              />
              <div
                v-else
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-silver)]/10"
              >
                <Icon name="lucide:package" class="h-5 w-5 text-[var(--color-silver)]" />
              </div>
            </td>
            <!-- Name -->
            <td class="px-4 py-3">
              <p class="font-medium text-[var(--color-deep)]">{{ product.name }}</p>
              <p v-if="product.category" class="text-xs text-[var(--color-titanium)]">{{ product.category }}</p>
            </td>
            <!-- SKU -->
            <td class="px-4 py-3 text-xs text-[var(--color-titanium)]">
              {{ product.sku || '—' }}
            </td>
            <!-- Price -->
            <td class="px-4 py-3 font-medium text-[var(--color-deep)]">
              {{ formatPrice(product.price) }}
            </td>
            <!-- Cost -->
            <td class="px-4 py-3 text-[var(--color-titanium)]">
              {{ product.cost_price ? formatPrice(product.cost_price) : '—' }}
            </td>
            <!-- Stock -->
            <td class="px-4 py-3">
              <span class="font-medium" :class="isLowStock(product) ? 'text-[var(--color-danger)]' : 'text-[var(--color-deep)]'">
                {{ product.stock }}
              </span>
              <span
                v-if="isLowStock(product)"
                class="ml-1.5 badge-pill bg-[var(--color-danger)]/10 text-[10px] text-[var(--color-danger)]"
              >
                LOW STOCK
              </span>
            </td>
            <!-- Status -->
            <td class="px-4 py-3">
              <StatusBadge :status="product.is_active ? 'active' : 'inactive'" size="sm" />
            </td>
            <!-- Actions -->
            <td class="px-4 py-3">
              <div class="flex items-center gap-1">
                <button
                  class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]"
                  title="Edit"
                  @click="openEditPanel(product)"
                >
                  <Icon name="lucide:pencil" class="h-4 w-4" />
                </button>
                <button
                  v-if="canManage"
                  class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
                  :class="product.is_active ? 'hover:text-[var(--color-warning)]' : 'hover:text-[var(--color-success)]'"
                  :title="product.is_active ? 'Deactivate' : 'Activate'"
                  @click="toggleActive(product)"
                >
                  <Icon
                    :name="product.is_active ? 'lucide:eye-off' : 'lucide:eye'"
                    class="h-4 w-4"
                  />
                </button>
                <button
                  v-if="canDelete"
                  class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                  title="Delete"
                  @click="deleteProduct(product)"
                >
                  <Icon name="lucide:trash-2" class="h-4 w-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ─── Slide-over Panel (Add / Edit) ─────────────── -->
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
              {{ isEditing ? 'Edit Product' : 'Add Product' }}
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
            <div class="space-y-4">
              <!-- Product Images -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Product Images</label>
                <p class="mb-2 text-xs text-[var(--color-titanium)]">First image is the primary image</p>

                <!-- Existing images -->
                <div v-if="formExistingImageUrls.length > 0" class="mb-2 flex flex-wrap gap-2">
                  <div
                    v-for="(url, index) in formExistingImageUrls"
                    :key="'existing-' + index"
                    class="group relative"
                  >
                    <img
                      :src="url"
                      :alt="`Image ${index + 1}`"
                      loading="lazy"
                      class="h-16 w-16 rounded-lg border border-[var(--color-silver)]/50 object-cover"
                      :class="{ 'ring-2 ring-[var(--color-deep)]': index === 0 }"
                    />
                    <span
                      v-if="index === 0"
                      class="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-deep)] px-1.5 py-0.5 text-[8px] font-bold text-white"
                    >
                      PRIMARY
                    </span>
                    <button
                      class="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-danger)] text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                      @click="removeExistingImage(index)"
                    >
                      <Icon name="lucide:x" class="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>

                <!-- New image previews -->
                <div v-if="formImagePreviews.length > 0" class="mb-2 flex flex-wrap gap-2">
                  <div
                    v-for="(preview, index) in formImagePreviews"
                    :key="'new-' + index"
                    class="group relative"
                  >
                    <img
                      :src="preview"
                      :alt="`New image ${index + 1}`"
                      class="h-16 w-16 rounded-lg border border-dashed border-[var(--color-deep)]/50 object-cover"
                    />
                    <button
                      class="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-danger)] text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                      @click="removeNewImage(index)"
                    >
                      <Icon name="lucide:x" class="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>

                <!-- Upload button -->
                <label
                  class="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-silver)]/50 p-3 text-sm text-[var(--color-titanium)] transition-colors hover:border-[var(--color-deep)]/30 hover:text-[var(--color-deep)]"
                >
                  <Icon name="lucide:image-plus" class="h-4 w-4" />
                  Add Images
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    class="hidden"
                    @change="handleImageSelect"
                  />
                </label>
              </div>

              <!-- Product Name -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                  Product Name <span class="text-[var(--color-danger)]">*</span>
                </label>
                <input
                  v-model="form.name"
                  type="text"
                  placeholder="e.g., Pomade Classic Hold"
                  class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>

              <!-- Category -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Category</label>
                <input
                  v-model="form.category"
                  type="text"
                  placeholder="e.g., Hair Products, Grooming Kits"
                  class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>

              <!-- Description -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Description</label>
                <textarea
                  v-model="form.description"
                  rows="3"
                  placeholder="Brief product description..."
                  class="rounded-input w-full resize-none border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>

              <!-- SKU -->
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">SKU</label>
                <input
                  v-model="form.sku"
                  type="text"
                  placeholder="Leave blank to auto-generate"
                  class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
                <p class="mt-1 text-[10px] text-[var(--color-titanium)]">Auto-generates as PRD-{timestamp} if left blank</p>
              </div>

              <!-- Price & Cost -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                    Selling Price ₱ <span class="text-[var(--color-danger)]">*</span>
                  </label>
                  <input
                    v-model.number="form.price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                  />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Cost Price ₱</label>
                  <input
                    v-model.number="form.cost_price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                  />
                </div>
              </div>

              <!-- Stock & Threshold -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                    Stock Quantity <span class="text-[var(--color-danger)]">*</span>
                  </label>
                  <input
                    v-model.number="form.stock"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                  />
                </div>
                <div>
                  <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Low Stock Threshold</label>
                  <input
                    v-model.number="form.low_stock_threshold"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="5"
                    class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                  />
                </div>
              </div>

              <!-- Active Toggle -->
              <div class="flex items-center justify-between rounded-lg bg-[var(--color-white)] p-4">
                <div>
                  <p class="text-sm font-medium text-[var(--color-deep)]">Active</p>
                  <p class="text-xs text-[var(--color-titanium)]">Make this product visible to customers</p>
                </div>
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
                :disabled="isSaving || !form.name.trim()"
                @click="saveProduct"
              >
                <Icon v-if="isSaving" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
                {{ isEditing ? 'Update Product' : 'Save Product' }}
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

    <ConfirmDialogComponent />
  </div>
</template>
