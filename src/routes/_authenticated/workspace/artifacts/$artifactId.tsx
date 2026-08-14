import { createFileRoute } from '@tanstack/react-router'
import { ArtifactDetailPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/artifacts/$artifactId')({
  component: ArtifactDetailPage,
})
