import { type ExecutionLogEntry } from '../types'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

const levelMeta: Record<
  ExecutionLogEntry['level'],
  string
> = {
  info: 'text-muted-foreground',
  error: 'text-rose-500',
  result: 'text-emerald-500',
}

export function ExecutionLog({ logs }: { logs: ExecutionLogEntry[] }) {
  return (
    <ScrollArea className='h-56 rounded-md border bg-muted/20 p-2'>
      {logs.length === 0 ? (
        <p className='px-2 py-4 text-center text-xs text-muted-foreground'>
          No logs yet.
        </p>
      ) : (
        <ul className='space-y-1 font-mono text-xs'>
          {logs.map((log) => (
            <li key={log.id} className={cn('break-all', levelMeta[log.level])}>
              {log.message}
            </li>
          ))}
        </ul>
      )}
    </ScrollArea>
  )
}
