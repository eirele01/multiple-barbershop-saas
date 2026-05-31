<script setup lang="ts">
/**
 * /admin/gallery — Gallery CMS Page
 *
 * Masonry-style gallery with upload, edit, and delete capabilities.
 * Tier limit: Basic = 20 images, Upgraded = unlimited.
 *
 * Accessible by: admin, manager
 */
import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'
import { checkTierLimit } from '~/utils/tierLimits'
import type { GalleryImage } from '~/types/database'

definePageMeta({
  layout: 'admin',
  middleware: [
    'auth',
    (to, from) => roleMiddleware('admin', 'manager'),
  ],
})

const authStore = useAuthStore()
const shopStore = useShopStore()
const toast = useToast()
const { confirm, ConfirmDialogComponent } = useConfirm()

// ─── State ────────────────────────────────────────────
const images = ref<GalleryImage[]>([])
const isLoading = ref(true)
const hasError = ref(false)
const isUploading = ref(false)

// Upload modal
const showUploadModal = ref(false)
const uploadFiles = ref<File[]>([])
const uploadPreviews = ref<string[]>([])
const uploadCaption = ref('')
const uploadCategory = ref('')
const uploadTags = ref('')
const uploadProgress = ref<Record<string, number>>({})

// Edit modal
const showEditModal = ref(false)
const editingImage = ref<GalleryImage | null>(null)
const editCaption = ref('')
const editCategory = ref('')
const editTags = ref('')
const isSavingEdit = ref(false)

// Drag state
const isDragging = ref(false)

// ─── Computed ─────────────────────────────────────────
const canManage = computed(() => {
  const role = authStore.role
  return role === 'admin' || role === 'manager'
})

const tierCheck = computed(() => {
  const plan = shopStore.plan || 'basic'
  return checkTierLimit(plan, 'gallery', images.value.length)
})

const isAtLimit = computed(() => !tierCheck.value.allowed)

const countLabel = computed(() => {
  const plan = shopStore.plan || 'basic'
  const isBasic = plan === 'basic'
  const limit = isBasic ? '20' : '∞'
  const planLabel = isBasic ? 'Basic' : 'Upgraded'
  return `${images.value.length} / ${limit} images (${planLabel})`
})

const categoryOptions = [
  'Haircuts',
  'Beard',
  'Color',
  'Shaves',
  'Treatments',
  'Packages',
  'Studio',
  'Other',
]

// ─── Auth helper ──────────────────────────────────────
async function getAuthToken(): Promise<string> {
  const supabase = useSupabase()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

// ─── Fetch images ─────────────────────────────────────
async function fetchImages() {
  isLoading.value = true
  hasError.value = false
  try {
    const data = await $fetch('/api/admin/gallery', {
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    images.value = (data as any)?.data || []
  } catch {
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

// ─── Upload ───────────────────────────────────────────
function openUploadModal() {
  if (isAtLimit.value) {
    toast.error(tierCheck.value.message)
    return
  }
  uploadFiles.value = []
  uploadPreviews.value = []
  uploadCaption.value = ''
  uploadCategory.value = ''
  uploadTags.value = ''
  uploadProgress.value = {}
  showUploadModal.value = true
}

function handleFileDrop(event: DragEvent) {
  isDragging.value = false
  const files = event.dataTransfer?.files
  if (!files) return
  addFiles(files)
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files) return
  addFiles(input.files)
  input.value = ''
}

function addFiles(fileList: FileList) {
  const newFiles = Array.from(fileList)
  const validFiles: File[] = []
  const validPreviews: string[] = []

  for (const file of newFiles) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(`"${file.name}" is not a valid image type. Only JPG, PNG, WebP allowed.`)
      continue
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`"${file.name}" exceeds the 5MB size limit.`)
      continue
    }
    validFiles.push(file)
    validPreviews.push(URL.createObjectURL(file))
  }

  // Check if adding would exceed limit
  const remaining = tierCheck.value.limit === Infinity ? Infinity : tierCheck.value.limit - images.value.length
  if (remaining !== Infinity && uploadFiles.value.length + validFiles.length > remaining) {
    toast.error(`You can only upload ${remaining} more image(s) on the Basic plan.`)
    const allowedFiles = validFiles.slice(0, remaining - uploadFiles.value.length)
    const allowedPreviews = validPreviews.slice(0, remaining - uploadFiles.value.length)
    uploadFiles.value.push(...allowedFiles)
    uploadPreviews.value.push(...allowedPreviews)
    return
  }

  uploadFiles.value.push(...validFiles)
  uploadPreviews.value.push(...validPreviews)
}

function removeUploadFile(index: number) {
  uploadFiles.value.splice(index, 1)
  uploadPreviews.value.splice(index, 1)
}

async function uploadAll() {
  if (uploadFiles.value.length === 0) return

  isUploading.value = true
  uploadProgress.value = {}
  for (let i = 0; i < uploadFiles.value.length; i++) {
    uploadProgress.value[`${i}`] = 0
  }

  try {
    // Simulate per-file progress by uploading files in batches
    const formData = new FormData()
    for (const file of uploadFiles.value) {
      formData.append('files', file)
    }
    formData.append('caption', uploadCaption.value)
    formData.append('category', uploadCategory.value)
    formData.append('tags', uploadTags.value)

    // Simulate progress ticks
    const progressInterval = setInterval(() => {
      for (let i = 0; i < uploadFiles.value.length; i++) {
        const current = uploadProgress.value[`${i}`] || 0
        if (current < 90) {
          uploadProgress.value[`${i}`] = current + Math.random() * 20
        }
      }
    }, 200)

    const response = await $fetch('/api/admin/gallery/upload', {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })

    clearInterval(progressInterval)

    // Mark all as complete
    for (let i = 0; i < uploadFiles.value.length; i++) {
      uploadProgress.value[`${i}`] = 100
    }

    toast.success(`${(response as any)?.count || uploadFiles.value.length} image(s) uploaded successfully`)
    showUploadModal.value = false
    await fetchImages()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to upload images')
  } finally {
    isUploading.value = false
  }
}

// ─── Edit ─────────────────────────────────────────────
function openEditModal(image: GalleryImage) {
  editingImage.value = image
  editCaption.value = image.caption || ''
  editCategory.value = image.category || ''
  editTags.value = (image.tags || []).join(', ')
  showEditModal.value = true
}

async function saveEdit() {
  if (!editingImage.value) return
  isSavingEdit.value = true

  try {
    const tags = editTags.value
      ? editTags.value.split(',').map(t => t.trim()).filter(Boolean)
      : []

    await $fetch(`/api/admin/gallery/${editingImage.value.id}`, {
      method: 'PATCH',
      body: {
        caption: editCaption.value || null,
        category: editCategory.value || null,
        tags,
      },
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })

    toast.success('Image updated')
    showEditModal.value = false
    await fetchImages()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to update image')
  } finally {
    isSavingEdit.value = false
  }
}

// ─── Delete ───────────────────────────────────────────
async function deleteImage(image: GalleryImage) {
  const ok = await confirm({
    title: 'Delete Image',
    message: 'Are you sure you want to delete this image? This action cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'danger',
  })
  if (!ok) return

  try {
    await $fetch(`/api/admin/gallery/${image.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    toast.success('Image deleted')
    await fetchImages()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to delete image')
  }
}

// ─── Lifecycle ────────────────────────────────────────
onMounted(() => {
  if (canManage.value) {
    fetchImages()
  } else {
    navigateTo('/admin/dashboard')
  }
})
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div>
          <h1 class="text-2xl font-bold text-[var(--color-deep)]">Gallery</h1>
          <p class="mt-1 text-sm text-[var(--color-titanium)]">
            Manage your shop's portfolio images
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
        @click="openUploadModal"
      >
        <Icon name="lucide:upload" class="h-4 w-4" />
        Upload Images
      </button>
    </div>

    <!-- Tier Limit Warning -->
    <div v-if="isAtLimit && shopStore.isBasicPlan" class="mb-6">
      <UpgradePrompt
        feature="unlimited gallery images"
        :current-count="images.length"
        :limit="20"
      />
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="columns-2 gap-4 sm:columns-3 lg:columns-4">
      <div v-for="n in 8" :key="n" class="mb-4 break-inside-avoid">
        <div class="rounded-card overflow-hidden bg-[var(--color-silver)]/10">
          <div class="h-48 animate-pulse bg-[var(--color-silver)]/20" :style="{ height: `${120 + Math.random() * 120}px` }" />
          <div class="p-3">
            <div class="h-3 w-2/3 animate-pulse rounded bg-[var(--color-silver)]/20" />
          </div>
        </div>
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="hasError"
      title="Failed to Load Gallery"
      message="Something went wrong while fetching gallery images. Please try again."
      :retry-fn="fetchImages"
    />

    <!-- Empty State -->
    <div
      v-else-if="images.length === 0"
      class="rounded-card border border-dashed border-[var(--color-silver)] p-12 text-center"
    >
      <Icon name="lucide:image" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
      <h3 class="mt-4 text-lg font-semibold text-[var(--color-deep)]">No images yet</h3>
      <p class="mt-2 text-sm text-[var(--color-titanium)]">
        Upload your first portfolio image to showcase your shop's work.
      </p>
      <button
        v-if="canManage"
        class="btn-design mt-6 bg-[var(--color-deep)] px-4 py-2.5 text-sm text-white hover:bg-[var(--color-deep)]/90"
        @click="openUploadModal"
      >
        <Icon name="lucide:upload" class="mr-2 h-4 w-4" />
        Upload Images
      </button>
    </div>

    <!-- Masonry Gallery Grid -->
    <div v-else class="columns-2 gap-4 sm:columns-3 lg:columns-4">
      <div
        v-for="image in images"
        :key="image.id"
        class="group relative mb-4 break-inside-overflow-hidden rounded-card overflow-hidden"
      >
        <img
          :src="image.thumbnail_url || image.url"
          :alt="image.caption || 'Gallery image'"
          loading="lazy"
          class="w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <!-- Hover Overlay -->
        <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div class="flex w-full items-end justify-between p-3">
            <div class="min-w-0 flex-1">
              <p v-if="image.caption" class="truncate text-sm font-medium text-white">
                {{ image.caption }}
              </p>
              <p v-if="image.category" class="text-xs text-white/70">
                {{ image.category }}
              </p>
            </div>
            <div v-if="canManage" class="flex items-center gap-1.5">
              <button
                class="rounded-btn bg-white/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                title="Edit"
                @click="openEditModal(image)"
              >
                <Icon name="lucide:pencil" class="h-3.5 w-3.5" />
              </button>
              <button
                class="rounded-btn bg-[var(--color-danger)]/60 p-2 text-white backdrop-blur-sm transition-colors hover:bg-[var(--color-danger)]/80"
                title="Delete"
                @click="deleteImage(image)"
              >
                <Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        <!-- Caption below image (visible when not hovered) -->
        <div v-if="image.caption" class="bg-[var(--color-pure-white)] px-3 py-2">
          <p class="truncate text-xs text-[var(--color-titanium)]">{{ image.caption }}</p>
        </div>
      </div>
    </div>

    <!-- ─── Upload Modal ─────────────────────────────── -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showUploadModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          @click.self="showUploadModal = false"
        >
          <div class="w-full max-w-lg rounded-xl bg-[var(--color-pure-white)] p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold text-[var(--color-deep)]">Upload Images</h2>
              <button
                class="rounded-lg p-2 text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20"
                @click="showUploadModal = false"
              >
                <Icon name="lucide:x" class="h-5 w-5" />
              </button>
            </div>

            <!-- Drag & Drop Zone -->
            <div
              class="mb-4 rounded-lg border-2 border-dashed p-6 text-center transition-colors"
              :class="isDragging
                ? 'border-[var(--color-deep)] bg-[var(--color-deep)]/5'
                : 'border-[var(--color-silver)]/50 hover:border-[var(--color-deep)]/30'"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleFileDrop"
              @click="($refs.fileInput as HTMLInputElement)?.click()"
            >
              <Icon name="lucide:cloud-upload" class="mx-auto h-10 w-10 text-[var(--color-silver)]" />
              <p class="mt-2 text-sm font-medium text-[var(--color-titanium)]">
                Drag & drop images here, or click to browse
              </p>
              <p class="mt-1 text-xs text-[var(--color-silver)]">
                JPG, PNG, WebP — max 5MB each
              </p>
              <input
                ref="fileInput"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                class="hidden"
                @change="handleFileSelect"
              />
            </div>

            <!-- Selected Files Preview -->
            <div v-if="uploadFiles.length > 0" class="mb-4 max-h-48 space-y-2 overflow-y-auto">
              <div
                v-for="(file, index) in uploadFiles"
                :key="index"
                class="flex items-center gap-3 rounded-lg bg-[var(--color-white)] p-2"
              >
                <img
                  :src="uploadPreviews[index]"
                  :alt="file.name"
                  class="h-12 w-12 rounded object-cover"
                />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium text-[var(--color-deep)]">{{ file.name }}</p>
                  <p class="text-[10px] text-[var(--color-titanium)]">{{ (file.size / 1024 / 1024).toFixed(1) }} MB</p>
                  <!-- Progress bar -->
                  <div v-if="isUploading" class="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--color-silver)]/30">
                    <div
                      class="h-full rounded-full bg-[var(--color-deep)] transition-all duration-300"
                      :style="{ width: `${Math.min(uploadProgress[index] || 0, 100)}%` }"
                    />
                  </div>
                </div>
                <button
                  v-if="!isUploading"
                  class="rounded-lg p-1.5 text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-danger)]"
                  @click="removeUploadFile(index)"
                >
                  <Icon name="lucide:x" class="h-4 w-4" />
                </button>
                <Icon
                  v-else-if="(uploadProgress[index] || 0) >= 100"
                  name="lucide:check-circle"
                  class="h-5 w-5 text-[var(--color-success)]"
                />
                <Icon
                  v-else
                  name="lucide:loader-2"
                  class="h-4 w-4 animate-spin text-[var(--color-deep)]"
                />
              </div>
            </div>

            <!-- Metadata Fields -->
            <div v-if="uploadFiles.length > 0" class="space-y-3">
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Caption</label>
                <input
                  v-model="uploadCaption"
                  type="text"
                  placeholder="e.g., Fade haircut showcase"
                  class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Category</label>
                <select
                  v-model="uploadCategory"
                  class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                >
                  <option value="">No category</option>
                  <option v-for="cat in categoryOptions" :key="cat" :value="cat">{{ cat }}</option>
                </select>
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Tags <span class="text-[var(--color-titanium)]">(comma-separated)</span></label>
                <input
                  v-model="uploadTags"
                  type="text"
                  placeholder="e.g., fade, modern, classic"
                  class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>
            </div>

            <!-- Actions -->
            <div class="mt-6 flex gap-3">
              <button
                class="btn-design flex-1 rounded-lg border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm font-medium text-[var(--color-deep)] hover:bg-[var(--color-white)]"
                :disabled="isUploading"
                @click="showUploadModal = false"
              >
                Cancel
              </button>
              <button
                class="btn-design flex-1 rounded-lg bg-[var(--color-deep)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-deep)]/90 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isUploading || uploadFiles.length === 0"
                @click="uploadAll"
              >
                <Icon v-if="isUploading" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
                Upload All ({{ uploadFiles.length }})
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ─── Edit Modal ───────────────────────────────── -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showEditModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          @click.self="showEditModal = false"
        >
          <div class="w-full max-w-md rounded-xl bg-[var(--color-pure-white)] p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold text-[var(--color-deep)]">Edit Image</h2>
              <button
                class="rounded-lg p-2 text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20"
                @click="showEditModal = false"
              >
                <Icon name="lucide:x" class="h-5 w-5" />
              </button>
            </div>

            <!-- Image Preview -->
            <div v-if="editingImage" class="mb-4 overflow-hidden rounded-lg">
              <img
                :src="editingImage.thumbnail_url || editingImage.url"
                :alt="editingImage.caption || 'Gallery image'"
                class="h-48 w-full object-cover"
              />
            </div>

            <div class="space-y-3">
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Caption</label>
                <input
                  v-model="editCaption"
                  type="text"
                  placeholder="Image caption"
                  class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Category</label>
                <select
                  v-model="editCategory"
                  class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                >
                  <option value="">No category</option>
                  <option v-for="cat in categoryOptions" :key="cat" :value="cat">{{ cat }}</option>
                </select>
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Tags <span class="text-[var(--color-titanium)]">(comma-separated)</span></label>
                <input
                  v-model="editTags"
                  type="text"
                  placeholder="e.g., fade, modern, classic"
                  class="rounded-input w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>
            </div>

            <!-- Actions -->
            <div class="mt-6 flex gap-3">
              <button
                class="btn-design flex-1 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-2.5 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                :disabled="isSavingEdit"
                @click="editingImage && deleteImage(editingImage); showEditModal = false"
              >
                <Icon name="lucide:trash-2" class="mr-1.5 inline h-4 w-4" />
                Delete
              </button>
              <div class="flex flex-1 gap-2">
                <button
                  class="btn-design flex-1 rounded-lg border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-2.5 text-sm font-medium text-[var(--color-deep)] hover:bg-[var(--color-white)]"
                  @click="showEditModal = false"
                >
                  Cancel
                </button>
                <button
                  class="btn-design flex-1 rounded-lg bg-[var(--color-deep)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-deep)]/90 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="isSavingEdit"
                  @click="saveEdit"
                >
                  <Icon v-if="isSavingEdit" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ConfirmDialogComponent />
  </div>
</template>

<style scoped>
/* Masonry layout using CSS columns */
.break-inside-overflow-hidden {
  break-inside: avoid;
}
</style>
