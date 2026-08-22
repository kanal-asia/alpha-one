import { createFileRoute } from '@tanstack/react-router'
import { BigDealsPage } from '@/features/big-deals'

export const Route = createFileRoute('/_authenticated/big-deals/')({
  component: BigDealsPage,
})
