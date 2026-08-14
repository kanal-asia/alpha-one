import { FolderOpen, ExternalLink, Trash2, Sparkles } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useResourceStore } from './resource-store'
import type { ResourceReference } from './types'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { useState } from 'react'

const PROVIDER_LABELS: Record<string, string> = {
  local: 'Local',
  google_drive: 'Drive',
  google_docs: 'Docs',
  google_sheets: 'Sheets',
  google_slides: 'Slides',
  apps_script: 'Apps Script',
}

const PROVIDER_COLORS: Record<string, string> = {
  local: 'bg-muted text-muted-foreground',
  google_drive: 'bg-blue-500/10 text-blue-600',
  google_docs: 'bg-blue-500/10 text-blue-600',
  google_sheets: 'bg-green-500/10 text-green-600',
  google_slides: 'bg-amber-500/10 text-amber-600',
  apps_script: 'bg-amber-500/10 text-amber-600',
}

function openResource(ref: ResourceReference) {
  if (ref.url) {
    window.open(ref.url, '_blank', 'noopener,noreferrer')
  } else if (ref.provider === 'local' && ref.path) {
    // Local files: navigate to workspace assistant with the file as context
    // The AI assistant can handle local file references
  }
}

export function ResourceLibraryPage() {
  const { resources, removeResource } = useResourceStore()
  const navigate = useNavigate()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  return (
    <>
      <PageHeader />
      <Main>
        {resources.length === 0 ? (
          <EmptyState onNavigate={() => void navigate({ to: '/workspace/assistant' })} />
        ) : (
          <div className='space-y-4'>
            <div className='flex items-center justify-between'>
              <div>
                <h1 className='text-2xl font-bold tracking-tight'>Resource Library</h1>
                <p className='text-sm text-muted-foreground'>
                  {resources.length} registered resource{resources.length === 1 ? '' : 's'} — references to your original files and projects.
                </p>
              </div>
            </div>
            <div className='grid gap-2'>
              {resources.map((ref) => (
                <ResourceRow
                  key={ref.id}
                  resource={ref}
                  onOpen={() => openResource(ref)}
                  onDelete={() => setDeleteId(ref.id)}
                />
              ))}
            </div>
          </div>
        )}

        <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove resource?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the reference from Resource Library. The original file is not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className='bg-destructive text-destructive-foreground hover:bg-destructive/95'
                onClick={() => {
                  if (deleteId) removeResource(deleteId)
                  setDeleteId(null)
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Main>
    </>
  )
}

function EmptyState({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Card>
      <CardContent className='flex min-h-72 flex-col items-center justify-center gap-4 py-16 text-center'>
        <div className='flex size-12 items-center justify-center rounded-2xl bg-muted'>
          <FolderOpen className='size-6 text-muted-foreground' />
        </div>
        <div>
          <h2 className='text-lg font-semibold'>Resource Library</h2>
          <p className='max-w-md text-sm text-muted-foreground'>
            Resources are registered automatically when Alpha Workspace creates or edits files, sheets, documents, or scripts.
          </p>
          <p className='mt-2 max-w-md text-xs text-muted-foreground italic'>
            One workspace. One assistant. All your work.
          </p>
        </div>
        <Button variant='outline' size='sm' className='gap-1.5' onClick={onNavigate}>
          <Sparkles className='size-3.5' />
          Start with Alpha Workspace
        </Button>
      </CardContent>
    </Card>
  )
}

function ResourceRow({
  resource,
  onOpen,
  onDelete,
}: {
  resource: ResourceReference
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div className='group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent/50'>
      <div className='flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium'>
        {resource.provider === 'local' ? 'L' : 'G'}
      </div>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium'>{resource.name}</p>
        <p className='truncate text-xs text-muted-foreground'>
          {PROVIDER_LABELS[resource.provider] ?? resource.provider}
          {resource.lastModified && ` · ${new Date(resource.lastModified).toLocaleDateString()}`}
        </p>
      </div>
      <Badge
        variant='outline'
        className={`shrink-0 border-transparent px-1.5 py-0 text-[10px] font-medium ${PROVIDER_COLORS[resource.provider] ?? 'bg-muted text-muted-foreground'}`}
      >
        {PROVIDER_LABELS[resource.provider] ?? resource.provider}
      </Badge>
      {resource.url && (
        <Button
          variant='ghost'
          size='icon'
          className='size-7 shrink-0 opacity-0 group-hover:opacity-100'
          onClick={onOpen}
          aria-label='Open original resource'
        >
          <ExternalLink className='size-3.5' />
        </Button>
      )}
      <Button
        variant='ghost'
        size='icon'
        className='size-7 shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive'
        onClick={onDelete}
        aria-label='Remove from library'
      >
        <Trash2 className='size-3.5' />
      </Button>
    </div>
  )
}
