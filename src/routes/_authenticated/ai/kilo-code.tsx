import { createFileRoute } from '@tanstack/react-router'
import { KiloCodePage } from '@/features/ai'

export const Route = createFileRoute('/_authenticated/ai/kilo-code')({
  component: KiloCodePage,
})
