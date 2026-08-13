import { createFileRoute } from '@tanstack/react-router'
import { OpenCodeSettings } from '@/features/ai'

export const Route = createFileRoute('/_authenticated/ai/opencode/settings')({
  component: OpenCodeSettings,
})
