import { createFileRoute } from '@tanstack/react-router'
import { AssistantChatPage } from '@/features/ai-assistant'

export const Route = createFileRoute('/_authenticated/workspace/assistant')({
  component: AssistantChatPage,
})
