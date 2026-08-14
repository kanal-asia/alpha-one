import { createFileRoute } from '@tanstack/react-router'
import { BrowserAutomationPage } from '@/features/automation'

export const Route = createFileRoute('/_authenticated/automation/browser')({
  component: BrowserAutomationPage,
})
