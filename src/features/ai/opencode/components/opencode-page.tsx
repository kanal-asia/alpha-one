import { useEffect, useMemo, useRef } from 'react'
import { MessagesSquare, Terminal } from 'lucide-react'
import { useDeveloperMode } from '@/context/developer-mode-provider'
import { useOpenCodeStore } from '../store/opencode-store'
import { useProjectStore, type Project } from '@/features/ai-assistant/store/project-store'
import { OpenCodeToolbar } from './opencode-toolbar'
import { ChatSidebar } from './chat-sidebar'
import { ChatMessageView } from './chat-message'
import { ChatComposer } from './chat-composer'
import { DeveloperPanel } from './developer-panel'
import { StatusIndicator } from './status-indicator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/page-header'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export function OpenCodeDashboard() {
  const { developerMode } = useDeveloperMode()
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
    archiveChat,
    deleteChat,
    sendMessage,
    stopGeneration,
    retryLast,
    editAndResend,
    continueGeneration,
    setActiveChatProject,
  } = store

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null
  const messages = useMemo(
    () => activeChat?.messages ?? [],
    [activeChat?.messages]
  )
  // TASK-OPENCODE-053: Status reflects the session's effective model.
  const activeModel = models.find(
    (m) => m.id === (activeChat?.model ?? settings.defaultModel)
  )
  // TASK-OPENCODE-053: Recent Projects fast track — existing project data only.
  const { projects: allProjects } = useProjectStore()
  const recentProjects = useMemo(
    () =>
      [...allProjects]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [allProjects]
  )
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
        <aside className='hidden w-72 shrink-0 overflow-hidden border-e md:block'>
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
          <OpenCodeToolbar />

          <div className='flex items-center justify-between px-4 py-2'>
            <h1 className='flex items-center gap-2 text-lg font-semibold'>
              <Terminal className='size-5' />
              OpenCode
            </h1>
            <StatusIndicator
              model={activeModel}
              latency={activeModel?.latency}
            />
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
                <EmptyState
                  recentProjects={recentProjects}
                  onPick={(t) => void sendMessage(t)}
                  onPickProject={(p) =>
                    setActiveChatProject({
                      id: p.id,
                      name: p.name,
                      // TASK-OPENCODE-055: `contextPath` IS the execution
                      // reference (local path OR Google Drive folder ID).
                      path: p.contextPath,
                      label: p.contextType === 'local' ? p.contextPath : p.contextLabel,
                      type: p.contextType,
                    })
                  }
                />
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

          {developerMode && <DeveloperPanel logs={logs} runtimeEvents={runtimeEvents} />}
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
  'Summarize the OpenCode provider integration',
]

function EmptyState({
  recentProjects,
  onPick,
  onPickProject,
}: {
  recentProjects: Project[]
  onPick: (t: string) => void
  onPickProject: (p: Project) => void
}) {
  return (
    <div className='flex flex-col items-center justify-center gap-4 py-16 text-center'>
      <div className='flex size-12 items-center justify-center rounded-2xl bg-muted'>
        <Terminal className='size-6' />
      </div>
      <div>
        <p className='text-lg font-semibold'>How can OpenCode help?</p>
        <p className='text-sm text-muted-foreground'>
          Start a conversation or pick a suggestion below.
        </p>
      </div>
      {/* TASK-OPENCODE-053: Recent Projects fast track — project starts empty, the
          user explicitly picks one to attach to this new session. */}
      {recentProjects.length > 0 && (
        <div className='w-full max-w-md space-y-1.5 text-start'>
          <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
            Recent Projects
          </p>
          {recentProjects.map((p) => (
            <button
              key={p.id}
              type='button'
              onClick={() => onPickProject(p)}
              className='flex w-full items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-start text-sm transition-colors hover:bg-accent'
            >
              <span className='min-w-0 flex-1'>
                <span className='block truncate font-medium'>{p.name}</span>
                <span className='block truncate text-xs text-muted-foreground'>
                  {p.contextType === 'local' ? p.contextPath : p.contextLabel}
                </span>
              </span>
              <span className='shrink-0 text-xs text-muted-foreground'>
                Use project
              </span>
            </button>
          ))}
        </div>
      )}
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
