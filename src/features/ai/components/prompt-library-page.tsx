import { useMemo, useState } from 'react'
import { type Prompt, type PromptCategory } from '../types'
import { AILayout } from './ai-layout'
import { PromptCard } from './prompt-card'
import { Button } from '@/components/ui/button'
import { useWorkspaceStore } from '../store/workspace-store'

const categories: (PromptCategory | 'all')[] = [
  'all',
  'coding',
  'documentation',
  'refactoring',
  'debugging',
  'automation',
]

const EMPTY_PROMPTS: Prompt[] = []

export function PromptLibraryPage() {
  const [active, setActive] = useState<PromptCategory | 'all'>('all')
  const [prompts, setPrompts] = useState<Prompt[]>(EMPTY_PROMPTS)
  const addEntry = useWorkspaceStore((s) => s.history.addEntry)

  const filtered = useMemo(
    () =>
      active === 'all'
        ? prompts
        : prompts.filter((p) => p.category === active),
    [active, prompts]
  )

  const handleCopy = (prompt: Prompt) => {
    void navigator.clipboard?.writeText(prompt.content)
    addEntry({
      id: `h-${Date.now()}`,
      type: 'prompt',
      title: 'Prompt copied',
      detail: `${prompt.title} was copied to clipboard.`,
      createdAt: new Date().toISOString(),
    })
  }

  const handleToggleFavorite = (prompt: Prompt) => {
    setPrompts((prev) =>
      prev.map((p) =>
        p.id === prompt.id ? { ...p, favorite: !p.favorite } : p
      )
    )
  }

  return (
    <AILayout>
      <div className='space-y-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>Prompt Library</h1>
          <p className='text-sm text-muted-foreground'>
            Store, organize, and reuse your favorite prompts.
          </p>
        </div>

        <div className='flex flex-wrap gap-2'>
          {categories.map((category) => (
            <Button
              key={category}
              size='sm'
              variant={active === category ? 'default' : 'outline'}
              onClick={() => setActive(category)}
              className='capitalize'
            >
              {category}
            </Button>
          ))}
        </div>

        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {filtered.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              onCopy={handleCopy}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className='py-10 text-center text-sm text-muted-foreground'>
            No prompts in this category.
          </div>
        )}
      </div>
    </AILayout>
  )
}
