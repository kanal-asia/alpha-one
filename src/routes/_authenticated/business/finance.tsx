import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/business/finance')({
  component: () => (
    <SectionPlaceholder
      title='Finance'
      description='Track income, expenses and cash flow at a glance.'
    />
  ),
})
