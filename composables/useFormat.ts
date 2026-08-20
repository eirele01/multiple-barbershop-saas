/**
 * useFormat — Shared formatting utilities
 *
 * Eliminates duplicated formatPrice/formatTime/formatDate functions
 * across 15+ page files.
 *
 * Usage:
 *   const { formatPrice, formatTime, formatDate } = useFormat()
 *   formatPrice(1500)          // '₱1,500'
 *   formatPrice(1500.50)       // '₱1,500.50'
 *   formatTime('14:30')        // '2:30 PM'
 *   formatDate('2025-03-15')   // 'Mar 15, 2025'
 */

import { CURRENCY_SYMBOL, CURRENCY_LOCALE } from '~/constants/app.config'

export function useFormat() {
  /** Format a number as Philippine Peso currency */
  function formatPrice(amount: number | string | null | undefined): string {
    if (amount === null || amount === undefined) return '₱0'
    const num = Number(amount)
    if (Number.isNaN(num)) return '₱0'
    // Show decimals only if the amount has them
    if (Number.isInteger(num)) {
      return `${CURRENCY_SYMBOL}${num.toLocaleString()}`
    }
    return `${CURRENCY_SYMBOL}${num.toLocaleString(CURRENCY_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  /** Convert 24h 'HH:MM' to 12h 'H:MM AM/PM' */
  function formatTime(time24: string): string {
    if (!time24) return ''
    const [h, m] = time24.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
  }

  /** Format ISO date 'YYYY-MM-DD' to 'Mon DD, YYYY' */
  function formatDate(dateStr: string): string {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  /** Format ISO datetime to readable string */
  function formatDateTime(isoStr: string): string {
    if (!isoStr) return ''
    const date = new Date(isoStr)
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  }

  return { formatPrice, formatTime, formatDate, formatDateTime }
}
