import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/business/reporting')({
  component: () => (
    <SectionPlaceholder
      title='Reporting'
      description='Build and schedule the reports your team relies on.'
    />
  ),
})
