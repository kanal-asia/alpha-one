import { useEffect, useMemo } from 'react'
import { FolderOpen, Plus, Settings2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useOpenCodeStore } from '../store/opencode-store'
import type { ChatProjectContext } from '../types'
import { ProjectSelector } from '@/features/ai-assistant/components/project-selector'
import type { Project } from '@/features/ai-assistant/store/project-store'
import { ModelSelector } from './model-selector'
import { UsageIndicator } from './usage-indicator'
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

/** TASK-OPENCODE-055: ChatProjectContext → Project (for the controlled
 *  ProjectSelector). Drive folder ID is preserved as `contextPath`. */
function toProject(ctx: ChatProjectContext): Project | null {
  if (!ctx?.id && !ctx?.name) return null
  return {
    id: ctx.id ?? `ctx-${Date.now()}`,
    name: ctx.name ?? 'Project',
    contextType: ctx.type ?? 'local',
    contextPath: ctx.path ?? '',
    contextLabel: ctx.label ?? ctx.path ?? '',
    createdAt: '',
  }
}

/** TASK-OPENCODE-055: Project → ChatProjectContext. Local keeps the absolute
 *  path; Google Drive keeps the folder ID as the execution reference. */
function toContext(p: Project): ChatProjectContext {
  return {
    id: p.id,
    name: p.name,
    path: p.contextPath,
    label: p.contextType === 'local' ? p.contextPath : p.contextLabel,
    type: p.contextType,
  }
}

export function OpenCodeToolbar() {
  const {
    settings,
    models,
    modes,
    workspaces,
    chats,
    activeChatId,
    updateSettings,
    selectWorkspace,
    loadModels,
    modelsLoaded,
    newChat,
    setActiveChatModel,
    setActiveChatProject,
  } = useOpenCodeStore()

  // TASK-OPENCODE-053: The toolbar model selector is session-scoped. The active
  // chat's own model wins; otherwise the configured/default model is shown.
  // Selecting a model mutates only the active chat — never settings.defaultModel.
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null
  const effectiveModelId = activeChat?.model ?? settings.defaultModel

  // TASK-OPENCODE-023: Derive available variants for the selected model.
  // (Computed directly — the React Compiler memoizes this; an explicit useMemo
  // can no longer be preserved once `activeChat` is also read in the JSX.)
  const selectedModel = models.find((m) => m.id === effectiveModelId)
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
      {/* TASK-OPENCODE-055: Project Path selection — reuses the existing
          ProjectSelector (Local Folder / Google Drive pickers). Bound to the
          active session so Project Path is per-session execution context, not
          app-global state. */}
      <ProjectSelector
        project={activeChat?.project ? toProject(activeChat.project) : null}
        onProjectChange={(p) => setActiveChatProject(p ? toContext(p) : undefined)}
      />

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
        value={effectiveModelId}
        disabled={!modelsLoaded}
        refreshing={!modelsLoaded}
        onSelect={(model) => {
          // TASK-OPENCODE-053: Session-scoped model selection. Does NOT change
          // the configured/default model; a New Chat still starts with the default.
          setActiveChatModel(model.id)
          updateSettings({ defaultVariant: '' })
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
