import { CheckCircle2, Server, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { usePlatformHealth, useRuntimes } from '../hooks'

export function RuntimePage() {
  const { data: runtimes } = useRuntimes()
  const { data: platform, isLoading } = usePlatformHealth()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Runtime</h1>
          <p className='text-sm text-muted-foreground'>
            The AI engine adapters the platform can execute work on.
          </p>
        </div>

        <section className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {(runtimes ?? []).map((runtime) => (
            <Card key={runtime.id}>
              <CardHeader className='pb-2'>
                <CardTitle className='flex items-center justify-between text-sm font-medium text-muted-foreground'>
                  <span className='flex items-center gap-2'>
                    <Server className='size-4' /> {runtime.label}
                  </span>
                  {runtime.available ? (
                    <CheckCircle2 className='size-4 text-emerald-500' />
                  ) : (
                    <XCircle className='size-4 text-destructive' />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-lg font-semibold'>{runtime.available ? 'available' : 'unavailable'}</p>
                <p className='font-mono text-xs text-muted-foreground'>{runtime.id}</p>
              </CardContent>
            </Card>
          ))}
          {!isLoading && (runtimes ?? []).length === 0 && (
            <Card>
              <CardContent className='py-10 text-sm text-muted-foreground'>No runtimes registered.</CardContent>
            </Card>
          )}
        </section>

        <Card className='mt-6'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Engine status</CardTitle>
          </CardHeader>
          <CardContent className='space-y-2 text-sm'>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>Platform health</span>
              <Badge variant={platform?.runtime.status === 'ok' ? 'default' : 'secondary'}>
                {platform?.runtime.status ?? '…'}
              </Badge>
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>Available engines</span>
              <span>
                {platform?.runtime.available ?? '…'} / {platform?.runtime.total ?? '…'}
              </span>
            </div>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
