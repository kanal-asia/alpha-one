import { useState } from 'react'
import { ChevronDown, FolderOpen, FolderPlus, Trash2, X } from 'lucide-react'
import { useProjectStore, type Project, type ProjectContextType } from '../store/project-store'
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

export function ProjectSelector() {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContextType, setNewContextType] = useState<ProjectContextType>('local')
  const [newContextPath, setNewContextPath] = useState('')

  const { projects, activeProject, createProject, setActiveProject, deleteProject } =
    useProjectStore()

  const handleCreate = () => {
    if (!newName.trim()) return
    const project = createProject({
      name: newName.trim(),
      contextType: newContextType,
      contextPath: newContextPath.trim() || (newContextType === 'local' ? 'C:\\dev' : ''),
      contextLabel:
        newContextType === 'local'
          ? newContextPath.trim() || 'Local folder'
          : newContextPath.trim() || 'Google Drive folder',
    })
    setActiveProject(project.id)
    setNewName('')
    setNewContextPath('')
    setCreating(false)
    setOpen(false)
  }

  const handleSelect = (id: string) => {
    setActiveProject(id)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='gap-1.5'>
          <FolderOpen className='size-4' />
          <span className='max-w-[160px] truncate'>
            {activeProject?.name ?? 'No project'}
          </span>
          <ChevronDown className='size-3.5 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-80 p-0'>
        {creating ? (
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
                onValueChange={(v) => setNewContextType(v as ProjectContextType)}
              >
                <SelectTrigger className='h-8'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='local'>Local folder</SelectItem>
                  <SelectItem value='google-drive'>Google Drive folder</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={newContextPath}
                onChange={(e) => setNewContextPath(e.target.value)}
                placeholder={
                  newContextType === 'local'
                    ? 'Folder path (e.g. C:\\projects\\my-project)'
                    : 'Drive folder name or ID'
                }
                className='h-8'
              />
            </div>
            <Button
              size='sm'
              className='w-full'
              onClick={handleCreate}
              disabled={!newName.trim()}
            >
              Create Project
            </Button>
          </div>
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
                  {projects.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      isActive={project.id === activeProject?.id}
                      onSelect={() => handleSelect(project.id)}
                      onDelete={() => deleteProject(project.id)}
                    />
                  ))}
                </ul>
              )}
            </ScrollArea>
            {activeProject && (
              <div className='border-t p-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-7 w-full justify-start gap-1.5 text-xs text-muted-foreground'
                  onClick={() => {
                    setActiveProject(null)
                    setOpen(false)
                  }}
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
