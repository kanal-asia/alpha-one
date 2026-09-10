/**
 * TASK-085R3: provider error blocking dialog.
 *
 * Reuses the exact AlertDialog infrastructure proven by the Delete Chat
 * confirmation dialog (`chat-sidebar.tsx`): AlertDialog root + portal +
 * overlay/backdrop + centered content + footer actions. Radix blocks
 * outside-click dismissal; Escape closes via onOpenChange(false).
 *
 * Mount contract: mounted ONCE in AuthenticatedLayout (never unmounts during
 * chat). Never mount inside conditional branches (e.g. empty-state) — an
 * unmounted subscriber is the proven prior failure mode.
 *
 * Primary CTA performs real behavior:
 * - Choose Another Model / Use Paid Model → opens the existing ModelSelector
 *   popover via window event (user still chooses; nothing auto-selected).
 * - Reconnect → opens the existing ConnectProviderDialog (provider auth flow).
 * - Check Billing → navigates to the OpenCode provider/account settings page.
 *   Limitation (documented): no authoritative billing URL exists in-product
 *   (the app's own surfaces show "Billing — Coming Soon"), so the nearest
 *   legitimate provider/account surface is used; nothing is fabricated.
 */
import { useNavigate } from '@tanstack/react-router'
import { TriangleAlert, X } from 'lucide-react'
import { useOpenCodeStore } from '../store/opencode-store'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/** Dispatched when the error CTA must open the existing model picker. */
export const OPEN_MODEL_PICKER_EVENT = 'alpha-one:open-model-picker'
/** Dispatched when the error CTA must open the existing provider auth flow. */
export const OPEN_PROVIDER_CONNECT_EVENT = 'alpha-one:open-provider-connect'

type PrimaryTarget = 'open-model-picker' | 'open-provider-connect' | 'open-billing-settings'

export function primaryTargetFor(classification: string | null): PrimaryTarget {
  switch (classification) {
    case 'AUTHENTICATION_REQUIRED':
      return 'open-provider-connect'
    case 'PAID_MODEL_USAGE_EXHAUSTED':
      return 'open-billing-settings'
    default:
      return 'open-model-picker'
  }
}

export function ProviderErrorModal() {
  const modal = useOpenCodeStore((s) => s.providerErrorModal)
  const setOpen = useOpenCodeStore((s) => s.setProviderErrorModalOpen)
  const navigate = useNavigate()

  const close = () => setOpen(false)

  const handlePrimary = () => {
    const target = primaryTargetFor(modal.classification)
    close()
    if (target === 'open-billing-settings') {
      void navigate({ to: '/ai/opencode/settings' })
    } else {
      window.dispatchEvent(
        new CustomEvent(
          target === 'open-provider-connect'
            ? OPEN_PROVIDER_CONNECT_EVENT
            : OPEN_MODEL_PICKER_EVENT
        )
      )
    }
  }

  return (
    <AlertDialog open={modal.open} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent className='sm:max-w-md'>
        <button
          type='button'
          onClick={close}
          aria-label='Close dialog'
          className='absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4'
        >
          <X />
          <span className='sr-only'>Close</span>
        </button>
        <AlertDialogHeader>
          <AlertDialogTitle className='flex items-center gap-2 pe-6'>
            <TriangleAlert className='size-5 shrink-0 text-amber-600' />
            {modal.headline}
          </AlertDialogTitle>
          <AlertDialogDescription className='whitespace-pre-wrap'>
            {modal.detail}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>
            {modal.secondaryLabel}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handlePrimary}>
            {modal.primaryLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
