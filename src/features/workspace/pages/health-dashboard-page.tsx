import { Activity, Boxes, CheckCircle2, FileText, Layers, Server, Workflow as WorkflowIcon, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { useHistorySummary, usePlatformHealth, useWorkspaceHealth } from '../hooks'

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  ok: CheckCircle2,
  degraded: Activity,
  down: XCircle,
  unavailable: XCircle,
}

const STATUS_COLOR: Record<string, string> = {
  ok: 'text-emerald-500',
  degraded: 'text-amber-500',
  down: 'text-destructive',
  unavailable: 'text-muted-foreground',
}

export function HealthDashboardPage() {
  const { data: health } = useWorkspaceHealth()
  const { data: platform, isLoading } = usePlatformHealth()
  const { data: summary } = useHistorySummary()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Health Dashboard</h1>
          <p className='text-sm text-muted-foreground'>
            Status of every platform component — kernel, SDKs, runtime, workflows, artifacts and storage.
          </p>
        </div>

        {isLoading && <p className='text-sm text-muted-foreground'>Loading…</p>}
        {platform && (
          <section className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            <HealthCard
              title='Kernel'
              icon={Server}
              status={platform.kernel.status}
              detail={`Alpha One · v${platform.kernel.version}`}
            />
            <HealthCard
              title='SDKs'
              icon={Layers}
              status={platform.sdks.status}
              detail={`${platform.sdks.available} / ${platform.sdks.total} registered`}
            />
            <HealthCard
              title='Runtimes'
              icon={Boxes}
              status={platform.runtime.status}
              detail={`${platform.runtime.available} / ${platform.runtime.total} available`}
            />
            <HealthCard
              title='Workflows'
              icon={WorkflowIcon}
              status={platform.workflow.status}
              detail={`${platform.workflow.active} active of ${platform.workflow.total}`}
            />
            <HealthCard
              title='Artifacts'
              icon={FileText}
              status={platform.artifact.status}
              detail={`${platform.artifact.total} artifacts · ${formatBytes(platform.artifact.sizeBytes)}`}
            />
            <HealthCard
              title='Storage'
              icon={Activity}
              status={platform.storage.status}
              detail={platform.storage.location}
            />
          </section>
        )}

        <div className='mt-6 grid gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium'>Kernel snapshot</CardTitle>
            </CardHeader>
            <CardContent className='grid grid-cols-2 gap-2 text-sm sm:grid-cols-3'>
              <Stat label='Operations' value={health?.registered.operations} />
              <Stat label='SDKs' value={health?.registered.sdks} />
              <Stat label='Runtimes' value={health?.registered.runtimes} />
              <Stat label='Workflows' value={health?.registered.workflows} />
              <Stat label='Entities' value={health?.registered.entities} />
              <Stat label='Artifacts' value={health?.registered.artifacts} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium'>Event log summary</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-wrap gap-2'>
              <Badge variant='outline'>total: {summary?.total ?? 0}</Badge>
              {summary &&
                Object.entries(summary.byType).map(([type, count]) => (
                  <Badge key={type} variant='secondary'>
                    {type}: {count}
                  </Badge>
                ))}
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}

function HealthCard({
  title,
  icon: Icon,
  status,
  detail,
}: {
  title: string
  icon: typeof CheckCircle2
  status: string
  detail: string
}) {
  const StatusIcon = STATUS_ICON[status] ?? Activity
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='flex items-center justify-between text-sm font-medium text-muted-foreground'>
          <span className='flex items-center gap-2'>
            <Icon className='size-4' /> {title}
          </span>
          <StatusIcon className={`size-4 ${STATUS_COLOR[status] ?? 'text-muted-foreground'}`} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className='text-lg font-semibold'>{status}</p>
        <p className='text-xs text-muted-foreground'>{detail}</p>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className='rounded-md border p-2'>
      <p className='text-xs uppercase text-muted-foreground'>{label}</p>
      <p className='text-lg font-semibold'>{value ?? '—'}</p>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}
