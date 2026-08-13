import { createFileRoute } from '@tanstack/react-router'
import { DriveFilePickerPage } from '@/features/google'

export const Route = createFileRoute(
  '/_authenticated/google/drive-file-picker'
)({
  component: DriveFilePickerPage,
})