import { createFileRoute } from '@tanstack/react-router'
import { ArtifactListPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/artifacts/')({
  component: ArtifactListPage,
})
