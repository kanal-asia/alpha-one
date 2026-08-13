import { createFileRoute } from '@tanstack/react-router'
import { ProviderSettingsPage } from '@/features/providers/components/providers-settings-page'

export const Route = createFileRoute('/_authenticated/ai/providers')({
  component: ProviderSettingsPage,
})
