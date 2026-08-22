import { Link } from '@tanstack/react-router'
import { Gift, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { Deal } from '../types'
import { AffiliateCta } from './affiliate-cta'
import { AffiliateDisclosure } from './affiliate-disclosure'
import { ValueSignal } from './value-signal'

interface DealCardProps {
  deal: Deal
  variant?: 'featured' | 'compact'
}

export function DealCard({ deal, variant = 'featured' }: DealCardProps) {
  if (variant === 'compact') {
    return (
      <Card className='relative overflow-hidden transition-colors hover:bg-accent/30'>
        <CardHeader className='pb-2'>
          <div className='flex items-start justify-between gap-2'>
            <div className='space-y-1'>
              <CardTitle className='text-base font-semibold'>{deal.dealId}</CardTitle>
              <p className='text-sm text-muted-foreground'>{deal.headline}</p>
            </div>
            <Badge variant='secondary' className='shrink-0 text-xs'>
              {deal.category}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <span className='font-semibold text-foreground'>{deal.introductoryPrice}</span>
            <span className='text-muted-foreground'>→</span>
            <span className='text-muted-foreground'>{deal.price}</span>
          </div>
          <AffiliateCta url={deal.destinationUrl} label={deal.ctaLabel} size='sm' />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className='relative overflow-hidden'>
      <CardHeader className='pb-4'>
        <div className='flex items-start justify-between gap-2'>
          <div className='space-y-1'>
            <div className='flex items-center gap-2'>
              <Sparkles className='size-5 text-amber-500' />
              <CardTitle className='text-xl font-bold'>{deal.dealId}</CardTitle>
            </div>
            <p className='text-sm text-muted-foreground'>{deal.headline}</p>
          </div>
          <Badge variant='secondary' className='shrink-0 text-xs'>
            {deal.category}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-5'>
        <ValueSignal
          introductoryPrice={deal.introductoryPrice}
          price={deal.price}
          usageValueLabel={deal.usageValueLabel}
          usageValue={deal.usageValue}
        />

        <Separator />

        <div className='space-y-2'>
          <div className='flex items-center gap-2 text-sm font-semibold text-foreground'>
            <Gift className='size-4 text-pink-500' />
            {deal.offerText}
          </div>
          <p className='text-sm text-muted-foreground'>{deal.benefitText}</p>
        </div>

        <AffiliateCta url={deal.destinationUrl} label={deal.ctaLabel} />

        <AffiliateDisclosure text={deal.disclosure} />

        <div className='pt-1'>
          <Link
            to='/big-deals/$dealId'
            params={{ dealId: deal.dealId }}
            className='text-sm text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground'
          >
            View full details →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
