import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/google/gmail')({
  component: () => (
    <SectionPlaceholder
      title='Gmail'
      description='Read and reply to email from inside your workspace.'
    />
  ),
})
