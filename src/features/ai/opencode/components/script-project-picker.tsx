import { useState, useMemo } from 'react'
import { FileCode, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

export interface ScriptProjectSummary {
  scriptId: string
  name: string
  modifiedTime: string
  parentId?: string
  boundContainerName?: string
}

interface ScriptProjectPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: ScriptProjectSummary[]
  loading: boolean
  onRefresh: () => void
  onSelect: (project: { scriptId: string; name: string }) => void
}

export function ScriptProjectPicker({
  open,
  onOpenChange,
  projects,
  loading,
  onRefresh,
  onSelect,
}: ScriptProjectPickerProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.scriptId.toLowerCase().includes(q)
    )
  }, [projects, query])

  const handleManualFallback = () => {
    const scriptId = prompt('Enter Google Apps Script Project Script ID manually:')
    if (scriptId && scriptId.trim()) {
      const name = prompt('Enter a display name for this project:', 'Matching SKU Platform Marketplace') ?? 'Apps Script Project'
      onSelect({ scriptId: scriptId.trim(), name: name.trim() })
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl md:max-w-3xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <FileCode className='size-5 text-amber-600' />
            Select Google Apps Script Project
          </DialogTitle>
          <DialogDescription>
            Choose an accessible Google Apps Script project from your authorized Google account.
          </DialogDescription>
        </DialogHeader>

        <div className='flex items-center gap-2'>
          <div className='relative flex-1'>
            <Search className='absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search projects or Script ID...'
              className='h-8 ps-8 text-xs'
            />
          </div>
          <Button
            variant='outline'
            size='sm'
            className='h-8 shrink-0 gap-1.5'
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        <ScrollArea className='max-h-80'>
          {loading ? (
            <div className='flex flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground'>
              <Loader2 className='size-6 animate-spin text-muted-foreground' />
              Loading Apps Script projects...
            </div>
          ) : projects.length === 0 ? (
            <div className='flex flex-col items-center gap-2 px-3 py-10 text-center text-xs text-muted-foreground'>
              <FileCode className='size-5 text-muted-foreground/60' />
              No Apps Script projects found or Google authorization required.
            </div>
          ) : filtered.length === 0 ? (
            <div className='flex flex-col items-center gap-2 px-3 py-10 text-center text-xs text-muted-foreground'>
              <FileCode className='size-5 text-muted-foreground/60' />
              No Apps Script projects match &quot;{query}&quot;.
            </div>
          ) : (
            <ul className='divide-y'>
              {filtered.map((proj) => (
                <li key={proj.scriptId} className='flex items-center justify-between gap-3 px-2 py-3 hover:bg-accent rounded-md transition-colors'>
                  <div className='min-w-0 flex-1 space-y-0.5'>
                    <p className='truncate text-sm font-medium'>{proj.name}</p>
                    <p className='truncate text-xs text-muted-foreground font-mono'>
                      Script ID: {proj.scriptId}
                    </p>
                    <p className='truncate text-[11px] text-muted-foreground/80'>
                      {proj.boundContainerName ? `Bound to: ${proj.boundContainerName}` : 'Bound resource: Not detected (Standalone)'} · Modified: {new Date(proj.modifiedTime).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size='sm'
                    className='h-8 shrink-0 gap-1.5'
                    onClick={() => {
                      onSelect({ scriptId: proj.scriptId, name: proj.name })
                      onOpenChange(false)
                    }}
                  >
                    <Sparkles className='size-3.5' />
                    Attach
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <div className='flex items-center justify-between border-t pt-3'>
          <p className='text-[11px] text-muted-foreground'>
            Canonical identity: Script ID. Source files are resolved securely server-side.
          </p>
          <Button variant='ghost' size='sm' className='text-xs h-8' onClick={handleManualFallback}>
            Enter Script ID manually…
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
