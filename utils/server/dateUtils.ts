/**
 * Timezone-aware date utilities for server-side operations.
 *
 * All date computations in this file use the shop's configured timezone
 * (default: Asia/Manila) to avoid UTC/daylight-savings drift.
 */

const DEFAULT_TIMEZONE = 'Asia/Manila'

/**
 * Day name mapping matching JS day indices (0=Sunday) → the snake_case
 * day names used in working_hours and barber schedule records.
 */
const DAY_INDEX_TO_NAME = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

/**
 * Get the day-of-week name for a date string in the given timezone.
 *
 * Example: getDayOfWeek('2026-08-15', 'Asia/Manila') → 'Saturday'
 *          (returns the display name, capitalized — use JS_DAY_TO_NAME for
 *           the working_hours-compatible snake_case name)
 */
export function getDayOfWeek(dateStr: string, timezone = DEFAULT_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: timezone,
  })
  return formatter.format(new Date(`${dateStr}T12:00:00`))
}

/**
 * Get the snake_case day name (matching working_hours.day column) for a
 * date string in the given timezone.
 *
 * Example: getDayOfWeekName('2026-08-15', 'Asia/Manila') → 'saturday'
 */
export function getDayOfWeekName(dateStr: string, timezone = DEFAULT_TIMEZONE): string {
  // NOTE: `weekday: 'numeric'` is NOT a valid value for Intl.DateTimeFormat
  // (only "long" | "short" | "narrow" are allowed) and throws at runtime:
  //   "Value numeric out of range for Date.prototype.toLocaleString options
  //    property weekday". That broke barber availability for every date.
  // Reuse the long-weekday formatter (same approach as getDayOfWeek above) and
  // lowercase the result to the snake_case day name expected by working_hours
  // and barber schedule rows (e.g. 'saturday').
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: timezone,
  })
  return formatter.format(new Date(`${dateStr}T12:00:00`)).toLowerCase()
}

/**
 * Get "today" as YYYY-MM-DD in the given timezone.
 * Avoids the common bug where `new Date().toISOString().split('T')[0]`
 * returns yesterday for UTC+8 servers.
 */
export function getToday(timezone = DEFAULT_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  })
  const parts = formatter.formatToParts(new Date())
  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}
