import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/productivity/documents')({
  component: () => (
    <SectionPlaceholder
      title='Documents'
      description='Create, edit and manage documents alongside your work.'
    />
  ),
})
