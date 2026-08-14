import { createFileRoute } from '@tanstack/react-router'
import { PdfGeneratorPage } from '@/features/automation'

export const Route = createFileRoute('/_authenticated/automation/pdf')({
  component: PdfGeneratorPage,
})
