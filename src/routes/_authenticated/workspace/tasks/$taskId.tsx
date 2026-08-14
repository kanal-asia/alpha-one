import { createFileRoute } from '@tanstack/react-router'
import { TaskDetailPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/tasks/$taskId')({
  component: TaskDetailPage,
})
