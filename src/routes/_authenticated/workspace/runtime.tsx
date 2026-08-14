import { createFileRoute } from '@tanstack/react-router'
import { RuntimePage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/runtime')({
  component: RuntimePage,
})
