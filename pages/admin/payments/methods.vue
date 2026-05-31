<script setup lang="ts">
/**
 * /admin/payments/methods — Payment Methods CMS
 *
 * Full CRUD interface for managing payment methods.
 * - Drag to reorder (vuedraggable)
 * - Slide-over panel for add/edit
 * - Delete with safety check (referenced methods → deactivate instead)
 *
 * Accessible by: admin, manager
 */

import draggable from 'vuedraggable'
import { useAuthStore } from '~/stores/auth'
import type { PaymentMethod, PaymentMethodCategory } from '~/types/database'

definePageMeta({
  layout: 'admin',
  middleware: [
    'auth',
    (to, from) => roleMiddleware('admin', 'manager'),
  ],
})

const authStore = useAuthStore()
const toast = useToast()

// ─── State ────────────────────────────────────────────
const methods = ref<PaymentMethod[]>([])
const isLoading = ref(true)
const isSaving = ref(false)

// Slide-over panel state
const isPanelOpen = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)

// Delete confirmation state
const showDeleteDialog = ref(false)
const deleteTarget = ref<PaymentMethod | null>(null)
const deleteError = ref<string | null>(null)

// Form state
const form = ref({
  type: 'qr_code' as PaymentMethodCategory,
  name: '',
  qr_code_url: '' as string | null,
  account_name: '',
  account_number: '',
  bank_name: '',
  instructions: '',
  is_active: true,
})

const qrFile = ref<File | null>(null)
const qrPreview = ref<string | null>(null)
const isUploadingQr = ref(false)

// ─── Role check ──────────────────────────────────────
const canManage = computed(() => {
  const role = authStore.role
  return role === 'admin' || role === 'manager'
})

// Redirect if not allowed
onMounted(() => {
  if (!canManage.value) {
    navigateTo('/admin/dashboard')
    return
  }
  fetchMethods()
})

// ─── Fetch methods ───────────────────────────────────
async function fetchMethods() {
  isLoading.value = true
  try {
    const data = await $fetch('/api/admin/payment-methods', {
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    methods.value = (data as any)?.data || []
  } catch (e) {
    toast.error('Failed to load payment methods')
  } finally {
    isLoading.value = false
  }
}

async function getAuthToken(): Promise<string> {
  const supabase = useSupabase()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

// ─── Type selector labels ─────────────────────────────
const typeOptions = [
  { value: 'qr_code' as PaymentMethodCategory, icon: 'lucide:qr-code', label: 'QR Code', desc: 'Scan to pay' },
  { value: 'bank_account' as PaymentMethodCategory, icon: 'lucide:landmark', label: 'Bank Account', desc: 'Bank transfer' },
  { value: 'e_wallet' as PaymentMethodCategory, icon: 'lucide:wallet', label: 'E-Wallet', desc: 'GCash, Maya, etc.' },
]

// ─── Open Add Panel ──────────────────────────────────
function openAddPanel() {
  isEditing.value = false
  editingId.value = null
  form.value = {
    type: 'qr_code',
    name: '',
    qr_code_url: null,
    account_name: '',
    account_number: '',
    bank_name: '',
    instructions: '',
    is_active: true,
  }
  qrFile.value = null
  qrPreview.value = null
  isPanelOpen.value = true
}

// ─── Open Edit Panel ─────────────────────────────────
function openEditPanel(method: PaymentMethod) {
  isEditing.value = true
  editingId.value = method.id
  form.value = {
    type: method.type,
    name: method.name,
    qr_code_url: method.qr_code_url,
    account_name: method.account_name || '',
    account_number: method.account_number || '',
    bank_name: method.bank_name || '',
    instructions: method.instructions || '',
    is_active: method.is_active,
  }
  qrFile.value = null
  qrPreview.value = method.qr_code_url
  isPanelOpen.value = true
}

// ─── QR Image handling ──────────────────────────────
function handleQrFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    if (file.size > 2 * 1024 * 1024) {
      toast.error('QR image must be less than 2MB')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPEG, PNG, and WebP images are allowed')
      return
    }
    qrFile.value = file
    qrPreview.value = URL.createObjectURL(file)
  }
}

function removeQrImage() {
  qrFile.value = null
  qrPreview.value = null
  form.value.qr_code_url = null
}

async function uploadQrImage(): Promise<string | null> {
  if (!qrFile.value) return form.value.qr_code_url

  isUploadingQr.value = true
  try {
    const formData = new FormData()
    formData.append('file', qrFile.value)

    const response = await $fetch<{ url: string }>('/api/admin/payment-methods/upload-qr', {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })

    return response.url
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to upload QR image')
    return null
  } finally {
    isUploadingQr.value = false
  }
}

// ─── Save (create or update) ─────────────────────────
async function saveMethod() {
  // Validate type-specific fields
  if (!form.value.name.trim()) {
    toast.error('Method name is required')
    return
  }

  if (form.value.type === 'qr_code' || form.value.type === 'e_wallet') {
    if (!form.value.account_name.trim()) {
      toast.error('Account name is required')
      return
    }
    if (!form.value.account_number.trim()) {
      toast.error('Account number is required')
      return
    }
  }

  if (form.value.type === 'bank_account') {
    if (!form.value.bank_name.trim()) {
      toast.error('Bank name is required')
      return
    }
    if (!form.value.account_name.trim()) {
      toast.error('Account name is required')
      return
    }
    if (!form.value.account_number.trim()) {
      toast.error('Account number is required')
      return
    }
  }

  isSaving.value = true

  try {
    // Upload QR image first if needed
    let qrUrl = form.value.qr_code_url
    if (qrFile.value && (form.value.type === 'qr_code' || form.value.type === 'e_wallet')) {
      qrUrl = await uploadQrImage()
      if (!qrUrl) {
        isSaving.value = false
        return
      }
    }

    const payload = {
      ...form.value,
      qr_code_url: (form.value.type === 'qr_code' || form.value.type === 'e_wallet') ? qrUrl : null,
      bank_name: form.value.type === 'bank_account' ? form.value.bank_name : null,
      instructions: form.value.instructions || null,
    }

    if (isEditing.value && editingId.value) {
      // Update
      await $fetch(`/api/admin/payment-methods/${editingId.value}`, {
        method: 'PATCH',
        body: payload,
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      })
      toast.success('Payment method updated')
    } else {
      // Create
      await $fetch('/api/admin/payment-methods', {
        method: 'POST',
        body: payload,
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      })
      toast.success('Payment method created')
    }

    isPanelOpen.value = false
    await fetchMethods()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to save payment method')
  } finally {
    isSaving.value = false
  }
}

// ─── Toggle Active ───────────────────────────────────
async function toggleActive(method: PaymentMethod) {
  try {
    await $fetch(`/api/admin/payment-methods/${method.id}`, {
      method: 'PATCH',
      body: { is_active: !method.is_active },
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    await fetchMethods()
    toast.success(method.is_active ? 'Payment method deactivated' : 'Payment method activated')
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to toggle status')
  }
}

// ─── Delete ──────────────────────────────────────────
function confirmDelete(method: PaymentMethod) {
  deleteTarget.value = method
  deleteError.value = null
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!deleteTarget.value) return

  try {
    await $fetch(`/api/admin/payment-methods/${deleteTarget.value.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    toast.success('Payment method deleted')
    showDeleteDialog.value = false
    await fetchMethods()
  } catch (e: any) {
    if (e.statusCode === 409) {
      deleteError.value = e.data?.statusMessage || 'This payment method has been used in existing bookings.'
    } else {
      toast.error(e.data?.statusMessage || 'Failed to delete payment method')
    }
  }
}

async function deactivateInstead() {
  if (!deleteTarget.value) return
  await toggleActive(deleteTarget.value)
  showDeleteDialog.value = false
  deleteError.value = null
}

// ─── Drag & Drop Reorder ─────────────────────────────
function onReorderEnd() {
  // Optimistic UI: the list is already reordered visually
  // Now persist to server
  const items = methods.value.map((m, index) => ({
    id: m.id,
    sort_order: index,
  }))

  $fetch('/api/admin/payment-methods/reorder', {
    method: 'PATCH',
    body: { items },
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  }).catch((e) => {
    toast.error('Failed to save reorder')
    fetchMethods() // Revert
  })
}
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Payment Methods</h1>
        <p class="mt-1 text-sm text-[var(--color-titanium)]">
          Manage how your customers can pay for bookings
        </p>
      </div>
      <button
        v-if="canManage"
        class="btn-design flex items-center gap-2 bg-[var(--color-deep)] px-4 py-2.5 text-sm text-white hover:bg-[var(--color-deep)]/90"
        @click="openAddPanel"
      >
        <Icon name="lucide:plus" class="h-4 w-4" />
        Add Payment Method
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <Icon name="lucide:loader-2" class="h-8 w-8 animate-spin text-[var(--color-titanium)]" />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="methods.length === 0"
      class="rounded-card border border-dashed border-[var(--color-silver)] p-12 text-center"
    >
      <Icon name="lucide:credit-card" class="mx-auto h-12 w-12 text-[var(--color-silver)]" />
      <h3 class="mt-4 text-lg font-semibold text-[var(--color-deep)]">No payment methods yet</h3>
      <p class="mt-2 text-sm text-[var(--color-titanium)]">
        Add your first payment method so customers can pay for their bookings.
      </p>
      <button
        v-if="canManage"
        class="btn-design mt-6 bg-[var(--color-deep)] px-4 py-2.5 text-sm text-white hover:bg-[var(--color-deep)]/90"
        @click="openAddPanel"
      >
        <Icon name="lucide:plus" class="mr-2 h-4 w-4" />
        Add Payment Method
      </button>
    </div>

    <!-- Payment Methods List -->
    <div v-else class="space-y-3">
      <draggable
        v-model="methods"
        item-key="id"
        handle=".drag-handle"
        ghost-class="opacity-30"
        animation="200"
        @end="onReorderEnd"
      >
        <template #item="{ element: method }">
          <div class="card-design group mb-3 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
            <!-- Drag Handle -->
            <div
              v-if="canManage"
              class="drag-handle cursor-grab text-[var(--color-silver)] hover:text-[var(--color-titanium)] active:cursor-grabbing"
            >
              <Icon name="lucide:grip-vertical" class="h-5 w-5" />
            </div>

            <!-- Icon / Thumbnail -->
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--color-white)]">
              <img
                v-if="method.type === 'qr_code' && method.qr_code_url"
                :src="method.qr_code_url"
                alt="QR Code"
                loading="lazy"
                class="h-10 w-10 rounded object-cover"
              />
              <Icon
                v-else-if="method.type === 'bank_account'"
                name="lucide:landmark"
                class="h-6 w-6 text-[var(--color-titanium)]"
              />
              <Icon
                v-else
                name="lucide:wallet"
                class="h-6 w-6 text-[var(--color-titanium)]"
              />
            </div>

            <!-- Details -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate text-sm font-semibold text-[var(--color-deep)]">
                  {{ method.name }}
                </p>
                <StatusBadge :status="method.is_active ? 'active' : 'inactive'" size="sm" />
              </div>
              <p class="mt-0.5 break-words text-xs text-[var(--color-titanium)]">
                <template v-if="method.type === 'bank_account'">
                  {{ method.bank_name }} &middot; {{ method.account_name }} &middot; {{ method.account_number }}
                </template>
                <template v-else>
                  {{ method.account_name }} &middot; {{ method.account_number }}
                </template>
              </p>
              <p v-if="method.instructions" class="mt-0.5 text-xs text-[var(--color-silver)]">
                {{ method.instructions }}
              </p>
            </div>

            <!-- Actions -->
            <div v-if="canManage" class="flex items-center gap-2 self-end sm:self-auto">
              <button
                class="rounded-lg p-2.5 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]"
                title="Edit"
                @click="openEditPanel(method)"
              >
                <Icon name="lucide:pencil" class="h-4 w-4" />
              </button>
              <button
                class="rounded-lg p-2.5 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
                :class="method.is_active ? 'hover:text-[var(--color-warning)]' : 'hover:text-[var(--color-success)]'"
                :title="method.is_active ? 'Deactivate' : 'Activate'"
                @click="toggleActive(method)"
              >
                <Icon
                  :name="method.is_active ? 'lucide:eye-off' : 'lucide:eye'"
                  class="h-4 w-4"
                />
              </button>
              <button
                class="rounded-lg p-2.5 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                title="Delete"
                @click="confirmDelete(method)"
              >
                <Icon name="lucide:trash-2" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </template>
      </draggable>
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
              {{ isEditing ? 'Edit Payment Method' : 'Add Payment Method' }}
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
            <!-- Type Selector (3 cards) -->
            <div class="mb-6">
              <label class="mb-2 block text-sm font-medium text-[var(--color-deep)]">Type</label>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  v-for="opt in typeOptions"
                  :key="opt.value"
                  class="flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-all"
                  :class="form.type === opt.value
                    ? 'border-[var(--color-deep)] bg-[var(--color-deep)]/5'
                    : 'border-[var(--color-silver)]/50 hover:border-[var(--color-silver)]'"
                  @click="form.type = opt.value"
                >
                  <Icon :name="opt.icon" class="h-6 w-6" :class="form.type === opt.value ? 'text-[var(--color-deep)]' : 'text-[var(--color-titanium)]'" />
                  <span class="text-xs font-medium" :class="form.type === opt.value ? 'text-[var(--color-deep)]' : 'text-[var(--color-titanium)]'">{{ opt.label }}</span>
                </button>
              </div>
            </div>

            <!-- Method Name -->
            <div class="mb-4">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                {{ form.type === 'bank_account' ? 'Bank Name' : 'Method Name' }} <span class="text-[var(--color-danger)]">*</span>
              </label>
              <input
                v-model="form.name"
                type="text"
                :placeholder="form.type === 'bank_account' ? 'e.g., BPI, BDO' : 'e.g., GCash, Maya'"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              />
            </div>

            <!-- QR Code Image (for qr_code and e_wallet) -->
            <div v-if="form.type === 'qr_code' || form.type === 'e_wallet'" class="mb-4">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                QR Code Image
              </label>
              <div v-if="qrPreview" class="relative mb-2 inline-block">
                <img :src="qrPreview" alt="QR Preview" loading="lazy" class="h-32 w-32 rounded-lg border border-[var(--color-silver)]/50 object-cover" />
                <button
                  class="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-danger)] text-white shadow"
                  @click="removeQrImage"
                >
                  <Icon name="lucide:x" class="h-3 w-3" />
                </button>
              </div>
              <label
                v-else
                class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-silver)]/50 p-6 text-center hover:border-[var(--color-deep)]/30"
              >
                <Icon name="lucide:upload" class="h-8 w-8 text-[var(--color-silver)]" />
                <span class="text-xs text-[var(--color-titanium)]">Click to upload QR image (max 2MB)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="handleQrFileSelect" />
              </label>
            </div>

            <!-- Account Name -->
            <div v-if="form.type !== 'qr_code' || form.type === 'qr_code' || form.type === 'e_wallet'" class="mb-4">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                Account Name <span class="text-[var(--color-danger)]">*</span>
              </label>
              <input
                v-model="form.account_name"
                type="text"
                placeholder="e.g., Juan Dela Cruz"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              />
            </div>

            <!-- Account Number -->
            <div class="mb-4">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                Account Number <span class="text-[var(--color-danger)]">*</span>
              </label>
              <input
                v-model="form.account_number"
                type="text"
                placeholder="e.g., 0917-123-4567"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              />
            </div>

            <!-- Bank Name (only for bank_account) -->
            <div v-if="form.type === 'bank_account'" class="mb-4">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                Bank Name <span class="text-[var(--color-danger)]">*</span>
              </label>
              <input
                v-model="form.bank_name"
                type="text"
                placeholder="e.g., BPI, BDO, Metrobank"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              />
            </div>

            <!-- Instructions -->
            <div class="mb-4">
              <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                Instructions <span class="text-[var(--color-titanium)]">(optional, max 200 chars)</span>
              </label>
              <textarea
                v-model="form.instructions"
                rows="3"
                maxlength="200"
                placeholder="e.g., Send payment to this account and upload the receipt."
                class="input-design w-full resize-none border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
              />
              <p class="mt-1 text-right text-[10px] text-[var(--color-titanium)]">
                {{ form.instructions.length }}/200
              </p>
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
                class="btn-design flex-1 rounded-lg bg-[var(--color-deep)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-deep)]/90"
                :disabled="isSaving"
                @click="saveMethod"
              >
                <Icon v-if="isSaving" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
                {{ isEditing ? 'Update Method' : 'Save Payment Method' }}
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

    <!-- ─── Delete Confirmation Dialog ────────────────── -->
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
          v-if="showDeleteDialog"
          class="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          @click.self="showDeleteDialog = false"
        >
          <div class="w-full max-w-sm rounded-xl bg-[var(--color-pure-white)] p-6 shadow-xl">
            <!-- Normal delete confirmation -->
            <template v-if="!deleteError">
              <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger)]/10">
                <Icon name="lucide:trash-2" class="h-6 w-6 text-[var(--color-danger)]" />
              </div>
              <h3 class="text-center text-lg font-semibold text-[var(--color-deep)]">Delete Payment Method</h3>
              <p class="mt-2 text-center text-sm text-[var(--color-titanium)]">
                Are you sure you want to delete <strong>{{ deleteTarget?.name }}</strong>? This action cannot be undone.
              </p>
              <div class="mt-6 flex gap-3">
                <button
                  class="btn-design flex-1 rounded-lg border border-[var(--color-silver)]/50 px-4 py-2.5 text-sm font-medium text-[var(--color-deep)]"
                  @click="showDeleteDialog = false"
                >
                  Cancel
                </button>
                <button
                  class="btn-design flex-1 rounded-lg bg-[var(--color-danger)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-danger)]/90"
                  @click="handleDelete"
                >
                  Delete
                </button>
              </div>
            </template>

            <!-- Used in bookings — offer deactivation -->
            <template v-else>
              <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-warning)]/10">
                <Icon name="lucide:alert-triangle" class="h-6 w-6 text-[var(--color-warning)]" />
              </div>
              <h3 class="text-center text-lg font-semibold text-[var(--color-deep)]">Cannot Delete</h3>
              <p class="mt-2 text-center text-sm text-[var(--color-titanium)]">
                {{ deleteError }}
              </p>
              <div class="mt-6 flex flex-col gap-2">
                <button
                  class="btn-design w-full rounded-lg bg-[var(--color-warning)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-warning)]/90"
                  @click="deactivateInstead"
                >
                  Deactivate Instead
                </button>
                <button
                  class="btn-design w-full rounded-lg border border-[var(--color-silver)]/50 px-4 py-2.5 text-sm font-medium text-[var(--color-deep)]"
                  @click="showDeleteDialog = false; deleteError = null"
                >
                  Cancel
                </button>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
