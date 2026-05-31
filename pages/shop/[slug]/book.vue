<script setup lang="ts">
/**
 * /shop/[slug]/book — 5-Step Booking Wizard
 *
 * Improved: Calendar with month nav, step transitions, mobile sticky CTA,
 * service category filters, time slot grouping, auto-advance, toast notifications,
 * accessibility, and consistent visual design with shop page.
 */
import type { Shop, Service, WorkingHoursDay, PaymentMethod, LoyaltyReward } from '~/types/database'
import type { BarberWithProfile } from '~/composables/useBookingWizard'
import { JS_DAY_TO_NAME } from '~/utils/dayMapping'
import { getTierFromPoints, getTierMultiplier } from '~/utils/loyaltyTierHelper'

definePageMeta({
  layout: 'shop',
})

const route = useRoute()
const slug = route.params.slug as string
const authStore = useAuthStore()
const wizard = useBookingWizard()

// ── Fetch shop data ──
const { data: shopData, error: shopError } = await useFetch<{
  shop: Shop
  services: Service[]
  barbers: BarberWithProfile[]
}>(`/api/shops/${slug}`)

if (shopError.value) {
  throw createError({ statusCode: 404, statusMessage: 'Shop not found' })
}

const shop = computed(() => shopData.value?.shop as Shop)
const services = computed(() => shopData.value?.services || [])
const barbers = computed(() => shopData.value?.barbers || [])

// ── Fetch payment methods ──
const { data: paymentMethodsData } = await useFetch<PaymentMethod[]>(
  `/api/shops/${slug}/payment-methods`,
  { query: { active: 'true' } }
)
const paymentMethods = computed(() => paymentMethodsData.value || [])

// ── URL pre-selection ──
const preselectedServiceId = route.query.service as string | undefined
const preselectedBarberId = route.query.barber as string | undefined

onMounted(() => {
  if (preselectedServiceId) {
    const svc = services.value.find((s) => s.id === preselectedServiceId)
    if (svc) wizard.selectService(svc)
  }
})

watch(() => wizard.selectedService, (svc) => {
  if (svc && preselectedBarberId) {
    const eligibleBarbers = getEligibleBarbers(svc)
    const brb = eligibleBarbers.find((b) => b.id === preselectedBarberId)
    if (brb) wizard.selectBarber(brb)
  }
})

// ── Toast notification system ──
const toastMessage = ref('')
const toastType = ref<'success' | 'error' | 'info'>('info')
const toastVisible = ref(false)
let toastTimeout: ReturnType<typeof setTimeout> | null = null

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) {
  if (toastTimeout) clearTimeout(toastTimeout)
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
  toastTimeout = setTimeout(() => { toastVisible.value = false }, duration)
}

// ── Computed helpers ──
const isUpgraded = computed(() => shop.value?.plan === 'upgraded')
const workingHours = computed(() => (shop.value?.working_hours || []) as WorkingHoursDay[])

function getEligibleBarbers(service: Service | null): BarberWithProfile[] {
  if (!service || !service.barber_ids || service.barber_ids.length === 0) return barbers.value
  return barbers.value.filter((b) => service.barber_ids.includes(b.id))
}

// ── Category labels & filter ──
const categoryLabels: Record<string, string> = {
  haircut: 'Haircut', beard: 'Beard', shave: 'Shave',
  treatment: 'Treatment', package: 'Package', other: 'Other',
}

const serviceCategories = computed(() => {
  const cats = new Set<string>()
  services.value.forEach((s) => { if (s.category) cats.add(s.category) })
  return Array.from(cats)
})

const activeCategory = ref<string | null>(null)
const filteredServices = computed(() => {
  if (!activeCategory.value) return services.value
  return services.value.filter((s) => s.category === activeCategory.value)
})

// ── Format helpers ──
function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`
}

function formatPrice(price: number): string {
  return `₱${price.toLocaleString()}`
}

// ── Time slot grouping ──
const morningSlots = computed(() =>
  wizard.availableSlots.filter((s) => { const h = parseInt(s); return h < 12 })
)
const afternoonSlots = computed(() =>
  wizard.availableSlots.filter((s) => { const h = parseInt(s); return h >= 12 && h < 17 })
)
const eveningSlots = computed(() =>
  wizard.availableSlots.filter((s) => { const h = parseInt(s); return h >= 17 })
)

// ── Step 3: Availability ──
const availabilityError = ref('')

async function fetchAvailability(date: string) {
  if (!shop.value || !wizard.selectedService) return
  wizard.setSlotsLoading(true)
  availabilityError.value = ''
  wizard.selectDate(date)
  wizard.selectTime('')

  try {
    const result = await $fetch<{ slots: string[]; timezone: string }>(
      '/api/bookings/availability',
      {
        params: {
          shopId: shop.value.id,
          barberId: wizard.barberIdForApi,
          date,
          serviceId: wizard.selectedService.id,
        },
      }
    )
    wizard.setAvailableSlots(result.slots || [])
  } catch (err: any) {
    wizard.setAvailableSlots([])
    availabilityError.value = 'Failed to load time slots. Please try again.'
  } finally {
    wizard.setSlotsLoading(false)
  }
}

// ── Step 3: Calendar with month navigation ──
const maxAdvanceDays = computed(() => shop.value?.booking_settings?.max_advance_days || 30)
const today = new Date()
today.setHours(0, 0, 0, 0)

const calendarMonth = ref(today.getMonth())
const calendarYear = ref(today.getFullYear())

// Pre-compute calendar data (avoid creating Date objects in template)
interface CalendarDay {
  date: Date
  dateStr: string
  dayNum: number
  weekday: string
  monthShort: string
  isToday: boolean
  isDisabled: boolean
  isSelected: boolean
}

const calendarDays = computed<CalendarDay[]>(() => {
  const days: CalendarDay[] = []
  const firstOfMonth = new Date(calendarYear.value, calendarMonth.value, 1)
  const lastOfMonth = new Date(calendarYear.value, calendarMonth.value + 1, 0)
  const startDay = firstOfMonth.getDay() // 0=Sunday

  // Previous month padding
  const prevMonthDays = new Date(calendarYear.value, calendarMonth.value, 0).getDate()
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(calendarYear.value, calendarMonth.value - 1, prevMonthDays - i)
    d.setHours(0, 0, 0, 0)
    days.push({
      date: d,
      dateStr: dateToString(d),
      dayNum: d.getDate(),
      weekday: '',
      monthShort: '',
      isToday: false,
      isDisabled: true, // Outside current month
      isSelected: false,
    })
  }

  // Current month days
  for (let day = 1; day <= lastOfMonth.getDate(); day++) {
    const d = new Date(calendarYear.value, calendarMonth.value, day)
    d.setHours(0, 0, 0, 0)
    const dateStr = dateToString(d)
    days.push({
      date: d,
      dateStr,
      dayNum: day,
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      monthShort: d.toLocaleDateString('en-US', { month: 'short' }),
      isToday: d.getTime() === today.getTime(),
      isDisabled: isDateDisabled(d),
      isSelected: wizard.selectedDate === dateStr,
    })
  }

  // Next month padding
  const remaining = 42 - days.length // 6 rows × 7
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(calendarYear.value, calendarMonth.value + 1, i)
    d.setHours(0, 0, 0, 0)
    days.push({
      date: d,
      dateStr: dateToString(d),
      dayNum: i,
      weekday: '',
      monthShort: '',
      isToday: false,
      isDisabled: true,
      isSelected: false,
    })
  }

  return days
})

const calendarMonthLabel = computed(() =>
  new Date(calendarYear.value, calendarMonth.value).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
)

const canPrevMonth = computed(() => {
  const firstVisible = new Date(calendarYear.value, calendarMonth.value, 1)
  return firstVisible > today
})

const canNextMonth = computed(() => {
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() + maxAdvanceDays.value)
  const nextMonthStart = new Date(calendarYear.value, calendarMonth.value + 1, 1)
  return nextMonthStart <= maxDate
})

function prevMonth() {
  if (!canPrevMonth.value) return
  if (calendarMonth.value === 0) {
    calendarMonth.value = 11
    calendarYear.value--
  } else {
    calendarMonth.value--
  }
}

function nextMonth() {
  if (!canNextMonth.value) return
  if (calendarMonth.value === 11) {
    calendarMonth.value = 0
    calendarYear.value++
  } else {
    calendarMonth.value++
  }
}

function isDateDisabled(date: Date): boolean {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  if (d < today) return true
  const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays > maxAdvanceDays.value) return true
  const dayOfWeek = JS_DAY_TO_NAME[d.getDay()]
  const dayHours = workingHours.value.find((wh) => wh.day === dayOfWeek)
  return !dayHours || !dayHours.is_open
}

function dateToString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Auto-advance after time selection ──
watch(() => wizard.selectedTime, (time) => {
  if (time && wizard.currentStep === 3) {
    // Small delay so user sees the selection before advancing
    setTimeout(() => {
      if (wizard.currentStep === 3) wizard.nextStep()
    }, 600)
  }
})

// ── Step 5: Loyalty ──
const customerPoints = ref(0)
const customerTotalEarned = ref(0)
const loyaltyRewards = ref<LoyaltyReward[]>([])

async function fetchLoyaltyData() {
  if (!isUpgraded.value || !authStore.isAuthenticated || !shop.value) return
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const response = await $fetch('/api/customer/loyalty/status', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      params: { shopId: shop.value.id },
    }) as any

    if (response && response.enabled) {
      customerPoints.value = response.balance || 0
      customerTotalEarned.value = response.totalEarned || 0
    }

    const { data: rewards } = await useSupabase()
      .from('loyalty_rewards')
      .select('*')
      .eq('shop_id', shop.value.id)
      .eq('is_active', true)

    loyaltyRewards.value = (rewards || []) as LoyaltyReward[]
  } catch (err) {
    console.error('Failed to fetch loyalty data:', err)
  }
}

watch(() => wizard.currentStep, (step) => {
  if (step === 5) fetchLoyaltyData()
})

// ── Loyalty calculations ──
function getRewardDiscountValue(reward: LoyaltyReward): number {
  if (reward.type === 'discount_fixed') return reward.discount_value || 0
  if (reward.type === 'discount_percent') {
    const svcPrice = wizard.selectedService?.price || 0
    const pctVal = svcPrice * (reward.discount_percent || 0) / 100
    return reward.max_value ? Math.min(pctVal, reward.max_value) : pctVal
  }
  if (reward.type === 'free_service') return wizard.selectedService?.price || 0
  return 0
}

function canAffordReward(reward: LoyaltyReward): boolean {
  return customerPoints.value >= reward.points_required
}

const selectedReward = computed(() => {
  if (!wizard.loyalty.rewardId) return null
  return loyaltyRewards.value.find((r) => r.id === wizard.loyalty.rewardId) || null
})

const loyaltyDiscount = computed(() => {
  if (!wizard.loyalty.usePoints || !selectedReward.value) return 0
  return getRewardDiscountValue(selectedReward.value)
})

const subtotal = computed(() => wizard.selectedService?.price || 0)
const amountDue = computed(() => Math.max(0, subtotal.value - loyaltyDiscount.value))

const pointsPreview = computed(() => {
  if (!shop.value || !wizard.selectedService) return 0
  if (!isUpgraded.value || !shop.value.loyalty_enabled) return 0

  const earnRate = shop.value.loyalty_earn_rate || 1
  const earnBase = shop.value.loyalty_earn_base || 100

  const tierMultiplier = getTierMultiplier(
    customerTotalEarned.value,
    shop.value.loyalty_tiers,
    shop.value.loyalty_tiers_enabled
  )

  return Math.floor((amountDue.value / earnBase) * earnRate * tierMultiplier)
})

const customerTier = computed(() => {
  if (!shop.value) return 'bronze'
  return getTierFromPoints(
    customerTotalEarned.value,
    shop.value.loyalty_tiers,
    shop.value.loyalty_tiers_enabled
  )
})

function onRewardSelect(reward: LoyaltyReward) {
  if (!canAffordReward(reward)) return
  const discount = getRewardDiscountValue(reward)
  wizard.updateLoyalty({
    rewardId: reward.id,
    pointsRedeemed: reward.points_required,
    discountApplied: discount,
  })
}

function toggleUsePoints() {
  if (wizard.loyalty.usePoints) {
    wizard.updateLoyalty({ usePoints: false, rewardId: null, pointsRedeemed: 0, discountApplied: 0 })
  } else {
    wizard.updateLoyalty({ usePoints: true })
  }
}

// ── Step 5: Payment methods ──
const paymongoMethods = computed(() => {
  if (!shop.value) return []
  const methods: { key: string; label: string; icon: string }[] = []
  if (shop.value.gcash_enabled) methods.push({ key: 'gcash_paymongo', label: 'GCash', icon: 'lucide:smartphone' })
  if (shop.value.maya_enabled) methods.push({ key: 'maya_paymongo', label: 'Maya', icon: 'lucide:wallet' })
  if (shop.value.instapay_enabled) methods.push({ key: 'instapay', label: 'InstaPay', icon: 'lucide:banknote' })
  if (shop.value.qr_ph_enabled) methods.push({ key: 'qrph', label: 'QR PH', icon: 'lucide:qr-code' })
  return methods
})

const manualPaymentMethods = computed(() => paymentMethods.value.filter((m) => m.is_active))

const showPayMongo = computed(() => {
  if (!isUpgraded.value) return false
  return shop.value?.paymongo_enabled && paymongoMethods.value.length > 0
})

const showManual = computed(() => {
  if (!isUpgraded.value) return manualPaymentMethods.value.length > 0
  return shop.value?.manual_payment_enabled && manualPaymentMethods.value.length > 0
})

// ── Step 6: Submit booking ──
const submitError = ref('')

async function submitBooking() {
  if (!shop.value || !wizard.selectedService) return
  wizard.setSubmitting(true)
  submitError.value = ''

  try {
    const result = await $fetch<{
      bookingId: string
      bookingRef: string
      status: string
      paymentType: string
      amount: number
      guestAccountCreated: boolean
      guestEmail: string | null
    }>('/api/bookings/create', {
      method: 'POST',
      body: {
        shopId: shop.value.id,
        serviceId: wizard.selectedService.id,
        barberId: wizard.barberIdForApi,
        date: wizard.selectedDate,
        startTime: wizard.selectedTime,
        customerFirstName: authStore.isAuthenticated
          ? (authStore.user?.display_name?.split(' ')[0] || '')
          : wizard.customerInfo.firstName,
        customerLastName: authStore.isAuthenticated
          ? (authStore.user?.display_name?.split(' ').slice(1).join(' ') || '')
          : wizard.customerInfo.lastName,
        customerPhone: authStore.isAuthenticated
          ? (authStore.user?.phone_number || '')
          : wizard.customerInfo.phone,
        customerEmail: authStore.isAuthenticated
          ? (authStore.user?.email || '')
          : wizard.customerInfo.email,
        customerNotes: wizard.customerInfo.notes,
        customerId: authStore.isAuthenticated ? authStore.user?.id : null,
        paymentMethodId: wizard.selectedPaymentMethod?.id || null,
        paymongoMethod: wizard.selectedPayMongoMethod,
        rewardId: wizard.loyalty.rewardId,
        pointsRedeemed: wizard.loyalty.pointsRedeemed,
        discountApplied: wizard.loyalty.discountApplied,
      },
    })

    wizard.setBookingResult(result)

    // If PayMongo → redirect to payment link
    if (result.paymentType === 'paymongo') {
      try {
        const linkResult = await $fetch<{ checkoutUrl: string }>(
          '/api/payments/create-paymongo-link',
          {
            method: 'POST',
            body: {
              bookingId: result.bookingId,
              bookingRef: result.bookingRef,
              shopId: shop.value.id,
              slug,
            },
          }
        )
        window.location.href = linkResult.checkoutUrl
        return
      } catch (err) {
        console.error('PayMongo link creation failed:', err)
        submitError.value = 'Payment link creation failed. Please try again.'
      }
    }

    // Move to step 6 (confirmation)
    wizard.nextStep()
  } catch (err: any) {
    const msg = err?.data?.statusMessage || err?.message || 'Failed to create booking. Please try again.'
    submitError.value = msg
    showToast(msg, 'error', 5000)
  } finally {
    wizard.setSubmitting(false)
  }
}

// ── Guest account created state ──
const guestAccountCreated = ref(false)
const guestEmail = ref('')

// ── Step 6: Manual payment proof upload ──
const proofFile = ref<File | null>(null)
const proofReferenceNumber = ref('')
const proofAmountSent = ref('')
const proofUploading = ref(false)
const proofSubmitted = ref(false)
const proofError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

watch(() => wizard.bookingResult, (result) => {
  if (result) {
    proofAmountSent.value = String(result.amount)
    guestAccountCreated.value = (result as any).guestAccountCreated === true
    guestEmail.value = (result as any).guestEmail || ''
  }
}, { immediate: true })

function handleFileDrop(e: DragEvent) {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (files && files.length > 0) validateAndSetFile(files[0])
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) validateAndSetFile(files[0])
}

function validateAndSetFile(file: File) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
  if (!allowedTypes.includes(file.type)) {
    showToast('Invalid file type. Only JPG, PNG, and PDF files are accepted.', 'error')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('File too large. Maximum size is 5MB.', 'error')
    return
  }
  proofFile.value = file
}

async function submitProof() {
  if (!proofFile.value || !wizard.bookingResult || !shop.value) return
  proofUploading.value = true
  proofError.value = ''

  try {
    const formData = new FormData()
    formData.append('file', proofFile.value)
    formData.append('bookingId', wizard.bookingResult.bookingId)
    formData.append('shopId', shop.value.id)
    if (proofReferenceNumber.value) formData.append('referenceNumber', proofReferenceNumber.value)
    if (proofAmountSent.value) formData.append('amountSent', proofAmountSent.value)

    await $fetch('/api/payments/upload-proof', {
      method: 'POST',
      body: formData,
    })

    proofSubmitted.value = true
    showToast('Payment proof submitted!', 'success')
  } catch (err) {
    proofError.value = 'Failed to upload proof. Please try again.'
    showToast('Failed to upload proof. Please try again.', 'error')
  } finally {
    proofUploading.value = false
  }
}

// ── Copy to clipboard with feedback ──
async function copyToClipboard(text: string, label?: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast(label ? `${label} copied!` : 'Copied to clipboard!', 'success', 2000)
  } catch {
    showToast('Failed to copy', 'error', 2000)
  }
}

// ── Login modal state ──
const showLoginModal = ref(false)
const loginEmail = ref('')
const loginPassword = ref('')
const loginLoading = ref(false)
const loginError = ref('')

async function handleLogin() {
  loginLoading.value = true
  loginError.value = ''
  try {
    await authStore.signIn(loginEmail.value, loginPassword.value)
    showLoginModal.value = false
    showToast('Welcome back!', 'success')
  } catch (err: any) {
    loginError.value = err.message || 'Login failed'
  } finally {
    loginLoading.value = false
  }
}

// ── Step 4: Guest form validation ──
const firstNameError = ref('')
const lastNameError = ref('')
const phoneError = ref('')
const emailError = ref('')

function validateFirstName() {
  const val = wizard.customerInfo.firstName.trim()
  if (!val) { firstNameError.value = 'First name is required'; return false }
  if (val.length < 2) { firstNameError.value = 'First name must be at least 2 characters'; return false }
  firstNameError.value = ''; return true
}

function validateLastName() {
  const val = wizard.customerInfo.lastName.trim()
  if (!val) { lastNameError.value = 'Last name is required'; return false }
  if (val.length < 2) { lastNameError.value = 'Last name must be at least 2 characters'; return false }
  lastNameError.value = ''; return true
}

function validatePhone() {
  const val = wizard.customerInfo.phone.trim()
  if (!val) { phoneError.value = 'Phone number is required'; return false }
  const phoneClean = val.replace(/[\s\-()]/g, '')
  if (!/^(09\d{9}|\+63\d{10}|0\d{10})$/.test(phoneClean)) {
    phoneError.value = 'Enter a valid Philippine phone number (e.g., 0917 123 4567 or +63...)'
    return false
  }
  phoneError.value = ''; return true
}

function validateEmail() {
  const val = wizard.customerInfo.email.trim()
  if (!val) { emailError.value = 'Email address is required'; return false }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { emailError.value = 'Enter a valid email address'; return false }
  emailError.value = ''; return true
}

function validateStep4AndProceed() {
  if (authStore.isAuthenticated) {
    wizard.nextStep()
    return
  }
  const v1 = validateFirstName()
  const v2 = validateLastName()
  const v3 = validatePhone()
  const v4 = validateEmail()
  if (v1 && v2 && v3 && v4) {
    wizard.nextStep()
  }
}

const hasStep4Errors = computed(() =>
  firstNameError.value || lastNameError.value || phoneError.value || emailError.value
)

const canProceedStep4 = computed(() =>
  wizard.canProceedFromStep4 && !hasStep4Errors.value
)

// Clear errors on input
watch(() => wizard.customerInfo.firstName, () => { if (firstNameError.value) firstNameError.value = '' })
watch(() => wizard.customerInfo.lastName, () => { if (lastNameError.value) lastNameError.value = '' })
watch(() => wizard.customerInfo.phone, () => { if (phoneError.value) phoneError.value = '' })
watch(() => wizard.customerInfo.email, () => { if (emailError.value) emailError.value = '' })

// ── Step transition direction ──
const transitionName = computed(() =>
  wizard.slideDirection === 'left' ? 'slide-left' : 'slide-right'
)

// ── Scroll to top on step change ──
watch(() => wizard.currentStep, () => {
  nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
})

// ── Reset wizard on unmount ──
onUnmounted(() => {
  wizard.resetWizard()
  if (toastTimeout) clearTimeout(toastTimeout)
})

// ── Weekday header labels ──
const weekDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
</script>

<template>
  <div>
    <div v-if="shop" class="min-h-screen bg-[var(--color-white)] pb-28 md:pb-8">
    <!-- ──── Progress Bar ──── -->
    <div class="sticky top-0 z-30 border-b border-[var(--color-silver)]/30 bg-[var(--color-pure-white)]/95 backdrop-blur-sm">
      <div class="mx-auto max-w-5xl px-4 py-3 sm:px-6">
        <div class="flex items-center justify-between">
          <!-- Back button -->
          <button
            v-if="wizard.currentStep > 1 && wizard.currentStep <= 6"
            class="flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
            aria-label="Go back to previous step"
            @click="wizard.prevStep()"
          >
            <Icon name="lucide:arrow-left" class="h-4 w-4" />
            <span class="hidden sm:inline">Back</span>
          </button>
          <div v-else />

          <!-- Step indicators -->
          <div class="flex items-center gap-1 sm:gap-2" role="navigation" aria-label="Booking steps">
            <template v-for="(label, idx) in wizard.stepLabels" :key="idx">
              <div class="flex items-center gap-1.5 sm:gap-2">
                <div
                  class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300"
                  :class="{
                    'bg-[var(--color-deep)] text-white scale-110': idx + 1 === wizard.currentStep,
                    'bg-[var(--color-success)] text-white': idx + 1 < wizard.currentStep,
                    'bg-[var(--color-silver)]/30 text-[var(--color-titanium)]': idx + 1 > wizard.currentStep,
                  }"
                  :aria-current="idx + 1 === wizard.currentStep ? 'step' : undefined"
                >
                  <Icon v-if="idx + 1 < wizard.currentStep" name="lucide:check" class="h-3.5 w-3.5" />
                  <span v-else>{{ idx + 1 }}</span>
                </div>
                <span
                  class="hidden text-xs font-medium md:inline"
                  :class="idx + 1 === wizard.currentStep ? 'text-[var(--color-deep)]' : 'text-[var(--color-titanium)]'"
                >
                  {{ label }}
                </span>
              </div>
              <div v-if="idx < wizard.stepLabels.length - 1" class="h-px w-3 bg-[var(--color-silver)]/40 sm:w-6 md:w-8" />
            </template>
          </div>

          <!-- Close / cancel -->
          <NuxtLink
            :to="`/shop/${slug}`"
            class="flex min-h-[44px] items-center text-sm font-medium text-[var(--color-titanium)] transition-colors hover:text-[var(--color-deep)]"
            aria-label="Cancel booking and return to shop"
          >
            <Icon name="lucide:x" class="h-5 w-5" />
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- ──── Toast Notification ──── -->
    <Teleport to="body">
      <Transition name="toast">
        <div
          v-if="toastVisible"
          class="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-btn px-5 py-3 text-sm font-medium shadow-lg"
          :class="{
            'bg-[var(--color-deep)] text-white': toastType === 'info',
            'bg-[var(--color-success)] text-white': toastType === 'success',
            'bg-[var(--color-danger)] text-white': toastType === 'error',
          }"
          role="alert"
        >
          {{ toastMessage }}
        </div>
      </Transition>
    </Teleport>

    <!-- ──── Main Content ──── -->
    <div class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div class="flex gap-8">
        <!-- ──── Wizard Steps ──── -->
        <div class="flex-1 min-w-0">

          <!-- ══════════════════════════════════════════
               STEP 1: SELECT SERVICE
               ══════════════════════════════════════════ -->
          <Transition :name="transitionName" mode="out-in">
          <div v-if="wizard.currentStep === 1" key="step1">
            <h2 class="text-xl font-bold text-[var(--color-deep)]">Select a Service</h2>
            <p class="mt-1 text-sm text-[var(--color-titanium)]">Choose the service you'd like to book</p>

            <!-- Category filter tabs -->
            <div v-if="serviceCategories.length > 1" class="mt-4 flex gap-2 overflow-x-auto pb-1 -webkit-overflow-scrolling-touch">
              <button
                class="shrink-0 rounded-pill px-4 py-1.5 text-xs font-medium transition-all min-h-[36px]"
                :class="!activeCategory
                  ? 'bg-[var(--color-deep)] text-white'
                  : 'bg-[var(--color-silver)]/10 text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20'"
                @click="activeCategory = null"
              >
                All
              </button>
              <button
                v-for="cat in serviceCategories"
                :key="cat"
                class="shrink-0 rounded-pill px-4 py-1.5 text-xs font-medium transition-all min-h-[36px]"
                :class="activeCategory === cat
                  ? 'bg-[var(--color-deep)] text-white'
                  : 'bg-[var(--color-silver)]/10 text-[var(--color-titanium)] hover:bg-[var(--color-silver)]/20'"
                @click="activeCategory = cat"
              >
                {{ categoryLabels[cat] || cat }}
              </button>
            </div>

            <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <button
                v-for="service in filteredServices"
                :key="service.id"
                class="card-design group flex flex-col overflow-hidden p-0 text-left transition-all min-h-[44px]"
                :class="wizard.selectedService?.id === service.id ? 'ring-2 ring-[var(--color-deep)] shadow-lg' : 'hover:shadow-lg hover:-translate-y-0.5'"
                :aria-pressed="wizard.selectedService?.id === service.id"
                @click="wizard.selectService(service)"
              >
                <!-- Image -->
                <div class="relative h-36 overflow-hidden bg-[var(--color-white)]">
                  <img
                    v-if="service.image_url"
                    :src="service.image_url"
                    :alt="service.name"
                    loading="lazy"
                    class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--color-deep)]/5 to-[var(--color-deep)]/10">
                    <Icon name="lucide:scissors" class="h-10 w-10 text-[var(--color-deep)]/30" />
                  </div>
                  <!-- Category badge -->
                  <span
                    v-if="service.category"
                    class="badge-pill absolute top-2 left-2 bg-[var(--color-pure-white)]/90 text-[10px] text-[var(--color-deep)] backdrop-blur-sm"
                  >
                    {{ categoryLabels[service.category] || service.category }}
                  </span>
                  <!-- Selected checkmark -->
                  <Transition name="fade">
                    <div
                      v-if="wizard.selectedService?.id === service.id"
                      class="absolute inset-0 flex items-center justify-center bg-[var(--color-deep)]/20"
                    >
                      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-deep)] shadow-lg">
                        <Icon name="lucide:check" class="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </Transition>
                </div>
                <!-- Info -->
                <div class="flex flex-1 flex-col p-4">
                  <h4 class="text-sm font-semibold text-[var(--color-deep)]">{{ service.name }}</h4>
                  <div class="mt-auto flex items-center justify-between pt-2">
                    <span class="text-base font-bold text-[var(--color-deep)]">{{ formatPrice(service.price) }}</span>
                    <span class="flex items-center gap-1 text-xs text-[var(--color-titanium)]">
                      <Icon name="lucide:clock" class="h-3 w-3" />
                      {{ service.duration_mins }} min
                    </span>
                  </div>
                </div>
              </button>
            </div>

            <!-- Empty state -->
            <div v-if="services.length === 0" class="py-16 text-center">
              <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-silver)]/10">
                <Icon name="lucide:scissors" class="h-8 w-8 text-[var(--color-silver)]" />
              </div>
              <p class="mt-4 text-sm font-medium text-[var(--color-deep)]">No services available yet</p>
              <p class="mt-1 text-xs text-[var(--color-titanium)]">Please check back later</p>
            </div>

            <!-- No results for category -->
            <div v-if="services.length > 0 && filteredServices.length === 0" class="py-12 text-center">
              <Icon name="lucide:filter-x" class="mx-auto h-8 w-8 text-[var(--color-silver)]" />
              <p class="mt-3 text-sm text-[var(--color-titanium)]">No services in this category</p>
            </div>

            <!-- Desktop Continue -->
            <div class="mt-8 hidden justify-end lg:flex">
              <button
                :disabled="!wizard.canProceedFromStep1"
                class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px]"
                @click="wizard.nextStep()"
              >
                Continue
                <Icon name="lucide:arrow-right" class="h-4 w-4" />
              </button>
            </div>
          </div>
          </Transition>

          <!-- ══════════════════════════════════════════
               STEP 2: SELECT BARBER
               ══════════════════════════════════════════ -->
          <Transition :name="transitionName" mode="out-in">
          <div v-if="wizard.currentStep === 2" key="step2">
            <h2 class="text-xl font-bold text-[var(--color-deep)]">Select a Barber</h2>
            <p class="mt-1 text-sm text-[var(--color-titanium)]">Choose who you'd like for your {{ wizard.selectedService?.name }}</p>

            <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <!-- "Any Available Barber" card -->
              <button
                class="card-design flex flex-col items-center p-6 text-center transition-all min-h-[44px]"
                :class="wizard.selectedBarberIsAny ? 'ring-2 ring-[var(--color-deep)] shadow-lg bg-[var(--color-deep)]/5' : 'hover:shadow-lg'"
                :aria-pressed="wizard.selectedBarberIsAny"
                @click="wizard.selectBarber(null, true)"
              >
                <div class="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-deep)]/10 to-[var(--color-deep)]/5">
                  <Icon name="lucide:users" class="h-8 w-8 text-[var(--color-deep)]" />
                </div>
                <h4 class="mt-3 text-sm font-semibold text-[var(--color-deep)]">Any Available Barber</h4>
                <p class="mt-1 text-xs text-[var(--color-titanium)]">
                  {{ getEligibleBarbers(wizard.selectedService).length > 0
                    ? `${getEligibleBarbers(wizard.selectedService).length} barber${getEligibleBarbers(wizard.selectedService).length !== 1 ? 's' : ''} available`
                    : 'We\'ll assign the next free barber' }}
                </p>
                <Transition name="fade">
                  <div v-if="wizard.selectedBarberIsAny" class="mt-3">
                    <Icon name="lucide:check-circle" class="h-5 w-5 text-[var(--color-success)]" />
                  </div>
                </Transition>
              </button>

              <!-- Barber cards -->
              <button
                v-for="barber in getEligibleBarbers(wizard.selectedService)"
                :key="barber.id"
                class="card-design group flex flex-col items-center p-6 text-center transition-all min-h-[44px]"
                :class="wizard.selectedBarber?.id === barber.id ? 'ring-2 ring-[var(--color-deep)] shadow-lg bg-[var(--color-deep)]/5' : 'hover:shadow-lg'"
                :aria-pressed="wizard.selectedBarber?.id === barber.id"
                @click="wizard.selectBarber(barber)"
              >
                <div class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[var(--color-silver)]/20 to-[var(--color-silver)]/10">
                  <img
                    v-if="barber.photo_url"
                    :src="barber.photo_url"
                    :alt="barber.display_name"
                    loading="lazy"
                    class="h-full w-full object-cover"
                  />
                  <Icon v-else name="lucide:user" class="h-8 w-8 text-[var(--color-titanium)]" />
                </div>
                <h4 class="mt-3 text-sm font-semibold text-[var(--color-deep)]">{{ barber.display_name }}</h4>
                <!-- Rating -->
                <div v-if="barber.rating > 0" class="mt-1 flex items-center gap-1">
                  <Icon name="lucide:star" class="h-3 w-3 text-[var(--color-warning)]" />
                  <span class="text-xs font-medium text-[var(--color-deep)]">{{ barber.rating.toFixed(1) }}</span>
                  <span class="text-xs text-[var(--color-titanium)]">({{ barber.total_reviews }})</span>
                </div>
                <!-- Specialties -->
                <div v-if="barber.specialties?.length" class="mt-2 flex flex-wrap justify-center gap-1">
                  <span
                    v-for="spec in barber.specialties.slice(0, 3)"
                    :key="spec"
                    class="rounded-pill bg-[var(--color-deep)]/5 px-2 py-0.5 text-[10px] text-[var(--color-deep)]"
                  >
                    {{ spec }}
                  </span>
                </div>
                <Transition name="fade">
                  <div v-if="wizard.selectedBarber?.id === barber.id" class="mt-3">
                    <Icon name="lucide:check-circle" class="h-5 w-5 text-[var(--color-success)]" />
                  </div>
                </Transition>
              </button>
            </div>

            <!-- No barbers -->
            <div v-if="getEligibleBarbers(wizard.selectedService).length === 0" class="py-12 text-center">
              <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-silver)]/10">
                <Icon name="lucide:user-x" class="h-8 w-8 text-[var(--color-silver)]" />
              </div>
              <p class="mt-4 text-sm text-[var(--color-titanium)]">No barbers available for this service</p>
            </div>

            <!-- Desktop Continue -->
            <div class="mt-8 hidden justify-end lg:flex">
              <button
                :disabled="!wizard.canProceedFromStep2"
                class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px]"
                @click="wizard.nextStep()"
              >
                Continue
                <Icon name="lucide:arrow-right" class="h-4 w-4" />
              </button>
            </div>
          </div>
          </Transition>

          <!-- ══════════════════════════════════════════
               STEP 3: SELECT DATE & TIME
               ══════════════════════════════════════════ -->
          <Transition :name="transitionName" mode="out-in">
          <div v-if="wizard.currentStep === 3" key="step3">
            <h2 class="text-xl font-bold text-[var(--color-deep)]">Select Date & Time</h2>
            <p class="mt-1 text-sm text-[var(--color-titanium)]">Pick your preferred appointment date and time</p>

            <!-- Calendar -->
            <div class="mt-6 card-design p-4 sm:p-6">
              <div class="flex items-center justify-between">
                <button
                  class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-btn text-[var(--color-deep)] transition-colors hover:bg-[var(--color-deep)]/5 disabled:opacity-30"
                  :disabled="!canPrevMonth"
                  aria-label="Previous month"
                  @click="prevMonth"
                >
                  <Icon name="lucide:chevron-left" class="h-5 w-5" />
                </button>
                <h3 class="text-sm font-bold text-[var(--color-deep)]">{{ calendarMonthLabel }}</h3>
                <button
                  class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-btn text-[var(--color-deep)] transition-colors hover:bg-[var(--color-deep)]/5 disabled:opacity-30"
                  :disabled="!canNextMonth"
                  aria-label="Next month"
                  @click="nextMonth"
                >
                  <Icon name="lucide:chevron-right" class="h-5 w-5" />
                </button>
              </div>

              <!-- Weekday headers -->
              <div class="mt-4 grid grid-cols-7 gap-1">
                <div
                  v-for="dayLabel in weekDayLabels"
                  :key="dayLabel"
                  class="py-1 text-center text-[10px] font-semibold uppercase text-[var(--color-titanium)]"
                >
                  {{ dayLabel }}
                </div>
              </div>

              <!-- Day grid -->
              <div class="grid grid-cols-7 gap-1">
                <button
                  v-for="(day, idx) in calendarDays"
                  :key="idx"
                  class="relative flex min-h-[44px] flex-col items-center justify-center rounded-btn text-xs transition-all"
                  :class="{
                    'text-[var(--color-silver)]/40 cursor-default': day.isDisabled,
                    'bg-[var(--color-deep)] text-white shadow-md scale-105': day.isSelected,
                    'hover:bg-[var(--color-deep)]/5 text-[var(--color-deep)] cursor-pointer': !day.isDisabled && !day.isSelected,
                    'ring-2 ring-[var(--color-info)] ring-offset-1': day.isToday && !day.isSelected,
                  }"
                  :disabled="day.isDisabled"
                  :aria-label="`${day.monthShort} ${day.dayNum}`"
                  @click="!day.isDisabled && fetchAvailability(day.dateStr)"
                >
                  <span class="text-sm font-bold">{{ day.dayNum }}</span>
                  <span v-if="day.isToday && !day.isSelected" class="absolute bottom-0.5 h-1 w-1 rounded-full bg-[var(--color-info)]" />
                </button>
              </div>
            </div>

            <!-- Time Slots -->
            <div v-if="wizard.selectedDate" class="mt-6 card-design p-4 sm:p-6">
              <h3 class="text-sm font-semibold text-[var(--color-deep)]">
                Available Times — {{ wizard.formattedDate }}
              </h3>

              <!-- Loading skeleton -->
              <div v-if="wizard.slotsLoading" class="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                <div v-for="n in 10" :key="n" class="h-11 animate-pulse rounded-btn bg-[var(--color-silver)]/20" />
              </div>

              <!-- No slots available -->
              <div v-else-if="wizard.availableSlots.length === 0" class="mt-4 py-8 text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-silver)]/10">
                  <Icon name="lucide:calendar-x" class="h-6 w-6 text-[var(--color-silver)]" />
                </div>
                <p class="mt-3 text-sm font-medium text-[var(--color-titanium)]">No available time slots for this date</p>
                <p class="mt-1 text-xs text-[var(--color-titanium)]">
                  {{ wizard.selectedBarberIsAny
                    ? 'All barbers are fully booked on this date. Try a different date.'
                    : 'This barber is fully booked on this date. Try a different date or select "Any Available Barber".' }}
                </p>
                <button
                  v-if="!wizard.selectedBarberIsAny"
                  class="mt-3 text-xs font-medium text-[var(--color-info)] hover:underline min-h-[44px]"
                  @click="wizard.selectBarber(null, true)"
                >
                  Switch to Any Available Barber
                </button>
              </div>

              <!-- Slot groups -->
              <div v-else class="mt-4 space-y-4">
                <!-- Morning -->
                <div v-if="morningSlots.length > 0">
                  <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-titanium)]">
                    <Icon name="lucide:sunrise" class="mr-1 inline h-3 w-3" /> Morning
                  </p>
                  <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                    <button
                      v-for="slot in morningSlots"
                      :key="slot"
                      class="min-h-[44px] rounded-btn py-2 text-sm font-medium transition-all"
                      :class="wizard.selectedTime === slot
                        ? 'bg-[var(--color-deep)] text-white shadow-md'
                        : 'border border-[var(--color-silver)]/50 text-[var(--color-deep)] hover:border-[var(--color-deep)] hover:bg-[var(--color-deep)]/5'"
                      :aria-pressed="wizard.selectedTime === slot"
                      @click="wizard.selectTime(slot)"
                    >
                      {{ formatTime(slot) }}
                    </button>
                  </div>
                </div>

                <!-- Afternoon -->
                <div v-if="afternoonSlots.length > 0">
                  <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-titanium)]">
                    <Icon name="lucide:sun" class="mr-1 inline h-3 w-3" /> Afternoon
                  </p>
                  <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                    <button
                      v-for="slot in afternoonSlots"
                      :key="slot"
                      class="min-h-[44px] rounded-btn py-2 text-sm font-medium transition-all"
                      :class="wizard.selectedTime === slot
                        ? 'bg-[var(--color-deep)] text-white shadow-md'
                        : 'border border-[var(--color-silver)]/50 text-[var(--color-deep)] hover:border-[var(--color-deep)] hover:bg-[var(--color-deep)]/5'"
                      :aria-pressed="wizard.selectedTime === slot"
                      @click="wizard.selectTime(slot)"
                    >
                      {{ formatTime(slot) }}
                    </button>
                  </div>
                </div>

                <!-- Evening -->
                <div v-if="eveningSlots.length > 0">
                  <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-titanium)]">
                    <Icon name="lucide:moon" class="mr-1 inline h-3 w-3" /> Evening
                  </p>
                  <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                    <button
                      v-for="slot in eveningSlots"
                      :key="slot"
                      class="min-h-[44px] rounded-btn py-2 text-sm font-medium transition-all"
                      :class="wizard.selectedTime === slot
                        ? 'bg-[var(--color-deep)] text-white shadow-md'
                        : 'border border-[var(--color-silver)]/50 text-[var(--color-deep)] hover:border-[var(--color-deep)] hover:bg-[var(--color-deep)]/5'"
                      :aria-pressed="wizard.selectedTime === slot"
                      @click="wizard.selectTime(slot)"
                    >
                      {{ formatTime(slot) }}
                    </button>
                  </div>
                </div>
              </div>

              <p v-if="availabilityError" class="mt-3 text-xs text-[var(--color-danger)]">{{ availabilityError }}</p>
            </div>

            <!-- Desktop Continue -->
            <div class="mt-8 hidden justify-end lg:flex">
              <button
                :disabled="!wizard.canProceedFromStep3"
                class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px]"
                @click="wizard.nextStep()"
              >
                Continue
                <Icon name="lucide:arrow-right" class="h-4 w-4" />
              </button>
            </div>
          </div>
          </Transition>

          <!-- ══════════════════════════════════════════
               STEP 4: CUSTOMER INFO
               ══════════════════════════════════════════ -->
          <Transition :name="transitionName" mode="out-in">
          <div v-if="wizard.currentStep === 4" key="step4">
            <h2 class="text-xl font-bold text-[var(--color-deep)]">Your Information</h2>
            <p class="mt-1 text-sm text-[var(--color-titanium)]">We need some details to confirm your booking</p>

            <!-- Logged in user -->
            <div v-if="authStore.isAuthenticated" class="mt-6 card-design p-6">
              <div class="flex items-center gap-4">
                <div class="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[var(--color-deep)]/10 to-[var(--color-deep)]/5">
                  <Icon v-if="!authStore.user?.avatar_url" name="lucide:user" class="h-6 w-6 text-[var(--color-deep)]" />
                  <img v-else :src="authStore.user.avatar_url" alt="Profile" class="h-full w-full object-cover" />
                </div>
                <div class="flex-1">
                  <h4 class="text-sm font-semibold text-[var(--color-deep)]">{{ authStore.user?.display_name }}</h4>
                  <p class="text-xs text-[var(--color-titanium)]">{{ authStore.user?.email }}</p>
                  <p v-if="authStore.user?.phone_number" class="text-xs text-[var(--color-titanium)]">{{ authStore.user?.phone_number }}</p>
                </div>
                <NuxtLink
                  to="/customer/profile"
                  target="_blank"
                  class="btn-design rounded-btn border border-[var(--color-silver)] px-4 py-2 text-xs font-medium text-[var(--color-deep)] min-h-[44px] inline-flex items-center"
                >
                  Edit Profile
                </NuxtLink>
              </div>
            </div>

            <!-- Guest form -->
            <div v-else class="mt-6 card-design p-6">
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">First Name *</label>
                  <input
                    v-model="wizard.customerInfo.firstName"
                    type="text"
                    placeholder="Juan"
                    autocomplete="given-name"
                    class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none transition-colors focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)] min-h-[44px]"
                    :class="firstNameError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]/50'"
                    @blur="validateFirstName"
                  />
                  <p v-if="firstNameError" class="mt-1 text-xs text-[var(--color-danger)]">{{ firstNameError }}</p>
                </div>
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">Last Name *</label>
                  <input
                    v-model="wizard.customerInfo.lastName"
                    type="text"
                    placeholder="Dela Cruz"
                    autocomplete="family-name"
                    class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none transition-colors focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)] min-h-[44px]"
                    :class="lastNameError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]/50'"
                    @blur="validateLastName"
                  />
                  <p v-if="lastNameError" class="mt-1 text-xs text-[var(--color-danger)]">{{ lastNameError }}</p>
                </div>
              </div>
              <div class="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">Phone Number *</label>
                  <input
                    v-model="wizard.customerInfo.phone"
                    type="tel"
                    placeholder="0917 123 4567"
                    autocomplete="tel"
                    class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none transition-colors focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)] min-h-[44px]"
                    :class="phoneError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]/50'"
                    @blur="validatePhone"
                  />
                  <p v-if="phoneError" class="mt-1 text-xs text-[var(--color-danger)]">{{ phoneError }}</p>
                </div>
                <div>
                  <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">Email Address *</label>
                  <input
                    v-model="wizard.customerInfo.email"
                    type="email"
                    placeholder="juan@email.com"
                    autocomplete="email"
                    class="input-design w-full border bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none transition-colors focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)] min-h-[44px]"
                    :class="emailError ? 'border-[var(--color-danger)]' : 'border-[var(--color-silver)]/50'"
                    @blur="validateEmail"
                  />
                  <p v-if="emailError" class="mt-1 text-xs text-[var(--color-danger)]">{{ emailError }}</p>
                </div>
              </div>
            </div>

            <!-- Loyalty login prompt (upgraded shops only, guests only) -->
            <div v-if="isUpgraded && !authStore.isAuthenticated" class="mt-4 rounded-card bg-[var(--color-info)]/5 border border-[var(--color-info)]/20 p-4">
              <div class="flex items-center gap-2">
                <Icon name="lucide:gift" class="h-5 w-5 text-[var(--color-info)]" />
                <p class="text-sm font-medium text-[var(--color-deep)]">Login to earn loyalty points on this booking</p>
              </div>
              <div class="mt-3 flex gap-2">
                <button
                  class="btn-design rounded-btn bg-[var(--color-deep)] px-4 py-2.5 text-xs font-semibold text-white min-h-[44px]"
                  @click="showLoginModal = true"
                >
                  Login
                </button>
                <button
                  class="btn-design rounded-btn border border-[var(--color-deep)] px-4 py-2.5 text-xs font-semibold text-[var(--color-deep)] min-h-[44px]"
                  @click="showLoginModal = true"
                >
                  Create Account
                </button>
              </div>
            </div>

            <!-- Notes for barber -->
            <div class="mt-4 card-design p-6">
              <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">Notes for Barber</label>
              <textarea
                v-model="wizard.customerInfo.notes"
                maxlength="300"
                rows="3"
                placeholder="Any special requests or preferences..."
                class="input-design w-full resize-none border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none transition-colors focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)]"
              />
              <p class="mt-1 text-right text-xs text-[var(--color-titanium)]">
                {{ wizard.customerInfo.notes.length }}/300
              </p>
            </div>

            <!-- Desktop Continue -->
            <div class="mt-8 hidden justify-end lg:flex">
              <button
                :disabled="!canProceedStep4"
                class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px]"
                @click="validateStep4AndProceed()"
              >
                Continue
                <Icon name="lucide:arrow-right" class="h-4 w-4" />
              </button>
            </div>
          </div>
          </Transition>

          <!-- ══════════════════════════════════════════
               STEP 5: REVIEW & PAY
               ══════════════════════════════════════════ -->
          <Transition :name="transitionName" mode="out-in">
          <div v-if="wizard.currentStep === 5" key="step5">
            <h2 class="text-xl font-bold text-[var(--color-deep)]">Review & Pay</h2>
            <p class="mt-1 text-sm text-[var(--color-titanium)]">Confirm your booking details and choose payment</p>

            <!-- Booking Summary -->
            <div class="mt-6 card-design p-6">
              <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">Booking Summary</h3>
              <div class="space-y-3">
                <div class="flex items-center justify-between gap-4">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-btn bg-[var(--color-deep)]/5">
                      <img v-if="wizard.selectedService?.image_url" :src="wizard.selectedService.image_url" :alt="wizard.selectedService.name" loading="lazy" class="h-full w-full object-cover" />
                      <Icon v-else name="lucide:scissors" class="h-5 w-5 text-[var(--color-titanium)]" />
                    </div>
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-[var(--color-deep)] truncate">{{ wizard.selectedService?.name }}</p>
                      <p class="text-xs text-[var(--color-titanium)]">{{ wizard.selectedService?.duration_mins }} min</p>
                    </div>
                  </div>
                  <span class="text-sm font-bold text-[var(--color-deep)] flex-shrink-0">{{ formatPrice(wizard.selectedService?.price || 0) }}</span>
                </div>
                <div class="flex items-center gap-3 border-t border-[var(--color-silver)]/20 pt-3">
                  <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-deep)]/5">
                    <Icon v-if="wizard.selectedBarberIsAny" name="lucide:users" class="h-4 w-4 text-[var(--color-deep)]" />
                    <img v-else-if="wizard.selectedBarber?.photo_url" :src="wizard.selectedBarber.photo_url" loading="lazy" class="h-full w-full rounded-full object-cover" />
                    <Icon v-else name="lucide:user" class="h-4 w-4 text-[var(--color-titanium)]" />
                  </div>
                  <div>
                    <p class="text-xs text-[var(--color-titanium)]">Barber</p>
                    <p class="text-sm font-medium text-[var(--color-deep)]">{{ wizard.effectiveBarberName }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-3 border-t border-[var(--color-silver)]/20 pt-3">
                  <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-info)]/10">
                    <Icon name="lucide:calendar" class="h-4 w-4 text-[var(--color-info)]" />
                  </div>
                  <div>
                    <p class="text-xs text-[var(--color-titanium)]">Date & Time</p>
                    <p class="text-sm font-medium text-[var(--color-deep)]">{{ wizard.formattedDate }}</p>
                    <p class="text-sm text-[var(--color-deep)]">{{ wizard.formattedTime }} – {{ wizard.formattedEndTime }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Loyalty Section -->
            <div v-if="isUpgraded && authStore.isAuthenticated" class="mt-4 card-design p-6">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="text-sm font-semibold text-[var(--color-deep)]">Loyalty Points</h3>
                <span v-if="shop.loyalty_tiers_enabled && customerTier !== 'bronze'" class="rounded-pill px-2 py-0.5 text-xs font-bold capitalize" :class="{
                  'bg-amber-800 text-white': customerTier === 'bronze',
                  'bg-gray-400 text-white': customerTier === 'silver',
                  'bg-yellow-500 text-white': customerTier === 'gold',
                  'bg-purple-600 text-white': customerTier === 'platinum',
                }">{{ customerTier }}</span>
              </div>
              <p class="text-sm text-[var(--color-titanium)]">You have <span class="font-bold text-[var(--color-deep)]">{{ customerPoints }}</span> points available</p>
              <p v-if="customerTotalEarned > customerPoints" class="text-xs text-[var(--color-titanium)] mt-1">Lifetime earned: {{ customerTotalEarned }} pts</p>

              <label class="mt-3 flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  :checked="wizard.loyalty.usePoints"
                  class="h-4 w-4 rounded border-[var(--color-silver)] text-[var(--color-deep)] focus:ring-[var(--color-deep)]"
                  @change="toggleUsePoints()"
                />
                <span class="text-sm font-medium text-[var(--color-deep)]">Use points for this booking</span>
              </label>

              <!-- Reward selector -->
              <div v-if="wizard.loyalty.usePoints && loyaltyRewards.length > 0" class="mt-3 space-y-2">
                <div
                  v-for="reward in loyaltyRewards"
                  :key="reward.id"
                  class="flex items-center gap-3 rounded-input border p-3 transition-all"
                  :class="canAffordReward(reward)
                    ? wizard.loyalty.rewardId === reward.id
                      ? 'border-[var(--color-deep)] bg-[var(--color-deep)]/5'
                      : 'border-[var(--color-silver)]/50 hover:border-[var(--color-deep)]/30 cursor-pointer'
                    : 'border-[var(--color-silver)]/30 opacity-50 cursor-not-allowed'"
                >
                  <input
                    type="radio"
                    name="reward"
                    :value="reward.id"
                    :checked="wizard.loyalty.rewardId === reward.id"
                    :disabled="!canAffordReward(reward)"
                    class="h-4 w-4 border-[var(--color-silver)] text-[var(--color-deep)] focus:ring-[var(--color-deep)]"
                    @change="onRewardSelect(reward)"
                  />
                  <div class="flex-1">
                    <p class="text-sm font-medium text-[var(--color-deep)]">{{ reward.name }}</p>
                    <p class="text-xs text-[var(--color-titanium)]">{{ reward.points_required }} pts</p>
                  </div>
                  <span v-if="!canAffordReward(reward)" class="text-xs text-[var(--color-danger)]">
                    Need {{ reward.points_required - customerPoints }} more
                  </span>
                </div>
              </div>

              <!-- No rewards available -->
              <p v-else-if="wizard.loyalty.usePoints && loyaltyRewards.length === 0" class="mt-2 text-xs text-[var(--color-titanium)]">
                No rewards available yet.
              </p>

              <!-- Price breakdown with loyalty -->
              <div v-if="wizard.loyalty.usePoints && wizard.loyalty.rewardId" class="mt-4 border-t border-[var(--color-silver)]/30 pt-3 space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-[var(--color-titanium)]">Subtotal</span>
                  <span class="text-[var(--color-deep)]">{{ formatPrice(subtotal) }}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-[var(--color-success)]">Loyalty Discount</span>
                  <span class="text-[var(--color-success)]">-{{ formatPrice(loyaltyDiscount) }}</span>
                </div>
                <div class="flex justify-between text-sm font-bold">
                  <span class="text-[var(--color-deep)]">Amount Due</span>
                  <span class="text-[var(--color-deep)]">{{ formatPrice(amountDue) }}</span>
                </div>
              </div>

              <!-- Points preview -->
              <p class="mt-3 text-xs text-[var(--color-info)]">
                You'll earn +{{ pointsPreview }} pts from this booking
              </p>
            </div>

            <!-- Payment Method -->
            <div class="mt-4 card-design p-6">
              <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">Payment Method</h3>

              <!-- PayMongo group -->
              <div v-if="showPayMongo">
                <h4 class="mb-2 text-xs font-semibold text-[var(--color-info)] uppercase tracking-wide flex items-center gap-1.5">
                  <Icon name="lucide:zap" class="h-3 w-3" /> Pay Online (Instant Confirmation)
                </h4>
                <div class="space-y-2">
                  <button
                    v-for="pm in paymongoMethods"
                    :key="pm.key"
                    class="flex w-full items-center gap-3 rounded-input border p-3 text-left transition-all min-h-[44px]"
                    :class="wizard.selectedPayMongoMethod === pm.key
                      ? 'border-[var(--color-deep)] bg-[var(--color-deep)]/5'
                      : 'border-[var(--color-silver)]/50 hover:border-[var(--color-deep)]/30'"
                    :aria-pressed="wizard.selectedPayMongoMethod === pm.key"
                    @click="wizard.selectPayMongoMethod(pm.key)"
                  >
                    <input
                      type="radio"
                      name="payment"
                      :checked="wizard.selectedPayMongoMethod === pm.key"
                      class="h-4 w-4 border-[var(--color-silver)] text-[var(--color-deep)] focus:ring-[var(--color-deep)]"
                      readonly
                      tabindex="-1"
                    />
                    <Icon :name="pm.icon" class="h-4 w-4 text-[var(--color-deep)]" />
                    <span class="text-sm font-medium text-[var(--color-deep)]">{{ pm.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Manual QR group -->
              <div v-if="showManual" :class="showPayMongo ? 'mt-4' : ''">
                <h4 v-if="showPayMongo" class="mb-2 text-xs font-semibold text-[var(--color-titanium)] uppercase tracking-wide flex items-center gap-1.5">
                  <Icon name="lucide:smartphone" class="h-3 w-3" /> Manual Payment (Requires Verification)
                </h4>
                <div class="space-y-2">
                  <button
                    v-for="method in manualPaymentMethods"
                    :key="method.id"
                    class="flex w-full items-center gap-3 rounded-input border p-3 text-left transition-all min-h-[44px]"
                    :class="wizard.selectedPaymentMethod?.id === method.id
                      ? 'border-[var(--color-deep)] bg-[var(--color-deep)]/5'
                      : 'border-[var(--color-silver)]/50 hover:border-[var(--color-deep)]/30'"
                    :aria-pressed="wizard.selectedPaymentMethod?.id === method.id"
                    @click="wizard.selectPaymentMethod(method)"
                  >
                    <input
                      type="radio"
                      name="payment"
                      :checked="wizard.selectedPaymentMethod?.id === method.id"
                      class="h-4 w-4 border-[var(--color-silver)] text-[var(--color-deep)] focus:ring-[var(--color-deep)]"
                      readonly
                      tabindex="-1"
                    />
                    <div class="flex-1">
                      <p class="text-sm font-medium text-[var(--color-deep)]">{{ method.name }}</p>
                      <p v-if="method.account_name" class="text-xs text-[var(--color-titanium)]">{{ method.account_name }}</p>
                    </div>
                    <img
                      v-if="method.qr_code_url"
                      :src="method.qr_code_url"
                      :alt="method.name"
                      loading="lazy"
                      class="h-8 w-8 rounded object-cover"
                    />
                  </button>
                </div>
              </div>

              <!-- No payment methods -->
              <div v-if="!showPayMongo && !showManual" class="py-8 text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-silver)]/10">
                  <Icon name="lucide:credit-card" class="h-6 w-6 text-[var(--color-silver)]" />
                </div>
                <p class="mt-3 text-sm text-[var(--color-titanium)]">No payment methods configured yet</p>
              </div>
            </div>

            <!-- Submit error -->
            <div v-if="submitError" class="mt-4 rounded-card bg-[var(--color-danger)]/5 border border-[var(--color-danger)]/20 p-4">
              <div class="flex items-start gap-3">
                <Icon name="lucide:alert-circle" class="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--color-danger)]" />
                <div>
                  <p class="text-sm font-medium text-[var(--color-danger)]">{{ submitError }}</p>
                  <p class="mt-1 text-xs text-[var(--color-titanium)]">Please try again or contact the shop directly.</p>
                </div>
              </div>
            </div>

            <!-- Desktop Confirm -->
            <div class="mt-8 hidden justify-end lg:flex">
              <button
                :disabled="!wizard.canProceedFromStep5"
                class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px]"
                @click="submitBooking()"
              >
                <Icon v-if="wizard.isSubmitting" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
                {{ wizard.isSubmitting ? 'Processing...' : `Confirm & Pay ${formatPrice(amountDue)}` }}
              </button>
            </div>
          </div>
          </Transition>

          <!-- ══════════════════════════════════════════
               STEP 6: POST-CONFIRMATION
               ══════════════════════════════════════════ -->
          <div v-if="wizard.currentStep === 6 && wizard.bookingResult">
            <!-- PayMongo flow: redirect handled in submitBooking() -->

            <!-- Guest account creation notice -->
            <div v-if="guestAccountCreated && guestEmail" class="mb-4 rounded-card bg-[var(--color-info)]/5 border border-[var(--color-info)]/20 p-4">
              <div class="flex items-start gap-3">
                <Icon name="lucide:info" class="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--color-info)]" />
                <div>
                  <p class="text-sm font-medium text-[var(--color-deep)]">We created a guest account for {{ guestEmail }}</p>
                  <p class="mt-1 text-xs text-[var(--color-titanium)]">Check your inbox to set your password and track your booking.</p>
                </div>
              </div>
            </div>

            <!-- Manual QR: Payment Proof Upload -->
            <div v-if="wizard.bookingResult.paymentType === 'manual' && !proofSubmitted">
              <h2 class="text-xl font-bold text-[var(--color-deep)]">Complete Your Payment</h2>
              <div class="mt-2 flex items-center gap-2">
                <p class="text-sm text-[var(--color-titanium)]">Booking ref:</p>
                <span class="text-sm font-bold text-[var(--color-deep)]">#{{ wizard.bookingResult.bookingRef }}</span>
                <button
                  class="text-[var(--color-info)] hover:underline min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                  aria-label="Copy booking reference"
                  @click="copyToClipboard(wizard.bookingResult.bookingRef, 'Booking ref')"
                >
                  <Icon name="lucide:copy" class="h-4 w-4" />
                </button>
              </div>

              <!-- Payment details -->
              <div class="mt-6 card-design p-6">
                <h3 class="mb-3 text-sm font-semibold text-[var(--color-deep)]">{{ wizard.selectedPaymentMethod?.name }}</h3>

                <!-- QR Image -->
                <div v-if="wizard.selectedPaymentMethod?.qr_code_url" class="mb-4 flex justify-center">
                  <img
                    :src="wizard.selectedPaymentMethod.qr_code_url"
                    :alt="wizard.selectedPaymentMethod.name"
                    loading="lazy"
                    class="max-h-64 rounded-card"
                  />
                </div>

                <!-- Account details -->
                <div class="space-y-3 text-sm">
                  <div v-if="wizard.selectedPaymentMethod?.account_name" class="flex items-center justify-between">
                    <span class="text-[var(--color-titanium)]">Account Name</span>
                    <span class="font-medium text-[var(--color-deep)]">{{ wizard.selectedPaymentMethod.account_name }}</span>
                  </div>
                  <div v-if="wizard.selectedPaymentMethod?.account_number" class="flex items-center justify-between">
                    <span class="text-[var(--color-titanium)]">Account Number</span>
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-[var(--color-deep)]">{{ wizard.selectedPaymentMethod.account_number }}</span>
                      <button
                        class="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[var(--color-info)] hover:underline"
                        aria-label="Copy account number"
                        @click="copyToClipboard(wizard.selectedPaymentMethod?.account_number || '', 'Account number')"
                      >
                        <Icon name="lucide:copy" class="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div v-if="wizard.selectedPaymentMethod?.bank_name" class="flex items-center justify-between">
                    <span class="text-[var(--color-titanium)]">Bank</span>
                    <span class="font-medium text-[var(--color-deep)]">{{ wizard.selectedPaymentMethod.bank_name }}</span>
                  </div>
                </div>

                <!-- Instructions -->
                <div class="mt-4 rounded-input bg-[var(--color-info)]/5 border border-[var(--color-info)]/20 p-4">
                  <p class="text-sm font-medium text-[var(--color-deep)]">Instructions:</p>
                  <ol class="mt-2 space-y-1.5 text-xs text-[var(--color-titanium)] list-decimal list-inside">
                    <li>Scan the QR code above or send to the account details</li>
                    <li>Send <strong class="text-[var(--color-deep)]">{{ formatPrice(amountDue) }}</strong></li>
                    <li>Take a screenshot of the payment confirmation</li>
                    <li>Upload the screenshot below</li>
                  </ol>
                </div>
              </div>

              <!-- Upload form -->
              <div class="mt-4 card-design p-6">
                <!-- File upload zone -->
                <div
                  class="flex flex-col items-center justify-center rounded-card border-2 border-dashed p-8 transition-colors cursor-pointer min-h-[44px]"
                  :class="proofFile ? 'border-[var(--color-success)] bg-[var(--color-success)]/5' : 'border-[var(--color-silver)]/50 hover:border-[var(--color-deep)]/30 hover:bg-[var(--color-deep)]/[0.02]'"
                  @dragover.prevent
                  @drop="handleFileDrop"
                  @click="fileInput?.click()"
                >
                  <input
                    ref="fileInput"
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    class="hidden"
                    @change="handleFileSelect"
                  />
                  <template v-if="proofFile">
                    <Icon name="lucide:file-check" class="h-8 w-8 text-[var(--color-success)]" />
                    <p class="mt-2 text-sm font-medium text-[var(--color-deep)]">{{ proofFile.name }}</p>
                    <p class="text-xs text-[var(--color-titanium)]">{{ (proofFile.size / 1024).toFixed(1) }} KB</p>
                    <button
                      class="mt-2 text-xs text-[var(--color-danger)] hover:underline min-h-[44px]"
                      @click.stop="proofFile = null"
                    >
                      Remove file
                    </button>
                  </template>
                  <template v-else>
                    <Icon name="lucide:upload" class="h-8 w-8 text-[var(--color-silver)]" />
                    <p class="mt-2 text-sm font-medium text-[var(--color-deep)]">Drop your proof here or tap to browse</p>
                    <p class="mt-1 text-xs text-[var(--color-titanium)]">JPG, PNG, or PDF — Max 5MB</p>
                  </template>
                </div>

                <!-- Reference & Amount -->
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">Reference Number (optional)</label>
                    <input
                      v-model="proofReferenceNumber"
                      type="text"
                      placeholder="e.g., 123456789"
                      class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)] min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">Amount Sent (₱)</label>
                    <input
                      v-model="proofAmountSent"
                      type="number"
                      step="0.01"
                      class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)] min-h-[44px]"
                    />
                  </div>
                </div>

                <!-- Proof upload error -->
                <div v-if="proofError" class="mt-3 text-xs text-[var(--color-danger)]">{{ proofError }}</div>

                <!-- Submit proof -->
                <div class="mt-6 flex justify-end">
                  <button
                    :disabled="!proofFile || proofUploading"
                    class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--color-titanium)] disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px]"
                    @click="submitProof()"
                  >
                    <Icon v-if="proofUploading" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
                    {{ proofUploading ? 'Uploading...' : 'Submit Payment Proof' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Manual QR: After proof submitted -->
            <div v-if="wizard.bookingResult.paymentType === 'manual' && proofSubmitted">
              <div class="py-12 text-center">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-warning)]/10">
                  <Icon name="lucide:clock" class="h-8 w-8 text-[var(--color-warning)]" />
                </div>
                <h2 class="mt-4 text-xl font-bold text-[var(--color-deep)]">Payment Submitted</h2>
                <p class="mt-2 text-sm text-[var(--color-titanium)]">
                  Booking ID: <span class="font-semibold text-[var(--color-deep)]">#{{ wizard.bookingResult.bookingRef }}</span>
                </p>
                <p class="mt-3 text-sm text-[var(--color-titanium)]">
                  We'll verify your payment and confirm your booking shortly.
                </p>
                <p v-if="isUpgraded" class="mt-1 text-sm text-[var(--color-info)]">
                  You'll receive an email confirmation once verified.
                </p>

                <div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <NuxtLink
                    to="/customer/bookings"
                    class="btn-design inline-flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-6 py-3 text-sm font-semibold text-white min-h-[44px]"
                  >
                    <Icon name="lucide:calendar" class="h-4 w-4" />
                    View My Bookings
                  </NuxtLink>
                  <NuxtLink
                    :to="`/shop/${slug}`"
                    class="btn-design inline-flex items-center gap-2 rounded-btn border border-[var(--color-silver)] px-6 py-3 text-sm font-medium text-[var(--color-deep)] min-h-[44px]"
                  >
                    <Icon name="lucide:arrow-left" class="h-4 w-4" />
                    Back to Shop
                  </NuxtLink>
                </div>
              </div>
            </div>

            <!-- PayMongo: waiting for redirect -->
            <div v-if="wizard.bookingResult.paymentType === 'paymongo'">
              <div class="py-12 text-center">
                <Icon name="lucide:loader-2" class="mx-auto h-8 w-8 animate-spin text-[var(--color-deep)]" />
                <h2 class="mt-4 text-xl font-bold text-[var(--color-deep)]">Redirecting to payment...</h2>
                <p class="mt-2 text-sm text-[var(--color-titanium)]">You'll be redirected to the secure payment page shortly.</p>
                <p class="mt-1 text-xs text-[var(--color-titanium)]">Booking ref: #{{ wizard.bookingResult.bookingRef }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ──── Desktop Sidebar Summary (Steps 2-5) ──── -->
        <div v-if="wizard.currentStep >= 2 && wizard.currentStep <= 5" class="hidden w-72 flex-shrink-0 lg:block">
          <div class="card-design sticky top-20 p-5">
            <h3 class="mb-4 text-sm font-semibold text-[var(--color-deep)]">Booking Summary</h3>

            <div class="space-y-3">
              <!-- Service -->
              <div v-if="wizard.selectedService" class="flex items-start gap-3">
                <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-btn bg-[var(--color-deep)]/5">
                  <img v-if="wizard.selectedService.image_url" :src="wizard.selectedService.image_url" loading="lazy" class="h-full w-full object-cover" />
                  <Icon v-else name="lucide:scissors" class="h-5 w-5 text-[var(--color-titanium)]" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium text-[var(--color-deep)] truncate">{{ wizard.selectedService.name }}</p>
                  <p class="text-xs text-[var(--color-titanium)]">{{ wizard.selectedService.duration_mins }} min</p>
                </div>
                <span class="text-sm font-bold text-[var(--color-deep)] flex-shrink-0">{{ formatPrice(wizard.selectedService.price) }}</span>
              </div>

              <!-- Barber -->
              <div v-if="wizard.selectedBarber || wizard.selectedBarberIsAny" class="flex items-center gap-3">
                <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-deep)]/5">
                  <Icon v-if="wizard.selectedBarberIsAny" name="lucide:users" class="h-4 w-4 text-[var(--color-deep)]" />
                  <img v-else-if="wizard.selectedBarber?.photo_url" :src="wizard.selectedBarber.photo_url" loading="lazy" class="h-full w-full rounded-full object-cover" />
                  <Icon v-else name="lucide:user" class="h-4 w-4 text-[var(--color-titanium)]" />
                </div>
                <p class="text-xs font-medium text-[var(--color-deep)]">{{ wizard.effectiveBarberName }}</p>
                <button
                  v-if="wizard.currentStep > 2 && wizard.currentStep <= 5"
                  class="ml-auto text-xs text-[var(--color-info)] hover:underline min-h-[44px] inline-flex items-center"
                  @click="wizard.goToStep(2)"
                >
                  Edit
                </button>
              </div>

              <!-- Date & Time -->
              <div v-if="wizard.selectedDate && wizard.selectedTime" class="flex items-center gap-3">
                <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-info)]/10">
                  <Icon name="lucide:calendar" class="h-4 w-4 text-[var(--color-info)]" />
                </div>
                <div class="min-w-0">
                  <p class="text-xs font-medium text-[var(--color-deep)]">{{ wizard.formattedTime }}</p>
                  <p class="text-[10px] text-[var(--color-titanium)]">{{ wizard.formattedDate }}</p>
                </div>
                <button
                  v-if="wizard.currentStep > 3 && wizard.currentStep <= 5"
                  class="ml-auto text-xs text-[var(--color-info)] hover:underline min-h-[44px] inline-flex items-center"
                  @click="wizard.goToStep(3)"
                >
                  Edit
                </button>
              </div>

              <!-- Placeholder when no selections yet -->
              <div v-if="!wizard.selectedService" class="py-4 text-center">
                <p class="text-xs text-[var(--color-titanium)]">Select a service to get started</p>
              </div>
            </div>

            <!-- Price -->
            <div v-if="wizard.selectedService" class="mt-4 border-t border-[var(--color-silver)]/30 pt-3">
              <div class="flex justify-between text-sm">
                <span class="text-[var(--color-titanium)]">Total</span>
                <span class="font-bold text-[var(--color-deep)]">{{ formatPrice(amountDue) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ──── Mobile Sticky Summary Bar ──── -->
    <div v-if="wizard.currentStep >= 2 && wizard.currentStep <= 5" class="fixed top-[57px] left-0 right-0 z-20 border-b border-[var(--color-silver)]/30 bg-[var(--color-pure-white)]/95 px-4 py-2 backdrop-blur-sm lg:hidden">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 min-w-0">
          <p class="truncate text-sm font-medium text-[var(--color-deep)]">
            {{ wizard.selectedService?.name || 'Select service' }}
          </p>
          <span v-if="wizard.effectiveBarberName && !wizard.selectedBarberIsAny" class="hidden sm:inline text-xs text-[var(--color-titanium)]">
            w/ {{ wizard.effectiveBarberName }}
          </span>
        </div>
        <div class="flex items-center gap-3 flex-shrink-0">
          <span v-if="wizard.selectedTime" class="text-xs text-[var(--color-info)]">
            {{ wizard.formattedTime }}
          </span>
          <span class="text-sm font-bold text-[var(--color-deep)]">
            {{ formatPrice(amountDue) }}
          </span>
        </div>
      </div>
    </div>

    <!-- ──── Mobile Bottom CTA Bar ──── -->
    <div v-if="wizard.currentStep >= 1 && wizard.currentStep <= 5" class="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--color-silver)]/30 bg-[var(--color-pure-white)]/98 backdrop-blur-sm p-4 lg:hidden" style="padding-bottom: max(1rem, env(safe-area-inset-bottom))">
      <div class="flex gap-3">
        <button
          v-if="wizard.currentStep > 1"
          class="btn-design flex-1 rounded-btn border border-[var(--color-silver)] py-3 text-sm font-medium text-[var(--color-deep)] min-h-[44px]"
          @click="wizard.prevStep()"
        >
          Back
        </button>
        <button
          v-if="wizard.currentStep < 5"
          :disabled="wizard.currentStep === 1 && !wizard.canProceedFromStep1
            || wizard.currentStep === 2 && !wizard.canProceedFromStep2
            || wizard.currentStep === 3 && !wizard.canProceedFromStep3
            || wizard.currentStep === 4 && !canProceedStep4"
          class="btn-design flex-[2] rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px]"
          @click="wizard.currentStep === 4 ? validateStep4AndProceed() : wizard.nextStep()"
        >
          Continue
        </button>
        <button
          v-if="wizard.currentStep === 5"
          :disabled="!wizard.canProceedFromStep5"
          class="btn-design flex-[2] rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px]"
          @click="submitBooking()"
        >
          <Icon v-if="wizard.isSubmitting" name="lucide:loader-2" class="mr-1 inline h-4 w-4 animate-spin" />
          {{ wizard.isSubmitting ? 'Processing...' : `Pay ${formatPrice(amountDue)}` }}
        </button>
      </div>
    </div>

    <!-- ──── Login Modal ──── -->
    <Teleport to="body">
      <div v-if="showLoginModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showLoginModal = false">
        <div class="card-design mx-4 w-full max-w-md p-6">
          <h3 class="text-lg font-bold text-[var(--color-deep)]">Login</h3>
          <p class="mt-1 text-sm text-[var(--color-titanium)]">Sign in to earn loyalty points</p>

          <div class="mt-4 space-y-3">
            <div>
              <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">Email</label>
              <input
                v-model="loginEmail"
                type="email"
                placeholder="your@email.com"
                autocomplete="email"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)] min-h-[44px]"
                @keyup.enter="handleLogin"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-xs font-medium text-[var(--color-deep)]">Password</label>
              <input
                v-model="loginPassword"
                type="password"
                placeholder="••••••••"
                autocomplete="current-password"
                class="input-design w-full border border-[var(--color-silver)]/50 bg-[var(--color-pure-white)] px-4 py-3 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-deep)] focus:ring-1 focus:ring-[var(--color-deep)] min-h-[44px]"
                @keyup.enter="handleLogin"
              />
            </div>
            <p v-if="loginError" class="text-xs text-[var(--color-danger)]">{{ loginError }}</p>
          </div>

          <div class="mt-6 flex gap-3">
            <button
              class="btn-design flex-1 rounded-btn bg-[var(--color-deep)] py-3 text-sm font-semibold text-white min-h-[44px]"
              :disabled="loginLoading"
              @click="handleLogin"
            >
              <Icon v-if="loginLoading" name="lucide:loader-2" class="mr-1 inline h-4 w-4 animate-spin" />
              {{ loginLoading ? 'Signing in...' : 'Login' }}
            </button>
            <button
              class="btn-design rounded-btn border border-[var(--color-silver)] px-4 py-3 text-sm font-medium text-[var(--color-deep)] min-h-[44px]"
              @click="showLoginModal = false"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>

  <!-- No shop found -->
  <div v-else class="flex min-h-screen items-center justify-center">
    <div class="text-center">
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-silver)]/10">
        <Icon name="lucide:store" class="h-8 w-8 text-[var(--color-silver)]" />
      </div>
      <p class="mt-4 text-sm font-medium text-[var(--color-titanium)]">Shop not found</p>
      <NuxtLink to="/" class="mt-4 inline-block text-sm font-medium text-[var(--color-info)] hover:underline">
        Go back home
      </NuxtLink>
    </div>
  </div>
</div>
</template>

<style scoped>
/* Step transition animations */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.25s ease;
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Toast transition */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translate(-50%, -20px);
}
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
