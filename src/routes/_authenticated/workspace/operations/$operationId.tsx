import { createFileRoute } from '@tanstack/react-router'
import { OperationDetailPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/operations/$operationId')({
  component: OperationDetailPage,
})
