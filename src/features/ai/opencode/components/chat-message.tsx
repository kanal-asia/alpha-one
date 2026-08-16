import { useState } from 'react'
import { AlertTriangle, Check, Copy, Pencil, RefreshCw, CornerDownRight, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { type ChatMessage, type ToolEvent, type ExecutionState } from '../types'
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
// TASK-OPENCODE-030: Execution state labels
// ---------------------------------------------------------------------------

const EXEC_STATE_LABELS: Record<ExecutionState, string> = {
  idle: '',
  working: 'Working…',
  progress: 'Working…',
  completed: 'Completed',
  completed_no_text: 'Execution completed',
  error: 'Request failed',
  cancelled: 'Cancelled',
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

function DeveloperDiagnostics({ toolEvents, exitCode }: { toolEvents?: ToolEvent[]; exitCode?: number }) {
  const [expanded, setExpanded] = useState(false)

  if (!toolEvents || toolEvents.length === 0) return null

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
          {toolEvents.map((e) => (
            <div key={e.id} className='flex gap-2'>
              <span className={cn(
                'shrink-0',
                e.status === 'completed' ? 'text-green-500' : e.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
              )}>
                [{e.status}]
              </span>
              <span className='shrink-0'>{e.tool}</span>
              <span className='truncate opacity-60'>{e.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TASK-OPENCODE-030: Progress indicator
// ---------------------------------------------------------------------------

function ProgressIndicator({ toolEvents }: { toolEvents?: ToolEvent[] }) {
  const lastEvent = toolEvents?.[toolEvents.length - 1]
  const label = lastEvent?.label ?? 'Working…'

  return (
    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
      <span className='flex gap-1'>
        <span className='inline-block size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]' />
        <span className='inline-block size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]' />
        <span className='inline-block size-1.5 animate-bounce rounded-full bg-current' />
      </span>
      <span>{label}</span>
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
  const execState = message.executionState ?? (isStreaming ? 'working' : message.content ? 'completed' : 'idle')
  const hasToolEvents = message.toolEvents && message.toolEvents.length > 0

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
          {message.content ? (
            <>
              <Markdown content={message.content} />
              {/* TASK-OPENCODE-030: Execution summary below response */}
              {message.status === 'done' && hasToolEvents && (
                <ExecutionSummary toolEvents={message.toolEvents} exitCode={message.exitCode} />
              )}
            </>
          ) : isStreaming ? (
            <ProgressIndicator toolEvents={message.toolEvents} />
          ) : message.executionState === 'completed_no_text' ? (
            /* TASK-OPENCODE-030: Graceful no-final-text state */
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
          ) : message.executionState === 'error' ? (
            <p className='text-sm text-destructive'>{message.content || 'An error occurred.'}</p>
          ) : (
            <p className='text-sm text-muted-foreground'>Empty response.</p>
          )}
          {isStreaming && (
            <span className='ms-1 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle' />
          )}
        </div>

        {/* TASK-OPENCODE-030: Developer Mode diagnostics */}
        {developerMode && message.status === 'done' && hasToolEvents && (
          <DeveloperDiagnostics toolEvents={message.toolEvents} exitCode={message.exitCode} />
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
