import { createFileRoute } from '@tanstack/react-router'
import { SdkRegistryPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/sdks')({
  component: SdkRegistryPage,
})
