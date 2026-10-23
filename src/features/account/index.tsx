import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAccountIdentity } from '@/hooks/use-account-identity'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'
import { getPlan, type PlanId } from '@/lib/subscription-plans'

function planDisplayName(planId: string): string {
  try {
    return getPlan(planId as PlanId).name
  } catch {
    return planId
  }
}

/**
 * TASK-ALPHA-SUBSCRIBER-002: account overview.
 *
 * Identity shown here comes from the Google Workspace connection
 * (useAccountIdentity) — it is NOT the product-login identity and NOT a
 * subscription record. Plan is the honest local default until the
 * subscription backend ships.
 */
export function AccountOverview() {
  const identity = useAccountIdentity()
  const { model, retry } = useSubscriptionStatus()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Account</h1>
          <p className='text-sm text-muted-foreground'>
            Your workspace identity and subscription overview.
          </p>
        </div>

        <div className='grid gap-4 md:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Workspace Identity</CardTitle>
              <CardDescription>From your connected Google account.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-1 text-sm'>
              <p className='font-medium'>{identity.loading ? 'Loading…' : identity.name}</p>
              <p className='text-muted-foreground'>
                {identity.loading ? 'Loading…' : identity.email}
              </p>
              {!identity.loading && !identity.connected && (
                <p className='text-muted-foreground'>
                  No Google account connected. Connect one in Settings to
                  personalize this view.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Read live from the subscription backend.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {model.kind === 'loading' && (
                <p className='text-sm text-muted-foreground'>Loading plan…</p>
              )}
              {model.kind === 'default' && (
                <div className='flex items-center gap-2'>
                  <span className='text-lg font-semibold'>
                    {planDisplayName(model.planId)}
                  </span>
                  <Badge variant='secondary'>Default plan</Badge>
                </div>
              )}
              {model.kind === 'record' && (
                <>
                  <div className='flex items-center gap-2'>
                    <span className='text-lg font-semibold'>
                      {planDisplayName(model.planId)}
                    </span>
                    <Badge variant='secondary'>Subscription</Badge>
                  </div>
                  {model.status !== 'active' && (
                    <p className='text-sm text-muted-foreground'>
                      Status: {model.status}
                    </p>
                  )}
                </>
              )}
              {model.kind === 'error' && (
                <>
                  <p className='text-sm text-muted-foreground'>
                    Plan status could not be loaded: {model.message}
                  </p>
                  <Button variant='outline' size='sm' onClick={retry}>
                    Retry
                  </Button>
                </>
              )}
              <div className='flex flex-wrap gap-2'>
                <Button variant='outline' size='sm' asChild>
                  <Link to='/account/plans'>
                    Compare plans
                    <ArrowRight className='size-4' />
                  </Link>
                </Button>
                <Button variant='outline' size='sm' asChild>
                  <Link to='/account/usage'>
                    View usage
                    <ArrowRight className='size-4' />
                  </Link>
                </Button>
                <Button variant='outline' size='sm' asChild>
                  <Link to='/account/billing'>
                    Billing history
                    <ArrowRight className='size-4' />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
