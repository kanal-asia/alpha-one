import { createFileRoute } from '@tanstack/react-router'
import { OperationListPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/operations/')({
  component: OperationListPage,
})
