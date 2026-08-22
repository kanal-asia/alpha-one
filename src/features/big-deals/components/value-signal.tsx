import { Badge } from '@/components/ui/badge'

interface ValueSignalProps {
  introductoryPrice: string
  price: string
  usageValueLabel: string
  usageValue: number
}

export function ValueSignal({
  introductoryPrice,
  price,
  usageValueLabel,
  usageValue,
}: ValueSignalProps) {
  return (
    <div className='space-y-3'>
      <div>
        <div className='text-2xl font-bold tracking-tight text-foreground'>
          {introductoryPrice}
        </div>
        <div className='text-sm text-muted-foreground'>Then {price}</div>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <Badge
          variant='outline'
          className='border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400'
        >
          {usageValueLabel}
        </Badge>
        <Badge
          variant='outline'
          className='border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-sm font-semibold text-amber-700 dark:text-amber-400'
        >
          {Math.round(usageValue / 10)}× Usage Value
        </Badge>
      </div>
    </div>
  )
}
