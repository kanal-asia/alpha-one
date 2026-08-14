import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/business/clients')({
  component: () => (
    <SectionPlaceholder
      title='Clients'
      description='Manage your client relationships and their work.'
    />
  ),
})
