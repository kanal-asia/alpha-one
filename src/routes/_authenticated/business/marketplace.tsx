import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/business/marketplace')({
  component: () => (
    <SectionPlaceholder
      title='Marketplace'
      description='Discover templates and extensions for your business.'
    />
  ),
})
