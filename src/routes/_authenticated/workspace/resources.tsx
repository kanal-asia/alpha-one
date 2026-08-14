import { createFileRoute } from '@tanstack/react-router'
import { ResourceLibraryPage } from '@/features/resources'

export const Route = createFileRoute('/_authenticated/workspace/resources')({
  component: ResourceLibraryPage,
})
