import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Cloud,
  KeyRound,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { AILayout } from '@/features/ai/components/ai-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  type ProviderConfigState,
  deleteProviderKey,
  listProviders,
  saveProviderKey,
  toggleProvider,
  validateProvider,
} from '../services/providers-config'

export function ProviderSettingsPage() {
  const [providers, setProviders] = useState<ProviderConfigState[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      setProviders(await listProviders())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load providers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (id: string, fn: () => Promise<ProviderConfigState[]>) => {
    setBusyId(id)
    try {
      setProviders(await fn())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleSaveKey = (id: string) => {
    const key = keys[id]?.trim()
    if (!key) {
      toast.error('Enter an API key first.')
      return
    }
    void run(id, () => saveProviderKey(id, key))
    setKeys((prev) => ({ ...prev, [id]: '' }))
  }

  const handleValidate = async (id: string) => {
    setBusyId(id)
    setResults((prev) => ({ ...prev, [id]: 'Validating...' }))
    try {
      const res = await validateProvider(id)
      setProviders(res.providers)
      setResults((prev) => ({
        ...prev,
        [id]: res.ok ? `OK · ${res.modelCount} models · ${res.latencyMs}ms` : res.message,
      }))
      if (!res.ok) toast.error(res.message)
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : 'Validation failed',
      }))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <AILayout>
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='size-4 animate-spin' />
          Loading providers...
        </div>
      </AILayout>
    )
  }

  return (
    <AILayout>
      <div className='mx-auto max-w-3xl space-y-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>AI Provider Settings</h1>
          <p className='text-sm text-muted-foreground'>
            Add API keys for cloud providers. Keys are stored locally on this
            machine and are only sent to the provider you configure. Zero-config
            works without any key — free OpenCode models are used automatically.
          </p>
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              busy={busyId === provider.id}
              apiKeyDraft={keys[provider.id] ?? ''}
              result={results[provider.id]}
              onKeyChange={(value) =>
                setKeys((prev) => ({ ...prev, [provider.id]: value }))
              }
              onSaveKey={() => handleSaveKey(provider.id)}
              onRemoveKey={() => void run(provider.id, () => deleteProviderKey(provider.id))}
              onValidate={() => void handleValidate(provider.id)}
              onToggle={(enabled) => void run(provider.id, () => toggleProvider(provider.id, enabled))}
            />
          ))}
        </div>
      </div>
    </AILayout>
  )
}

type ProviderCardProps = {
  provider: ProviderConfigState
  busy: boolean
  apiKeyDraft: string
  result?: string
  onKeyChange: (value: string) => void
  onSaveKey: () => void
  onRemoveKey: () => void
  onValidate: () => void
  onToggle: (enabled: boolean) => void
}

function ProviderCard({
  provider,
  busy,
  apiKeyDraft,
  result,
  onKeyChange,
  onSaveKey,
  onRemoveKey,
  onValidate,
  onToggle,
}: ProviderCardProps) {
  return (
    <Card className={cn(!provider.enabled && 'opacity-70')}>
      <CardHeader className='space-y-0 pb-2'>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2 text-sm font-medium'>
            <Cloud className='size-4' />
            {provider.name}
          </CardTitle>
          <div className='flex items-center gap-2'>
            <HealthBadge state={provider.health} />
            <Switch
              checked={provider.enabled}
              onCheckedChange={onToggle}
              aria-label={`Enable ${provider.name}`}
            />
          </div>
        </div>
        <CardDescription className='pt-1 text-xs'>
          {provider.description}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='space-y-1.5'>
          <Label className='text-xs'>API Key</Label>
          {provider.apiKeySet ? (
            <div className='flex items-center gap-2'>
              <div className='flex h-8 flex-1 items-center rounded-md border bg-muted/40 px-3 font-mono text-xs text-muted-foreground'>
                {provider.apiKeyMasked}
              </div>
              <Button
                variant='outline'
                size='sm'
                className='h-8 gap-1'
                onClick={onRemoveKey}
                disabled={busy}
              >
                <Trash2 className='size-3.5' />
                Remove
              </Button>
            </div>
          ) : (
            <div className='flex items-center gap-2'>
              <Input
                type='password'
                placeholder='sk-...'
                className='h-8'
                value={apiKeyDraft}
                onChange={(e) => onKeyChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSaveKey()}
              />
              <Button
                variant='outline'
                size='sm'
                className='h-8 gap-1'
                onClick={onSaveKey}
                disabled={busy || !apiKeyDraft.trim()}
              >
                <KeyRound className='size-3.5' />
                Save
              </Button>
            </div>
          )}
        </div>

        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              className='h-7 gap-1 text-[11px]'
              onClick={onValidate}
              disabled={busy || !provider.apiKeySet}
            >
              <RefreshCw className={cn('size-3', busy && 'animate-spin')} />
              Validate Connection
            </Button>
          </div>
          <div className='text-right text-[11px] text-muted-foreground'>
            {provider.lastHealthCheck && (
              <p>
                Last check:{' '}
                {new Date(provider.lastHealthCheck).toLocaleTimeString()}
              </p>
            )}
            {provider.modelCount != null && <p>{provider.modelCount} models</p>}
          </div>
        </div>

        {result && (
          <p
            className={cn(
              'text-[11px]',
              result.startsWith('OK') ? 'text-emerald-600' : 'text-destructive'
            )}
          >
            {result}
          </p>
        )}
        {provider.lastError && !result && (
          <p className='text-[11px] text-destructive'>{provider.lastError}</p>
        )}
      </CardContent>
    </Card>
  )
}

function HealthBadge({ state }: { state: ProviderConfigState['health'] }) {
  if (state === 'unknown') {
    return (
      <Badge variant='outline' className='text-[10px] text-muted-foreground'>
        Not checked
      </Badge>
    )
  }
  const ok = state === 'ok'
  return (
    <Badge
      variant='outline'
      className={cn(
        'text-[10px]',
        ok ? 'text-emerald-600' : 'text-destructive'
      )}
    >
      {ok ? <Check className='me-0.5 inline size-3' /> : <X className='me-0.5 inline size-3' />}
      {ok ? 'Connected' : 'Failed'}
    </Badge>
  )
}
