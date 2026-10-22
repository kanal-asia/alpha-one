import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  SUBSCRIPTION_PLANS,
  isCandidatePrice,
  planPriceIdr,
} from '@/lib/subscription-plans'

function formatIdr(amount: number): string {
  return `Rp${amount.toLocaleString('id-ID')}/bulan`
}

/**
 * TASK-ALPHA-SUBSCRIBER-002: plans, pricing & benefits.
 *
 * Rendered directly from the static catalog. Candidate prices carry a
 * visible badge and an explicit disclaimer — they are never presented as
 * final offers. There is deliberately no purchase button: no billing
 * backend exists.
 */
export function AccountPlans() {
  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Subscription Plans</h1>
          <p className='text-sm text-muted-foreground'>
            Plans, pricing, and benefits. Prices marked Candidate are proposals
            from the product specification — not final commercial offers.
          </p>
        </div>

        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          {SUBSCRIPTION_PLANS.map((plan) => (
            <Card key={plan.id}>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  {plan.name}
                  {isCandidatePrice(plan.monthlyPriceIdr) && (
                    <Badge variant='outline'>Candidate price</Badge>
                  )}
                </CardTitle>
                <CardDescription>{plan.positioning}</CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                <p className='text-lg font-semibold'>
                  {planPriceIdr(plan) === 0 ? 'Rp0' : formatIdr(planPriceIdr(plan))}
                </p>
                <ul className='space-y-1 text-sm'>
                  {plan.benefits.map((b) => (
                    <li key={b.label} className='flex justify-between gap-2'>
                      <span>{b.label}</span>
                      <span className='shrink-0 text-muted-foreground'>{b.level}</span>
                    </li>
                  ))}
                </ul>
                {plan.exclusions.length > 0 && (
                  <p className='text-xs text-muted-foreground'>
                    Not included: {plan.exclusions.join('; ')}.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className='mt-4'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              Upgrade
              <Badge variant='outline'>Coming Soon</Badge>
            </CardTitle>
            <CardDescription>
              Upgrades, billing, and quota enforcement ship with the
              subscription backend. Nothing on this page charges you.
            </CardDescription>
          </CardHeader>
        </Card>
      </Main>
    </>
  )
}
