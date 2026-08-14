import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle2, FileText, Loader2, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '../components/status-badge'
import { workspace, workspaceKeys, useTask } from '../hooks'

export function TaskDetailPage() {
  const { taskId } = useParams({ from: '/_authenticated/workspace/tasks/$taskId' })
  const { data, isLoading } = useTask(taskId)

  const run = data?.run ?? null
  const artifacts = run?.steps.flatMap((s) => s.artifactIds.map((id) => ({ stepId: s.stepId, id }))) ?? []

  return (
    <>
      <PageHeader />
      <Main>
        <Link
          to='/workspace/tasks'
          className='mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='size-4' /> Tasks
        </Link>

        {isLoading && <p className='text-sm text-muted-foreground'>Loading…</p>}
        {data && (
          <>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
              <div>
                <h1 className='text-2xl font-bold tracking-tight'>{data.task.title}</h1>
                <p className='text-sm text-muted-foreground'>
                  {data.task.workflowId} · {new Date(data.task.createdAt).toLocaleString()} · created by{' '}
                  {data.task.createdBy}
                </p>
              </div>
              <StatusBadge status={data.task.status} />
            </div>

            {data.task.description && (
              <Card className='mb-4'>
                <CardContent className='text-sm text-muted-foreground'>{data.task.description}</CardContent>
              </Card>
            )}

            {run && (
              <section className='space-y-2'>
                <h2 className='text-lg font-semibold tracking-tight'>Task run</h2>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-medium'>
                      Run {run.id} · {run.workflowId} · {run.steps.length} steps
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    {run.steps.map((step, index) => (
                      <div key={step.stepId} className='rounded-md border p-3'>
                        <div className='flex items-center justify-between gap-2'>
                          <div className='flex items-center gap-2'>
                            <span className='text-xs text-muted-foreground'>{index + 1}.</span>
                            <span className='text-sm font-medium'>{step.label}</span>
                            <span className='font-mono text-xs text-muted-foreground'>{step.operationId}</span>
                          </div>
                          {step.status === 'completed' && <CheckCircle2 className='size-4 text-emerald-500' />}
                          {step.status === 'failed' && <XCircle className='size-4 text-destructive' />}
                          {step.status === 'running' && <Loader2 className='size-4 animate-spin text-muted-foreground' />}
                          {step.status === 'pending' && <span className='text-xs text-muted-foreground'>pending</span>}
                        </div>
                        {step.error && <p className='mt-1 text-sm text-destructive'>{step.error}</p>}
                        {step.artifactIds.length > 0 && (
                          <div className='mt-2 flex flex-wrap gap-2'>
                            {step.artifactIds.map((id) => (
                              <Link
                                key={id}
                                to='/workspace/artifacts'
                                className='inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-muted/70'
                              >
                                <FileText className='size-3' /> {id}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {run.status === 'completed' && (
                  <Card>
                    <CardHeader className='pb-2'>
                      <CardTitle className='text-sm font-medium'>Results</CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-2'>
                      {artifacts.length === 0 && (
                        <p className='text-sm text-muted-foreground'>This run produced no results.</p>
                      )}
                      {artifacts.map(({ id }) => (
                        <ArtifactRow key={id} artifactId={id} />
                      ))}
                    </CardContent>
                  </Card>
                )}
              </section>
            )}
          </>
        )}
      </Main>
    </>
  )
}

function ArtifactRow({ artifactId }: { artifactId: string }) {
  const { data: artifact } = useQueryArtifact(artifactId)
  if (!artifact) return null
  return (
    <div className='flex items-center justify-between rounded-md border p-3'>
      <div className='min-w-0'>
        <p className='truncate text-sm font-medium'>{artifact.name}</p>
        <p className='text-xs text-muted-foreground'>
          {artifact.type} · {artifact.format} · {(artifact.size / 1024).toFixed(1)} KB
        </p>
      </div>
      <a
        href={workspace.artifactContentUrl(artifact.id)}
        target='_blank'
        rel='noreferrer'
        className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
      >
        <FileText className='size-4' /> View
      </a>
    </div>
  )
}

function useQueryArtifact(id: string) {
  return useQuery({
    queryKey: workspaceKeys.artifacts,
    queryFn: () => workspace.listArtifacts(),
    select: (artifacts) => artifacts.find((a) => a.id === id),
  })
}
