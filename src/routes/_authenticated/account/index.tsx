import { createFileRoute } from '@tanstack/react-router'
import { AccountOverview } from '@/features/account'

export const Route = createFileRoute('/_authenticated/account/')({
  component: AccountOverview,
})
