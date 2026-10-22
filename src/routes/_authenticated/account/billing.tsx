import { createFileRoute } from '@tanstack/react-router'
import { AccountBilling } from '@/features/account/billing'

export const Route = createFileRoute('/_authenticated/account/billing')({
  component: AccountBilling,
})
