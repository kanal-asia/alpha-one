import { createFileRoute } from '@tanstack/react-router'
import { HealthDashboardPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/health')({
  component: HealthDashboardPage,
})
