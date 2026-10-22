import { ReceiptText } from 'lucide-react'
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
 * TASK-ALPHA-SUBSCRIBER-002: billing history.
 *
 * Honest empty state: there is no billing integration, so there are no
 * invoices. This page exists as the specified destination so navigation
 * never dead-ends.
 */
export function AccountBilling() {
  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Billing History</h1>
          <p className='text-sm text-muted-foreground'>
            Invoices and payment records for your subscription.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ReceiptText className='size-4' />
              No billing records
              <Badge variant='outline'>Coming Soon</Badge>
            </CardTitle>
            <CardDescription>
              Billing ships with the billing integration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-muted-foreground'>
              You have not been charged for anything. Invoices will appear
              here once paid plans and billing are available.
            </p>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
