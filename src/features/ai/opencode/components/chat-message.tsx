import { useState } from 'react'
import { AlertTriangle, Check, Copy, Pencil, RefreshCw, CornerDownRight } from 'lucide-react'
import { type ChatMessage } from '../types'
import type { ReferenceAttachment } from '@/features/ai/references/contract'
import { Markdown } from './markdown'
import { ReferenceChips } from './reference-chips'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

type ChatMessageProps = {
  message: ChatMessage
  isLast: boolean
  streaming: boolean
  onRetry: () => void
  onEdit: (text: string, references?: ReferenceAttachment[]) => void
  onContinue: () => void
}

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
            <Markdown content={message.content} />
          ) : isStreaming ? (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <span className='flex gap-1'>
                <span className='inline-block size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]' />
                <span className='inline-block size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]' />
                <span className='inline-block size-1.5 animate-bounce rounded-full bg-current' />
              </span>
              <span>Thinking…</span>
            </div>
          ) : (
            <p className='text-sm text-muted-foreground'>Empty response.</p>
          )}
          {isStreaming && (
            <span className='ms-1 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle' />
          )}
        </div>

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
