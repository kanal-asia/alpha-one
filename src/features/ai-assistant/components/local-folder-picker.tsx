import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUp,
  ChevronRight,
  Folder,
  FolderOpen,
  Home,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DirEntry, DirListResponse } from '@/services/fs/fs-router'

interface LocalFolderPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
}

async function fetchDirs(path?: string): Promise<DirListResponse> {
  const url = path
    ? `/api/fs/dirs?path=${encodeURIComponent(path)}`
    : '/api/fs/dirs'
  const res = await fetch(url)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<DirListResponse>
}

export function LocalFolderPicker({
  open,
  onOpenChange,
  onSelect,
}: LocalFolderPickerProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [hasParent, setHasParent] = useState(false)
  const [directories, setDirectories] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runLoad = useCallback((path?: string) => {
    return fetchDirs(path).then(
      (data) => {
        setCurrentPath(data.current)
        setHasParent(data.parent !== null)
        setDirectories(data.directories)
        setError(null)
        return data
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load folders.')
        setDirectories([])
        return undefined
      }
    )
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void runLoad(undefined).then(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, runLoad])

  const navigateTo = useCallback(
    (path: string) => {
      setLoading(true)
      setError(null)
      void runLoad(path).then(() => setLoading(false))
    },
    [runLoad]
  )

  const goHome = useCallback(() => {
    setLoading(true)
    setError(null)
    void runLoad(undefined).then(() => setLoading(false))
  }, [runLoad])

  const segments = useMemo(() => {
    if (currentPath === '/') return [{ name: '/', path: '/' }]
    if (/^[A-Za-z]:\\/.test(currentPath)) {
      const parts = currentPath.split(/[\\/]+/).filter(Boolean)
      const out: { name: string; path: string }[] = []
      let acc = ''
      parts.forEach((part, i) => {
        const isDrive = i === 0 && /^[A-Za-z]:$/.test(part)
        acc = i === 0 ? `${part}\\` : `${acc}\\${part}`
        out.push({ name: isDrive ? `${part}\\` : part, path: acc })
      })
      return out
    }
    return []
  }, [currentPath])

  const upPath = segments.length > 1 ? segments[segments.length - 2].path : null
  const isDrivesRoot = currentPath === 'This PC' || currentPath === ''
  const canSelect = !loading && !isDrivesRoot && currentPath !== ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Choose local folder</DialogTitle>
        </DialogHeader>

        <div className='space-y-3'>
          <div className='flex items-center gap-1'>
            <Button
              variant='ghost'
              size='sm'
              className='h-7 px-2'
              onClick={goHome}
              title='Show all drives'
            >
              <Home className='size-3.5' />
            </Button>

            <div className='flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-sm'>
              {segments.length > 0 ? (
                segments.map((seg, i) => (
                  <Fragment key={seg.path}>
                    {i > 0 && (
                      <ChevronRight className='size-3 text-muted-foreground' />
                    )}
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7 max-w-[160px] truncate px-1.5'
                      onClick={() => navigateTo(seg.path)}
                    >
                      {seg.name}
                    </Button>
                  </Fragment>
                ))
              ) : (
                <span className='px-1.5 text-sm text-muted-foreground'>
                  {currentPath || 'This PC'}
                </span>
              )}
            </div>

            {(hasParent || upPath) && (
              <Button
                variant='ghost'
                size='sm'
                className='h-7 px-2'
                onClick={() => upPath && navigateTo(upPath)}
                title='Up one level'
              >
                <ArrowUp className='size-3.5' />
              </Button>
            )}
          </div>

          {error && (
            <div className='flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive'>
              <AlertCircle className='size-4 shrink-0' />
              {error}
            </div>
          )}

          <ScrollArea className='h-64 rounded-md border'>
            {loading ? (
              <div className='flex items-center justify-center py-12'>
                <Loader2 className='size-6 animate-spin text-muted-foreground' />
              </div>
            ) : directories.length === 0 ? (
              <div className='flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground'>
                <FolderOpen className='size-8' />
                No subfolders here.
              </div>
            ) : (
              <div className='divide-y'>
                {directories.map((dir) => (
                  <button
                    type='button'
                    key={dir.path}
                    onClick={() => navigateTo(dir.path)}
                    className='flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted/50'
                  >
                    <Folder className='size-4 shrink-0 text-blue-500' />
                    <span className='truncate'>{dir.name}</span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>Cancel</Button>
          </DialogClose>
          <Button
            disabled={!canSelect}
            onClick={() => {
              if (canSelect) {
                onSelect(currentPath)
                onOpenChange(false)
              }
            }}
          >
            Select this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}