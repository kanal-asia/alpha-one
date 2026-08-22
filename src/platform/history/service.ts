/**
 * Alpha Workspace ΓÇö History Platform (TASK-ENGINEERING-002)
 *
 * A dedicated history service. It records every workspace event into a
 * structured, immutable store and derives entity ids (workflow / operation /
 * artifact / runtime) plus durations by pairing start/completed events.
 *
 * History NEVER reads a Runtime directly ΓÇö it only reads the Event Bus. This
 * keeps History a pure projection of the event log.
 */
import type { EventBus } from '../events/bus'
import type { WorkspaceEvent, WorkspaceEventType } from '../events/contract'

export interface HistoryEntry {
  id: string
  type: WorkspaceEventType
  ts: string
  actor: string
  target: string
  detail: Record<string, unknown>
  workflowId: string | null
  operationId: string | null
  artifactId: string | null
  runtimeId: string | null
  sdkId: string | null
  status: string | null
  durationMs: number | null
}

export interface HistoryService {
  list(): HistoryEntry[]
  get(id: string): HistoryEntry | null
  listByType(type: WorkspaceEventType): HistoryEntry[]
  summary(): { total: number; byType: Record<string, number> }
}

export function createHistoryService(events: EventBus): HistoryService {
  const entries = new Map<string, HistoryEntry>()
  const startTimes = new Map<string, number>()

  events.on('*', (event: WorkspaceEvent) => {
    const entry = derive(event)
    entries.set(entry.id, entry)
  })

  function derive(event: WorkspaceEvent): HistoryEntry {
    const detail = event.detail as Record<string, unknown>
    const d = detail ?? {}

    if (event.type === 'operation.started') {
      startTimes.set(`op:${event.target}:${d.stepId as string}`, Date.parse(event.ts))
    }
    if (event.type === 'runtime.started') {
      startTimes.set(`rt:${event.target}`, Date.parse(event.ts))
    }

    let durationMs: number | null = null
    if (event.type === 'operation.completed') {
      const start = startTimes.get(`op:${event.target}:${d.stepId as string}`)
      if (start != null) durationMs = Math.max(0, Date.parse(event.ts) - start)
      if (typeof d.durationMs === 'number') durationMs = d.durationMs
    }
    if (event.type === 'runtime.completed' || event.type === 'runtime.failed') {
      const start = startTimes.get(`rt:${event.target}`)
      if (start != null) durationMs = Math.max(0, Date.parse(event.ts) - start)
      if (typeof d.durationMs === 'number') durationMs = d.durationMs
    }

    return {
      id: event.id,
      type: event.type,
      ts: event.ts,
      actor: event.actor,
      target: event.target,
      detail,
      workflowId:
        typeof d.workflowId === 'string' ? d.workflowId : event.actor === 'workflow' ? event.target : null,
      operationId: typeof d.operationId === 'string' ? d.operationId : event.actor === 'operation' ? event.target : null,
      artifactId:
        typeof d.artifactId === 'string'
          ? d.artifactId
          : event.actor === 'artifact'
            ? event.target
            : null,
      runtimeId: event.actor === 'runtime' ? event.target : typeof d.runtimeId === 'string' ? d.runtimeId : null,
      sdkId: typeof d.sdkId === 'string' ? d.sdkId : event.actor === 'sdk' ? event.target : null,
      status:
        typeof d.status === 'string'
          ? d.status
          : typeof d.ok === 'boolean'
            ? d.ok
              ? 'completed'
              : 'failed'
            : event.type.endsWith('.failed')
              ? 'failed'
              : event.type.endsWith('.started')
                ? 'running'
                : null,
      durationMs,
    }
  }

  return {
    list() {
      return [...entries.values()].sort((a, b) => b.ts.localeCompare(a.ts))
    },
    get(id) {
      return entries.get(id) ?? null
    },
    listByType(type) {
      return this.list().filter((e) => e.type === type)
    },
    summary() {
      const byType: Record<string, number> = {}
      for (const entry of entries.values()) {
        byType[entry.type] = (byType[entry.type] ?? 0) + 1
      }
      return { total: entries.size, byType }
    },
  }
}
