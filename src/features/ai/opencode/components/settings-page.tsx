import { useState } from 'react'
import { Plug, RefreshCw } from 'lucide-react'
import { AILayout } from '../../components/ai-layout'
import { useOpenCodeStore } from '../store/opencode-store'
import { ConnectProviderDialog } from './connect-provider-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { OpenCodeConfigCard } from './opencode-config-card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const API_BASE = '/api/opencode'

export function OpenCodeSettingsPage() {
  const {
    settings,
    updateSettings,
    detect,
    installed,
    models,
    modes,
    loadModels,
    loadProviders,
    chats,
    clearLocalCache,
  } = useOpenCodeStore()
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [clearCacheOpen, setClearCacheOpen] = useState(false)
  const [storageBytes, setStorageBytes] = useState(() => {
    let bytes = 0
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('alpha-workspace:')) {
          bytes += (key.length + (localStorage.getItem(key)?.length ?? 0))
        }
      }
    } catch {
      /* ignore */
    }
    return bytes
  })

  const defaultProvider = models.find(
    (m) => m.id === settings.defaultModel
  )?.provider

  const persistDefaultAgent = async (mode: string) => {
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch: { default_agent: mode } }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error((err as { error?: string }).error ?? `HTTP ${res.status}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update OpenCode config.')
    }
  }

  return (
    <AILayout>
      <div className='mx-auto w-full min-w-0 max-w-2xl space-y-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>OpenCode Settings</h1>
          <p className='text-sm text-muted-foreground'>
            Configure how Alpha One connects to and uses your local OpenCode
            instance.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>General</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between'>
              <div className='space-y-0.5'>
                <Label>Auto Save Conversations</Label>
                <p className='text-xs text-muted-foreground'>
                  Persist chats locally between sessions.
                </p>
              </div>
              <Switch
                checked={settings.autoSave}
                onCheckedChange={(v) => updateSettings({ autoSave: v })}
              />
            </div>
            <div className='flex items-center justify-between'>
              <div className='space-y-0.5'>
                <Label>Streaming</Label>
                <p className='text-xs text-muted-foreground'>
                  Stream responses token by token.
                </p>
              </div>
              <Switch
                checked={settings.streaming}
                onCheckedChange={(v) => updateSettings({ streaming: v })}
              />
            </div>
            <div className='flex items-center justify-between'>
              <div className='space-y-0.5'>
                <Label>Developer Mode</Label>
                <p className='text-xs text-muted-foreground'>
                  Show the developer console by default.
                </p>
              </div>
              <Switch
                checked={settings.developerMode}
                onCheckedChange={(v) => updateSettings({ developerMode: v })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Storage & Data</CardTitle>
            <CardDescription>
              Manage local OpenCode workspace storage and browser cache.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between text-sm'>
              <div className='space-y-0.5'>
                <p className='font-medium'>Estimated Storage Used</p>
                <p className='text-xs text-muted-foreground'>
                  {(storageBytes / 1024).toFixed(1)} KB across {chats.length} saved conversation{chats.length === 1 ? '' : 's'}, model preferences, custom skills, and resources.
                </p>
              </div>
              <Button
                variant='outline'
                size='sm'
                className='text-destructive hover:text-destructive'
                onClick={() => setClearCacheOpen(true)}
              >
                Clear Cache
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Workspace</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-1'>
              <Label htmlFor='workspace'>Workspace Path</Label>
              <Input
                id='workspace'
                value={settings.workspacePath}
                readOnly
                className='text-muted-foreground'
              />
              <p className='text-xs text-muted-foreground'>
                Runtime-detected. Cannot be overridden manually.
              </p>
            </div>
            <div className='space-y-1'>
              <Label htmlFor='executable'>OpenCode Executable</Label>
              <Input
                id='executable'
                value={settings.executablePath}
                onChange={(e) => updateSettings({ executablePath: e.target.value })}
                placeholder='opencode'
              />
            </div>
            <Button
              variant='outline'
              onClick={() => {
                void detect()
                toast.message(
                  installed ? 'OpenCode detected.' : 'OpenCode not detected.'
                )
              }}
            >
              Detect Installation
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Provider</CardTitle>
            <CardDescription>
              Connection behavior for the local OpenCode provider.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between'>
              <div className='space-y-0.5'>
                <Label>Auto Connect</Label>
                <p className='text-xs text-muted-foreground'>
                  Connect automatically when the workspace opens.
                </p>
              </div>
              <Switch
                checked={settings.autoConnect}
                onCheckedChange={(v) => updateSettings({ autoConnect: v })}
              />
            </div>
            <div className='flex items-center justify-between'>
              <div className='space-y-0.5'>
                <Label>Auto Reconnect</Label>
                <p className='text-xs text-muted-foreground'>
                  Reconnect if the session is lost unexpectedly.
                </p>
              </div>
              <Switch
                checked={settings.autoReconnect}
                onCheckedChange={(v) => updateSettings({ autoReconnect: v })}
              />
            </div>
            <div className='space-y-1'>
              <Label>Default Provider</Label>
              <p className='text-xs text-muted-foreground'>
                {defaultProvider
                  ? `Derived from the default model (${defaultProvider}).`
                  : 'Resolved from the default model once one is selected.'}
              </p>
            </div>
            <div className='space-y-1'>
              <Label htmlFor='mode'>Default Execution Mode</Label>
              <p className='text-xs text-muted-foreground'>
                Persisted to{' '}
                <code className='rounded bg-muted px-1 font-mono text-[11px]'>
                  opencode.json
                </code>{' '}
                (<code className='rounded bg-muted px-1 font-mono text-[11px]'>
                  default_agent
                </code>) so reloads keep the selected mode. Defaults to Build.
              </p>
              <Select
                value={settings.defaultMode}
                onValueChange={(v) => {
                  updateSettings({ defaultMode: v })
                  void persistDefaultAgent(v)
                }}
              >
                <SelectTrigger id='mode'>
                  <SelectValue placeholder='Mode' />
                </SelectTrigger>
                <SelectContent>
                  {modes.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                className='gap-1.5'
                onClick={() => setProviderDialogOpen(true)}
              >
                <Plug className='size-3.5' />
                Manage Providers
              </Button>
              <Button
                variant='outline'
                size='sm'
                className='gap-1.5'
                onClick={() => {
                  void loadModels()
                  void loadProviders()
                }}
              >
                <RefreshCw className='size-3.5' />
                Refresh Providers & Models
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Model Defaults</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-1'>
              <Label htmlFor='model'>Default Model</Label>
              <Select
                value={settings.defaultModel}
                onValueChange={(v) => updateSettings({ defaultModel: v })}
              >
                <SelectTrigger id='model'>
                  <SelectValue placeholder='Model' />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className='rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground'>
              Reasoning variants are available in the chat header next to the
              model selector. They are discovered dynamically from the active
              model and affect the actual OpenCode runtime.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>OpenCode Configuration</CardTitle>
            <CardDescription>
              Read and update the active OpenCode config file itself. OpenCode has
              no config command, so this writes directly to{' '}
              <code className='rounded bg-muted px-1 font-mono text-[11px]'>
                opencode.json
              </code>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OpenCodeConfigCard models={models} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Environment</CardTitle>
            <CardDescription>
              Environment variables are applied to the OpenCode process at launch.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-xs text-muted-foreground'>
              Environment configuration is managed from the Tool Manager. The
              OpenCode provider reads those values when launching a session.
            </p>
          </CardContent>
        </Card>

        <ConnectProviderDialog
          open={providerDialogOpen}
          onOpenChange={setProviderDialogOpen}
          onRefreshed={() => void loadModels()}
        />

        <AlertDialog open={clearCacheOpen} onOpenChange={setClearCacheOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear cache?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes temporary cached data such as tool execution history. Your conversations, custom skills, resources, model preferences, and settings will not be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className='bg-destructive text-destructive-foreground hover:bg-destructive/95'
                onClick={() => {
                  clearLocalCache()
                  setStorageBytes(() => {
                    let bytes = 0
                    try {
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i)
                        if (key && key.startsWith('alpha-workspace:')) {
                          bytes += (key.length + (localStorage.getItem(key)?.length ?? 0))
                        }
                      }
                    } catch {
                      /* ignore */
                    }
                    return bytes
                  })
                  setClearCacheOpen(false)
                  toast.success('Cache cleared successfully.')
                }}
              >
                Clear Cache
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AILayout>
  )
}
