import { BarChart3 } from 'lucide-react'
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

/**
 * TASK-ALPHA-SUBSCRIBER-002: usage & quota.
 *
 * Honest empty state: there is no usage ledger yet, so no figures are
 * shown. Rendering zeros or estimates here would be fabricated billing
 * data.
 */
export function AccountUsage() {
  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Usage & Quota</h1>
          <p className='text-sm text-muted-foreground'>
            How much of your plan you have used.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BarChart3 className='size-4' />
              No usage data yet
              <Badge variant='outline'>Planned</Badge>
            </CardTitle>
            <CardDescription>
              Usage metering ships with the subscription backend.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-muted-foreground'>
              Once metering is available, this page shows your AI usage,
              remaining quota, and plan limits. Until then, nothing is
              measured and nothing is limited.
            </p>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
