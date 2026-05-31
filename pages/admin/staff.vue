<script setup lang="ts">
/**
 * /admin/staff — Team / Staff Management
 *
 * Full CRUD interface for managing staff members.
 * - Card grid view with profile photos and role badges
 * - Slide-over panel for add/edit
 * - Schedule editor for barbers
 * - Tier limit enforcement (Basic = 5 staff)
 *
 * Accessible by: admin, manager
 */

import { useAuthStore } from '~/stores/auth'
import { useShopStore } from '~/stores/shop'
import { checkTierLimit } from '~/utils/tierLimits'
import type { Barber, BarberSchedule, BarberTimeOff, Service, UserRole } from '~/types/database'
import { TIER_LIMITS } from '~/types/database'

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

// ─── State ────────────────────────────────────────────
interface StaffMember {
  id: string
  user_id: string
  display_name: string
  email: string
  phone_number: string | null
  photo_url: string | null
  role: UserRole
  is_active: boolean
  // Barber-specific fields
  barber_id?: string
  bio?: string | null
  specialties?: string[]
  experience_yrs?: number | null
  schedule?: Record<string, BarberSchedule>
  time_off?: BarberTimeOff[]
  is_available?: boolean
  service_ids?: string[]
}

const staff = ref<StaffMember[]>([])
const services = ref<Service[]>([])
const isLoading = ref(true)
const hasError = ref(false)

// Slide-over panel state
const isPanelOpen = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const panelTab = ref<'profile' | 'schedule'>('profile')

// Delete / Deactivate dialog
const showConfirmDialog = ref(false)
const confirmAction = ref<'delete' | 'deactivate'>('delete')
const confirmTarget = ref<StaffMember | null>(null)

// Upgrade prompt
const showUpgradePrompt = ref(false)

// Form state
const form = ref({
  display_name: '',
  email: '',
  phone: '',
  role: 'barber' as UserRole,
  bio: '',
  specialties: [] as string[],
  experience_yrs: null as number | undefined | null,
  is_active: true,
  photo_url: null as string | null,
  // Barber schedule
  schedule: {} as Record<string, BarberSchedule>,
  time_off: [] as BarberTimeOff[],
  service_ids: [] as string[],
})

const photoFile = ref<File | null>(null)
const photoPreview = ref<string | null>(null)
const isUploadingPhoto = ref(false)
const isSaving = ref(false)

// Specialties tag input
const specialtyInput = ref('')

// ─── Role check ──────────────────────────────────────
const canManage = computed(() => {
  const role = authStore.role
  return role === 'admin' || role === 'manager'
})

const isAdmin = computed(() => authStore.role === 'admin')

// ─── Tier limit ──────────────────────────────────────
const tierLimit = computed(() => {
  const plan = shopStore.plan || 'basic'
  return checkTierLimit(plan, 'staff', staff.value.length)
})

const staffLimitLabel = computed(() => {
  const plan = shopStore.plan || 'basic'
  const limit = TIER_LIMITS[plan].staff
  const current = staff.value.length
  if (limit === Infinity) return `${current} staff (Unlimited)`
  return `${current} / ${limit} staff (${plan === 'basic' ? 'Basic' : 'Upgraded'})`
})

// ─── Days of week ────────────────────────────────────
const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

// ─── Time options ────────────────────────────────────
const TIME_OPTIONS = (() => {
  const options: string[] = []
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour = h.toString().padStart(2, '0')
      const min = m.toString().padStart(2, '0')
      options.push(`${hour}:${min}`)
    }
  }
  return options
})()

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
}

// ─── Init ────────────────────────────────────────────
onMounted(async () => {
  if (!canManage.value) {
    navigateTo('/admin/dashboard')
    return
  }
  await Promise.all([fetchStaff(), fetchServices()])
})

// ─── Auth token helper ───────────────────────────────
async function getAuthToken(): Promise<string> {
  const supabase = useSupabase()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

// ─── Fetch staff ─────────────────────────────────────
async function fetchStaff() {
  isLoading.value = true
  hasError.value = false
  try {
    const data = await $fetch('/api/admin/staff', {
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    staff.value = (data as any)?.data || []
  } catch {
    hasError.value = true
    toast.error('Failed to load staff')
  } finally {
    isLoading.value = false
  }
}

// ─── Fetch services (for barber service assignment) ──
async function fetchServices() {
  try {
    const supabase = useSupabase()
    const { data: svcData } = await supabase
      .from('services')
      .select('id, name, category, is_active')
      .eq('shop_id', authStore.shopId || '')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    services.value = (svcData || []) as Service[]
  } catch {
    // Non-critical — services list is optional
  }
}

// ─── Default schedule ────────────────────────────────
function getDefaultSchedule(): Record<string, BarberSchedule> {
  const schedule: Record<string, BarberSchedule> = {}
  for (const day of DAYS_OF_WEEK) {
    schedule[day] = {
      start: '09:00',
      end: '17:00',
      is_working: !['sunday'].includes(day),
      breaks: [],
    }
  }
  return schedule
}

// ─── Open Add Panel ──────────────────────────────────
function openAddPanel() {
  // Check tier limit
  if (!tierLimit.value.allowed) {
    showUpgradePrompt.value = true
    return
  }

  isEditing.value = false
  editingId.value = null
  panelTab.value = 'profile'
  form.value = {
    display_name: '',
    email: '',
    phone: '',
    role: 'barber',
    bio: '',
    specialties: [],
    experience_yrs: null,
    is_active: true,
    photo_url: null,
    schedule: getDefaultSchedule(),
    time_off: [],
    service_ids: [],
  }
  photoFile.value = null
  photoPreview.value = null
  isPanelOpen.value = true
}

// ─── Open Edit Panel ─────────────────────────────────
function openEditPanel(member: StaffMember) {
  isEditing.value = true
  editingId.value = member.user_id
  panelTab.value = 'profile'
  form.value = {
    display_name: member.display_name,
    email: member.email,
    phone: member.phone_number || '',
    role: member.role,
    bio: member.bio || '',
    specialties: member.specialties || [],
    experience_yrs: member.experience_yrs,
    is_active: member.is_active,
    photo_url: member.photo_url,
    schedule: member.schedule || getDefaultSchedule(),
    time_off: member.time_off || [],
    service_ids: member.service_ids || [],
  }
  photoFile.value = null
  photoPreview.value = member.photo_url
  isPanelOpen.value = true
}

// ─── Photo handling ──────────────────────────────────
function handlePhotoSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo must be less than 5MB')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPEG, PNG, and WebP images are allowed')
      return
    }
    photoFile.value = file
    photoPreview.value = URL.createObjectURL(file)
  }
}

function removePhoto() {
  photoFile.value = null
  photoPreview.value = null
  form.value.photo_url = null
}

async function uploadPhoto(): Promise<string | null> {
  if (!photoFile.value) return form.value.photo_url

  isUploadingPhoto.value = true
  try {
    const formData = new FormData()
    formData.append('file', photoFile.value)

    const response = await $fetch<{ url: string }>('/api/admin/staff/upload-photo', {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    return response.url
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to upload photo')
    return null
  } finally {
    isUploadingPhoto.value = false
  }
}

// ─── Specialty tags ──────────────────────────────────
function addSpecialty() {
  const tag = specialtyInput.value.trim()
  if (!tag) return
  if (form.value.specialties.includes(tag)) {
    toast.error('Specialty already added')
    return
  }
  form.value.specialties.push(tag)
  specialtyInput.value = ''
}

function removeSpecialty(index: number) {
  form.value.specialties.splice(index, 1)
}

function onSpecialtyKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addSpecialty()
  }
}

// ─── Schedule helpers ────────────────────────────────
function toggleWorkingDay(day: string) {
  const daySchedule = form.value.schedule[day]
  if (daySchedule) {
    daySchedule.is_working = !daySchedule.is_working
  }
}

function addBreak(day: string) {
  const daySchedule = form.value.schedule[day]
  if (daySchedule) {
    daySchedule.breaks.push({ start: '12:00', end: '13:00' })
  }
}

function removeBreak(day: string, breakIndex: number) {
  const daySchedule = form.value.schedule[day]
  if (daySchedule) {
    daySchedule.breaks.splice(breakIndex, 1)
  }
}

// ─── Time off helpers ────────────────────────────────
function addTimeOff() {
  form.value.time_off.push({
    start_date: '',
    end_date: '',
    reason: '',
  })
}

function removeTimeOff(index: number) {
  form.value.time_off.splice(index, 1)
}

// ─── Service toggle ──────────────────────────────────
function toggleService(serviceId: string) {
  const idx = form.value.service_ids.indexOf(serviceId)
  if (idx >= 0) {
    form.value.service_ids.splice(idx, 1)
  } else {
    form.value.service_ids.push(serviceId)
  }
}

// ─── Save (create or update) ─────────────────────────
async function saveStaff() {
  if (!form.value.display_name.trim()) {
    toast.error('Full name is required')
    return
  }
  if (!form.value.email.trim()) {
    toast.error('Email is required')
    return
  }

  isSaving.value = true

  try {
    // Upload photo first if needed
    let photoUrl = form.value.photo_url
    if (photoFile.value) {
      photoUrl = await uploadPhoto()
      if (photoFile.value && !photoUrl) {
        isSaving.value = false
        return
      }
    }

    const payload = {
      display_name: form.value.display_name.trim(),
      email: form.value.email.trim(),
      phone: form.value.phone.trim() || null,
      role: form.value.role,
      photo_url: photoUrl,
      is_active: form.value.is_active,
      // Barber fields
      bio: form.value.role === 'barber' ? form.value.bio.trim() || null : null,
      specialties: form.value.role === 'barber' ? form.value.specialties : [],
      experience_yrs: form.value.role === 'barber' ? form.value.experience_yrs : null,
      schedule: form.value.role === 'barber' ? form.value.schedule : null,
      time_off: form.value.role === 'barber' ? form.value.time_off : [],
      service_ids: form.value.role === 'barber' ? form.value.service_ids : [],
    }

    if (isEditing.value && editingId.value) {
      await $fetch(`/api/admin/staff/${editingId.value}`, {
        method: 'PATCH',
        body: payload,
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      })
      toast.success('Staff member updated')
    } else {
      await $fetch('/api/admin/staff', {
        method: 'POST',
        body: payload,
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      })
      toast.success('Staff member added')
    }

    isPanelOpen.value = false
    await fetchStaff()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to save staff member')
  } finally {
    isSaving.value = false
  }
}

// ─── Save schedule separately ────────────────────────
async function saveSchedule() {
  if (!editingId.value) return

  isSaving.value = true
  try {
    await $fetch(`/api/admin/staff/${editingId.value}/schedule`, {
      method: 'PATCH',
      body: {
        schedule: form.value.schedule,
        time_off: form.value.time_off,
      },
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    toast.success('Schedule updated')
    isPanelOpen.value = false
    await fetchStaff()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to save schedule')
  } finally {
    isSaving.value = false
  }
}

// ─── Deactivate ──────────────────────────────────────
function confirmDeactivate(member: StaffMember) {
  confirmAction.value = 'deactivate'
  confirmTarget.value = member
  showConfirmDialog.value = true
}

async function handleDeactivate() {
  if (!confirmTarget.value) return
  try {
    await $fetch(`/api/admin/staff/${confirmTarget.value.user_id}`, {
      method: 'PATCH',
      body: { is_active: !confirmTarget.value.is_active },
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    toast.success(confirmTarget.value.is_active ? 'Staff member deactivated' : 'Staff member activated')
    showConfirmDialog.value = false
    await fetchStaff()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to update status')
  }
}

// ─── Delete ──────────────────────────────────────────
function confirmDelete(member: StaffMember) {
  if (!isAdmin.value) return
  confirmAction.value = 'delete'
  confirmTarget.value = member
  showConfirmDialog.value = true
}

async function handleDelete() {
  if (!confirmTarget.value) return
  try {
    await $fetch(`/api/admin/staff/${confirmTarget.value.user_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    })
    toast.success('Staff member removed')
    showConfirmDialog.value = false
    await fetchStaff()
  } catch (e: any) {
    toast.error(e.data?.statusMessage || 'Failed to remove staff member')
  }
}

// ─── Handle confirm dialog ───────────────────────────
function onConfirm() {
  if (confirmAction.value === 'delete') {
    handleDelete()
  } else {
    handleDeactivate()
  }
}

// ─── Role badge colors ───────────────────────────────
function roleBadgeClass(role: string): string {
  switch (role) {
    case 'admin': return 'bg-[var(--color-deep)]/10 text-[var(--color-deep)]'
    case 'manager': return 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
    case 'cashier': return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
    case 'barber': return 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
    default: return 'bg-[var(--color-silver)]/20 text-[var(--color-titanium)]'
  }
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}
</script>

<template>
  <div>
    <!-- Page Header -->
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Team</h1>
        <p class="mt-1 text-sm text-[var(--color-titanium)]">
          Manage your shop staff and barbers
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="badge-pill px-3 py-1 text-xs font-medium bg-[var(--color-white)] text-[var(--color-titanium)]">
          {{ staffLimitLabel }}
        </span>
        <button
          v-if="canManage"
          class="btn-design flex items-center gap-2 bg-[var(--color-deep)] px-4 py-2.5 text-sm text-white hover:bg-[var(--color-deep)]/90"
          @click="openAddPanel"
        >
          <Icon name="lucide:plus" class="h-4 w-4" />
          Add Staff
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="i in 6"
        :key="i"
        class="card-design animate-pulse p-5"
      >
        <div class="flex items-center gap-4">
          <div class="h-14 w-14 rounded-full bg-[var(--color-silver)]/20" />
          <div class="flex-1 space-y-2">
            <div class="h-4 w-3/4 rounded bg-[var(--color-silver)]/20" />
            <div class="h-3 w-1/2 rounded bg-[var(--color-silver)]/20" />
          </div>
        </div>
        <div class="mt-4 space-y-2">
          <div class="h-3 w-full rounded bg-[var(--color-silver)]/20" />
          <div class="h-3 w-2/3 rounded bg-[var(--color-silver)]/20" />
        </div>
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="hasError"
      title="Failed to load staff"
      message="Something went wrong while loading your team. Please try again."
      :retry-fn="fetchStaff"
    />

    <!-- Empty State -->
    <EmptyState
      v-else-if="staff.length === 0"
      icon="lucide:users"
      title="No team members yet"
      message="Add your first staff member to start managing your team."
      action-label="Add Staff"
      :action-fn="openAddPanel"
    />

    <!-- Staff Cards Grid -->
    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="member in staff"
        :key="member.user_id"
        class="card-design group p-5 transition-shadow hover:shadow-md"
      >
        <!-- Card Header: Photo + Name + Role -->
        <div class="flex items-start gap-4">
          <div class="relative shrink-0">
            <img
              v-if="member.photo_url"
              :src="member.photo_url"
              :alt="member.display_name"
              loading="lazy"
              class="h-14 w-14 rounded-full object-cover border-2 border-[var(--color-silver)]/30"
            />
            <div
              v-else
              class="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-deep)]/10 text-lg font-semibold text-[var(--color-deep)]"
            >
              {{ member.display_name?.charAt(0)?.toUpperCase() || '?' }}
            </div>
            <!-- Status dot -->
            <span
              class="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white"
              :class="member.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-titanium)]'"
            />
          </div>

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-[var(--color-deep)]">
              {{ member.display_name }}
            </p>
            <p class="truncate text-xs text-[var(--color-titanium)]">{{ member.email }}</p>
            <span
              class="badge-pill mt-1.5 inline-block px-2 py-0.5 text-[10px] font-medium"
              :class="roleBadgeClass(member.role)"
            >
              {{ roleLabel(member.role) }}
            </span>
          </div>
        </div>

        <!-- Specialties (barbers only) -->
        <div v-if="member.specialties && member.specialties.length > 0" class="mt-3 flex flex-wrap gap-1.5">
          <span
            v-for="spec in member.specialties.slice(0, 4)"
            :key="spec"
            class="badge-pill bg-[var(--color-white)] px-2 py-0.5 text-[10px] text-[var(--color-titanium)]"
          >
            {{ spec }}
          </span>
          <span
            v-if="member.specialties.length > 4"
            class="badge-pill bg-[var(--color-white)] px-2 py-0.5 text-[10px] text-[var(--color-titanium)]"
          >
            +{{ member.specialties.length - 4 }}
          </span>
        </div>

        <!-- Experience (barbers only) -->
        <p
          v-if="member.experience_yrs"
          class="mt-2 text-xs text-[var(--color-titanium)]"
        >
          {{ member.experience_yrs }} yr{{ member.experience_yrs !== 1 ? 's' : '' }} experience
        </p>

        <!-- Card Actions -->
        <div class="mt-4 flex items-center gap-1 border-t border-[var(--color-silver)]/20 pt-3">
          <button
            class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-deep)]"
            title="Edit"
            @click="openEditPanel(member)"
          >
            <Icon name="lucide:pencil" class="h-4 w-4" />
          </button>
          <button
            v-if="member.role === 'barber'"
            class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20 hover:text-[var(--color-info)]"
            title="Schedule"
            @click="openEditPanel(member); panelTab = 'schedule'"
          >
            <Icon name="lucide:calendar" class="h-4 w-4" />
          </button>
          <button
            class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
            :class="member.is_active ? 'hover:text-[var(--color-warning)]' : 'hover:text-[var(--color-success)]'"
            :title="member.is_active ? 'Deactivate' : 'Activate'"
            @click="confirmDeactivate(member)"
          >
            <Icon
              :name="member.is_active ? 'lucide:eye-off' : 'lucide:eye'"
              class="h-4 w-4"
            />
          </button>
          <button
            v-if="isAdmin && member.role !== 'admin'"
            class="rounded-lg p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
            title="Remove"
            @click="confirmDelete(member)"
          >
            <Icon name="lucide:trash-2" class="h-4 w-4" />
          </button>
        </div>
      </div>
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
          class="fixed inset-y-0 right-0 z-[60] flex w-full max-w-lg flex-col border-l border-[var(--color-silver)]/30 bg-[var(--color-pure-white)] shadow-2xl"
        >
          <!-- Panel Header -->
          <div class="flex items-center justify-between border-b border-[var(--color-silver)]/30 px-6 py-4">
            <h2 class="text-lg font-semibold text-[var(--color-deep)]">
              {{ isEditing ? 'Edit Staff Member' : 'Add Staff Member' }}
            </h2>
            <button
              class="rounded-lg p-2 text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20"
              @click="isPanelOpen = false"
            >
              <Icon name="lucide:x" class="h-5 w-5" />
            </button>
          </div>

          <!-- Tab navigation (only show if editing a barber) -->
          <div
            v-if="isEditing && form.role === 'barber'"
            class="flex border-b border-[var(--color-silver)]/30"
          >
            <button
              class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
              :class="panelTab === 'profile' ? 'border-b-2 border-[var(--color-deep)] text-[var(--color-deep)]' : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'"
              @click="panelTab = 'profile'"
            >
              Profile
            </button>
            <button
              class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
              :class="panelTab === 'schedule' ? 'border-b-2 border-[var(--color-deep)] text-[var(--color-deep)]' : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'"
              @click="panelTab = 'schedule'"
            >
              Schedule
            </button>
          </div>

          <!-- Panel Body -->
          <div class="flex-1 overflow-y-auto px-6 py-6">

            <!-- ════════ PROFILE TAB ════════ -->
            <div v-if="panelTab === 'profile'">
              <!-- Profile Photo -->
              <div class="mb-5">
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Profile Photo</label>
                <div v-if="photoPreview" class="relative mb-2 inline-block">
                  <img :src="photoPreview" alt="Photo Preview" loading="lazy" class="h-24 w-24 rounded-full border border-[var(--color-silver)]/50 object-cover" />
                  <button
                    class="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-danger)] text-white shadow"
                    @click="removePhoto"
                  >
                    <Icon name="lucide:x" class="h-3 w-3" />
                  </button>
                </div>
                <label
                  v-else
                  class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-silver)]/50 p-4 text-center hover:border-[var(--color-deep)]/30"
                >
                  <Icon name="lucide:upload" class="h-6 w-6 text-[var(--color-silver)]" />
                  <span class="text-xs text-[var(--color-titanium)]">Click to upload (max 5MB)</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="handlePhotoSelect" />
                </label>
              </div>

              <!-- Full Name -->
              <div class="mb-4">
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                  Full Name <span class="text-[var(--color-danger)]">*</span>
                </label>
                <input
                  v-model="form.display_name"
                  type="text"
                  placeholder="e.g., Juan Dela Cruz"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>

              <!-- Email -->
              <div class="mb-4">
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                  Email <span class="text-[var(--color-danger)]">*</span>
                </label>
                <input
                  v-model="form.email"
                  type="email"
                  placeholder="e.g., juan@example.com"
                  :disabled="isEditing"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)] disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <!-- Role -->
              <div class="mb-4">
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                  Role <span class="text-[var(--color-danger)]">*</span>
                </label>
                <select
                  v-model="form.role"
                  :disabled="isEditing"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="manager">Manager</option>
                  <option value="cashier">Cashier</option>
                  <option value="barber">Barber</option>
                </select>
              </div>

              <!-- Phone -->
              <div class="mb-4">
                <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Phone</label>
                <input
                  v-model="form.phone"
                  type="tel"
                  placeholder="e.g., 0917-123-4567"
                  class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                />
              </div>

              <!-- ─── Barber-specific fields ─── -->
              <template v-if="form.role === 'barber'">
                <div class="mb-4">
                  <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">
                    Bio <span class="text-[var(--color-titanium)]">(shown on public page)</span>
                  </label>
                  <textarea
                    v-model="form.bio"
                    rows="3"
                    maxlength="500"
                    placeholder="Tell customers about this barber..."
                    class="input-design w-full resize-none border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                  />
                  <p class="mt-1 text-right text-[10px] text-[var(--color-titanium)]">
                    {{ form.bio.length }}/500
                  </p>
                </div>

                <!-- Specialties Tag Input -->
                <div class="mb-4">
                  <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Specialties</label>
                  <div class="flex flex-wrap gap-1.5 mb-2">
                    <span
                      v-for="(tag, idx) in form.specialties"
                      :key="idx"
                      class="badge-pill inline-flex items-center gap-1 bg-[var(--color-deep)]/5 px-2.5 py-1 text-xs text-[var(--color-deep)]"
                    >
                      {{ tag }}
                      <button @click="removeSpecialty(idx)" class="hover:text-[var(--color-danger)]">
                        <Icon name="lucide:x" class="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                  <div class="flex gap-2">
                    <input
                      v-model="specialtyInput"
                      type="text"
                      placeholder="e.g., Fade, Hot Towel Shave"
                      class="input-design flex-1 border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                      @keydown="onSpecialtyKeyDown"
                    />
                    <button
                      class="btn-design rounded-lg bg-[var(--color-deep)]/10 px-3 py-2 text-sm text-[var(--color-deep)] hover:bg-[var(--color-deep)]/20"
                      @click="addSpecialty"
                    >
                      <Icon name="lucide:plus" class="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <!-- Years of Experience -->
                <div class="mb-4">
                  <label class="mb-1.5 block text-sm font-medium text-[var(--color-deep)]">Years of Experience</label>
                  <input
                    v-model.number="form.experience_yrs"
                    type="number"
                    min="0"
                    max="50"
                    placeholder="e.g., 5"
                    class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-2.5 text-sm text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none focus:ring-1 focus:ring-[var(--color-deep)]"
                  />
                </div>

                <!-- ─── Weekly Schedule ─── -->
                <div class="mb-4">
                  <div class="mb-3 flex items-center justify-between">
                    <label class="text-sm font-medium text-[var(--color-deep)]">Weekly Schedule</label>
                    <span class="text-xs text-[var(--color-titanium)]">
                      Switch to Schedule tab to edit in detail
                    </span>
                  </div>
                  <div class="space-y-2">
                    <div
                      v-for="day in DAYS_OF_WEEK"
                      :key="day"
                      class="flex items-center gap-3 rounded-lg bg-[var(--color-white)] p-2.5"
                    >
                      <label class="flex items-center gap-2 w-20">
                        <input
                          type="checkbox"
                          :checked="form.schedule[day]?.is_working"
                          class="h-4 w-4 rounded border-[var(--color-silver)] text-[var(--color-deep)] focus:ring-[var(--color-deep)]"
                          @change="toggleWorkingDay(day)"
                        />
                        <span class="text-xs font-medium text-[var(--color-deep)]">{{ DAY_LABELS[day] }}</span>
                      </label>
                      <template v-if="form.schedule[day]?.is_working">
                        <select
                          v-model="form.schedule[day].start"
                          class="input-design rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1 text-xs text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
                        >
                          <option v-for="t in TIME_OPTIONS" :key="t" :value="t">{{ formatTime(t) }}</option>
                        </select>
                        <span class="text-xs text-[var(--color-titanium)]">to</span>
                        <select
                          v-model="form.schedule[day].end"
                          class="input-design rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1 text-xs text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
                        >
                          <option v-for="t in TIME_OPTIONS" :key="t" :value="t">{{ formatTime(t) }}</option>
                        </select>
                      </template>
                      <span v-else class="text-xs text-[var(--color-silver)]">Off</span>
                    </div>
                  </div>
                </div>

                <!-- ─── Time Off ─── -->
                <div class="mb-4">
                  <div class="mb-2 flex items-center justify-between">
                    <label class="text-sm font-medium text-[var(--color-deep)]">Time Off</label>
                    <button
                      class="btn-design flex items-center gap-1 text-xs text-[var(--color-deep)] hover:bg-[var(--color-deep)]/5 px-2 py-1"
                      @click="addTimeOff"
                    >
                      <Icon name="lucide:plus" class="h-3 w-3" />
                      Add Time Off
                    </button>
                  </div>
                  <div v-if="form.time_off.length === 0" class="text-xs text-[var(--color-silver)] py-2">
                    No time off scheduled
                  </div>
                  <div v-else class="space-y-2">
                    <div
                      v-for="(to, idx) in form.time_off"
                      :key="idx"
                      class="flex items-center gap-2 rounded-lg bg-[var(--color-white)] p-2.5"
                    >
                      <input
                        v-model="to.start_date"
                        type="date"
                        class="input-design rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1 text-xs text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
                      />
                      <span class="text-xs text-[var(--color-titanium)]">to</span>
                      <input
                        v-model="to.end_date"
                        type="date"
                        class="input-design rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1 text-xs text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
                      />
                      <input
                        v-model="to.reason"
                        type="text"
                        placeholder="Reason"
                        class="input-design flex-1 rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1 text-xs text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none"
                      />
                      <button
                        class="rounded p-1 text-[var(--color-titanium)] hover:text-[var(--color-danger)]"
                        @click="removeTimeOff(idx)"
                      >
                        <Icon name="lucide:x" class="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- ─── Services this barber can perform ─── -->
                <div class="mb-4">
                  <label class="mb-2 block text-sm font-medium text-[var(--color-deep)]">Services This Barber Can Perform</label>
                  <div v-if="services.length === 0" class="text-xs text-[var(--color-silver)] py-2">
                    No active services configured for your shop yet.
                  </div>
                  <div v-else class="max-h-48 space-y-1.5 overflow-y-auto rounded-lg bg-[var(--color-white)] p-3">
                    <label
                      v-for="svc in services"
                      :key="svc.id"
                      class="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-[var(--color-pure-white)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        :checked="form.service_ids.includes(svc.id)"
                        class="h-4 w-4 rounded border-[var(--color-silver)] text-[var(--color-deep)] focus:ring-[var(--color-deep)]"
                        @change="toggleService(svc.id)"
                      />
                      <span class="text-sm text-[var(--color-deep)]">{{ svc.name }}</span>
                      <span class="ml-auto text-[10px] text-[var(--color-titanium)]">{{ svc.category }}</span>
                    </label>
                  </div>
                </div>
              </template>

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

            <!-- ════════ SCHEDULE TAB ════════ -->
            <div v-if="panelTab === 'schedule' && form.role === 'barber'">
              <!-- Weekly Schedule (detailed with breaks) -->
              <div class="mb-6">
                <label class="mb-3 block text-sm font-medium text-[var(--color-deep)]">Weekly Schedule</label>
                <div class="space-y-3">
                  <div
                    v-for="day in DAYS_OF_WEEK"
                    :key="day"
                    class="rounded-lg border border-[var(--color-silver)]/30 p-3"
                  >
                    <!-- Day header -->
                    <div class="flex items-center gap-3 mb-2">
                      <label class="flex items-center gap-2 min-w-[80px]">
                        <input
                          type="checkbox"
                          :checked="form.schedule[day]?.is_working"
                          class="h-4 w-4 rounded border-[var(--color-silver)] text-[var(--color-deep)] focus:ring-[var(--color-deep)]"
                          @change="toggleWorkingDay(day)"
                        />
                        <span class="text-sm font-medium text-[var(--color-deep)]">{{ DAY_LABELS[day] }}</span>
                      </label>
                      <template v-if="form.schedule[day]?.is_working">
                        <select
                          v-model="form.schedule[day].start"
                          class="input-design rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1 text-xs text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
                        >
                          <option v-for="t in TIME_OPTIONS" :key="t" :value="t">{{ formatTime(t) }}</option>
                        </select>
                        <span class="text-xs text-[var(--color-titanium)]">to</span>
                        <select
                          v-model="form.schedule[day].end"
                          class="input-design rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1 text-xs text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
                        >
                          <option v-for="t in TIME_OPTIONS" :key="t" :value="t">{{ formatTime(t) }}</option>
                        </select>
                      </template>
                      <span v-else class="text-sm text-[var(--color-silver)]">Day Off</span>
                    </div>

                    <!-- Breaks -->
                    <template v-if="form.schedule[day]?.is_working && form.schedule[day]?.breaks?.length > 0">
                      <div class="ml-[80px] space-y-1.5">
                        <div
                          v-for="(brk, bIdx) in form.schedule[day].breaks"
                          :key="bIdx"
                          class="flex items-center gap-2"
                        >
                          <Icon name="lucide:coffee" class="h-3.5 w-3.5 text-[var(--color-titanium)]" />
                          <select
                            v-model="brk.start"
                            class="input-design rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1 text-xs text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
                          >
                            <option v-for="t in TIME_OPTIONS" :key="t" :value="t">{{ formatTime(t) }}</option>
                          </select>
                          <span class="text-xs text-[var(--color-titanium)]">to</span>
                          <select
                            v-model="brk.end"
                            class="input-design rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1 text-xs text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
                          >
                            <option v-for="t in TIME_OPTIONS" :key="t" :value="t">{{ formatTime(t) }}</option>
                          </select>
                          <button
                            class="rounded p-1 text-[var(--color-titanium)] hover:text-[var(--color-danger)]"
                            @click="removeBreak(day, bIdx)"
                          >
                            <Icon name="lucide:x" class="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </template>

                    <!-- Add Break button -->
                    <div v-if="form.schedule[day]?.is_working" class="ml-[80px] mt-1.5">
                      <button
                        class="btn-design flex items-center gap-1 text-xs text-[var(--color-titanium)] hover:text-[var(--color-deep)] px-2 py-1"
                        @click="addBreak(day)"
                      >
                        <Icon name="lucide:plus" class="h-3 w-3" />
                        Add Break
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Time Off -->
              <div class="mb-6">
                <div class="mb-2 flex items-center justify-between">
                  <label class="text-sm font-medium text-[var(--color-deep)]">Time Off</label>
                  <button
                    class="btn-design flex items-center gap-1.5 text-xs bg-[var(--color-deep)]/10 px-3 py-1.5 text-[var(--color-deep)] hover:bg-[var(--color-deep)]/20"
                    @click="addTimeOff"
                  >
                    <Icon name="lucide:plus" class="h-3 w-3" />
                    Add Time Off
                  </button>
                </div>
                <div v-if="form.time_off.length === 0" class="text-xs text-[var(--color-silver)] py-3 text-center">
                  No time off scheduled
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="(to, idx) in form.time_off"
                    :key="idx"
                    class="rounded-lg border border-[var(--color-silver)]/30 p-3"
                  >
                    <div class="flex items-center gap-2">
                      <input
                        v-model="to.start_date"
                        type="date"
                        class="input-design flex-1 rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1.5 text-xs text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
                      />
                      <span class="text-xs text-[var(--color-titanium)]">to</span>
                      <input
                        v-model="to.end_date"
                        type="date"
                        class="input-design flex-1 rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1.5 text-xs text-[var(--color-deep)] focus:border-[var(--color-deep)] focus:outline-none"
                      />
                      <button
                        class="rounded p-1.5 text-[var(--color-titanium)] hover:text-[var(--color-danger)]"
                        @click="removeTimeOff(idx)"
                      >
                        <Icon name="lucide:trash-2" class="h-4 w-4" />
                      </button>
                    </div>
                    <input
                      v-model="to.reason"
                      type="text"
                      placeholder="Reason (e.g., Vacation, Sick leave)"
                      class="input-design mt-2 w-full rounded border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-2 py-1.5 text-xs text-[var(--color-deep)] placeholder:text-[var(--color-silver)] focus:border-[var(--color-deep)] focus:outline-none"
                    />
                  </div>
                </div>
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
                v-if="panelTab === 'schedule' && isEditing"
                class="btn-design flex-1 rounded-lg bg-[var(--color-deep)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-deep)]/90"
                :disabled="isSaving"
                @click="saveSchedule"
              >
                <Icon v-if="isSaving" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
                Save Schedule
              </button>
              <button
                v-else
                class="btn-design flex-1 rounded-lg bg-[var(--color-deep)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-deep)]/90"
                :disabled="isSaving"
                @click="saveStaff"
              >
                <Icon v-if="isSaving" name="lucide:loader-2" class="mr-2 inline h-4 w-4 animate-spin" />
                {{ isEditing ? 'Update Staff' : 'Add Staff' }}
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

    <!-- ─── Confirm Dialog ──────────────────────────────── -->
    <ConfirmDialog
      v-model:model-value="showConfirmDialog"
      :title="confirmAction === 'delete' ? 'Remove Staff Member' : (confirmTarget?.is_active ? 'Deactivate Staff' : 'Activate Staff')"
      :message="confirmAction === 'delete'
        ? `Are you sure you want to remove ${confirmTarget?.display_name}? This action cannot be undone.`
        : (confirmTarget?.is_active
          ? `Deactivate ${confirmTarget?.display_name}? They won't be able to log in or receive bookings.`
          : `Activate ${confirmTarget?.display_name}? They will be able to log in and receive bookings again.`)"
      :confirm-label="confirmAction === 'delete' ? 'Remove' : (confirmTarget?.is_active ? 'Deactivate' : 'Activate')"
      :variant="confirmAction === 'delete' ? 'danger' : 'warning'"
      @confirm="onConfirm"
      @cancel="showConfirmDialog = false"
    />

    <!-- ─── Upgrade Prompt ──────────────────────────────── -->
    <UpgradePrompt
      :is-open="showUpgradePrompt"
      resource="staff"
      :current-count="staff.length"
      :limit="5"
      @close="showUpgradePrompt = false"
      @upgrade="showUpgradePrompt = false; navigateTo('/admin/settings')"
    />
  </div>
</template>
