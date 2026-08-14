import { createFileRoute } from '@tanstack/react-router'
import { TaskListPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/tasks/')({
  component: TaskListPage,
})
