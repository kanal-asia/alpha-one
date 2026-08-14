import { createFileRoute } from '@tanstack/react-router'
import { GoogleDrivePage } from '@/features/google'

export const Route = createFileRoute('/_authenticated/google/drive')({
  component: GoogleDrivePage,
})
