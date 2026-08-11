import { createFileRoute } from '@tanstack/react-router'
import { PresentationWorkspace } from '@/features/automation/presentation-workspace'

export const Route = createFileRoute('/_authenticated/automation/ppt')({
  component: PresentationWorkspace,
})
