import { Boxes } from 'lucide-react'
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
import { useSdks } from '../hooks'

export function SdkRegistryPage() {
  const { data: sdks, isLoading } = useSdks()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>SDK Registry</h1>
          <p className='text-sm text-muted-foreground'>
            Every service (SDK) registered with the platform and the operations it provides.
          </p>
        </div>

        <Card>
          <CardContent className='py-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Operations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className='text-center text-muted-foreground'>
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {(sdks ?? []).map((sdk) => (
                  <TableRow key={sdk.id}>
                    <TableCell className='font-medium'>
                      <span className='flex items-center gap-2'>
                        <Boxes className='size-4 text-muted-foreground' /> {sdk.name}
                      </span>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>{sdk.description}</TableCell>
                    <TableCell className='text-muted-foreground'>v{sdk.version}</TableCell>
                    <TableCell>
                      <span className='flex flex-wrap gap-1'>
                        {sdk.operations.map((op) => (
                          <span
                            key={op}
                            className='rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground'
                          >
                            {op}
                          </span>
                        ))}
                      </span>
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
