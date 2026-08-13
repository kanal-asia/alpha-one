import { useEffect, useState } from 'react'
import {
  Circle,
  ChevronDown,
  ChevronUp,
  FileWarning,
  Loader2,
  RotateCcw,
  TerminalSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useRuntimeStore } from '../store/runtime-store'
import { useOpenCodeStore } from '@/features/ai/opencode/store/opencode-store'
import { CONNECTION_LABEL, type RuntimeConnectionState } from '../types'

const dotColor: Record<RuntimeConnectionState, string> = {
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

function isPending(connection: RuntimeConnectionState): boolean {
  return (
    connection === 'starting_runtime' ||
    connection === 'checking_opencode' ||
    connection === 'loading_models' ||
    connection === 'stopping'
  )
}

export function RuntimeStatusBar() {
  const {
    connection,
    snapshot,
    logsOpen,
    setLogsOpen,
    restart,
    refreshModels,
  } = useRuntimeStore()
  const isStreaming = useOpenCodeStore((s) => s.isStreaming)
  const [showInstallHint, setShowInstallHint] = useState(false)

  useEffect(() => {
    useRuntimeStore.getState().init()
  }, [])

  const displayConnection: RuntimeConnectionState =
    isStreaming && (connection === 'ready' || connection === 'busy')
      ? 'busy'
      : connection

  const pending = isPending(displayConnection)
  const ready = displayConnection === 'ready'
  const failed =
    displayConnection === 'api_offline' ||
    displayConnection === 'cli_not_installed' ||
    displayConnection === 'model_discovery_failed' ||
    displayConnection === 'error'

  return (
    <div className='border-b bg-background/95 backdrop-blur'>
      <div className='flex h-9 items-center gap-2 px-4 text-xs'>
        <span className='flex items-center gap-1.5'>
          {pending ? (
            <Loader2 className='size-3.5 animate-spin text-amber-500' />
          ) : (
            <Circle
              className={cn('size-2.5 fill-current', dotColor[displayConnection])}
            />
          )}
          <span
            className={cn(
              'font-medium',
              failed ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {CONNECTION_LABEL[displayConnection]}
          </span>
        </span>

        {ready && snapshot?.workspace && (
          <span className='hidden items-center gap-1.5 text-muted-foreground sm:flex'>
            <span className='text-muted-foreground/50'>·</span>
            <span className='font-medium text-foreground/80'>
              {snapshot.workspace.name}
            </span>
            {snapshot.workspace.gitBranch && (
              <span className='rounded bg-muted px-1.5 py-0.5 text-[10px]'>
                {snapshot.workspace.gitBranch}
              </span>
            )}
            {snapshot.workspace.packageManager && (
              <span className='rounded bg-muted px-1.5 py-0.5 text-[10px]'>
                {snapshot.workspace.packageManager}
              </span>
            )}
            <span className='text-muted-foreground/50'>·</span>
            <span>
              {snapshot.models.free} free models
            </span>
          </span>
        )}

        {displayConnection === 'cli_not_installed' && (
          <span className='hidden text-muted-foreground md:inline'>
            Install with: npm i -g opencode-ai
          </span>
        )}

        {displayConnection === 'model_discovery_failed' && (
          <span className='hidden text-muted-foreground md:inline'>
            No models discovered from the OpenCode CLI.
          </span>
        )}

        <div className='ms-auto flex items-center gap-1'>
          {failed && (
            <Button
              variant='outline'
              size='sm'
              className='h-6 gap-1 px-2 text-[11px]'
              onClick={() => {
                setShowInstallHint(false)
                void restart()
              }}
            >
              <RotateCcw className='size-3' />
              {displayConnection === 'cli_not_installed' ? 'Retry' : 'Restart Runtime'}
            </Button>
          )}
          {displayConnection === 'model_discovery_failed' && (
            <Button
              variant='outline'
              size='sm'
              className='h-6 gap-1 px-2 text-[11px]'
              onClick={() => void refreshModels()}
            >
              <RotateCcw className='size-3' />
              Refresh Models
            </Button>
          )}
          <Button
            variant='ghost'
            size='sm'
            className='h-6 gap-1 px-2 text-[11px]'
            onClick={() => setLogsOpen(!logsOpen)}
          >
            <TerminalSquare className='size-3' />
            Logs
            {logsOpen ? (
              <ChevronUp className='size-3' />
            ) : (
              <ChevronDown className='size-3' />
            )}
          </Button>
        </div>
      </div>

      {showInstallHint && (
        <div className='px-4 pb-2 text-[11px] text-destructive'>
          OpenCode CLI not found on PATH. Run <code>npm i -g opencode-ai</code> and
          restart the runtime.
        </div>
      )}

      {logsOpen && <RuntimeLogs />}
    </div>
  )
}

function RuntimeLogs() {
  const logs = useRuntimeStore((s) => s.logs)
  if (logs.length === 0) {
    return (
      <div className='border-t px-4 py-3 text-xs text-muted-foreground'>
        <FileWarning className='me-1 inline size-3.5' />
        No startup events yet.
      </div>
    )
  }
  return (
    <div className='max-h-64 overflow-y-auto border-t bg-muted/30 px-4 py-2'>
      <div className='space-y-1'>
        {logs.map((log) => (
          <div key={log.id} className='flex items-start gap-2 text-[11px] leading-5'>
            <span className='shrink-0 font-mono text-muted-foreground/60'>
              {new Date(log.ts).toLocaleTimeString()}
            </span>
            <span
              className={cn(
                'shrink-0 font-medium uppercase tracking-wide',
                log.level === 'error'
                  ? 'text-destructive'
                  : log.level === 'warn'
                    ? 'text-amber-600'
                    : 'text-muted-foreground'
              )}
            >
              {log.stage}
            </span>
            <span className='min-w-0 break-words text-muted-foreground'>
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
