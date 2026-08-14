import { type ToolExecution } from '../types'
import { cn } from '@/lib/utils'

const statusMeta: Record<
  ToolExecution['status'],
  { dot: string; label: string }
> = {
  queued: { dot: 'bg-muted-foreground/40', label: 'Queued' },
  running: { dot: 'bg-blue-500', label: 'Running' },
  succeeded: { dot: 'bg-emerald-500', label: 'Succeeded' },
  failed: { dot: 'bg-rose-500', label: 'Failed' },
  cancelled: { dot: 'bg-amber-500', label: 'Cancelled' },
}

export function ExecutionTimeline({ executions }: { executions: ToolExecution[] }) {
  if (executions.length === 0) {
    return (
      <p className='py-8 text-center text-sm text-muted-foreground'>
        No executions yet.
      </p>
    )
  }
  return (
    <ol className='relative space-y-4 border-s ps-4'>
      {executions.map((exec) => {
        const meta = statusMeta[exec.status]
        return (
          <li key={exec.id} className='relative'>
            <span
              className={cn(
                'absolute -start-[1.30rem] mt-1 size-2.5 rounded-full',
                meta.dot
              )}
            />
            <div className='flex items-center justify-between gap-2'>
              <span className='text-sm font-medium'>{exec.toolName}</span>
              <span className='text-xs text-muted-foreground'>
                {meta.label}
                {exec.durationMs != null && ` · ${exec.durationMs}ms`}
              </span>
            </div>
            <p className='font-mono text-xs text-muted-foreground'>{exec.id}</p>
          </li>
        )
      })}
    </ol>
  )
}
