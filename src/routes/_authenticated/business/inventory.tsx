import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/business/inventory')({
  component: () => (
    <SectionPlaceholder
      title='Inventory'
      description='Keep stock levels accurate and reorder before you run out.'
    />
  ),
})
