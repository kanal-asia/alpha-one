import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Boxes, GitBranch, Layers, Terminal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { RunTaskForm } from '../components/run-task-form'
import { StatusBadge } from '../components/status-badge'
import { useRuntimes, useTasks, useWorkspaceHealth } from '../hooks'

export function WorkspaceDashboardPage() {
  const { data: health } = useWorkspaceHealth()
  const { data: tasks } = useTasks()
  const { data: runtimes } = useRuntimes()

  const recent = tasks?.slice(0, 5) ?? []

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4 flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Kernel</h1>
            <p className='text-sm text-muted-foreground'>
              Platform overview — registered services, steps, engines and their current state.
            </p>
          </div>
          <Link
            to='/workspace/tasks'
            className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
          >
            All tasks <ArrowUpRight className='size-4' />
          </Link>
        </div>

        {/* ===== Platform health ===== */}
        <section className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>Kernel</CardTitle>
            </CardHeader>
            <CardContent className='flex items-center gap-2'>
              <Terminal className='size-4 text-muted-foreground' />
              <span className='text-lg font-semibold'>
                {health?.status === 'ok' ? 'Healthy' : health?.status ?? '...'}
              </span>
              {health && <span className='text-xs text-muted-foreground'>v{health.version}</span>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>Operations</CardTitle>
            </CardHeader>
            <CardContent className='flex items-center gap-2'>
              <GitBranch className='size-4 text-muted-foreground' />
              <span className='text-lg font-semibold'>{health?.registered.operations ?? '...'}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>SDKs</CardTitle>
            </CardHeader>
            <CardContent className='flex items-center gap-2'>
              <Layers className='size-4 text-muted-foreground' />
              <span className='text-lg font-semibold'>{health?.registered.sdks ?? '...'}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>Runtimes</CardTitle>
            </CardHeader>
            <CardContent className='flex items-center gap-2'>
              <Boxes className='size-4 text-muted-foreground' />
              <span className='text-lg font-semibold'>
                {runtimes?.filter((r) => r.available).length ?? 0}
                <span className='text-xs font-normal text-muted-foreground'> / {runtimes?.length ?? 0} available</span>
              </span>
            </CardContent>
          </Card>
        </section>

        {/* ===== Run a task ===== */}
        <section className='mt-6 grid gap-4 lg:grid-cols-2'>
          <RunTaskForm />
          <Card>
            <CardHeader>
              <CardTitle className='text-sm font-medium'>Recent tasks</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              {recent.length === 0 && (
                <p className='py-6 text-center text-sm text-muted-foreground'>
                  No tasks yet. Run a task template to get started.
                </p>
              )}
              {recent.map((task) => (
                <Link
                  key={task.id}
                  to='/workspace/tasks/$taskId'
                  params={{ taskId: task.id }}
                  className='flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50'
                >
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>{task.title}</p>
                    <p className='text-xs text-muted-foreground'>{task.workflowId}</p>
                  </div>
                  <StatusBadge status={task.status} />
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      </Main>
    </>
  )
}
