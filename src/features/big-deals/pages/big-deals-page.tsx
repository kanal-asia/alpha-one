import { Tag } from 'lucide-react'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { getFeaturedDeals } from '../data/deals'
import { DealCard } from '../components/deal-card'

export function BigDealsPage() {
  const featured = getFeaturedDeals()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold tracking-tight'>AI BIG Deals</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Discover AI offers, credits & savings.
          </p>
          <p className='mt-1 text-sm text-muted-foreground'>
            Find valuable AI subscriptions, usage credits, discounts, free trials, and curated
            offers for your AI workflow.
          </p>
        </div>

        {featured.length > 0 && (
          <div className='space-y-4'>
            <div className='flex items-center gap-2'>
              <Tag className='size-4 text-muted-foreground' />
              <h2 className='text-lg font-semibold'>Featured Deals</h2>
            </div>
            <div className='grid gap-4 lg:grid-cols-1'>
              {featured.map((deal) => (
                <DealCard key={deal.dealId} deal={deal} />
              ))}
            </div>
          </div>
        )}
      </Main>
    </>
  )
}
