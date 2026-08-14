import { createFileRoute } from '@tanstack/react-router'
import { WorkflowDetailPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/workflows/$workflowId')({
  component: WorkflowDetailPage,
})
