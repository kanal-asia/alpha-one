import { type ToolState } from '../types'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { HealthIndicator, ToolStatusBadge } from './health-indicator'

type ToolDetailsProps = {
  tool: ToolState
  onToggleEnabled: (enabled: boolean) => void
  onExecutableChange: (path: string) => void
  onEnvChange: (env: Record<string, string>) => void
}

export function ToolDetails({
  tool,
  onToggleEnabled,
  onExecutableChange,
  onEnvChange,
}: ToolDetailsProps) {
  const env = tool.definition.config.env
  const envEntries = Object.entries(env)

  const updateEntry = (key: string, value: string) => {
    onEnvChange({ ...env, [key]: value })
  }

  const removeEntry = (key: string) => {
    const next = { ...env }
    delete next[key]
    onEnvChange(next)
  }

  const addEntry = () => {
    onEnvChange({ ...env, '': '' })
  }
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-lg font-semibold'>{tool.definition.name}</h3>
          <p className='text-sm text-muted-foreground'>
            {tool.definition.description}
          </p>
        </div>
        <ToolStatusBadge status={tool.status} />
      </div>

      <div className='flex flex-wrap gap-2'>
        <Badge variant='outline'>v{tool.definition.version}</Badge>
        <Badge variant='outline' className='capitalize'>
          {tool.definition.category.replace('_', ' ')}
        </Badge>
        {tool.definition.capabilities.map((cap) => (
          <Badge key={cap.id} variant='secondary'>
            {cap.label}
          </Badge>
        ))}
      </div>

      <Separator />

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label htmlFor='enabled'>Enabled</Label>
            <p className='text-xs text-muted-foreground'>
              Tools must be enabled before they can execute.
            </p>
          </div>
          <Switch
            id='enabled'
            checked={tool.definition.config.enabled}
            onCheckedChange={onToggleEnabled}
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='exe'>Executable Path</Label>
          <Input
            id='exe'
            value={tool.definition.config.executablePath}
            onChange={(e) => onExecutableChange(e.target.value)}
            placeholder='e.g. opencode'
          />
        </div>
        <div className='text-xs text-muted-foreground'>
          <HealthIndicator state={tool.health} />
        </div>
      </div>

      <Separator />

      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <Label>Environment Variables</Label>
          <Button variant='outline' size='sm' onClick={addEntry}>
            Add variable
          </Button>
        </div>
        {envEntries.length === 0 ? (
          <p className='text-xs text-muted-foreground'>
            No environment variables configured.
          </p>
        ) : (
          <div className='space-y-2'>
            {envEntries.map(([key, value]) => (
              <div key={key} className='flex items-center gap-2'>
                <Input
                  aria-label='Environment variable name'
                  value={key}
                  placeholder='NAME'
                  onChange={(e) => {
                    const next = { ...env }
                    delete next[key]
                    next[e.target.value] = value
                    onEnvChange(next)
                  }}
                />
                <Input
                  aria-label='Environment variable value'
                  value={value}
                  placeholder='value'
                  onChange={(e) => updateEntry(key, e.target.value)}
                />
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label={`Remove ${key || 'variable'}`}
                  onClick={() => removeEntry(key)}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
