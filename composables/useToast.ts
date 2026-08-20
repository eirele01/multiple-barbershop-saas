/**
 * useToast — Lightweight toast notification composable
 *
 * SSR-safe: uses useState() for hydration, guards timers behind
 * import.meta.client so setTimeout only runs in the browser.
 *
 * Usage:
 *   const toast = useToast()
 *   toast.success('Saved!')
 *   toast.error('Something went wrong')
 *   toast.info('New notification')
 */

interface ToastMessage {
  id: number
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
}

let nextId = 0

export function useToast() {
  const toasts = useState<ToastMessage[]>('toasts', () => [])

  function addToast(type: ToastMessage['type'], message: string, duration = 4000) {
    // Toasts are a client-only UI feature — skip during SSR
    if (import.meta.server) return

    const id = ++nextId
    toasts.value.push({ id, type, message })

    // Guard timer: only schedule auto-dismiss in the browser
    if (import.meta.client) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }

  function removeToast(id: number) {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  return {
    toasts,
    success: (message: string) => addToast('success', message),
    error: (message: string, duration = 6000) => addToast('error', message, duration),
    info: (message: string) => addToast('info', message),
    warning: (message: string) => addToast('warning', message),
    remove: removeToast,
  }
}
