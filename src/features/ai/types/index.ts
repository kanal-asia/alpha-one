export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting'

export type PromptCategory =
  | 'coding'
  | 'documentation'
  | 'refactoring'
  | 'debugging'
  | 'automation'

export interface Prompt {
  id: string
  title: string
  description: string
  content: string
  category: PromptCategory
  favorite: boolean
}

export interface HistoryEntry {
  id: string
  type: 'session' | 'prompt' | 'chat' | 'automation'
  title: string
  detail: string
  createdAt: string
}
