import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useOperations } from '../hooks'

export function OperationListPage() {
  const { data: operations, isLoading } = useOperations()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Operations</h1>
          <p className='text-sm text-muted-foreground'>
            The single executable unit of the platform — every operation declared once in the Operation Registry.
          </p>
        </div>

        <Card>
          <CardContent className='py-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead>SDK</TableHead>
                  <TableHead>Capability</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Produces</TableHead>
                  <TableHead>Timeout</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className='text-center text-muted-foreground'>
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {(operations ?? []).map((op) => (
                  <TableRow key={op.id}>
                    <TableCell>
                      <p className='font-mono text-sm font-medium'>{op.id}</p>
                      <p className='max-w-sm truncate text-xs text-muted-foreground'>{op.description}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>{op.sdkOwner}</Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>{op.capability}</TableCell>
                    <TableCell className='font-mono text-xs text-muted-foreground'>v{op.version}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {op.artifactContract?.produces?.map((p) => `${p.type} (${p.format})`).join(', ') ?? '—'}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>{op.timeoutMs ? `${op.timeoutMs}ms` : '—'}</TableCell>
                    <TableCell className='text-right'>
                      <Link
                        to='/workspace/operations/$operationId'
                        params={{ operationId: op.id }}
                        className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
                      >
                        Detail <ArrowUpRight className='size-4' />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
