import { useCallback, useEffect, useState } from 'react'
import { Cloud, Loader2, LogOut, Plug, ShieldCheck, TriangleAlert } from 'lucide-react'
import { openCodeService } from '../services/opencode-service'
import type { OpenCodeAuthResult, ProviderSummary } from '../types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface ConnectProviderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CONNECTION_LABEL: Record<ProviderSummary['connection'], string> = {
  connected: 'Connected',
  configured: 'Configured',
  available: 'Available',
  unavailable: 'Unavailable',
}

export function ConnectProviderDialog({
  open,
  onOpenChange,
}: ConnectProviderDialogProps) {
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ providerId: string } & OpenCodeAuthResult | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await openCodeService.listProviders()
      setProviders(list)
    } catch {
      setProviders([])
    } finally {
      setLoading(false)
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    await load()
  }, [load])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const run = async () => {
      await Promise.resolve()
      if (cancelled) return
      await load()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [open, load])

  const handleConnect = async (provider: ProviderSummary) => {
    setBusy(provider.id)
    setResult(null)
    try {
      const res = await openCodeService.connectProvider(provider.id)
      setResult({ providerId: provider.id, ...res })
    } catch (err) {
      setResult({
        providerId: provider.id,
        ok: false,
        command: `opencode auth login --provider ${provider.id}`,
        output: err instanceof Error ? err.message : 'Connection attempt failed.',
        timedOut: false,
      })
    } finally {
      setBusy(null)
    }
  }

  const handleDisconnect = async (provider: ProviderSummary) => {
    setBusy(provider.id)
    setResult(null)
    try {
      const res = await openCodeService.disconnectProvider(provider.id)
      setResult({ providerId: provider.id, ...res })
      void reload()
    } catch (err) {
      setResult({
        providerId: provider.id,
        ok: false,
        command: `opencode auth logout ${provider.id}`,
        output: err instanceof Error ? err.message : 'Logout attempt failed.',
        timedOut: false,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setResult(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Connect Provider</DialogTitle>
          <DialogDescription>
            Providers are discovered from your local OpenCode runtime. Credentials
            are managed by OpenCode itself — never stored by the workspace.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className='max-h-80'>
          {loading ? (
            <div className='flex items-center justify-center py-10'>
              <Loader2 className='size-6 animate-spin text-muted-foreground' />
            </div>
          ) : providers.length === 0 ? (
            <p className='px-3 py-8 text-center text-sm text-muted-foreground'>
              No providers discovered. Make sure the OpenCode runtime has loaded
              models, then try again.
            </p>
          ) : (
            <ul className='divide-y'>
              {providers.map((provider) => (
                <li
                  key={provider.id}
                  className='flex items-center gap-3 px-2 py-2.5'
                >
                  <Cloud className='size-5 shrink-0 text-muted-foreground' />
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <span className='truncate text-sm font-medium'>
                        {provider.name}
                      </span>
                      <ConnectionBadge connection={provider.connection} />
                    </div>
                    <p className='truncate text-xs text-muted-foreground'>
                      {provider.modelCount} models · {provider.freeModelCount} free
                      {provider.requiresAuth && ' · requires auth'}
                    </p>
                  </div>
                  {provider.connection === 'connected' ? (
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-8 shrink-0 gap-1.5'
                      disabled={busy === provider.id}
                      onClick={() => void handleDisconnect(provider)}
                    >
                      {busy === provider.id ? (
                        <Loader2 className='size-3.5 animate-spin' />
                      ) : (
                        <LogOut className='size-3.5' />
                      )}
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-8 shrink-0 gap-1.5'
                      disabled={busy === provider.id}
                      onClick={() => void handleConnect(provider)}
                    >
                      {busy === provider.id ? (
                        <Loader2 className='size-3.5 animate-spin' />
                      ) : (
                        <Plug className='size-3.5' />
                      )}
                      Connect
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        {result && (
          <div
            className={cn(
              'space-y-2 rounded-lg border p-3 text-sm',
              result.ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5'
            )}
          >
            <div className='flex items-start gap-2'>
              {result.ok ? (
                <ShieldCheck className='mt-0.5 size-4 shrink-0 text-emerald-600' />
              ) : (
                <TriangleAlert className='mt-0.5 size-4 shrink-0 text-amber-600' />
              )}
              <div className='min-w-0 space-y-1'>
                <p className='font-medium'>
                  {result.ok ? 'Disconnected.' : 'Login requires a terminal.'}
                </p>
                <p className='text-xs text-muted-foreground'>
                  OpenCode provider login runs an interactive OAuth flow that the
                  workspace runtime cannot complete in-process. Run the command in
                  your own terminal to finish connecting, then refresh this list.
                </p>
                {!result.ok && (
                  <code className='block rounded bg-muted px-2 py-1 font-mono text-xs'>
                    {result.command}
                  </code>
                )}
                {result.output && !result.ok && (
                  <p className='text-xs text-muted-foreground'>
                    Runtime output: {result.output.slice(0, 300)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConnectionBadge({ connection }: { connection: ProviderSummary['connection'] }) {
  return (
    <Badge
      variant='outline'
      className={cn(
        'shrink-0 border-transparent px-1.5 py-0 text-[10px] font-medium',
        connection === 'connected' && 'bg-emerald-500/10 text-emerald-600',
        connection === 'configured' && 'bg-blue-500/10 text-blue-600',
        connection === 'available' && 'bg-muted text-muted-foreground',
        connection === 'unavailable' && 'bg-destructive/10 text-destructive'
      )}
    >
      {CONNECTION_LABEL[connection]}
    </Badge>
  )
}