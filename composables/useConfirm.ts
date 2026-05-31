/**
 * useConfirm — Composable for showing confirmation dialogs
 * 
 * Usage:
 *   const { confirm, ConfirmDialogComponent } = useConfirm()
 *   const ok = await confirm({ title: 'Delete?', message: 'This cannot be undone.', variant: 'danger' })
 *   if (ok) { ... }
 */
import { ref, defineComponent, h } from 'vue'
import ConfirmDialog from '~/components/ConfirmDialog.vue'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
}

export function useConfirm() {
  const showDialog = ref(false)
  const options = ref<ConfirmOptions>({
    title: '',
    message: '',
    variant: 'default',
  })
  
  let resolveFn: ((value: boolean) => void) | null = null

  async function confirm(confirmOptions: ConfirmOptions): Promise<boolean> {
    options.value = { ...confirmOptions }
    showDialog.value = true
    
    return new Promise((resolve) => {
      resolveFn = resolve
    })
  }

  function handleConfirm() {
    showDialog.value = false
    resolveFn?.(true)
    resolveFn = null
  }

  function handleCancel() {
    showDialog.value = false
    resolveFn?.(false)
    resolveFn = null
  }

  // Render function for the dialog — consumers add <ConfirmDialogComponent /> to their template
  const ConfirmDialogComponent = defineComponent({
    setup() {
      return () => h(ConfirmDialog, {
        modelValue: showDialog.value,
        'onUpdate:modelValue': (val: boolean) => { showDialog.value = val },
        title: options.value.title,
        message: options.value.message,
        confirmLabel: options.value.confirmLabel,
        cancelLabel: options.value.cancelLabel,
        variant: options.value.variant,
        onConfirm: handleConfirm,
        onCancel: handleCancel,
      })
    },
  })

  return {
    confirm,
    ConfirmDialogComponent,
  }
}
