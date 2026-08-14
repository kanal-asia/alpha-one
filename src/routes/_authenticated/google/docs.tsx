import { createFileRoute } from '@tanstack/react-router'
import { GoogleDocsPage } from '@/features/google'

export const Route = createFileRoute('/_authenticated/google/docs')({
  component: GoogleDocsPage,
})
