<script setup lang="ts">
/**
 * /admin/calendar — Calendar view of all bookings
 *
 * Features:
 * - View toggle: Day / Week / Month (default: Week)
 * - Navigation: Prev / Today / Next with current range label
 * - Calendar grid with booking blocks colored by barber
 * - Click booking → detail slide-over
 * - Filters: barber dropdown, status dropdown
 */
import { useAuthStore } from '~/stores/auth'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const authStore = useAuthStore()
const toast = useToast()

// ─── State ────────────────────────────────────────
const isLoading = ref(true)
const hasError = ref(false)
const bookings = ref<any[]>([])
const barbers = ref<any[]>([])
const selectedBooking = ref<any>(null)
const showSlideOver = ref(false)

// View mode
type ViewMode = 'day' | 'week' | 'month'
const viewMode = ref<ViewMode>('week')

// Current date for navigation
const currentDate = ref(new Date())

// Filters
const filterBarberId = ref('')
const filterStatus = ref('')

// Status options
const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
]

// Barber color palette
const barberColors = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-cyan-500', 'bg-orange-500', 'bg-pink-500',
  'bg-teal-500', 'bg-indigo-500',
]
const barberColorMap = ref<Record<string, string>>({})

function getBarberColor(barberId: string): string {
  if (!barberColorMap.value[barberId]) {
    const idx = Object.keys(barberColorMap.value).length % barberColors.length
    barberColorMap.value[barberId] = barberColors[idx]
  }
  return barberColorMap.value[barberId]
}

// ─── Time slots ────────────────────────────────────
const timeSlots: string[] = []
for (let h = 8; h <= 20; h++) {
  timeSlots.push(`${h.toString().padStart(2, '0')}:00`)
  if (h < 20) {
    timeSlots.push(`${h.toString().padStart(2, '0')}:30`)
  }
}

// ─── Date helpers ──────────────────────────────────
function formatDateStr(d: Date): string {
  // Use LOCAL date components, NOT toISOString() which returns UTC.
  // toISOString() shifts the date backwards in timezones ahead of UTC
  // (e.g., midnight in UTC+8 becomes 4PM previous day in UTC).
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getWeekStart(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday start
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function getWeekDays(d: Date): Date[] {
  const start = getWeekStart(d)
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    return day
  })
}

function getMonthDays(d: Date): Date[] {
  const year = d.getFullYear()
  const month = d.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Start from Monday of the week containing the 1st
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - startOffset)

  const days: Date[] = []
  const endDate = new Date(lastDay)
  const endOffset = endDate.getDay() === 0 ? 0 : 7 - endDate.getDay()
  endDate.setDate(lastDay.getDate() + endOffset)

  const current = new Date(startDate)
  while (current <= endDate) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

// ─── Range label ──────────────────────────────────
const rangeLabel = computed(() => {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  if (viewMode.value === 'day') {
    return currentDate.value.toLocaleDateString('en-PH', opts)
  }
  if (viewMode.value === 'week') {
    const days = getWeekDays(currentDate.value)
    const start = days[0].toLocaleDateString('en-PH', opts)
    const end = days[6].toLocaleDateString('en-PH', opts)
    return `${start} — ${end}`
  }
  // Month
  return currentDate.value.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
})

// ─── Navigation ────────────────────────────────────
function goPrev() {
  const d = new Date(currentDate.value)
  if (viewMode.value === 'day') d.setDate(d.getDate() - 1)
  else if (viewMode.value === 'week') d.setDate(d.getDate() - 7)
  else d.setMonth(d.getMonth() - 1)
  currentDate.value = d
  fetchCalendarBookings()
}

function goNext() {
  const d = new Date(currentDate.value)
  if (viewMode.value === 'day') d.setDate(d.getDate() + 1)
  else if (viewMode.value === 'week') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  currentDate.value = d
  fetchCalendarBookings()
}

function goToday() {
  currentDate.value = new Date()
  fetchCalendarBookings()
}

function setView(mode: ViewMode) {
  viewMode.value = mode
  fetchCalendarBookings()
}

// ─── Computed date range for API ──────────────────
const dateRange = computed(() => {
  if (viewMode.value === 'day') {
    const d = formatDateStr(currentDate.value)
    return { startDate: d, endDate: d }
  }
  if (viewMode.value === 'week') {
    const days = getWeekDays(currentDate.value)
    return { startDate: formatDateStr(days[0]), endDate: formatDateStr(days[6]) }
  }
  // Month — get all visible days
  const days = getMonthDays(currentDate.value)
  return { startDate: formatDateStr(days[0]), endDate: formatDateStr(days[days.length - 1]) }
})

// ─── Fetch Bookings ────────────────────────────────
async function fetchCalendarBookings() {
  isLoading.value = true
  hasError.value = false
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token || !authStore.shopId) return

    const params = new URLSearchParams({
      startDate: dateRange.value.startDate,
      endDate: dateRange.value.endDate,
    })
    if (filterBarberId.value) params.set('barberId', filterBarberId.value)
    if (filterStatus.value) params.set('status', filterStatus.value)

    const result = await $fetch(`/api/admin/bookings/calendar?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }) as any

    bookings.value = result.bookings || []

    // Reset and rebuild barber color map
    barberColorMap.value = {}
    for (const b of bookings.value) {
      getBarberColor(b.barber_id)
    }
  } catch (error: any) {
    hasError.value = true
    toast.error('Failed to load calendar bookings')
  } finally {
    isLoading.value = false
  }
}

// ─── Fetch Barbers for Filter ──────────────────────
async function fetchBarbers() {
  try {
    const supabase = useSupabase()
    const shopId = authStore.shopId
    if (!shopId) return

    const { data: barberData } = await supabase
      .from('barbers')
      .select('id, user_id, is_active')
      .eq('shop_id', shopId)
      .eq('is_active', true)

    if (barberData && barberData.length > 0) {
      const userIds = barberData.map(b => b.user_id).filter(Boolean)
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', userIds)

      if (users) {
        const userMap = Object.fromEntries(users.map(u => [u.id, u.display_name]))
        barbers.value = barberData.map(b => ({
          id: b.id,
          name: userMap[b.user_id] || 'Unknown',
        }))
      }
    }
  } catch (error) {
    // Silently fail — filter just won't have options
  }
}

// ─── Booking helpers ───────────────────────────────
function getBookingsForDay(dateStr: string) {
  return bookings.value.filter(b => b.date === dateStr)
}

function getBookingsForSlot(dateStr: string, time: string) {
  // start_time from PostgreSQL is "HH:MM:SS" but our time slots are "HH:MM",
  // so compare only the first 5 characters to match.
  return bookings.value.filter(b => b.date === dateStr && b.start_time?.substring(0, 5) === time)
}

function isToday(dateStr: string): boolean {
  return dateStr === formatDateStr(new Date())
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`
}

function formatPrice(price: number): string {
  return `₱${Number(price).toLocaleString()}`
}

function openBookingDetail(booking: any) {
  selectedBooking.value = booking
  showSlideOver.value = true
}

function closeSlideOver() {
  showSlideOver.value = false
  selectedBooking.value = null
}

// ─── Month view helper ─────────────────────────────
function getMonthBookingsForDay(dateStr: string) {
  return bookings.value.filter(b => b.date === dateStr)
}

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ─── Filter actions ────────────────────────────────
function applyFilters() {
  fetchCalendarBookings()
}

function resetFilters() {
  filterBarberId.value = ''
  filterStatus.value = ''
  fetchCalendarBookings()
}

// ─── Lifecycle ─────────────────────────────────────
onMounted(() => {
  fetchCalendarBookings()
  fetchBarbers()
})

// Watch view mode changes
watch(viewMode, () => {
  fetchCalendarBookings()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-4">
    <!-- Header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--color-deep)]">Calendar</h1>
        <p class="text-sm text-[var(--color-titanium)]">{{ bookings.length }} booking{{ bookings.length !== 1 ? 's' : '' }} in view</p>
      </div>

      <!-- View Toggle -->
      <div class="flex items-center gap-1 rounded-btn border border-[var(--color-silver)]/50 p-1">
        <button
          v-for="mode in (['day', 'week', 'month'] as ViewMode[])"
          :key="mode"
          class="rounded-btn px-3 py-1.5 text-xs font-medium capitalize transition-colors"
          :class="
            viewMode === mode
              ? 'bg-[var(--color-deep)] text-white'
              : 'text-[var(--color-titanium)] hover:text-[var(--color-deep)]'
          "
          @click="setView(mode)"
        >
          {{ mode }}
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="card-design p-3">
      <div class="flex flex-wrap items-center gap-3">
        <!-- Barber filter -->
        <select
          v-model="filterBarberId"
          class="rounded-input border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-1.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
        >
          <option value="">All Barbers</option>
          <option v-for="b in barbers" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <!-- Status filter -->
        <select
          v-model="filterStatus"
          class="rounded-input border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-3 py-1.5 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)]"
        >
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <button
          class="btn-design rounded-btn bg-[var(--color-deep)] px-3 py-1.5 text-xs font-medium text-white"
          @click="applyFilters"
        >
          Apply
        </button>
        <button
          class="rounded-btn border border-[var(--color-silver)]/50 px-3 py-1.5 text-xs text-[var(--color-titanium)] hover:text-[var(--color-deep)]"
          @click="resetFilters"
        >
          Reset
        </button>
      </div>
    </div>

    <!-- Navigation -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <button
          class="rounded-btn border border-[var(--color-silver)]/50 p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/10"
          @click="goPrev"
        >
          <Icon name="lucide:chevron-left" class="h-4 w-4" />
        </button>
        <button
          class="btn-design rounded-btn bg-[var(--color-deep)] px-3 py-1.5 text-xs font-medium text-white"
          @click="goToday"
        >
          Today
        </button>
        <button
          class="rounded-btn border border-[var(--color-silver)]/50 p-2 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/10"
          @click="goNext"
        >
          <Icon name="lucide:chevron-right" class="h-4 w-4" />
        </button>
      </div>
      <h2 class="text-sm font-semibold text-[var(--color-deep)]">{{ rangeLabel }}</h2>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="card-design p-8">
      <div class="flex items-center justify-center gap-3">
        <Icon name="lucide:loader-2" class="h-5 w-5 animate-spin text-[var(--color-titanium)]" />
        <span class="text-sm text-[var(--color-titanium)]">Loading calendar...</span>
      </div>
    </div>

    <!-- Error -->
    <ErrorState
      v-else-if="hasError"
      title="Failed to Load Calendar"
      message="Something went wrong while fetching bookings."
      :retry-fn="fetchCalendarBookings"
    />

    <!-- ═══════════════════════════════════════════ -->
    <!-- WEEK VIEW -->
    <!-- ═══════════════════════════════════════════ -->
    <div v-else-if="viewMode === 'week'" class="card-design overflow-hidden">
      <div class="overflow-x-auto">
        <div class="min-w-[800px]">
          <!-- Day headers -->
          <div class="grid grid-cols-8 border-b border-[var(--color-silver)]/30">
            <div class="p-2 text-xs font-medium text-[var(--color-titanium)]"></div>
            <div
              v-for="(day, idx) in getWeekDays(currentDate)"
              :key="idx"
              class="border-l border-[var(--color-silver)]/20 p-2 text-center"
              :class="isToday(formatDateStr(day)) ? 'bg-[var(--color-info)]/5' : ''"
            >
              <p class="text-[10px] font-medium uppercase text-[var(--color-titanium)]">{{ dayNames[idx] }}</p>
              <p
                class="text-lg font-bold"
                :class="isToday(formatDateStr(day)) ? 'text-[var(--color-info)]' : 'text-[var(--color-deep)]'"
              >
                {{ day.getDate() }}
              </p>
            </div>
          </div>

          <!-- Time slots -->
          <div class="max-h-[600px] overflow-y-auto">
            <div
              v-for="time in timeSlots"
              :key="time"
              class="grid grid-cols-8 border-b border-[var(--color-silver)]/10"
            >
              <!-- Time label -->
              <div class="flex h-12 items-start justify-end pr-2 pt-1">
                <span class="text-[10px] text-[var(--color-titanium)]">{{ formatTime(time) }}</span>
              </div>
              <!-- Day cells -->
              <div
                v-for="(day, idx) in getWeekDays(currentDate)"
                :key="idx"
                class="relative h-12 border-l border-[var(--color-silver)]/10"
                :class="isToday(formatDateStr(day)) ? 'bg-[var(--color-info)]/[0.02]' : ''"
              >
                <template v-for="booking in getBookingsForSlot(formatDateStr(day), time)" :key="booking.id">
                  <button
                    class="absolute inset-x-0.5 top-0.5 z-10 flex items-center gap-1 overflow-hidden rounded px-1.5 py-0.5 text-left transition-opacity hover:opacity-90"
                    :class="getBarberColor(booking.barber_id)"
                    style="color: white; font-size: 10px;"
                    @click="openBookingDetail(booking)"
                  >
                    <span class="truncate font-medium">{{ booking.customer_name }}</span>
                    <span class="truncate opacity-80">{{ booking.service_name }}</span>
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════ -->
    <!-- DAY VIEW -->
    <!-- ═══════════════════════════════════════════ -->
    <div v-else-if="viewMode === 'day'" class="card-design overflow-hidden">
      <div class="max-h-[600px] overflow-y-auto">
        <div
          v-for="time in timeSlots"
          :key="time"
          class="flex border-b border-[var(--color-silver)]/10"
        >
          <!-- Time label -->
          <div class="flex w-20 flex-shrink-0 items-start justify-end pr-3 pt-2">
            <span class="text-xs text-[var(--color-titanium)]">{{ formatTime(time) }}</span>
          </div>
          <!-- Slot area -->
          <div class="flex-1 border-l border-[var(--color-silver)]/10 py-1 pl-2">
            <template v-if="getBookingsForSlot(formatDateStr(currentDate), time).length > 0">
              <button
                v-for="booking in getBookingsForSlot(formatDateStr(currentDate), time)"
                :key="booking.id"
                class="mb-1 flex w-full items-center gap-2 rounded-card px-3 py-2 text-left transition-opacity hover:opacity-90"
                :class="getBarberColor(booking.barber_id)"
                style="color: white;"
                @click="openBookingDetail(booking)"
              >
                <span class="text-sm font-medium">{{ booking.customer_name }}</span>
                <span class="text-xs opacity-80">{{ booking.service_name }}</span>
                <span class="ml-auto text-xs opacity-70">{{ formatTime(booking.start_time) }} - {{ formatTime(booking.end_time) }}</span>
              </button>
            </template>
            <div v-else class="h-12" />
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════ -->
    <!-- MONTH VIEW -->
    <!-- ═══════════════════════════════════════════ -->
    <div v-else class="card-design overflow-hidden">
      <div class="overflow-x-auto">
        <div class="min-w-[800px]">
          <!-- Day headers -->
          <div class="grid grid-cols-7 border-b border-[var(--color-silver)]/30">
            <div
              v-for="dayName in dayNames"
              :key="dayName"
              class="p-2 text-center text-xs font-medium uppercase text-[var(--color-titanium)]"
            >
              {{ dayName }}
            </div>
          </div>

          <!-- Calendar grid -->
          <div class="grid grid-cols-7">
            <div
              v-for="(day, idx) in getMonthDays(currentDate)"
              :key="idx"
              class="min-h-[100px] border-b border-r border-[var(--color-silver)]/10 p-1.5"
              :class="
                isToday(formatDateStr(day))
                  ? 'bg-[var(--color-info)]/5'
                  : day.getMonth() !== currentDate.getMonth()
                    ? 'bg-[var(--color-silver)]/[0.03]'
                    : ''
              "
            >
              <p
                class="mb-1 text-xs font-medium"
                :class="
                  isToday(formatDateStr(day))
                    ? 'text-[var(--color-info)]'
                    : day.getMonth() !== currentDate.getMonth()
                      ? 'text-[var(--color-silver)]'
                      : 'text-[var(--color-deep)]'
                "
              >
                {{ day.getDate() }}
              </p>
              <div class="space-y-0.5">
                <button
                  v-for="booking in getMonthBookingsForDay(formatDateStr(day)).slice(0, 3)"
                  :key="booking.id"
                  class="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] text-white transition-opacity hover:opacity-90"
                  :class="getBarberColor(booking.barber_id)"
                  @click="openBookingDetail(booking)"
                >
                  <span class="truncate font-medium">{{ booking.customer_name }}</span>
                </button>
                <p
                  v-if="getMonthBookingsForDay(formatDateStr(day)).length > 3"
                  class="px-1 text-[10px] text-[var(--color-titanium)]"
                >
                  +{{ getMonthBookingsForDay(formatDateStr(day)).length - 3 }} more
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════ -->
    <!-- BOOKING DETAIL SLIDE-OVER -->
    <!-- ═══════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <!-- Backdrop -->
        <div
          v-if="showSlideOver"
          class="fixed inset-0 z-40 bg-black/30"
          @click="closeSlideOver"
        />
      </Transition>

      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="translate-x-full"
        enter-to-class="translate-x-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="translate-x-0"
        leave-to-class="translate-x-full"
      >
        <div
          v-if="showSlideOver && selectedBooking"
          class="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-[var(--color-pure-white)] shadow-xl"
        >
          <!-- Slide-over header -->
          <div class="flex items-center justify-between border-b border-[var(--color-silver)]/30 px-5 py-4">
            <h3 class="text-base font-bold text-[var(--color-deep)]">Booking Details</h3>
            <button
              class="rounded-full p-1 text-[var(--color-titanium)] transition-colors hover:bg-[var(--color-silver)]/20"
              @click="closeSlideOver"
            >
              <Icon name="lucide:x" class="h-5 w-5" />
            </button>
          </div>

          <!-- Slide-over body -->
          <div class="flex-1 overflow-y-auto p-5 space-y-5">
            <!-- Customer -->
            <div>
              <p class="text-xs font-medium text-[var(--color-titanium)]">Customer</p>
              <p class="mt-0.5 text-sm font-semibold text-[var(--color-deep)]">{{ selectedBooking.customer_name }}</p>
              <p v-if="selectedBooking.customer_phone" class="text-xs text-[var(--color-titanium)]">{{ selectedBooking.customer_phone }}</p>
            </div>

            <!-- Service -->
            <div>
              <p class="text-xs font-medium text-[var(--color-titanium)]">Service</p>
              <p class="mt-0.5 text-sm font-semibold text-[var(--color-deep)]">{{ selectedBooking.service_name }}</p>
              <div class="flex items-center gap-3 text-xs text-[var(--color-titanium)]">
                <span>{{ selectedBooking.service_duration }} min</span>
                <span>{{ formatPrice(selectedBooking.service_price) }}</span>
              </div>
            </div>

            <!-- Barber -->
            <div>
              <p class="text-xs font-medium text-[var(--color-titanium)]">Barber</p>
              <div class="mt-0.5 flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" :class="getBarberColor(selectedBooking.barber_id)" />
                <span class="text-sm font-semibold text-[var(--color-deep)]">{{ selectedBooking.barber_name }}</span>
              </div>
            </div>

            <!-- Date/Time -->
            <div>
              <p class="text-xs font-medium text-[var(--color-titanium)]">Date & Time</p>
              <p class="mt-0.5 text-sm font-semibold text-[var(--color-deep)]">
                {{ new Date(selectedBooking.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) }}
              </p>
              <p class="text-xs text-[var(--color-titanium)]">
                {{ formatTime(selectedBooking.start_time) }} — {{ formatTime(selectedBooking.end_time) }}
              </p>
            </div>

            <!-- Status -->
            <div class="flex gap-4">
              <div>
                <p class="text-xs font-medium text-[var(--color-titanium)]">Status</p>
                <div class="mt-1">
                  <StatusBadge :status="selectedBooking.status" size="sm" />
                </div>
              </div>
              <div>
                <p class="text-xs font-medium text-[var(--color-titanium)]">Payment</p>
                <div class="mt-1">
                  <StatusBadge :status="selectedBooking.payment_status" size="sm" />
                </div>
              </div>
            </div>

            <!-- Amount -->
            <div v-if="selectedBooking.payment_amount" class="rounded-input bg-[var(--color-silver)]/5 p-3">
              <p class="text-xs font-medium text-[var(--color-titanium)]">Amount</p>
              <p class="mt-0.5 text-lg font-bold text-[var(--color-deep)]">{{ formatPrice(selectedBooking.payment_amount) }}</p>
            </div>
          </div>

          <!-- Slide-over footer -->
          <div class="border-t border-[var(--color-silver)]/30 px-5 py-4">
            <NuxtLink
              :to="`/admin/bookings/${selectedBooking.id}`"
              class="btn-design flex w-full items-center justify-center gap-2 rounded-btn bg-[var(--color-deep)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-titanium)]"
              @click="closeSlideOver"
            >
              <Icon name="lucide:external-link" class="h-4 w-4" />
              View Full Details
            </NuxtLink>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
