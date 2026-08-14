import { createFileRoute } from '@tanstack/react-router'
import { ToolManagerPage } from '@/features/tools'

export const Route = createFileRoute('/_authenticated/tools/')({
  component: ToolManagerPage,
})
