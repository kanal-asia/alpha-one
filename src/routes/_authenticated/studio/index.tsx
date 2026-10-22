import { createFileRoute } from '@tanstack/react-router'
import { StudioHome } from '@/features/studio'

export const Route = createFileRoute('/_authenticated/studio/')({
  component: StudioHome,
})
