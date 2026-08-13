import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUp,
  ChevronRight,
  File,
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
import { cn } from '@/lib/utils'
import type {
  DirEntry,
  EntryListResponse,
  FileEntry,
} from '@/services/fs/fs-router'

export interface LocalFileSelection {
  name: string
  path: string
  size: number
  modifiedTime: string
}

interface LocalFilePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (file: LocalFileSelection) => void
}

async function fetchEntries(path?: string): Promise<EntryListResponse> {
  const url = path
    ? `/api/fs/entries?path=${encodeURIComponent(path)}`
    : '/api/fs/entries'
  const res = await fetch(url)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<EntryListResponse>
}

export function LocalFilePicker({
  open,
  onOpenChange,
  onSelect,
}: LocalFilePickerProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [hasParent, setHasParent] = useState(false)
  const [directories, setDirectories] = useState<DirEntry[]>([])
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runLoad = useCallback((path?: string) => {
    return fetchEntries(path).then(
      (data) => {
        setCurrentPath(data.current)
        setHasParent(data.parent !== null)
        setDirectories(data.directories)
        setFiles(data.files)
        setSelectedPath(null)
        setError(null)
        return data
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load files.')
        setDirectories([])
        setFiles([])
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
  const canSelect = !loading && !!selectedPath

  const handleSelectFile = (file: FileEntry) => {
    setSelectedPath(file.path)
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Choose a local file</DialogTitle>
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
            ) : directories.length === 0 && files.length === 0 ? (
              <div className='flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground'>
                <FolderOpen className='size-8' />
                Nothing here yet.
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
                {files.map((file) => {
                  const selected = selectedPath === file.path
                  return (
                    <button
                      type='button'
                      key={file.path}
                      onClick={() => handleSelectFile(file)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted/50',
                        selected && 'bg-muted'
                      )}
                    >
                      <File className='size-4 shrink-0 text-muted-foreground' />
                      <span className='min-w-0 flex-1 truncate'>{file.name}</span>
                      <span className='shrink-0 text-xs text-muted-foreground'>
                        {formatSize(file.size)}
                      </span>
                    </button>
                  )
                })}
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
              const file = files.find((f) => f.path === selectedPath)
              if (!canSelect || !file) return
              onSelect({
                name: file.name,
                path: file.path,
                size: file.size,
                modifiedTime: file.modifiedTime,
              })
              onOpenChange(false)
            }}
          >
            Select this file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}