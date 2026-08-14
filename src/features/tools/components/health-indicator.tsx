import { cn } from '@/lib/utils'
import { type HealthState, type ToolStatus } from '../types'

const healthMeta: Record<HealthState, { dot: string; label: string }> = {
  healthy: { dot: 'bg-emerald-500', label: 'Healthy' },
  unhealthy: { dot: 'bg-rose-500', label: 'Unhealthy' },
  unknown: { dot: 'bg-muted-foreground/40', label: 'Unknown' },
}

export function HealthIndicator({ state }: { state: HealthState }) {
  const meta = healthMeta[state]
  return (
    <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
      <span className={cn('size-2 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

const statusMeta: Record<ToolStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  installed: { label: 'Installed', variant: 'default' },
  running: { label: 'Running', variant: 'default' },
  stopped: { label: 'Stopped', variant: 'outline' },
  not_installed: { label: 'Not Installed', variant: 'secondary' },
  error: { label: 'Error', variant: 'destructive' },
}

export function ToolStatusBadge({ status }: { status: ToolStatus }) {
  const meta = statusMeta[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        meta.variant === 'default' &&
          'border-transparent bg-primary text-primary-foreground',
        meta.variant === 'secondary' &&
          'border-transparent bg-secondary text-secondary-foreground',
        meta.variant === 'destructive' &&
          'border-transparent bg-destructive text-white',
        meta.variant === 'outline' && 'text-foreground'
      )}
    >
      {meta.label}
    </span>
  )
}
