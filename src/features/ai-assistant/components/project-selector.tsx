import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Cloud, FolderOpen, FolderPlus, Trash2, X } from 'lucide-react'
import { useProjectStore, type Project, type ProjectContextType } from '../store/project-store'
import { LocalFolderPicker } from './local-folder-picker'
import { openDriveFolderPicker } from '@/features/google/components/drive-folder-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const DRIVE_PICKER_MESSAGE_SOURCE = 'alpha-gdrive-picker'

export function ProjectSelector({
  project,
  onProjectChange,
}: {
  /** Optional controlled value (bound to a session's ChatProjectContext). */
  project?: Project | null
  /** Called on explicit select/create/clear when controlled. */
  onProjectChange?: (p: Project | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContextType, setNewContextType] = useState<ProjectContextType>('local')
  const [newContextPath, setNewContextPath] = useState('')
  const [newContextLabel, setNewContextLabel] = useState('')
  const [localPickerOpen, setLocalPickerOpen] = useState(false)
  const driveWindowRef = useRef<Window | null>(null)

  const { projects, activeProject, createProject, setActiveProject, deleteProject } =
    useProjectStore()

  // TASK-OPENCODE-055: Controlled mode keeps this component reusable. When a
  // `project` value is supplied, selection targets that session's project
  // context instead of the app-global active project (assistant page usage).
  const controlled = project !== undefined
  const displayProject = controlled ? project : activeProject

  // TASK-OPENCODE-056-SCR1: Recent Projects fast-track inside the dropdown —
  // existing project data only, same recency rule as the OpenCode page empty
  // state (most-recent 5). No new persistence; the rest stay under All Projects.
  const recentProjects = useMemo(
    () => [...projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [projects]
  )
  const otherProjects = useMemo(
    () => [...projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(5),
    [projects]
  )

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as {
        source?: string
        folder?: { id: string; name: string; path?: string }
      } | undefined
      if (!data || data.source !== DRIVE_PICKER_MESSAGE_SOURCE || !data.folder) return
      setNewContextPath(data.folder.id)
      setNewContextLabel(data.folder.path || data.folder.name)
      driveWindowRef.current = null
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const clearContext = () => {
    setNewContextPath('')
    setNewContextLabel('')
  }

  const handleCreate = () => {
    if (!newName.trim() || !newContextPath.trim()) return
    const project = createProject({
      name: newName.trim(),
      contextType: newContextType,
      contextPath: newContextPath.trim(),
      contextLabel:
        newContextLabel.trim() ||
        (newContextType === 'local' ? newContextPath.trim() : 'Google Drive folder'),
    })
    if (controlled) {
      onProjectChange?.(project)
    } else {
      setActiveProject(project.id)
    }
    setNewName('')
    setNewContextPath('')
    setNewContextLabel('')
    setCreating(false)
    setOpen(false)
  }

  const handleSelect = (id: string) => {
    const selected = projects.find((p) => p.id === id) ?? null
    if (controlled) {
      onProjectChange?.(selected)
    } else {
      setActiveProject(id)
    }
    setOpen(false)
  }

  const handleClear = () => {
    if (controlled) {
      onProjectChange?.(null)
    } else {
      setActiveProject(null)
    }
    setOpen(false)
  }

  const handleDelete = (id: string) => {
    deleteProject(id)
    if (controlled && displayProject?.id === id) {
      onProjectChange?.(null)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='gap-1.5'>
          <FolderOpen className='size-4' />
          <span className='max-w-[160px] truncate'>
            {displayProject?.name ?? 'No project'}
          </span>
          <ChevronDown className='size-3.5 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-80 p-0'>
        {creating ? (
          <>
            <div className='space-y-3 p-3'>
            <div className='flex items-center justify-between'>
              <Label className='text-sm font-medium'>New Project</Label>
              <Button
                variant='ghost'
                size='icon'
                className='size-6'
                onClick={() => setCreating(false)}
              >
                <X className='size-3.5' />
              </Button>
            </div>
            <div className='space-y-2'>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder='Project name'
                className='h-8'
              />
              <Select
                value={newContextType}
                onValueChange={(v) => {
                  setNewContextType(v as ProjectContextType)
                  clearContext()
                }}
              >
                <SelectTrigger className='h-8'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='local'>Local folder</SelectItem>
                  <SelectItem value='google-drive'>Google Drive folder</SelectItem>
                </SelectContent>
              </Select>
              {newContextType === 'local' ? (
                <div className='space-y-1.5'>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-8 min-w-0 flex-1 justify-start gap-1.5'
                      onClick={() => setLocalPickerOpen(true)}
                    >
                      <FolderOpen className='size-3.5 shrink-0 text-muted-foreground' />
                      <span className='truncate'>
                        {newContextPath || 'Choose folder...'}
                      </span>
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-8'
                      onClick={clearContext}
                      disabled={!newContextPath}
                    >
                      <X className='size-3.5' />
                    </Button>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {newContextPath
                      ? `Selected: ${newContextPath}`
                      : 'Browse local folders on this machine.'}
                  </p>
                </div>
              ) : (
                <div className='space-y-1.5'>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-8 min-w-0 flex-1 justify-start gap-1.5'
                      onClick={() => {
                        driveWindowRef.current = openDriveFolderPicker()
                      }}
                    >
                      <Cloud className='size-3.5 shrink-0 text-muted-foreground' />
                      <span className='truncate'>
                        {newContextLabel || newContextPath || 'Choose Drive folder...'}
                      </span>
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-8'
                      onClick={clearContext}
                      disabled={!newContextPath}
                    >
                      <X className='size-3.5' />
                    </Button>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {newContextLabel
                      ? `Selected: ${newContextLabel}`
                      : 'Opens the Drive explorer to pick a folder.'}
                  </p>
                </div>
              )}
            </div>
            <Button
              size='sm'
              className='w-full'
              onClick={handleCreate}
              disabled={!newName.trim() || !newContextPath.trim()}
            >
              Create Project
            </Button>
          </div>
          <LocalFolderPicker
            open={localPickerOpen}
            onOpenChange={setLocalPickerOpen}
            onSelect={(path) => {
              setNewContextPath(path)
              setNewContextLabel(path)
            }}
          />
          </>
        ) : (
          <div className='flex flex-col'>
            <div className='flex items-center justify-between border-b p-2'>
              <span className='px-2 text-xs font-medium text-muted-foreground'>
                Projects
              </span>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 gap-1 text-xs'
                onClick={() => setCreating(true)}
              >
                <FolderPlus className='size-3.5' />
                New
              </Button>
            </div>
            <ScrollArea className='max-h-64'>
              {projects.length === 0 ? (
                <div className='px-3 py-6 text-center text-xs text-muted-foreground'>
                  No projects yet. Create one to get started.
                </div>
              ) : (
                <ul className='p-1'>
                  {/* TASK-OPENCODE-056-SCR1: Recent Projects as a fast-track,
                      selectable exactly like any other project row. */}
                  {recentProjects.length > 0 && (
                    <li className='px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground'>
                      Recent Projects
                    </li>
                  )}
                  {recentProjects.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      isActive={project.id === displayProject?.id}
                      onSelect={() => handleSelect(project.id)}
                      onDelete={() => handleDelete(project.id)}
                    />
                  ))}
                  {otherProjects.length > 0 && (
                    <>
                      <li className='mt-1 border-t px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground'>
                        All Projects
                      </li>
                      {otherProjects.map((project) => (
                        <ProjectRow
                          key={project.id}
                          project={project}
                          isActive={project.id === displayProject?.id}
                          onSelect={() => handleSelect(project.id)}
                          onDelete={() => handleDelete(project.id)}
                        />
                      ))}
                    </>
                  )}
                </ul>
              )}
            </ScrollArea>
            {displayProject && (
              <div className='border-t p-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-7 w-full justify-start gap-1.5 text-xs text-muted-foreground'
                  onClick={handleClear}
                >
                  <X className='size-3.5' />
                  Clear project
                </Button>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ProjectRow({
  project,
  isActive,
  onSelect,
  onDelete,
}: {
  project: Project
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
          isActive ? 'bg-muted' : 'hover:bg-accent'
        )}
      >
        <button
          type='button'
          onClick={onSelect}
          className='min-w-0 flex-1 text-start'
        >
          <span className='block truncate font-medium'>{project.name}</span>
          <span className='block truncate text-xs text-muted-foreground'>
            {project.contextType === 'local' ? '📁' : '☁️'}{' '}
            {project.contextLabel}
          </span>
        </button>
        <Button
          variant='ghost'
          size='icon'
          className='size-6 opacity-0 group-hover:opacity-100'
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className='size-3.5' />
        </Button>
      </div>
    </li>
  )
}
