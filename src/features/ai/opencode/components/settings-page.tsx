import { AILayout } from '../../components/ai-layout'
import { useOpenCodeStore } from '../store/opencode-store'
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

export function OpenCodeSettingsPage() {
  const { settings, updateSettings, detect, installed, models, modes, loadModels } =
    useOpenCodeStore()

  return (
    <AILayout>
      <div className='mx-auto max-w-2xl space-y-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>OpenCode Settings</h1>
          <p className='text-sm text-muted-foreground'>
            Configure how Alpha Workspace connects to and uses your local OpenCode
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
            <CardTitle className='text-base'>Workspace</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-1'>
              <Label htmlFor='workspace'>Workspace Path</Label>
              <Input
                id='workspace'
                value={settings.workspacePath}
                onChange={(e) => updateSettings({ workspacePath: e.target.value })}
              />
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
              <Label htmlFor='mode'>Default Execution Mode</Label>
              <Select
                value={settings.defaultMode}
                onValueChange={(v) => updateSettings({ defaultMode: v })}
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
            <Button variant='outline' onClick={() => void loadModels()}>
              Refresh Models & Modes
            </Button>
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
            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-1'>
                <Label htmlFor='temperature'>Temperature</Label>
                <Input
                  id='temperature'
                  type='number'
                  min={0}
                  max={2}
                  step={0.1}
                  value={settings.temperature}
                  onChange={(e) =>
                    updateSettings({ temperature: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='maxtokens'>Max Tokens</Label>
                <Input
                  id='maxtokens'
                  type='number'
                  min={1}
                  value={settings.maxTokens}
                  onChange={(e) =>
                    updateSettings({ maxTokens: Number(e.target.value) || 1 })
                  }
                />
              </div>
            </div>
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
      </div>
    </AILayout>
  )
}
