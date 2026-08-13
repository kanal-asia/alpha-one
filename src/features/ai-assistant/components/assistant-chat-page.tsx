import { useEffect, useMemo, useRef } from 'react'
import { MessagesSquare, Settings2, Sparkles } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useOpenCodeStore } from '@/features/ai/opencode/store/opencode-store'
import { ChatSidebar } from '@/features/ai/opencode/components/chat-sidebar'
import { ChatMessageView } from '@/features/ai/opencode/components/chat-message'
import { ChatComposer } from '@/features/ai/opencode/components/chat-composer'
import { DeveloperPanel } from '@/features/ai/opencode/components/developer-panel'
import { StatusIndicator } from '@/features/ai/opencode/components/status-indicator'
import { ModelSelector } from '@/features/ai/opencode/components/model-selector'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ProjectSelector } from './project-selector'

export function AssistantChatPage() {
  const store = useOpenCodeStore()
  const {
    settings,
    models,
    chats,
    activeChatId,
    isStreaming,
    logs,
    runtimeEvents,
    detect,
    loadWorkspaces,
    loadModels,
    newChat,
    selectChat,
    renameChat,
    deleteChat,
    sendMessage,
    stopGeneration,
    retryLast,
    editAndResend,
    continueGeneration,
    updateSettings,
  } = store

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null
  const messages = useMemo(
    () => activeChat?.messages ?? [],
    [activeChat?.messages]
  )
  const activeModel = models.find((m) => m.id === settings.defaultModel)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void detect()
    void loadWorkspaces()
    void loadModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, isStreaming])

  return (
    <>
      <PageHeader />
      <div data-layout='fixed' className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        <div className='flex min-h-0 flex-1 overflow-hidden'>
        {/* Chat history sidebar */}
        <aside className='hidden w-64 shrink-0 overflow-hidden border-e md:block'>
          <ChatSidebar
            chats={chats}
            activeChatId={activeChatId}
            onNew={newChat}
            onSelect={selectChat}
            onRename={renameChat}
            onDelete={deleteChat}
          />
        </aside>

        {/* Main chat column */}
        <div className='flex min-w-0 min-h-0 flex-1 flex-col'>
          {/* Toolbar */}
          <div className='flex flex-wrap items-center gap-2 border-b px-4 py-2'>
            <ProjectSelector />

            <ModelSelector
              models={models}
              value={settings.defaultModel}
              disabled={models.length === 0}
              refreshing={models.length === 0}
              onSelect={(model) => {
                updateSettings({ defaultModel: model.id })
              }}
              onRefresh={() => void loadModels()}
            />

            <div className='ms-auto flex items-center gap-2'>
              <StatusIndicator
                model={activeModel}
                latency={activeModel?.latency}
              />
              <Button
                variant='outline'
                size='sm'
                className='h-8 gap-1.5'
                asChild
                aria-label='OpenCode Settings'
              >
                <Link to='/ai/opencode/settings'>
                  <Settings2 className='size-3.5' />
                  OpenCode Settings
                </Link>
              </Button>
            </div>
          </div>

          {/* Header */}
          <div className='flex items-center justify-between px-4 py-2'>
            <h1 className='flex items-center gap-2 text-lg font-semibold'>
              <Sparkles className='size-5' />
              AI Assistant
            </h1>
          </div>

          {/* Mobile chat history trigger */}
          <div className='px-4 md:hidden'>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant='outline' size='sm' className='gap-1.5'>
                  <MessagesSquare className='size-4' />
                  History
                </Button>
              </SheetTrigger>
              <SheetContent side='left' className='w-72 p-0'>
                <ChatSidebar
                  chats={chats}
                  activeChatId={activeChatId}
                  onNew={newChat}
                  onSelect={selectChat}
                  onRename={renameChat}
                  onDelete={deleteChat}
                />
              </SheetContent>
            </Sheet>
          </div>

          <ScrollArea ref={scrollRef} className='min-h-0 flex-1 px-4'>
            <div className='mx-auto max-w-3xl space-y-5 py-4'>
              {messages.length === 0 ? (
                <EmptyState onPick={(t) => void sendMessage(t)} />
              ) : (
                messages.map((m, i) => (
                  <ChatMessageView
                    key={m.id}
                    message={m}
                    isLast={i === messages.length - 1}
                    streaming={isStreaming}
                    onRetry={() => void retryLast()}
                    onEdit={(text, refs) => void editAndResend(m.id, text, refs)}
                    onContinue={() => void continueGeneration()}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          <div className='border-t px-4 py-3'>
            <div className='mx-auto max-w-3xl'>
              <ChatComposer
                onSend={(t, refs) => void sendMessage(t, refs)}
                onStop={stopGeneration}
                isStreaming={isStreaming}
              />
            </div>
          </div>

          <DeveloperPanel logs={logs} runtimeEvents={runtimeEvents} />
        </div>
        </div>
      </div>
    </>
  )
}

const SUGGESTIONS = [
  'Explain the workspace structure',
  'Write a React component for a settings form',
  'Find unused imports in the project',
  'Help me analyze a spreadsheet',
]

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className='flex flex-col items-center justify-center gap-4 py-16 text-center'>
      <div className='flex size-12 items-center justify-center rounded-2xl bg-muted'>
        <Sparkles className='size-6' />
      </div>
      <div>
        <p className='text-lg font-semibold'>How can I help you?</p>
        <p className='text-sm text-muted-foreground'>
          Start a conversation or pick a suggestion below.
        </p>
      </div>
      <div className='grid w-full max-w-md gap-2'>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type='button'
            onClick={() => onPick(s)}
            className='rounded-xl border bg-card px-4 py-2.5 text-start text-sm transition-colors hover:bg-accent'
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
