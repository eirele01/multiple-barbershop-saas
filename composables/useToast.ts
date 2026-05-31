/**
 * useToast — Lightweight toast notification composable
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
  visible: boolean
}

const toasts = ref<ToastMessage[]>([])
let nextId = 0

export function useToast() {
  function addToast(type: ToastMessage['type'], message: string, duration = 4000) {
    const id = nextId++
    const toast: ToastMessage = { id, type, message, visible: true }
    toasts.value.push(toast)

    setTimeout(() => {
      removeToast(id)
    }, duration)
  }

  function removeToast(id: number) {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  return {
    toasts: readonly(toasts),
    success: (message: string) => addToast('success', message),
    error: (message: string, duration = 6000) => addToast('error', message, duration),
    info: (message: string) => addToast('info', message),
    warning: (message: string) => addToast('warning', message),
    remove: removeToast,
  }
}
