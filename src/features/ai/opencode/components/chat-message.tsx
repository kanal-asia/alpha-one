import { useState } from 'react'
import { AlertTriangle, Check, Copy, Pencil, RefreshCw, CornerDownRight, ChevronDown, ChevronRight, Loader2, RotateCcw, Square } from 'lucide-react'
import { type ChatMessage, type ToolEvent, type LifecycleStage } from '../types'
import type { ReferenceAttachment } from '@/features/ai/references/contract'
import { Markdown } from './markdown'
import { ReferenceChips } from './reference-chips'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { useDeveloperMode } from '@/context/developer-mode-provider'

type ChatMessageProps = {
  message: ChatMessage
  isLast: boolean
  streaming: boolean
  onRetry: () => void
  onEdit: (text: string, references?: ReferenceAttachment[]) => void
  onContinue: () => void
}

// ---------------------------------------------------------------------------
// TASK-OPENCODE-030: Execution Summary
// ---------------------------------------------------------------------------

function ExecutionSummary({ toolEvents, exitCode }: { toolEvents?: ToolEvent[]; exitCode?: number }) {
  const [expanded, setExpanded] = useState(false)

  if (!toolEvents || toolEvents.length === 0) return null

  // Build evidence-based summary from actual tool events
  const completedTools = toolEvents.filter((e) => e.status === 'completed')
  const failedTools = toolEvents.filter((e) => e.status === 'error')

  return (
    <div className='mt-2 border-t pt-2'>
      <button
        onClick={() => setExpanded(!expanded)}
        className='flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors'
      >
        {expanded ? <ChevronDown className='size-3' /> : <ChevronRight className='size-3' />}
        <span className='font-medium'>Execution Summary</span>
        <span className='text-muted-foreground/60'>
          ({completedTools.length} action{completedTools.length !== 1 ? 's' : ''}
          {failedTools.length > 0 ? `, ${failedTools.length} failed` : ''})
        </span>
      </button>
      {expanded && (
        <ul className='mt-1.5 space-y-0.5 text-xs text-muted-foreground'>
          {toolEvents.map((e) => (
            <li key={e.id} className='flex items-center gap-1.5'>
              {e.status === 'completed' ? (
                <Check className='size-3 shrink-0 text-green-500' />
              ) : e.status === 'error' ? (
                <AlertTriangle className='size-3 shrink-0 text-destructive' />
              ) : (
                <Loader2 className='size-3 shrink-0 animate-spin' />
              )}
              <span>{e.label}</span>
            </li>
          ))}
          {exitCode != null && exitCode !== 0 && (
            <li className='flex items-center gap-1.5 text-destructive'>
              <AlertTriangle className='size-3 shrink-0' />
              <span>Process exited with code {exitCode}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TASK-OPENCODE-030: Developer Mode diagnostics
// ---------------------------------------------------------------------------

function DeveloperDiagnostics({ toolEvents, exitCode, lifecycle }: { toolEvents?: ToolEvent[]; exitCode?: number; lifecycle?: LifecycleStage[] }) {
  const [expanded, setExpanded] = useState(false)

  if ((!toolEvents || toolEvents.length === 0) && (!lifecycle || lifecycle.length === 0)) return null

  return (
    <div className='mt-2 border-t pt-2'>
      <button
        onClick={() => setExpanded(!expanded)}
        className='flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors'
      >
        {expanded ? <ChevronDown className='size-3' /> : <ChevronRight className='size-3' />}
        <span className='font-medium text-amber-600 dark:text-amber-400'>Developer Diagnostics</span>
      </button>
      {expanded && (
        <div className='mt-1.5 space-y-1 text-xs font-mono text-muted-foreground'>
          {exitCode != null && (
            <div>exit code: {exitCode}</div>
          )}
          {lifecycle && lifecycle.length > 0 && (
            <div className='space-y-0.5 border-b pb-1'>
              {lifecycle.map((s) => (
                <div key={s.id} className='flex gap-2'>
                  <span className={cn(
                    'shrink-0',
                    s.status === 'completed' ? 'text-green-500' : s.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    [{s.status}]
                  </span>
                  <span className='shrink-0'>{s.kind}</span>
                  <span className='truncate'>{s.label}</span>
                  {s.detail && <span className='truncate opacity-60'>{s.detail}</span>}
                </div>
              ))}
            </div>
          )}
          {toolEvents?.map((e) => (
            <div key={e.id} className='flex gap-2'>
              <span className={cn(
                'shrink-0',
                e.status === 'completed' ? 'text-green-500' : e.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
              )}>
                [{e.status}]
              </span>
              <span className='shrink-0'>{e.tool}</span>
              <span className='truncate opacity-60'>{e.label}</span>
              {e.detail && <span className='truncate opacity-60'>{e.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TASK-OPENCODE-033: Live progress during streaming
// TASK-OPENCODE-050: Lifecycle-aware progress — always shows an active working
// line while streaming (previously dropped when the last tool event was
// 'completed'), plus plan and tool-status summary.
// TASK-OPENCODE-050-SCR2: The visible list is EXECUTION ACTIVITY (from real
// tool/lifecycle events), not a Todo list. The persistent indicator uses a
// subtle native-CSS activity animation (not a terminal cursor/bar) and only
// animates while streaming.
// ---------------------------------------------------------------------------

/** TASK-OPENCODE-050-SCR2: subtle segmented activity animation (1→2→3→4). */
function ActivityIndicator({ className }: { className?: string }) {
  return (
    <span className={cn('activity-indicator text-muted-foreground', className)} aria-hidden='true'>
      <span className='activity-indicator__seg' />
      <span className='activity-indicator__seg' />
      <span className='activity-indicator__seg' />
      <span className='activity-indicator__seg' />
    </span>
  )
}

function TodoPlan({ plan }: { plan?: { id: string; content: string; status: 'pending' | 'in_progress' | 'completed' }[] }) {
  if (!plan || plan.length === 0) return null
  return (
    <div className='mt-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm'>
      <p className='mb-1 text-xs font-medium text-muted-foreground'>Rencana pekerjaan</p>
      <ul className='space-y-0.5'>
        {plan.map((t) => (
          <li key={t.id} className='flex items-center gap-2 text-muted-foreground'>
            {t.status === 'completed' ? (
              <Check className='size-3.5 shrink-0 text-green-500' />
            ) : t.status === 'in_progress' ? (
              <Loader2 className='size-3.5 shrink-0 animate-spin text-primary' />
            ) : (
              <span className='inline-block size-3.5 shrink-0 rounded-full border text-center text-[9px] leading-[12px]'>○</span>
            )}
            <span className={cn(t.status === 'completed' && 'line-through opacity-60')}>{t.content}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LiveProgress({ toolEvents, plan, lifecycle }: { toolEvents: ToolEvent[]; plan?: ChatMessage['plan']; lifecycle?: LifecycleStage[] }) {
  const completed = toolEvents.filter((e) => e.status === 'completed')
  const failed = toolEvents.filter((e) => e.status === 'error')
  const active = toolEvents.find((e) => e.status === 'running')
  const lastEvent = toolEvents[toolEvents.length - 1]

  // TASK-OPENCODE-050-SCR: Separate lifecycle detail from persistent status.
  // TASK-OPENCODE-050-SCR2: lifecycle detail is presented as EXECUTION ACTIVITY.
  const runningStage = [...(lifecycle ?? [])].reverse().find((s) => s.status === 'running')
  let currentAction: string
  if (active?.label) currentAction = active.label
  else if (runningStage?.kind === 'continuation') currentAction = 'Melanjutkan pekerjaan…'
  else if (lastEvent?.label) currentAction = lastEvent.status === 'completed' ? `${lastEvent.label}…` : lastEvent.label
  else if (runningStage?.kind === 'thinking') currentAction = 'Memproses permintaan…'
  else currentAction = 'Working…'

  return (
    <div className='mt-2 space-y-1.5 text-sm text-muted-foreground'>
      <TodoPlan plan={plan} />
      {/* Execution activity (WHAT): completed/failed steps stay visible. */}
      {[...completed.slice(-3), ...failed.slice(-2)].map((e) => (
        <div key={e.id} className='flex items-center gap-2'>
          {e.status === 'error' ? (
            <AlertTriangle className='size-3.5 shrink-0 text-destructive' />
          ) : (
            <Check className='size-3.5 shrink-0 text-green-500' />
          )}
          <span className='truncate'>{e.label}</span>
        </div>
      ))}
      {/* Current activity (●) — visually distinct from completed steps. */}
      <div className='flex items-center gap-2 font-medium text-foreground/80'>
        <span className='size-3.5 shrink-0 text-primary'>●</span>
        <span className='truncate'>{currentAction}</span>
      </div>
      {/* Persistent status — state-based, neutral. Subtle activity animation
          only while streaming (this component renders only when streaming). */}
      <div className='flex items-center gap-2'>
        <ActivityIndicator />
        <span className='truncate'>Sedang bekerja...</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TASK-OPENCODE-030: Progress indicator (fallback before any tool event)
// TASK-OPENCODE-050-SCR: persistent status is state-based (neutral wording).
// TASK-OPENCODE-050-SCR2: uses the segmented activity animation.
// ---------------------------------------------------------------------------

function ProgressIndicator() {
  return (
    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
      <ActivityIndicator />
      <span>Sedang bekerja...</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChatMessageView({
  message,
  isLast,
  streaming,
  onRetry,
  onEdit,
  onContinue,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const { developerMode } = useDeveloperMode()

  const copy = () => {
    void navigator.clipboard?.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (message.role === 'user') {
    return (
      <div className='flex justify-end'>
        {editing ? (
          <div className='w-full max-w-2xl space-y-2 rounded-2xl border bg-muted/40 p-3'>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  setEditing(false)
                  onEdit(draft, message.references)
                }
              }}
            />
            <div className='flex justify-end gap-2'>
              <Button variant='ghost' size='sm' onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size='sm'
                onClick={() => {
                  setEditing(false)
                  onEdit(draft, message.references)
                }}
              >
                Resend
              </Button>
            </div>
          </div>
        ) : (
          <div className='max-w-2xl rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground'>
            <p className='whitespace-pre-wrap'>{message.content}</p>
            {message.references && message.references.length > 0 && (
              <div className='mt-2'>
                <ReferenceChips references={message.references} className='[&>span]:bg-primary-foreground/10 [&>span]:text-primary-foreground [&>span]:border-primary-foreground/20' />
              </div>
            )}
            {message.referenceErrors && message.referenceErrors.length > 0 && (
              <div className='mt-2 flex items-start gap-2 rounded-lg bg-destructive/20 px-2 py-1.5 text-xs text-primary-foreground'>
                <AlertTriangle className='mt-0.5 size-3.5 shrink-0' />
                <div className='space-y-1'>
                  {message.referenceErrors.map((e, i) => (
                    <p key={i}>
                      {e.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <div className='mt-1 flex justify-end'>
              <Button
                variant='ghost'
                size='icon'
                className='size-6 text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'
                aria-label='Edit prompt'
                onClick={() => {
                  setDraft(message.content)
                  setEditing(true)
                }}
              >
                <Pencil className='size-3.5' />
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const isStreaming = streaming && message.status === 'streaming'
  const isTerminal = message.status === 'done' || message.status === 'error' || message.status === 'cancelled'
  const hasToolEvents = message.toolEvents && message.toolEvents.length > 0
  const hasLifecycle = message.lifecycle && message.lifecycle.length > 0

  // TASK-OPENCODE-033: Live progress = tool events shown DURING streaming only
  const liveToolEvents = isStreaming ? message.toolEvents : undefined
  const hasLiveProgress = isStreaming && hasToolEvents

  // TASK-OPENCODE-050: Continuation indicator — show while continuing even if
  // the working line is otherwise hidden.
  const isContinuing = isStreaming && (message.continuations ?? 0) > 0

  return (
    <div className='group flex gap-3'>
      <div className='mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium'>
        AI
      </div>
      <div className='min-w-0 flex-1'>
        <div className='mb-1 flex items-center gap-2 text-xs text-muted-foreground'>
          <span className='font-medium text-foreground/70'>OpenCode</span>
          {message.model && <span>· {message.model}</span>}
          {message.mode && <span>· {message.mode}</span>}
          {message.tokens != null && <span>· {message.tokens} tokens</span>}
          {message.durationMs != null && (
            <span>· {(message.durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>

        <div
          className={cn(
            'rounded-2xl border bg-card px-4 py-3',
            message.status === 'error' && 'border-destructive/40'
          )}
        >
          {/* --- ACTIVE STREAMING: intermediate text + live progress --- */}
          {isStreaming && (
            <>
              {isContinuing && (
                <div className='mb-1 flex items-center gap-2 text-sm text-muted-foreground'>
                  <RotateCcw className='size-3.5 shrink-0 text-primary' />
                  <span>Melanjutkan pekerjaan…</span>
                </div>
              )}
              {message.content && <Markdown content={message.content} />}
              {hasLiveProgress ? (
                <LiveProgress toolEvents={liveToolEvents!} plan={message.plan} lifecycle={message.lifecycle} />
              ) : (
                <ProgressIndicator />
              )}
            </>
          )}

          {/* --- TERMINAL: final text + Execution Summary --- */}
          {!isStreaming && isTerminal && message.content && (
            <>
              <Markdown content={message.content} />
              {message.status === 'done' && hasToolEvents && (
                <ExecutionSummary toolEvents={message.toolEvents} exitCode={message.exitCode} />
              )}
            </>
          )}

          {/* --- TERMINAL: interrupted/cancelled (distinct from completion) --- */}
          {!isStreaming && isTerminal && message.status === 'cancelled' && !message.content && (
            <div className='space-y-2'>
              <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
                <Square className='size-3.5 shrink-0' />
                Eksekusi dihentikan
              </p>
              {hasToolEvents && (
                <ExecutionSummary toolEvents={message.toolEvents} exitCode={message.exitCode} />
              )}
            </div>
          )}

          {/* --- TERMINAL: no final text --- */}
          {!isStreaming && isTerminal && !message.content && message.executionState === 'completed_no_text' && (
            <div className='space-y-2'>
              <p className='text-sm text-muted-foreground'>
                No final response was returned.
              </p>
              <p className='text-xs text-muted-foreground/70'>
                The agent completed its available execution steps without producing a final answer.
              </p>
              {hasToolEvents && (
                <ExecutionSummary toolEvents={message.toolEvents} exitCode={message.exitCode} />
              )}
            </div>
          )}

          {/* --- TERMINAL: error --- */}
          {!isStreaming && isTerminal && message.executionState === 'error' && message.status !== 'cancelled' && (
            <div className='space-y-2'>
              <p className='flex items-center gap-1.5 text-sm text-destructive'>
                <AlertTriangle className='size-3.5 shrink-0' />
                {message.content || 'An error occurred.'}
              </p>
              {hasToolEvents && (
                <ExecutionSummary toolEvents={message.toolEvents} exitCode={message.exitCode} />
              )}
            </div>
          )}

          {/* --- TERMINAL: empty fallback --- */}
          {!isStreaming && isTerminal && !message.content && message.executionState !== 'completed_no_text' && message.executionState !== 'error' && message.status !== 'cancelled' && (
            <p className='text-sm text-muted-foreground'>Empty response.</p>
          )}

          {isStreaming && (
            <span className='ms-1 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle' />
          )}
        </div>

        {/* TASK-OPENCODE-033/050: Developer Mode diagnostics — live while streaming,
            terminal otherwise. Adds lifecycle/tool/detail for observability. */}
        {developerMode && hasToolEvents && hasLifecycle && (
          <DeveloperDiagnostics toolEvents={message.toolEvents} exitCode={message.exitCode} lifecycle={message.lifecycle} />
        )}

        <div className='mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
          <Button variant='ghost' size='icon' className='size-7' onClick={copy} aria-label='Copy response'>
            {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
          </Button>
          <Button
            variant='ghost'
            size='sm'
            className='h-7 gap-1 text-xs'
            onClick={onRetry}
            disabled={isStreaming}
          >
            <RefreshCw className='size-3.5' />
            Retry
          </Button>
          <Button
            variant='ghost'
            size='sm'
            className='h-7 gap-1 text-xs'
            onClick={onContinue}
            disabled={isStreaming || !isLast}
          >
            <CornerDownRight className='size-3.5' />
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}
