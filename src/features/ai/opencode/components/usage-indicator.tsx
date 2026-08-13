import { useState } from 'react'
import { Gauge, Loader2, Scissors } from 'lucide-react'
import { useOpenCodeStore } from '../store/opencode-store'
import type { ContextStatus } from '../types'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<ContextStatus, string> = {
  normal: 'text-cyan-600',
  attention: 'text-amber-600',
  high: 'text-orange-600',
  critical: 'text-red-600',
}

const STATUS_LABELS: Record<ContextStatus, string> = {
  normal: 'Normal',
  attention: 'Attention',
  high: 'High',
  critical: 'Critical',
}

function formatTokens(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatMoney(n: number | null): string {
  if (n === null) return '—'
  if (n === 0) return '$0.00'
  return `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`
}

interface DaysOption {
  label: string
  days: number | undefined
}

const DAY_OPTIONS: DaysOption[] = [
  { label: 'Today', days: 1 },
  { label: 'Month', days: 30 },
  { label: 'All', days: undefined },
]

export function UsageIndicator() {
  const {
    chats,
    activeChatId,
    settings,
    usageSummary,
    compacting,
    compactResult,
    loadUsageSummary,
    compactActiveSession,
  } = useOpenCodeStore()
  const [days, setDays] = useState<number | undefined>(undefined)

  const chat = chats.find((c) => c.id === activeChatId)
  const context = chat?.context
  const usage = chat?.usage
  const sessionId = chat?.sessionId

  const percent = context ? Math.round(context.percent) : null
  const pillClass = context ? STATUS_STYLES[context.status] : 'text-muted-foreground'

  const switchDays = (d: number | undefined) => {
    setDays(d)
    void loadUsageSummary(d)
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && !usageSummary) void loadUsageSummary(days)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='h-8 gap-1.5'
          aria-label='Context usage'
        >
          <Gauge className='size-3.5 text-muted-foreground' />
          <span className={cn('font-medium', pillClass)}>
            {percent === null ? 'Context —' : `Context ${percent}%`}
          </span>
          <span className='hidden text-[11px] text-muted-foreground sm:inline'>
            {context ? `${formatTokens(context.used)} / ${formatTokens(context.limit)}` : ''}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-80'>
        <div className='space-y-4'>
          <div>
            <div className='flex items-baseline justify-between'>
              <p className='text-sm font-medium'>Context Usage</p>
              {context ? (
                <span className={cn('text-xs font-medium', pillClass)}>
                  {percent}% · {STATUS_LABELS[context.status]}
                </span>
              ) : (
                <span className='text-xs text-muted-foreground'>Unavailable</span>
              )}
            </div>
            {context ? (
              <p className='mt-0.5 text-xs text-muted-foreground'>
                {formatTokens(context.used)} of {formatTokens(context.limit)} tokens
                (step usage vs model context window)
              </p>
            ) : (
              <p className='mt-0.5 text-xs text-muted-foreground'>
                Basis missing (no native step tokens or unknown context window) —
                not shown as 0%.
              </p>
            )}
          </div>

          <div className='space-y-1 border-t pt-3'>
            <div className='flex items-center justify-between'>
              <p className='text-sm font-medium'>This Session</p>
              {usage ? (
                <span className='text-xs text-muted-foreground'>
                  {formatMoney(usage.cost)}
                </span>
              ) : (
                <span className='text-xs text-muted-foreground'>—</span>
              )}
            </div>
            {usage ? (
              <dl className='grid grid-cols-2 gap-x-3 gap-y-1 text-xs'>
                <Row label='Input' value={formatTokens(usage.inputTokens)} />
                <Row label='Output' value={formatTokens(usage.outputTokens)} />
                <Row label='Total' value={formatTokens(usage.totalTokens)} />
                <Row label='Reasoning' value={formatTokens(usage.reasoningTokens)} />
                <Row label='Cache read' value={formatTokens(usage.cacheReadTokens)} />
                <Row label='Cache write' value={formatTokens(usage.cacheWriteTokens)} />
              </dl>
            ) : (
              <p className='text-xs text-muted-foreground'>
                Send a message to capture native usage from the runtime.
              </p>
            )}
          </div>

          <div className='space-y-2 border-t pt-3'>
            <div className='flex items-center justify-between'>
              <p className='text-sm font-medium'>Usage Summary</p>
              <div className='flex overflow-hidden rounded-md border'>
                {DAY_OPTIONS.map((o) => (
                  <button
                    key={o.label}
                    type='button'
                    onClick={() => switchDays(o.days)}
                    className={cn(
                      'px-2 py-1 text-[11px] transition-colors',
                      days === o.days
                        ? 'bg-accent font-medium'
                        : 'text-muted-foreground hover:bg-accent/50'
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {usageSummary ? (
              <dl className='grid grid-cols-2 gap-x-3 gap-y-1 text-xs'>
                <Row label='Sessions' value={String(usageSummary.sessions ?? '—')} />
                <Row label='Messages' value={String(usageSummary.messages ?? '—')} />
                <Row label='Total cost' value={formatMoney(usageSummary.totalCost)} />
                <Row label='Cost/day' value={formatMoney(usageSummary.avgCostPerDay)} />
                <Row label='Input' value={formatTokens(usageSummary.inputTokens)} />
                <Row label='Output' value={formatTokens(usageSummary.outputTokens)} />
                <Row label='Cache read' value={formatTokens(usageSummary.cacheReadTokens)} />
                <Row label='Cache write' value={formatTokens(usageSummary.cacheWriteTokens)} />
                <Row label='Avg/session' value={formatTokens(usageSummary.avgTokensPerSession)} />
                <Row label='Median/session' value={formatTokens(usageSummary.medianTokensPerSession)} />
              </dl>
            ) : (
              <p className='text-xs text-muted-foreground'>
                Loading native OpenCode statistics...
              </p>
            )}
          </div>

          <div className='space-y-2 border-t pt-3'>
            <div className='flex items-center justify-between'>
              <p className='text-sm font-medium'>Compaction</p>
              <span className='text-[11px] text-muted-foreground'>
                Mode: {settings.defaultMode}
              </span>
            </div>
            <p className='text-xs text-muted-foreground'>
              Managed natively by OpenCode (automatic compaction is active).
            </p>
            {compactResult?.supported === false && (
              <p className='text-xs text-destructive'>
                {compactResult.message}
              </p>
            )}
            {compactResult?.ok && (
              <p className='text-xs text-emerald-600'>Conversation compacted.</p>
            )}
            <Button
              variant='outline'
              size='sm'
              className='gap-1.5'
              disabled={!sessionId || compacting}
              onClick={() => void compactActiveSession()}
            >
              {compacting ? (
                <Loader2 className='size-3.5 animate-spin' />
              ) : (
                <Scissors className='size-3.5' />
              )}
              {compacting ? 'Compacting…' : 'Compact Conversation'}
            </Button>
          </div>

          <div className='border-t pt-3'>
            <p className='text-sm font-medium'>Provider Limit</p>
            <p className='mt-0.5 text-xs text-muted-foreground'>
              Provider limit unavailable — quota/credits are not exposed by the
              OpenCode CLI.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='font-medium tabular-nums'>{value}</dd>
    </div>
  )
}