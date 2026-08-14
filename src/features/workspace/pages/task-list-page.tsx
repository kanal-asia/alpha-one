import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { useTasks } from '../hooks'

export function TaskListPage() {
  const { data: tasks, isLoading } = useTasks()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4 flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Tasks</h1>
            <p className='text-sm text-muted-foreground'>
              Every workflow run in the workspace, newest first.
            </p>
          </div>
          <Button asChild size='sm'>
            <Link to='/'>New task</Link>
          </Button>
        </div>

        <Card>
          <CardContent className='py-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Task Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className='text-center text-muted-foreground'>
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {(tasks ?? []).map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className='font-medium'>{task.title}</TableCell>
                    <TableCell className='text-muted-foreground'>{task.workflowId}</TableCell>
                    <TableCell>
                      <StatusBadge status={task.status} />
                    </TableCell>
                    <TableCell className='text-muted-foreground'>{task.createdBy}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {new Date(task.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className='text-right'>
                      <Link
                        to='/workspace/tasks/$taskId'
                        params={{ taskId: task.id }}
                        className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
                      >
                        Open <ArrowUpRight className='size-4' />
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
