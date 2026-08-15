import { useEffect, useMemo } from 'react'
import { FolderOpen, Plus, Settings2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useOpenCodeStore } from '../store/opencode-store'
import { ModelSelector } from './model-selector'
import { UsageIndicator } from './usage-indicator'
import { markModelUsed } from '../model-preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

/**
 * TASK-OPENCODE-023R1: Resolve a valid default variant from the available list.
 * Priority: persisted valid → "low" if available → first available.
 * Never fabricates a variant the model does not provide.
 */
function resolveDefaultVariant(
  available: string[],
  persisted: string
): string {
  if (available.includes(persisted)) return persisted
  if (available.includes('low')) return 'low'
  return available[0] ?? ''
}

export function OpenCodeToolbar() {
  const {
    settings,
    models,
    modes,
    workspaces,
    updateSettings,
    selectWorkspace,
    loadModels,
    modelsLoaded,
    newChat,
  } = useOpenCodeStore()

  // TASK-OPENCODE-023: Derive available variants for the selected model.
  const selectedModel = useMemo(
    () => models.find((m) => m.id === settings.defaultModel),
    [models, settings.defaultModel]
  )
  const variantNames = useMemo(() => {
    const v = selectedModel?.variants
    return v ? Object.keys(v).sort() : []
  }, [selectedModel])

  // TASK-OPENCODE-023R1: Compute valid active variant with auto-default.
  const activeVariant = useMemo(
    () => resolveDefaultVariant(variantNames, settings.defaultVariant),
    [variantNames, settings.defaultVariant]
  )

  // TASK-OPENCODE-023R1: Auto-select default when variant names exist but selection is empty.
  useEffect(() => {
    if (variantNames.length > 0 && activeVariant && activeVariant !== settings.defaultVariant) {
      updateSettings({ defaultVariant: activeVariant })
    }
  }, [variantNames, activeVariant, settings.defaultVariant, updateSettings])

  return (
    <div className='flex flex-wrap items-center gap-2 border-b px-4 py-2'>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant='outline' size='sm' className='gap-1.5'>
            <FolderOpen className='size-4' />
            <span className='max-w-[160px] truncate'>
              {settings.workspacePath.split('\\').pop() || settings.workspacePath}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='w-80'>
          <div className='space-y-2'>
            <Label htmlFor='ws'>Workspace Path</Label>
            <Input
              id='ws'
              value={settings.workspacePath}
              readOnly
              className='text-muted-foreground'
            />
            <p className='text-xs text-muted-foreground'>
              Runtime-detected. Cannot be overridden manually.
            </p>
            {workspaces.length > 0 && (
              <ul className='space-y-1'>
                {workspaces.map((ws) => (
                  <li key={ws.path}>
                    <button
                      type='button'
                      onClick={() => selectWorkspace(ws.path)}
                      className='w-full rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent'
                    >
                      <span className='font-medium'>{ws.name}</span>
                      <span className='block truncate text-xs text-muted-foreground'>
                        {ws.path}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <ModelSelector
        models={models}
        value={settings.defaultModel}
        disabled={!modelsLoaded}
        refreshing={!modelsLoaded}
        onSelect={(model) => {
          updateSettings({ defaultModel: model.id, defaultVariant: '' })
          markModelUsed(model.id)
        }}
        onRefresh={() => void loadModels()}
      />

      {variantNames.length > 0 && (
        <Select
          value={activeVariant}
          onValueChange={(v) => updateSettings({ defaultVariant: v })}
        >
          <SelectTrigger className='h-8 w-[120px]' aria-label='Reasoning variant'>
            <SelectValue placeholder='Reasoning' />
          </SelectTrigger>
          <SelectContent>
            {variantNames.map((v) => (
              <SelectItem key={v} value={v}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={settings.defaultMode}
        onValueChange={(v) => updateSettings({ defaultMode: v })}
      >
        <SelectTrigger className='h-8 w-[120px]' aria-label='Execution mode'>
          <SelectValue placeholder='Mode' />
        </SelectTrigger>
        <SelectContent>
          {modes.map((mode) => (
            <SelectItem key={mode.id} value={mode.id}>
              {mode.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <UsageIndicator />

      <div className='ms-auto flex items-center gap-2'>
        <Button size='sm' className='gap-1.5' onClick={newChat}>
          <Plus className='size-4' />
          New Chat
        </Button>
        <Button variant='outline' size='sm' className='h-8 gap-1.5' asChild aria-label='Settings'>
          <Link to='/ai/opencode/settings'>
            <Settings2 className='size-3.5' />
            Settings
          </Link>
        </Button>
      </div>
    </div>
  )
}
