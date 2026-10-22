import { Link } from '@tanstack/react-router'
import { ArrowRight, BadgeCheck, BarChart3, CreditCard, Crown, FlaskConical } from 'lucide-react'
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
import { DEFAULT_PLAN_ID, getPlan } from '@/lib/subscription-plans'

const currentPlan = getPlan(DEFAULT_PLAN_ID)

/**
 * TASK-ALPHA-SUBSCRIBER-002: Business Studio home.
 *
 * Single subscriber entry point (see sidebar registry). There is no
 * subscription backend yet, so plan and usage are shown as the honest local
 * default — never as server-issued records. Workflow sections from the
 * architecture spec that have no implementation stay out of this page
 * entirely (no false capability).
 */
export function StudioHome() {
  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Business Studio</h1>
          <p className='text-sm text-muted-foreground'>
            Turn business data into actionable insights, reports, and decisions.
          </p>
        </div>

        <div className='grid gap-4 md:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <BadgeCheck className='size-4' />
                Current Plan
              </CardTitle>
              <CardDescription>Local default until subscription backend ships.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex items-center gap-2'>
                <span className='text-lg font-semibold'>{currentPlan.name}</span>
                <Badge variant='secondary'>Local default</Badge>
              </div>
              <p className='text-sm text-muted-foreground'>{currentPlan.positioning}</p>
              <Button variant='outline' size='sm' asChild>
                <Link to='/account'>
                  View account
                  <ArrowRight className='size-4' />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <BarChart3 className='size-4' />
                Usage & Quota
              </CardTitle>
              <CardDescription>No usage tracking backend yet.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Usage metering ships with the subscription backend. No usage
                figures are shown until then.
              </p>
              <Button variant='outline' size='sm' asChild>
                <Link to='/account/usage'>
                  View usage
                  <ArrowRight className='size-4' />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Crown className='size-4' />
                Available Plans
              </CardTitle>
              <CardDescription>Prices are candidates, not final offers.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Free, Member, Pro, and Business — compare benefits and find the
                plan that fits your work.
              </p>
              <Button variant='outline' size='sm' asChild>
                <Link to='/account/plans'>
                  Compare plans
                  <ArrowRight className='size-4' />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <CreditCard className='size-4' />
                Account & Billing
              </CardTitle>
              <CardDescription>Billing history ships with billing integration.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Review your account overview and billing records once billing
                is available.
              </p>
              <Button variant='outline' size='sm' asChild>
                <Link to='/account/billing'>
                  View billing
                  <ArrowRight className='size-4' />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className='mt-4'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <FlaskConical className='size-4' />
              Business Workflows
              <Badge variant='outline'>Planned</Badge>
            </CardTitle>
            <CardDescription>
              Guided Marketing, Operations, and reporting workflows arrive with
              the Studio workflow milestones — after subscription entitlements
              ship.
            </CardDescription>
          </CardHeader>
        </Card>
      </Main>
    </>
  )
}
