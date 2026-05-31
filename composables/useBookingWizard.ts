/**
 * useBookingWizard — Composable for the 5-step booking wizard
 * Manages all booking state: step navigation, selections, and slide animation direction.
 *
 * Steps:
 * 1. Select Service
 * 2. Select Barber
 * 3. Select Date & Time
 * 4. Customer Info
 * 5. Review & Pay
 */
import type { Service, Barber, PaymentMethod, LoyaltyReward } from '~/types/database'

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6

export interface BarberWithProfile extends Barber {
  display_name: string
  photo_url: string | null
}

export interface CustomerInfo {
  firstName: string
  lastName: string
  phone: string
  email: string
  notes: string
}

export interface LoyaltySelection {
  usePoints: boolean
  rewardId: string | null
  pointsRedeemed: number
  discountApplied: number
}

export interface BookingWizardState {
  currentStep: WizardStep
  slideDirection: 'left' | 'right'

  selectedService: Service | null
  selectedBarber: BarberWithProfile | null
  selectedBarberIsAny: boolean

  selectedDate: string | null
  selectedTime: string | null
  availableSlots: string[]
  slotsLoading: boolean

  customerInfo: CustomerInfo
  loyalty: LoyaltySelection

  selectedPaymentMethod: PaymentMethod | null
  selectedPayMongoMethod: string | null

  isSubmitting: boolean
  bookingResult: {
    bookingId: string
    bookingRef: string
    status: string
    paymentType: string
    amount: number
    guestAccountCreated?: boolean
    guestEmail?: string | null
  } | null
}

export const useBookingWizard = defineStore('bookingWizard', {
  state: (): BookingWizardState => ({
    currentStep: 1,
    slideDirection: 'left',

    selectedService: null,
    selectedBarber: null,
    selectedBarberIsAny: false,

    selectedDate: null,
    selectedTime: null,
    availableSlots: [],
    slotsLoading: false,

    customerInfo: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      notes: '',
    },
    loyalty: {
      usePoints: false,
      rewardId: null,
      pointsRedeemed: 0,
      discountApplied: 0,
    },

    selectedPaymentMethod: null,
    selectedPayMongoMethod: null,

    isSubmitting: false,
    bookingResult: null,
  }),

  getters: {
    canProceedFromStep1: (state): boolean => state.selectedService !== null,
    canProceedFromStep2: (state): boolean => state.selectedBarber !== null || state.selectedBarberIsAny,
    canProceedFromStep3: (state): boolean => state.selectedDate !== null && state.selectedTime !== null,
    canProceedFromStep4(state): boolean {
      const authStore = useAuthStore()
      if (authStore.isAuthenticated) return true

      const info = state.customerInfo
      return (
        info.firstName.trim().length >= 2 &&
        info.lastName.trim().length >= 2 &&
        info.phone.trim().length >= 7 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email.trim())
      )
    },
    canProceedFromStep5(state): boolean {
      return (state.selectedPaymentMethod !== null || state.selectedPayMongoMethod !== null) && !state.isSubmitting
    },

    barberIdForApi(state): string {
      if (state.selectedBarberIsAny) return 'any'
      return state.selectedBarber?.id || 'any'
    },

    effectiveBarberName(state): string {
      if (state.selectedBarberIsAny) return 'Any Available Barber'
      return state.selectedBarber?.display_name || 'Any Available Barber'
    },

    formattedDate(state): string {
      if (!state.selectedDate) return ''
      const date = new Date(state.selectedDate + 'T00:00:00')
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    },

    formattedTime(state): string {
      if (!state.selectedTime) return ''
      const [h, m] = state.selectedTime.split(':').map(Number)
      const startPeriod = h >= 12 ? 'PM' : 'AM'
      const startDisplay = h % 12 || 12
      return `${startDisplay}:${m.toString().padStart(2, '0')} ${startPeriod}`
    },

    formattedEndTime(state): string {
      if (!state.selectedTime || !state.selectedService) return ''
      const [h, m] = state.selectedTime.split(':').map(Number)
      const totalMinutes = h * 60 + m + (state.selectedService.duration_mins || 30)
      const endH = Math.floor(totalMinutes / 60)
      const endM = totalMinutes % 60
      const endPeriod = endH >= 12 ? 'PM' : 'AM'
      const endDisplay = endH % 12 || 12
      return `${endDisplay}:${endM.toString().padStart(2, '0')} ${endPeriod}`
    },

    stepLabels(): string[] {
      return ['Service', 'Barber', 'Date & Time', 'Your Info', 'Review & Pay']
    },
  },

  actions: {
    nextStep() {
      if (this.currentStep < 6) {
        this.slideDirection = 'left'
        this.currentStep = (this.currentStep + 1) as WizardStep
      }
    },

    prevStep() {
      if (this.currentStep > 1) {
        this.slideDirection = 'right'
        this.currentStep = (this.currentStep - 1) as WizardStep
      }
    },

    goToStep(step: WizardStep) {
      if (step < this.currentStep) {
        this.slideDirection = 'right'
      } else {
        this.slideDirection = 'left'
      }
      this.currentStep = step
    },

    selectService(service: Service) {
      this.selectedService = service
      // Reset downstream selections when service changes
      this.selectedBarber = null
      this.selectedBarberIsAny = false
      this.selectedDate = null
      this.selectedTime = null
      this.availableSlots = []
    },

    selectBarber(barber: BarberWithProfile | null, isAny: boolean = false) {
      this.selectedBarber = isAny ? null : barber
      this.selectedBarberIsAny = isAny
      // Reset date/time when barber changes
      this.selectedDate = null
      this.selectedTime = null
      this.availableSlots = []
    },

    selectDate(date: string) {
      this.selectedDate = date
      this.selectedTime = null
    },

    selectTime(time: string) {
      this.selectedTime = time
    },

    setAvailableSlots(slots: string[]) {
      this.availableSlots = slots
    },

    setSlotsLoading(loading: boolean) {
      this.slotsLoading = loading
    },

    updateCustomerInfo(info: Partial<CustomerInfo>) {
      this.customerInfo = { ...this.customerInfo, ...info }
    },

    updateLoyalty(loyalty: Partial<LoyaltySelection>) {
      this.loyalty = { ...this.loyalty, ...loyalty }
    },

    selectPaymentMethod(method: PaymentMethod | null) {
      this.selectedPaymentMethod = method
      this.selectedPayMongoMethod = null
    },

    selectPayMongoMethod(method: string | null) {
      this.selectedPayMongoMethod = method
      this.selectedPaymentMethod = null
    },

    setSubmitting(submitting: boolean) {
      this.isSubmitting = submitting
    },

    setBookingResult(result: { bookingId: string; bookingRef: string; status: string; paymentType: string; amount?: number; guestAccountCreated?: boolean; guestEmail?: string | null } | null) {
      this.bookingResult = result
    },

    resetWizard() {
      this.$reset()
    },
  },
})
