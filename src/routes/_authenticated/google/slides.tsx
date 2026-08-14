import { createFileRoute } from '@tanstack/react-router'
import { GoogleSlidesPage } from '@/features/google'

export const Route = createFileRoute('/_authenticated/google/slides')({
  component: GoogleSlidesPage,
})
