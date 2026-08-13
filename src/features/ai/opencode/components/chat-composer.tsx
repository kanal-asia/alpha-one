import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Paperclip, Square } from 'lucide-react'
import type { ReferenceAttachment } from '@/features/ai/references/contract'
import { Button } from '@/components/ui/button'
import { ReferenceChips } from './reference-chips'
import { ReferenceSourcePicker } from './reference-source-picker'

type ChatComposerProps = {
  onSend: (text: string, references?: ReferenceAttachment[]) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
}

export function ChatComposer({
  onSend,
  onStop,
  isStreaming,
  disabled,
}: ChatComposerProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<ReferenceAttachment[]>([])
  const ref = useRef<HTMLTextAreaElement>(null)

  const autoResize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }

  useEffect(() => {
    autoResize()
  }, [value, attachments])

  const submit = () => {
    const text = value.trim()
    if (!text || isStreaming || disabled) return
    onSend(text, attachments)
    setValue('')
    setAttachments([])
  }

  const tokenCount = value.trim() ? value.trim().split(/\s+/).length : 0

  return (
    <div className='rounded-2xl border bg-card p-2 shadow-sm'>
      {attachments.length > 0 && (
        <ReferenceChips
          references={attachments}
          onRemove={(i) =>
            setAttachments((prev) => prev.filter((_, idx) => idx !== i))
          }
          className='px-1 pb-1'
        />
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        rows={1}
        placeholder='Message OpenCode…  (Enter to send, Shift+Enter for newline)'
        className='max-h-[220px] w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground'
      />
      <div className='flex items-center justify-between px-1 pt-1'>
        <div className='flex items-center gap-1'>
          <ReferenceSourcePicker
            onAddReference={(ref) =>
              setAttachments((prev) => [...prev, ref])
            }
          >
            {({ open }) => (
              <Button
                variant='ghost'
                size='icon'
                className='size-8'
                aria-label='Attach file reference'
                type='button'
                disabled={isStreaming}
                title='Attach a file reference'
                data-state={open ? 'open' : 'closed'}
              >
                <Paperclip className='size-4' />
              </Button>
            )}
          </ReferenceSourcePicker>
          <span className='text-xs text-muted-foreground'>{tokenCount} tokens</span>
        </div>
        {isStreaming ? (
          <Button size='icon' className='size-8 rounded-full' onClick={onStop} aria-label='Stop'>
            <Square className='size-4' />
          </Button>
        ) : (
          <Button
            size='icon'
            className='size-8 rounded-full'
            onClick={submit}
            disabled={disabled || !value.trim()}
            aria-label='Send'
          >
            <ArrowUp className='size-4' />
          </Button>
        )}
      </div>
    </div>
  )
}