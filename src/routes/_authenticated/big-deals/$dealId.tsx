import { createFileRoute } from '@tanstack/react-router'
import { DealDetailPage } from '@/features/big-deals'

export const Route = createFileRoute('/_authenticated/big-deals/$dealId')({
  component: DealDetailPage,
})
