import { createFileRoute } from '@tanstack/react-router'
import { TaskRunnerPage } from '@/features/automation'

export const Route = createFileRoute('/_authenticated/automation/task-runner')({
  component: TaskRunnerPage,
})
