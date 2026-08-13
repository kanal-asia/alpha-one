import { Circle } from 'lucide-react'
import { type ModelInfo } from '../types'
import {
  useRuntimeStore,
  CONNECTION_LABEL,
  type RuntimeConnectionState,
} from '@/features/runtime'
import { useOpenCodeStore } from '../store/opencode-store'
import { cn } from '@/lib/utils'

const dot: Record<RuntimeConnectionState, string> = {
  stopped: 'bg-muted-foreground/50',
  starting_runtime: 'bg-amber-500 animate-pulse',
  checking_opencode: 'bg-amber-500 animate-pulse',
  loading_models: 'bg-amber-500 animate-pulse',
  ready: 'bg-emerald-500',
  busy: 'bg-sky-500',
  stopping: 'bg-amber-500 animate-pulse',
  api_offline: 'bg-rose-500',
  cli_not_installed: 'bg-rose-500',
  model_discovery_failed: 'bg-rose-500',
  error: 'bg-rose-500',
}

type StatusIndicatorProps = {
  model?: ModelInfo
  tokens?: number
  latency?: string
}

export function StatusIndicator({ model, tokens, latency }: StatusIndicatorProps) {
  const connection = useRuntimeStore((s) => s.connection)
  const isStreaming = useOpenCodeStore((s) => s.isStreaming)
  const display: RuntimeConnectionState =
    isStreaming && (connection === 'ready' || connection === 'busy') ? 'busy' : connection

  return (
    <div className='flex items-center gap-3 text-xs text-muted-foreground'>
      <span className='flex items-center gap-1.5'>
        <Circle className={cn('size-2.5 fill-current', dot[display])} />
        <span className='font-medium text-foreground/80'>
          {CONNECTION_LABEL[display]}
        </span>
      </span>
      {model && <span className='hidden sm:inline'>{model.displayName}</span>}
      {latency && <span className='hidden md:inline'>· {latency} latency</span>}
      {tokens != null && <span className='hidden md:inline'>· {tokens} tokens</span>}
    </div>
  )
}
