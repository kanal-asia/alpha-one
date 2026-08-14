import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Workflow as WorkflowIcon } from 'lucide-react'
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
import { useWorkflows } from '../hooks'

export function WorkflowCatalogPage() {
  const { data: workflows, isLoading } = useWorkflows()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Workflow Catalog</h1>
          <p className='text-sm text-muted-foreground'>
            Every business capability, declared once in the Workflow Registry. No engine changes — only registry entries.
          </p>
        </div>

        <Card>
          <CardContent className='py-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Artifacts</TableHead>
                  <TableHead>Status</TableHead>
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
                {(workflows ?? []).map((workflow) => (
                  <TableRow key={workflow.id}>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        <WorkflowIcon className='size-4 text-muted-foreground' />
                        <div>
                          <p className='font-medium'>{workflow.name}</p>
                          <p className='max-w-md truncate text-xs text-muted-foreground'>{workflow.description}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>{workflow.category}</Badge>
                    </TableCell>
                    <TableCell className='font-mono text-xs text-muted-foreground'>v{workflow.version}</TableCell>
                    <TableCell className='text-muted-foreground'>{workflow.steps.length}</TableCell>
                    <TableCell className='text-muted-foreground'>{workflow.artifactTypes.join(', ')}</TableCell>
                    <TableCell>
                      <Badge variant={workflow.status === 'active' ? 'default' : 'outline'}>{workflow.status}</Badge>
                    </TableCell>
                    <TableCell className='text-right'>
                      <Link
                        to='/workspace/workflows/$workflowId'
                        params={{ workflowId: workflow.id }}
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
