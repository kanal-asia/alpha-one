import { useEffect, useMemo, useRef } from 'react'
import { MessagesSquare, Settings2, Sparkles } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useOpenCodeStore } from '@/features/ai/opencode/store/opencode-store'
import type { ChatProjectContext } from '@/features/ai/opencode/types'
import { ChatSidebar } from '@/features/ai/opencode/components/chat-sidebar'
import { useChatScrollToBottom } from '@/features/ai/opencode/components/chat-scroll'
import { ChatMessageView } from '@/features/ai/opencode/components/chat-message'
import { ChatComposer } from '@/features/ai/opencode/components/chat-composer'
import { DeveloperPanel } from '@/features/ai/opencode/components/developer-panel'
import { StatusIndicator } from '@/features/ai/opencode/components/status-indicator'
import { ModelSelector } from '@/features/ai/opencode/components/model-selector'
import { UsageIndicator } from '@/features/ai/opencode/components/usage-indicator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ProjectSelector } from './project-selector'
import type { Project } from '@/features/ai-assistant/store/project-store'

/** ChatProjectContext → Project (for the controlled ProjectSelector). */
function toProject(ctx: ChatProjectContext): Project | null {
  if (!ctx?.id && !ctx?.name) return null
  return {
    id: ctx.id ?? `ctx-${Date.now()}`,
    name: ctx.name ?? 'Project',
    contextType: ctx.type ?? 'local',
    contextPath: ctx.path ?? '',
    contextLabel: ctx.label ?? ctx.path ?? '',
    createdAt: '',
  }
}

/** Project → ChatProjectContext. */
function toContext(p: Project): ChatProjectContext {
  return {
    id: p.id,
    name: p.name,
    path: p.contextPath,
    label: p.contextType === 'local' ? p.contextPath : p.contextLabel,
    type: p.contextType,
  }
}

export function AssistantChatPage() {
  const store = useOpenCodeStore()
  const {
    settings,
    models,
    modes,
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
    archiveChat,
    deleteChat,
    sendMessage,
    stopGeneration,
    retryLast,
    editAndResend,
    continueGeneration,
    updateSettings,
    setActiveChatProject,
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

  // MSI-066R1: restore-to-bottom via the shared viewport-targeted hook. The
  // previous inline scrollTo hit the ScrollArea root (no scrollable overflow)
  // so restored chats opened at the top.
  useChatScrollToBottom(scrollRef, activeChatId, messages, isStreaming)

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
            onArchive={archiveChat}
            onDelete={deleteChat}
          />
        </aside>

        {/* Main chat column */}
        <div className='flex min-w-0 min-h-0 flex-1 flex-col'>
          {/* Toolbar */}
          <div className='flex flex-wrap items-center gap-2 border-b px-4 py-2'>
            <ProjectSelector
              project={activeChat?.project ? toProject(activeChat.project) : null}
              onProjectChange={(p) => setActiveChatProject(p ? toContext(p) : undefined)}
            />

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

            <Select
              value={settings.defaultMode}
              onValueChange={(v) => updateSettings({ defaultMode: v })}
            >
              <SelectTrigger className='h-8 w-[120px]' aria-label='Execution mode'>
                <SelectValue placeholder='Mode' />
              </SelectTrigger>
              <SelectContent>
                {modes.map((mode) => (
                  <SelectItem key={mode.id} value={mode.id}>
                    {mode.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <UsageIndicator />

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
            <div>
              <h1 className='flex items-center gap-2 text-lg font-semibold'>
                <Sparkles className='size-5' />
                Alpha Workspace
              </h1>
              <p className='text-xs text-muted-foreground'>
                One workspace. One assistant. All your work.
              </p>
            </div>
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
                  onArchive={archiveChat}
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
