import { createFileRoute } from '@tanstack/react-router'
import { GoogleSheetsPage } from '@/features/google'

export const Route = createFileRoute('/_authenticated/google/sheets')({
  component: GoogleSheetsPage,
})
