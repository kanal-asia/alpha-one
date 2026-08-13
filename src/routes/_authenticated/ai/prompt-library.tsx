import { createFileRoute } from '@tanstack/react-router'
import { PromptLibraryPage } from '@/features/ai'

export const Route = createFileRoute('/_authenticated/ai/prompt-library')({
  component: PromptLibraryPage,
})
