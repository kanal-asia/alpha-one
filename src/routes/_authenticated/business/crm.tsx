import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/business/crm')({
  component: () => (
    <SectionPlaceholder
      title='CRM'
      description='Track leads, deals and customer relationships in one place.'
    />
  ),
})
