import type { WorkspaceEventType } from '@/platform/events/contract'
import type { HistoryEntry } from '@/platform/history/service'
import {
  Monitor,
  CheckCircle2,
  XCircle,
  Play,
  FileUp,
  FileCheck,
  FileX2,
  Cpu,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

export interface ActivityViewItem {
  id: string
  title: string
  description: string
  category: ActivityCategory
  icon: LucideIcon
  iconColor: string
  timestamp: string
  rawTimestamp: string
  actor: string
  source: string
  entry: HistoryEntry
}

export type ActivityCategory =
  | 'workspace'
  | 'tasks'
  | 'workflows'
  | 'operations'
  | 'artifacts'
  | 'runtime'
  | 'errors'

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  workspace: 'Workspace',
  tasks: 'Tasks',
  workflows: 'Workflows',
  operations: 'Operations',
  artifacts: 'Artifacts',
  runtime: 'Runtime',
  errors: 'Errors',
}

export function categoryLabel(cat: ActivityCategory): string {
  return CATEGORY_LABELS[cat]
}

const ACTOR_SOURCE_LABELS: Record<string, string> = {
  kernel: 'System',
  task: 'Agent',
  workflow: 'Agent',
  operation: 'Agent',
  sdk: 'Service',
  artifact: 'System',
  runtime: 'Engine',
  user: 'You',
  assistant: 'Assistant',
}

interface EventMapping {
  title: (entry: HistoryEntry) => string
  description: (entry: HistoryEntry) => string
  category: ActivityCategory
  icon: LucideIcon
  iconColor: string
}

const EVENT_MAPPINGS: Partial<Record<WorkspaceEventType, EventMapping>> = {
  'workspace.opened': {
    title: () => 'Workspace opened',
    description: (e) => (e.detail.workspaceId as string) ?? 'Alpha Workspace',
    category: 'workspace',
    icon: Monitor,
    iconColor: 'text-slate-500',
  },
  'task.created': {
    title: () => 'Task created',
    description: (e) => (e.detail.title as string) ?? 'New task',
    category: 'tasks',
    icon: Play,
    iconColor: 'text-blue-500',
  },
  'task.completed': {
    title: (e) => {
      const status = e.detail.status as string
      return status === 'completed' ? 'Task completed' : 'Task failed'
    },
    description: (e) => {
      const status = e.detail.status as string
      return status === 'completed' ? 'Finished successfully' : 'Encountered an error'
    },
    category: 'tasks',
    icon: (e) => (e.detail.status === 'completed' ? CheckCircle2 : XCircle),
    iconColor: (e) => (e.detail.status === 'completed' ? 'text-emerald-500' : 'text-red-500'),
  },
  'workflow.started': {
    title: () => 'Workflow started',
    description: (e) => {
      const steps = e.detail.steps as number
      return `${steps} step${steps !== 1 ? 's' : ''}`
    },
    category: 'workflows',
    icon: Play,
    iconColor: 'text-violet-500',
  },
  'workflow.completed': {
    title: (e) => {
      const status = e.detail.status as string
      return status === 'completed' ? 'Workflow completed' : 'Workflow failed'
    },
    description: (e) => {
      const completed = e.detail.completedSteps as number
      const total = e.detail.steps as number
      const error = e.detail.error as string | null
      if (error) return error
      return `${completed}/${total} steps completed`
    },
    category: 'workflows',
    icon: (e) => (e.detail.status === 'completed' ? CheckCircle2 : XCircle),
    iconColor: (e) => (e.detail.status === 'completed' ? 'text-emerald-500' : 'text-red-500'),
  },
  'workflow.failed': {
    title: () => 'Workflow failed',
    description: (e) => (e.detail.error as string) ?? 'An error occurred',
    category: 'workflows',
    icon: XCircle,
    iconColor: 'text-red-500',
  },
  'operation.started': {
    title: () => 'Operation started',
    description: (e) => {
      const stepId = e.detail.stepId as string
      return stepId ?? 'Processing'
    },
    category: 'operations',
    icon: Play,
    iconColor: 'text-amber-500',
  },
  'operation.completed': {
    title: (e) => {
      const ok = e.detail.ok as boolean
      return ok ? 'Operation completed' : 'Operation failed'
    },
    description: (e) => {
      const ok = e.detail.ok as boolean
      const duration = e.detail.durationMs as number | undefined
      const suffix = duration != null ? ` (${formatDuration(duration)})` : ''
      return ok ? `Succeeded${suffix}` : `Failed${suffix}`
    },
    category: 'operations',
    icon: (e) => (e.detail.ok ? CheckCircle2 : XCircle),
    iconColor: (e) => (e.detail.ok ? 'text-emerald-500' : 'text-red-500'),
  },
  'artifact.created': {
    title: () => 'File created',
    description: (e) => (e.detail.name as string) ?? 'New artifact',
    category: 'artifacts',
    icon: FileUp,
    iconColor: 'text-emerald-500',
  },
  'artifact.saved': {
    title: () => 'File saved',
    description: () => 'Changes persisted',
    category: 'artifacts',
    icon: FileCheck,
    iconColor: 'text-emerald-500',
  },
  'artifact.deleted': {
    title: () => 'File deleted',
    description: () => 'Removed from workspace',
    category: 'artifacts',
    icon: FileX2,
    iconColor: 'text-red-500',
  },
  'runtime.started': {
    title: () => 'Runtime started',
    description: (e) => (e.detail.capability as string) ?? 'Engine ready',
    category: 'runtime',
    icon: Cpu,
    iconColor: 'text-cyan-500',
  },
  'runtime.completed': {
    title: (e) => {
      const ok = e.detail.ok as boolean
      return ok ? 'Runtime completed' : 'Runtime failed'
    },
    description: (e) => {
      const cap = e.detail.capability as string
      const error = e.detail.error as string | null
      return error ?? cap
    },
    category: 'runtime',
    icon: (e) => (e.detail.ok ? CheckCircle2 : XCircle),
    iconColor: (e) => (e.detail.ok ? 'text-emerald-500' : 'text-red-500'),
  },
  'runtime.failed': {
    title: () => 'Runtime failed',
    description: (e) => (e.detail.error as string) ?? 'Engine error',
    category: 'runtime',
    icon: XCircle,
    iconColor: 'text-red-500',
  },
  'sdk.started': {
    title: () => 'Service started',
    description: (e) => (e.detail.sdkId as string) ?? 'Service',
    category: 'runtime',
    icon: Play,
    iconColor: 'text-indigo-500',
  },
  'sdk.completed': {
    title: (e) => {
      const ok = e.detail.ok as boolean
      return ok ? 'Service completed' : 'Service failed'
    },
    description: (e) => {
      const duration = e.detail.durationMs as number | undefined
      return duration != null ? `Finished in ${formatDuration(duration)}` : 'Finished'
    },
    category: 'runtime',
    icon: (e) => (e.detail.ok ? CheckCircle2 : XCircle),
    iconColor: (e) => (e.detail.ok ? 'text-emerald-500' : 'text-red-500'),
  },
  'error.occurred': {
    title: () => 'Error occurred',
    description: (e) => {
      const source = e.detail.source as string
      const message = e.detail.message as string
      return message ?? source ?? 'Unknown error'
    },
    category: 'errors',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
  },
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s - m * 60)
  return `${m}m ${rem}s`
}

function formatActivityTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  if (diffDays === 0) return `Today · ${time}`
  if (diffDays === 1) return `Yesterday · ${time}`

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ` · ${time}`
}

function deriveSourceLabel(actor: string): string {
  return ACTOR_SOURCE_LABELS[actor] ?? actor
}

export function toActivityViewItem(entry: HistoryEntry): ActivityViewItem {
  const mapping = EVENT_MAPPINGS[entry.type]

  if (!mapping) {
    return {
      id: entry.id,
      title: formatUnknownTitle(entry.type),
      description: entry.target ?? 'Activity',
      category: 'workspace',
      icon: AlertTriangle,
      iconColor: 'text-slate-400',
      timestamp: formatActivityTimestamp(entry.ts),
      rawTimestamp: entry.ts,
      actor: entry.actor,
      source: deriveSourceLabel(entry.actor),
      entry,
    }
  }

  const resolvedIcon = typeof mapping.icon === 'function' ? mapping.icon(entry) : mapping.icon
  const resolvedIconColor =
    typeof mapping.iconColor === 'function' ? mapping.iconColor(entry) : mapping.iconColor

  return {
    id: entry.id,
    title: mapping.title(entry),
    description: mapping.description(entry),
    category: mapping.category,
    icon: resolvedIcon,
    iconColor: resolvedIconColor,
    timestamp: formatActivityTimestamp(entry.ts),
    rawTimestamp: entry.ts,
    actor: entry.actor,
    source: deriveSourceLabel(entry.actor),
    entry,
  }
}

function formatUnknownTitle(type: string): string {
  return type
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
