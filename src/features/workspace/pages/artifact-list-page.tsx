import { FileText } from 'lucide-react'
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
import { StatusBadge } from '../components/status-badge'
import { useArtifacts } from '../hooks'

export function ArtifactListPage() {
  const { data: artifacts, isLoading } = useArtifacts()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Results</h1>
          <p className='text-sm text-muted-foreground'>
            Everything produced from your tasks — reports, summaries and generated files.
          </p>
        </div>

        <Card>
          <CardContent className='py-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
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
                {(artifacts ?? []).map((artifact) => (
                  <TableRow key={artifact.id}>
                    <TableCell className='font-medium'>{artifact.name}</TableCell>
                    <TableCell className='text-muted-foreground'>{artifact.type}</TableCell>
                    <TableCell className='text-muted-foreground'>{artifact.format}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {(artifact.size / 1024).toFixed(1)} KB
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={artifact.status} />
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {new Date(artifact.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className='text-right'>
                      <a
                        href={`/api/ws/artifacts/${artifact.id}/content`}
                        target='_blank'
                        rel='noreferrer'
                        className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
                      >
                        <FileText className='size-4' /> View
                      </a>
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
