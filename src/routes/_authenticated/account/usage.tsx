import { createFileRoute } from '@tanstack/react-router'
import { AccountUsage } from '@/features/account/usage'

export const Route = createFileRoute('/_authenticated/account/usage')({
  component: AccountUsage,
})
