import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '../components/status-badge'
import { useArtifact, workspace } from '../hooks'

export function ArtifactDetailPage() {
  const { artifactId } = useParams({ from: '/_authenticated/workspace/artifacts/$artifactId' })
  const { data: artifact, isLoading } = useArtifact(artifactId)

  return (
    <>
      <PageHeader />
      <Main>
        <Link
          to='/workspace/artifacts'
          className='mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='size-4' /> Results
        </Link>

        {isLoading && <p className='text-sm text-muted-foreground'>Loading…</p>}
        {artifact && (
          <>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
              <div>
                <h1 className='text-2xl font-bold tracking-tight'>{artifact.name}</h1>
                <p className='text-sm text-muted-foreground'>
                  <span className='font-mono'>{artifact.id}</span> · {artifact.type}/{artifact.format}
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <StatusBadge status={artifact.status} />
                <a
                  href={workspace.artifactContentUrl(artifact.id)}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
                >
                  <FileText className='size-4' /> View content
                </a>
              </div>
            </div>

            <div className='grid gap-4 lg:grid-cols-2'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Provenance</CardTitle>
                </CardHeader>
                <CardContent className='space-y-2 text-sm'>
                  <Row label='Produced by' value={artifact.producer} mono />
                  <Row label='Created by' value={artifact.createdBy} />
                  <Row label='Consumed by' value={artifact.consumers.length ? artifact.consumers.join(', ') : '—'} />
                  <Row label='MIME' value={artifact.mime} mono />
                  <Row label='Size' value={`${artifact.size} bytes`} />
                  <Row label='Storage' value={`${artifact.storage} · ${artifact.ref}`} mono />
                  <Row label='Created' value={new Date(artifact.createdAt).toLocaleString()} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Links & lifecycle</CardTitle>
                </CardHeader>
                <CardContent className='space-y-2 text-sm'>
                  <div>
                    <p className='text-xs uppercase text-muted-foreground'>Lifecycle</p>
                    <StatusBadge status={artifact.lifecycle} />
                  </div>
                  <div>
                    <p className='text-xs uppercase text-muted-foreground'>Source result</p>
                    {artifact.parentArtifactId ? (
                      <Link
                        to='/workspace/artifacts/$artifactId'
                        params={{ artifactId: artifact.parentArtifactId }}
                        className='font-mono text-xs hover:underline'
                      >
                        {artifact.parentArtifactId}
                      </Link>
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
                  </div>
                  <div>
                    <p className='text-xs uppercase text-muted-foreground'>Derived results</p>
                    <div className='flex flex-wrap gap-1'>
                      {artifact.childArtifactIds.length === 0 && <span className='text-muted-foreground'>—</span>}
                      {artifact.childArtifactIds.map((id) => (
                        <Link
                          key={id}
                          to='/workspace/artifacts/$artifactId'
                          params={{ artifactId: id }}
                          className='rounded-full bg-muted px-2 py-0.5 font-mono text-xs hover:bg-muted/70'
                        >
                          {id}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className='text-xs uppercase text-muted-foreground'>Run / Task</p>
                    <p className='font-mono text-xs'>
                      {artifact.workflowRunId ?? '—'} / {artifact.taskId ?? '—'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {Object.keys(artifact.meta).length > 0 && (
              <Card className='mt-4'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Metadata</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className='overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground'>
                    {JSON.stringify(artifact.meta, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </Main>
    </>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <span className='text-xs uppercase text-muted-foreground'>{label}</span>
      <span className={`truncate ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value}</span>
    </div>
  )
}
