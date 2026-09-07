/**
 * Suppress known non-fatal errors from third-party scripts (Google Maps, etc.)
 * that use PerformanceObserver with startTime on cleared entries.
 */
export default defineNuxtPlugin(() => {
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    const msg = String(args[0] ?? '')
    if (msg.includes('startTime') && msg.includes('reportAllChanges')) return
    originalError.apply(console, args)
  }

  // Also swallow uncaught errors matching the pattern
  addEventListener('error', (e) => {
    if (e.message?.includes('startTime') && e.message?.includes('reportAllChanges')) {
      e.stopImmediatePropagation()
      e.preventDefault()
    }
  })
})
