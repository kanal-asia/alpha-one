import { createFileRoute } from '@tanstack/react-router'
import { WorkflowCatalogPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/workflows/')({
  component: WorkflowCatalogPage,
})
