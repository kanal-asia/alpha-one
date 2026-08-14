import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/business/sales')({
  component: () => (
    <SectionPlaceholder
      title='Sales'
      description='Manage your pipeline and follow up on every opportunity.'
    />
  ),
})
