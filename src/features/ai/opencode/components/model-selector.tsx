import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  Check,
  ChevronsUpDown,
  Plug,
  RefreshCw,
  Search,
  Sparkles,
  Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ConnectProviderDialog } from './connect-provider-dialog'
import type { ModelInfo } from '../types'
import {
  loadModelPreferences,
  markModelUsed,
  toggleFavorite,
} from '../model-preferences'

type ModelSelectorProps = {
  models: ModelInfo[]
  value: string
  onSelect: (model: ModelInfo) => void
  onRefresh?: () => void
  refreshing?: boolean
  disabled?: boolean
}

interface DisplayModel extends ModelInfo {
  favorite: boolean
  lastUsed: boolean
  active: boolean
}

export function ModelSelector({
  models,
  value,
  onSelect,
  onRefresh,
  refreshing,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [prefs, setPrefs] = useState(() => loadModelPreferences())
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)

  const display = useMemo<DisplayModel[]>(() => {
    const q = query.trim().toLowerCase()
    return models
      .map((m) => ({
        ...m,
        favorite: prefs.favorites.includes(m.id),
        lastUsed: prefs.lastUsed === m.id,
        active: m.id === value,
      }))
      .filter((m) =>
        q
          ? m.displayName.toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q)
          : m.availability !== 'unavailable'
      )
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
        if (a.free !== b.free) return a.free ? -1 : 1
        if (a.lastUsed !== b.lastUsed) return a.lastUsed ? -1 : 1
        return a.displayName.localeCompare(b.displayName)
      })
  }, [models, value, prefs, query])

  const free = display.filter((m) => m.free && m.availability !== 'unavailable')
  const paid = display.filter((m) => !m.free && m.availability !== 'unavailable')
  const unavailable = display.filter((m) => m.availability === 'unavailable')

  const handleSelect = (model: ModelInfo) => {
    onSelect(model)
    markModelUsed(model.id)
    setPrefs(loadModelPreferences())
    setOpen(false)
  }

  const handleToggleFavorite = (id: string) => {
    const next = toggleFavorite(id)
    setPrefs(next)
  }

  const activeModel = models.find((m) => m.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='h-8 w-[260px] justify-between gap-2'
          disabled={disabled}
          role='combobox'
          aria-expanded={open}
        >
          <span className='flex min-w-0 items-center gap-2'>
            {activeModel?.free ? (
              <Sparkles className='size-3.5 shrink-0 text-emerald-500' />
            ) : (
              <Sparkles className='size-3.5 shrink-0 text-muted-foreground' />
            )}
            <span className='truncate'>
              {activeModel?.displayName ?? 'Select model'}
            </span>
            {activeModel && (
              <ModelTierBadge free={activeModel.free} />
            )}
          </span>
          <ChevronsUpDown className='size-3.5 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-[440px] max-w-[calc(100vw-2rem)] p-0'>
        <div className='flex items-center gap-2 border-b p-2'>
          <Search className='size-4 shrink-0 text-muted-foreground' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search models...'
            className='h-8 border-0 bg-transparent shadow-none focus-visible:ring-0'
          />
        </div>
        <ScrollArea className='h-72'>
          <div className='p-1'>
            <SectionHeading title='Free' count={free.length} />
            {free.map((m) => (
              <ModelRow key={m.id} model={m} onSelect={handleSelect} onFavorite={handleToggleFavorite} />
            ))}

            <SectionHeading title='Paid' count={paid.length} />
            {paid.map((m) => (
              <ModelRow key={m.id} model={m} onSelect={handleSelect} onFavorite={handleToggleFavorite} />
            ))}

            {unavailable.length > 0 && (
              <>
                <SectionHeading title='Unavailable' count={unavailable.length} />
                {unavailable.map((m) => (
                  <ModelRow key={m.id} model={m} onSelect={handleSelect} onFavorite={handleToggleFavorite} />
                ))}
              </>
            )}

            {display.length === 0 && (
              <p className='px-3 py-6 text-center text-xs text-muted-foreground'>
                No models found.
              </p>
            )}
          </div>
        </ScrollArea>
        <div className='flex items-center justify-between border-t p-2'>
          <span className='px-1 text-[11px] text-muted-foreground'>
            {models.filter((m) => m.free).length} free · {models.length} total
          </span>
          <div className='flex items-center gap-1'>
            <Button
              variant='ghost'
              size='sm'
              className='h-7 gap-1 text-[11px]'
              onClick={() => {
                setOpen(false)
                setProviderDialogOpen(true)
              }}
            >
              <Plug className='size-3' />
              Connect Provider
            </Button>
            <Button
              variant='ghost'
              size='sm'
              className='h-7 gap-1 text-[11px]'
              onClick={() => {
                onRefresh?.()
                setOpen(false)
              }}
              disabled={refreshing}
            >
              <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </PopoverContent>
      <ConnectProviderDialog
        open={providerDialogOpen}
        onOpenChange={setProviderDialogOpen}
        onRefreshed={onRefresh}
      />
    </Popover>
  )
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  if (count === 0) return null
  return (
    <p className='px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
      {title} · {count}
    </p>
  )
}

function ModelTierBadge({ free }: { free: boolean }) {
  return (
    <Badge
      variant='outline'
      className={cn(
        'shrink-0 border-transparent px-1.5 py-0 text-[10px] font-medium',
        free ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
      )}
    >
      {free ? 'Free' : 'Paid'}
    </Badge>
  )
}

function ModelRow({
  model,
  onSelect,
  onFavorite,
}: {
  model: DisplayModel
  onSelect: (model: DisplayModel) => void
  onFavorite: (id: string) => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
        model.active ? 'bg-muted' : 'hover:bg-accent',
        model.availability === 'unavailable' && 'opacity-60'
      )}
    >
      <Button
        variant='ghost'
        size='icon'
        className='size-6 shrink-0'
        aria-label={model.favorite ? 'Remove favorite' : 'Add favorite'}
        onClick={(e) => {
          e.stopPropagation()
          onFavorite(model.id)
        }}
      >
        <Star
          className={cn(
            'size-3.5',
            model.favorite
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/50 opacity-0 group-hover:opacity-100'
          )}
        />
      </Button>
      <button
        type='button'
        onClick={() => onSelect(model)}
        className='flex min-w-0 flex-1 items-center gap-2 py-1 text-start'
      >
        {model.free ? (
          <BadgeCheck className='size-4 shrink-0 text-emerald-500' />
        ) : (
          <Sparkles className='size-4 shrink-0 text-muted-foreground/60' />
        )}
        <span className='min-w-0 flex-1'>
          <span className='block truncate'>{model.displayName}</span>
          <span className='block truncate text-[11px] text-muted-foreground'>
            {model.provider}
            {model.lastUsed ? ' · last used' : ''}
          </span>
        </span>
        <ModelTierBadge free={model.free} />
        {model.active && <Check className='size-4 shrink-0 text-primary' />}
      </button>
    </div>
  )
}
