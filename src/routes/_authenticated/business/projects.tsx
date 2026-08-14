import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/business/projects')({
  component: () => (
    <SectionPlaceholder
      title='Projects'
      description='Plan, track and deliver your projects with your team.'
    />
  ),
})
