import { createFileRoute } from '@tanstack/react-router'
import { HistoryDetailPage } from '@/features/workspace'

export const Route = createFileRoute('/_authenticated/workspace/history/$eventId')({
  component: HistoryDetailPage,
})
