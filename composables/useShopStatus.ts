/**
 * useShopStatus — Composable for computing shop open/closed status
 * Based on shops.working_hours and the shop's stored timezone.
 *
 * Uses Intl.DateTimeFormat() to get the current day/time in the
 * shop's timezone (e.g., 'Asia/Manila'), NOT the browser's local time.
 *
 * Returns:
 * - isOpen: Whether the shop is currently open
 * - isClosingSoon: Whether the shop closes within 30 minutes
 * - statusText: "Open" or "Closed"
 * - statusDetail: "Open Now · Closes 6:00 PM" or "Closed · Opens Mon 9:00 AM"
 * - currentDayHours: Today's working hours
 * - closingTime: Today's closing time formatted (e.g. "6:00 PM")
 * - nextOpenTime: When the shop opens next (if closed)
 * - formattedNextOpen: Formatted next open time for badge display
 * - statusColor: Color token for the badge
 */
import type { WorkingHoursDay } from '~/types/database'
import { JS_DAY_TO_NAME, DAY_NAME_TO_JS } from '~/utils/dayMapping'

interface ShopStatusReturn {
  isOpen: Ref<boolean>
  isClosingSoon: Ref<boolean>
  statusText: Ref<string>
  statusDetail: Ref<string>
  currentDayHours: Ref<WorkingHoursDay | null>
  closingTime: Ref<string | null>
  nextOpenTime: Ref<string | null>
  formattedNextOpen: Ref<string | null>
  statusColor: Ref<string>
}

export function useShopStatus(
  workingHours: Ref<WorkingHoursDay[] | undefined>,
  timezone: Ref<string | undefined> = ref('Asia/Manila')
): ShopStatusReturn {
  const isOpen = ref(false)
  const isClosingSoon = ref(false)
  const statusText = ref('Closed')
  const statusDetail = ref('Closed')
  const currentDayHours = ref<WorkingHoursDay | null>(null)
  const closingTime = ref<string | null>(null)
  const nextOpenTime = ref<string | null>(null)
  const formattedNextOpen = ref<string | null>(null)
  const statusColor = ref('danger')

  function getNowInTimezone(tz: string): {
    dayName: string
    hours: number
    minutes: number
    dayIndex: number
    timeString: string
  } {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })
    const parts = formatter.formatToParts(now)

    const weekdayPart = parts.find((p) => p.type === 'weekday')
    const hourPart = parts.find((p) => p.type === 'hour')
    const minutePart = parts.find((p) => p.type === 'minute')

    const dayName = (weekdayPart?.value || 'Monday').toLowerCase()
    const hours = parseInt(hourPart?.value || '0', 10)
    const minutes = parseInt(minutePart?.value || '0', 10)

    const dayIndex = DAY_NAME_TO_JS[dayName] ?? 0

    const timeString = hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0')

    return { dayName, hours, minutes, dayIndex, timeString }
  }

  function formatTime12(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const displayH = h % 12 || 12
    return `${displayH}:${m.toString().padStart(2, '0')} ${period}`
  }

  function findNextOpenDay(currentDayIndex: number, wh: WorkingHoursDay[]): string | null {
    let nextDayIndex = (currentDayIndex + 1) % 7
    for (let i = 0; i < 7; i++) {
      const nextDayName = JS_DAY_TO_NAME[nextDayIndex]
      const nextDay = wh.find((d) => d.day === nextDayName)
      if (nextDay && nextDay.is_open) {
        const dayLabel = i === 0 ? '' : nextDayName.charAt(0).toUpperCase() + nextDayName.slice(1) + ' '
        return `${dayLabel}${formatTime12(nextDay.open)}`
      }
      nextDayIndex = (nextDayIndex + 1) % 7
    }
    return null
  }

  function computeStatus() {
    if (!workingHours.value || workingHours.value.length === 0) {
      isOpen.value = false
      isClosingSoon.value = false
      statusText.value = 'Closed'
      statusDetail.value = 'Closed'
      statusColor.value = 'danger'
      currentDayHours.value = null
      closingTime.value = null
      nextOpenTime.value = null
      formattedNextOpen.value = null
      return
    }

    const tz = timezone.value || 'Asia/Manila'
    const now = getNowInTimezone(tz)
    const currentDayName = now.dayName
    const currentTime = now.timeString
    const currentDayIndex = now.dayIndex
    const currentMinutes = now.hours * 60 + now.minutes

    const today = workingHours.value.find((wh) => wh.day === currentDayName) || null
    currentDayHours.value = today

    if (!today || !today.is_open) {
      isOpen.value = false
      isClosingSoon.value = false
      statusText.value = 'Closed'
      statusColor.value = 'danger'
      closingTime.value = null

      const nextOpen = findNextOpenDay(currentDayIndex, workingHours.value)
      nextOpenTime.value = nextOpen
      formattedNextOpen.value = nextOpen
      statusDetail.value = nextOpen ? `Closed · Opens ${nextOpen}` : 'Closed'
      return
    }

    const closeMinutes = timeToMinutes(today.close)
    const openMinutes = timeToMinutes(today.open)

    if (currentTime >= today.open && currentTime < today.close) {
      isOpen.value = true
      statusColor.value = 'success'
      closingTime.value = formatTime12(today.close)

      // Check if closing within 30 minutes
      const minutesUntilClose = closeMinutes - currentMinutes
      isClosingSoon.value = minutesUntilClose <= 30

      statusText.value = isClosingSoon.value ? 'Closing Soon' : 'Open Now'
      statusDetail.value = isClosingSoon.value
        ? `Closing Soon · Closes ${formatTime12(today.close)}`
        : `Open Now · Closes ${formatTime12(today.close)}`
      nextOpenTime.value = null
      formattedNextOpen.value = null
    } else if (currentTime < today.open) {
      isOpen.value = false
      isClosingSoon.value = false
      statusText.value = 'Closed'
      statusDetail.value = `Closed · Opens ${formatTime12(today.open)}`
      statusColor.value = 'danger'
      closingTime.value = null
      nextOpenTime.value = `Opens at ${formatTime12(today.open)}`
      formattedNextOpen.value = `Opens ${formatTime12(today.open)}`
    } else {
      isOpen.value = false
      isClosingSoon.value = false
      statusText.value = 'Closed'
      statusColor.value = 'danger'
      closingTime.value = null

      const nextOpen = findNextOpenDay(currentDayIndex, workingHours.value)
      nextOpenTime.value = nextOpen
      formattedNextOpen.value = nextOpen
      statusDetail.value = nextOpen ? `Closed · Opens ${nextOpen}` : 'Closed'
    }
  }

  function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }

  // Compute on mount
  onMounted(() => {
    computeStatus()
    // Re-compute every minute
    const interval = setInterval(computeStatus, 60000)
    onUnmounted(() => clearInterval(interval))
  })

  // Re-compute when working hours or timezone change
  watch([workingHours, timezone], computeStatus)

  return {
    isOpen,
    isClosingSoon,
    statusText,
    statusDetail,
    currentDayHours,
    closingTime,
    nextOpenTime,
    formattedNextOpen,
    statusColor,
  }
}
