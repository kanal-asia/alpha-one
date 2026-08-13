import { Circle, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  type ProviderStatus,
  type HealthState,
} from '@/services/providers/types/Provider'

const STATUS_STYLES: Record<
  ProviderStatus,
  { dot: string; badge: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  unknown: { dot: 'bg-muted-foreground', badge: 'outline' },
  detecting: { dot: 'bg-amber-500 animate-pulse', badge: 'outline' },
  installed: { dot: 'bg-blue-500', badge: 'outline' },
  not_installed: { dot: 'bg-muted-foreground', badge: 'outline' },
  connected: { dot: 'bg-emerald-500', badge: 'default' },
  disconnected: { dot: 'bg-muted-foreground', badge: 'secondary' },
  error: { dot: 'bg-destructive', badge: 'destructive' },
  busy: { dot: 'bg-blue-500 animate-pulse', badge: 'default' },
  streaming: { dot: 'bg-emerald-500 animate-pulse', badge: 'default' },
  cancelled: { dot: 'bg-amber-500', badge: 'outline' },
  completed: { dot: 'bg-emerald-500', badge: 'default' },
  launching: { dot: 'bg-blue-500 animate-pulse', badge: 'outline' },
}

export function ConnectionIndicator({ status }: { status: ProviderStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown
  return (
    <span className='inline-flex items-center gap-1.5'>
      {status === 'detecting' ? (
        <Loader2 className={cn('size-2.5 animate-spin', style.dot)} />
      ) : (
        <Circle className={cn('size-2.5 fill-current', style.dot)} />
      )}
      <span className='text-xs capitalize text-muted-foreground'>
        {status.replace('_', ' ')}
      </span>
    </span>
  )
}

export function ProviderHealth({ health }: { health: HealthState }) {
  const label =
    health === 'healthy'
      ? 'Healthy'
      : health === 'unhealthy'
        ? 'Unhealthy'
        : 'Unknown'
  const color =
    health === 'healthy'
      ? 'text-emerald-600'
      : health === 'unhealthy'
        ? 'text-destructive'
        : 'text-muted-foreground'
  return <span className={cn('text-xs font-medium', color)}>{label}</span>
}

export function VersionBadge({ version }: { version: string | null }) {
  if (!version) return <span className='text-xs text-muted-foreground'>—</span>
  return (
    <Badge variant='outline' className='font-mono text-xs'>
      v{version}
    </Badge>
  )
}
