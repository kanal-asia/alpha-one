import { createFileRoute } from '@tanstack/react-router'
import { GoogleWorkspacePage } from '@/features/google'

export const Route = createFileRoute('/_authenticated/google/')({
  component: GoogleWorkspacePage,
})
