import { createFileRoute } from '@tanstack/react-router'
import { AccountPlans } from '@/features/account/plans'

export const Route = createFileRoute('/_authenticated/account/plans')({
  component: AccountPlans,
})
