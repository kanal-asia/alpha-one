import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowUp, Paperclip, Square } from 'lucide-react'
import type { ReferenceAttachment } from '@/features/ai/references/contract'
import type { SkillDefinition } from '@/features/skills/types'
import { useSkillStore } from '@/features/skills/skill-store'
import { SkillPalette } from '@/features/skills/skill-palette'
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
  const attachBtnRef = useRef<HTMLButtonElement>(null)

  // MSI-067: desktop File → Attach Reference command reuses this composer's
  // existing reference picker by activating its trigger button.
  useEffect(() => {
    const onMenuAttach = () => {
      attachBtnRef.current?.click()
    }
    window.addEventListener('alpha-one:attach-reference', onMenuAttach)
    return () =>
      window.removeEventListener('alpha-one:attach-reference', onMenuAttach)
  }, [])

  // Slash command palette state
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')

  const autoResize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }

  useEffect(() => {
    autoResize()
  }, [value, attachments])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setValue(v)

    // Detect slash command at cursor position
    const cursorPos = e.target.selectionStart ?? v.length
    const textBeforeCursor = v.slice(0, cursorPos)
    const slashMatch = textBeforeCursor.match(/^\/(\w*)$/)

    if (slashMatch) {
      setSlashOpen(true)
      setSlashQuery(slashMatch[1])
    } else {
      setSlashOpen(false)
      setSlashQuery('')
    }
  }

  const handleSkillSelect = useCallback(
    (skill: SkillDefinition) => {
      const resolved = useSkillStore.getState().resolveSkill(skill.command)
      if (resolved) {
        setValue(resolved.promptTemplate)
      }
      setSlashOpen(false)
      setSlashQuery('')
      ref.current?.focus()
    },
    []
  )

  const handleSlashClose = useCallback(() => {
    setSlashOpen(false)
    setSlashQuery('')
  }, [])

  const submit = () => {
    const text = value.trim()
    if (!text || isStreaming || disabled) return
    onSend(text, attachments)
    setValue('')
    setAttachments([])
  }

  return (
    <div className='relative rounded-2xl border bg-card shadow-sm'>
      {attachments.length > 0 && (
        <ReferenceChips
          references={attachments}
          onRemove={(i) =>
            setAttachments((prev) => prev.filter((_, idx) => idx !== i))
          }
          className='px-2 pt-1.5'
        />
      )}
      <SkillPalette
        open={slashOpen}
        query={slashQuery}
        onSelect={handleSkillSelect}
        onClose={handleSlashClose}
      />
      {/* TASK-077C1: Single horizontal interaction line — attach → input → submit.
          items-end keeps buttons anchored at bottom when textarea grows multiline. */}
      <div className='flex items-end gap-0.5 p-1.5'>
        <ReferenceSourcePicker
          onAddReference={(ref) =>
            setAttachments((prev) => [...prev, ref])
          }
        >
          {({ open }) => (
            <Button
              ref={attachBtnRef}
              variant='ghost'
              size='icon'
              className='size-7 shrink-0'
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
        <textarea
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !slashOpen) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder='Message OpenCode…'
          className='min-h-[28px] max-h-[220px] flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground'
        />
        {isStreaming ? (
          <Button size='icon' className='size-7 shrink-0 rounded-full' onClick={onStop} aria-label='Stop'>
            <Square className='size-3.5' />
          </Button>
        ) : (
          <Button
            size='icon'
            className='size-7 shrink-0 rounded-full'
            onClick={submit}
            disabled={disabled || !value.trim()}
            aria-label='Send'
          >
            <ArrowUp className='size-3.5' />
          </Button>
        )}
      </div>
    </div>
  )
}