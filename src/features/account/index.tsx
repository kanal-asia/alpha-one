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
import { DEFAULT_PLAN_ID, getPlan } from '@/lib/subscription-plans'

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
  const plan = getPlan(DEFAULT_PLAN_ID)

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
              <CardDescription>Local default, not a subscription record.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex items-center gap-2'>
                <span className='text-lg font-semibold'>{plan.name}</span>
                <Badge variant='secondary'>Local default</Badge>
              </div>
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
