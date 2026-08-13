import { createFileRoute } from '@tanstack/react-router'
import { DriveFolderPickerPage } from '@/features/google'

export const Route = createFileRoute('/_authenticated/google/drive-picker')({
  component: DriveFolderPickerPage,
})
