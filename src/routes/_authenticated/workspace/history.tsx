import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceHistoryPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/history')({
  component: WorkspaceHistoryPage,
})
