import { createFileRoute } from '@tanstack/react-router'
import { OpenCodePage } from '@/features/ai'

export const Route = createFileRoute('/_authenticated/ai/opencode/')({
  component: OpenCodePage,
})
