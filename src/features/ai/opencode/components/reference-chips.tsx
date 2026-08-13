import { Cloud, File as FileIcon, X } from 'lucide-react'
import type { ReferenceAttachment } from '@/features/ai/references/contract'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ReferenceChips({
  references,
  onRemove,
  className,
}: {
  references: ReferenceAttachment[]
  onRemove?: (index: number) => void
  className?: string
}) {
  if (references.length === 0) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {references.map((ref, i) => (
        <span
          key={ref.fileId ?? ref.path ?? `${ref.provider}-${ref.name}-${i}`}
          className='inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 text-xs text-foreground/80'
        >
          {ref.provider === 'google_drive' ? (
            <Cloud className='size-3 shrink-0' />
          ) : (
            <FileIcon className='size-3 shrink-0' />
          )}
          <span className='max-w-[180px] truncate' title={ref.path ?? ref.name}>
            {ref.name}
          </span>
          {onRemove && (
            <Button
              variant='ghost'
              size='icon'
              className='-me-1 size-4 rounded-full'
              onClick={() => onRemove(i)}
              aria-label={`Remove ${ref.name}`}
            >
              <X className='size-2.5' />
            </Button>
          )}
        </span>
      ))}
    </div>
  )
}