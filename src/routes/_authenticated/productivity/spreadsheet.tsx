import { createFileRoute } from '@tanstack/react-router'
import { SectionPlaceholder } from '@/features/sections/section-placeholder'

export const Route = createFileRoute('/_authenticated/productivity/spreadsheet')({
  component: () => (
    <SectionPlaceholder
      title='Spreadsheet'
      description='Open, edit and analyse spreadsheets directly in the workspace.'
    />
  ),
})
