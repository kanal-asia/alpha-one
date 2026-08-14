import { createFileRoute } from '@tanstack/react-router'
import { SkillLibraryPage } from '@/features/skills'

export const Route = createFileRoute('/_authenticated/workspace/skills')({
  component: SkillLibraryPage,
})
