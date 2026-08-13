import { useCallback, useEffect, useState } from 'react'
import { FileJson2, Loader2, Save, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ModelInfo } from '../types'

interface OpenCodeConfigState {
  resolvedPath: string
  exists: boolean
  config: Record<string, unknown>
  cwd: string
}

const API_BASE = '/api/opencode'

export function OpenCodeConfigCard({ models }: { models: ModelInfo[] }) {
  const [state, setState] = useState<OpenCodeConfigState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/config`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState(await res.json())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config.')
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
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
  }, [load])

  const configModel =
    typeof state?.config?.model === 'string' ? state.config.model : ''

  const handleSave = async () => {
    if (!state) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch: { model: configModel } }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setState(await res.json())
      toast.success('Saved to the active OpenCode config.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save config.')
    } finally {
      setSaving(false)
    }
  }

  const keyCount = state ? Object.keys(state.config).length : 0

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <div className='space-y-0.5'>
          <Label>Config File</Label>
          <p className='font-mono text-xs text-muted-foreground'>
            {state?.resolvedPath ?? 'Loading...'}
          </p>
        </div>
        {state && (
          <Badge
            variant='outline'
            className={cn(
              'shrink-0 border-transparent',
              state.exists
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-amber-500/10 text-amber-600'
            )}
          >
            {state.exists ? 'Found' : 'Not created yet'}
          </Badge>
        )}
      </div>

      {error && (
        <p className='flex items-center gap-1.5 text-xs text-destructive'>
          <TriangleAlert className='size-3.5' />
          {error}
        </p>
      )}

      {loading ? (
        <div className='flex items-center gap-2 py-2 text-xs text-muted-foreground'>
          <Loader2 className='size-3.5 animate-spin' />
          Reading active configuration...
        </div>
      ) : (
        state && (
          <>
            <div className='space-y-1'>
              <Label htmlFor='oc-config-model'>Default Model (opencode.json)</Label>
              <div className='flex items-center gap-2'>
                <Select
                  value={configModel}
                  onValueChange={(v) =>
                    setState((s) =>
                      s
                        ? { ...s, config: { ...s.config, model: v } }
                        : s
                    )
                  }
                >
                  <SelectTrigger id='oc-config-model' className='flex-1'>
                    <SelectValue placeholder='Inherit default' />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-9 shrink-0 gap-1.5'
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className='size-3.5 animate-spin' />
                  ) : (
                    <Save className='size-3.5' />
                  )}
                  Save
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                {state.exists
                  ? `Existing config preserved (${keyCount} top-level keys kept).`
                  : 'No config exists yet — saving creates the file above (the real OpenCode config, not a workspace copy).'}
              </p>
            </div>

            <div className='flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground'>
              <FileJson2 className='size-3.5 shrink-0' />
              <span className='truncate'>
                Values containing API keys or secrets are redacted.
              </span>
            </div>
          </>
        )
      )}
    </div>
  )
}