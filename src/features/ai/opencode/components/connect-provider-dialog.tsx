import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Cloud,
  Copy,
  Loader2,
  LogOut,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { openCodeService } from '../services/opencode-service'
import type { OpenCodeAuthResult, ProviderSummary } from '../types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  available: 'Not connected',
  unavailable: 'Unavailable',
}

function isConnected(p: ProviderSummary): boolean {
  return p.connection === 'connected' || p.connection === 'configured'
}

export function ConnectProviderDialog({
  open,
  onOpenChange,
}: ConnectProviderDialogProps) {
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ providerId: string } & OpenCodeAuthResult | null>(null)
  const [copied, setCopied] = useState(false)

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? providers.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
        )
      : providers
    const connected = list.filter(isConnected)
    const available = list.filter((p) => !isConnected(p))
    return { connected, available }
  }, [providers, query])

  const handleConnect = async (provider: ProviderSummary) => {
    setBusy(provider.id)
    setResult(null)
    setCopied(false)
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
    setCopied(false)
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

  const handleCopyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const connectedCount = filtered.connected.length
  const availableCount = filtered.available.length

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setResult(null)
          setQuery('')
        }
        onOpenChange(o)
      }}
    >
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Connect Provider</DialogTitle>
          <DialogDescription>
            Providers come from your local OpenCode runtime and its models.dev
            registry. Credentials are managed by OpenCode itself — never stored
            by the workspace.
          </DialogDescription>
        </DialogHeader>

        <div className='flex items-center gap-2'>
          <div className='relative flex-1'>
            <Search className='absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search providers...'
              className='h-8 ps-7'
            />
          </div>
          <Button
            variant='outline'
            size='sm'
            className='h-8 shrink-0 gap-1.5'
            onClick={() => void reload()}
            disabled={loading}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            Refresh Providers
          </Button>
        </div>

        <ScrollArea className='max-h-80'>
          {loading ? (
            <div className='flex items-center justify-center py-10'>
              <Loader2 className='size-6 animate-spin text-muted-foreground' />
            </div>
          ) : providers.length === 0 ? (
            <p className='px-3 py-8 text-center text-sm text-muted-foreground'>
              No providers discovered. Make sure the OpenCode runtime has loaded
              models, then try refreshing.
            </p>
          ) : (
            <div className='space-y-3'>
              {connectedCount > 0 && (
                <ProviderSection title='Connected' count={connectedCount}>
                  {filtered.connected.map((provider) => (
                    <ProviderRow
                      key={provider.id}
                      provider={provider}
                      busy={busy === provider.id}
                      onConnect={() => void handleConnect(provider)}
                      onDisconnect={() => void handleDisconnect(provider)}
                    />
                  ))}
                </ProviderSection>
              )}
              {availableCount > 0 && (
                <ProviderSection title='Available' count={availableCount}>
                  {filtered.available.map((provider) => (
                    <ProviderRow
                      key={provider.id}
                      provider={provider}
                      busy={busy === provider.id}
                      onConnect={() => void handleConnect(provider)}
                      onDisconnect={() => void handleDisconnect(provider)}
                    />
                  ))}
                </ProviderSection>
              )}
              {connectedCount === 0 && availableCount === 0 && (
                <p className='px-3 py-8 text-center text-sm text-muted-foreground'>
                  No providers match &quot;{query}&quot;.
                </p>
              )}
            </div>
          )}
        </ScrollArea>

        {result && (
          <div
            className={cn(
              'space-y-2 rounded-lg border p-3 text-sm',
              result.ok
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-amber-500/40 bg-amber-500/5'
            )}
          >
            <div className='flex items-start gap-2'>
              {result.ok ? (
                <ShieldCheck className='mt-0.5 size-4 shrink-0 text-emerald-600' />
              ) : (
                <TriangleAlert className='mt-0.5 size-4 shrink-0 text-amber-600' />
              )}
              <div className='min-w-0 flex-1 space-y-1'>
                {result.ok ? (
                  <p className='font-medium'>Disconnected.</p>
                ) : (
                  <>
                    <p className='font-medium'>
                      Authentication requires terminal interaction
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      OpenCode provider login runs an interactive flow that the
                      workspace runtime cannot complete in-process. Run the
                      command in your own terminal, then click{' '}
                      <span className='font-medium'>Refresh Providers</span> to
                      re-read the connection state.
                    </p>
                    <div className='flex items-center gap-2'>
                      <code className='min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs'>
                        {result.command}
                      </code>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='size-6 shrink-0'
                        aria-label='Copy command'
                        onClick={() => void handleCopyCommand(result.command)}
                      >
                        {copied ? (
                          <ShieldCheck className='size-3.5 text-emerald-600' />
                        ) : (
                          <Copy className='size-3.5' />
                        )}
                      </Button>
                    </div>
                  </>
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

function ProviderSection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <p className='px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
        {title} · {count}
      </p>
      <ul className='divide-y'>{children}</ul>
    </div>
  )
}

function ProviderRow({
  provider,
  busy,
  onConnect,
  onDisconnect,
}: {
  provider: ProviderSummary
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
}) {
  const connected = isConnected(provider)
  return (
    <li className='flex items-center gap-3 px-2 py-2.5'>
      <Cloud className='size-5 shrink-0 text-muted-foreground' />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='truncate text-sm font-medium'>{provider.name}</span>
          <ConnectionBadge connection={provider.connection} />
          {provider.source === 'registry' && (
            <span className='shrink-0 text-[10px] text-muted-foreground/60'>
              registry
            </span>
          )}
        </div>
        <p className='truncate text-xs text-muted-foreground'>
          {provider.modelCount} models · {provider.freeModelCount} free
          {provider.requiresAuth && ' · requires auth'}
        </p>
      </div>
      {connected ? (
        <Button
          variant='outline'
          size='sm'
          className='h-8 shrink-0 gap-1.5'
          disabled={busy}
          onClick={onDisconnect}
        >
          {busy ? <Loader2 className='size-3.5 animate-spin' /> : <LogOut className='size-3.5' />}
          Disconnect
        </Button>
      ) : (
        <Button
          variant='outline'
          size='sm'
          className='h-8 shrink-0 gap-1.5'
          disabled={busy}
          onClick={onConnect}
        >
          {busy ? <Loader2 className='size-3.5 animate-spin' /> : <Plug className='size-3.5' />}
          Connect
        </Button>
      )}
    </li>
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