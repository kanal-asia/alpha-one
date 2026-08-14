import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/google/calendar')({
  component: () => (
    <SectionPlaceholder
      title='Calendar'
      description='Schedule meetings and keep your day organised.'
    />
  ),
})
