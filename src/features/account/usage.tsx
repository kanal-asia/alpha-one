import { BarChart3 } from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSubscriptionUsage } from '@/hooks/use-subscription-usage'

function formatDate(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  return new Date(ms).toLocaleString()
}

/**
 * TASK-ALPHA-SUBSCRIBER-012: recorded usage.
 *
 * Shows ledger facts only: recorded runs with model, token counts, outcome,
 * and timestamps. Never invoices, costs, quotas, or limits — none of those
 * exist. An empty ledger is an honest empty state, not proof of zero
 * consumption outside the tracked execution path.
 */
export function AccountUsage() {
  const { model, retry } = useSubscriptionUsage()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Usage & Quota</h1>
          <p className='text-sm text-muted-foreground'>
            Recorded AI runs on this device. No quotas or billing are attached.
          </p>
        </div>

        {model.kind === 'loading' && (
          <Card>
            <CardContent>
              <p className='text-sm text-muted-foreground'>Loading usage…</p>
            </CardContent>
          </Card>
        )}

        {model.kind === 'error' && (
          <Card>
            <CardHeader>
              <CardTitle>Usage unavailable</CardTitle>
              <CardDescription>{model.message}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant='outline' size='sm' onClick={retry}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {model.kind === 'ready' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <BarChart3 className='size-4' />
                  {model.total} recorded run{model.total === 1 ? '' : 's'}
                  <Badge variant='secondary'>Ledger facts</Badge>
                </CardTitle>
                <CardDescription>
                  Completed chat executions recorded by this app. Aborted runs
                  are not recorded.
                </CardDescription>
              </CardHeader>
              {model.runs.length > 0 && (
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Finished</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Tokens</TableHead>
                        <TableHead>Outcome</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {model.runs.map((run) => (
                        <TableRow key={run.runId}>
                          <TableCell>{formatDate(run.createdAt)}</TableCell>
                          <TableCell>{run.model}</TableCell>
                          <TableCell>{run.tokenCount}</TableCell>
                          <TableCell>
                            {run.terminal ? 'Completed' : 'Incomplete'}
                            {run.exitCode !== null && run.exitCode !== 0
                              ? ` (exit ${run.exitCode})`
                              : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>

            {model.runs.length === 0 && (
              <Card className='mt-4'>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    No runs recorded yet. Usage appears here after completed AI
                    executions.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </Main>
    </>
  )
}
