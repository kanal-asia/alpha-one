import { describe, expect, it } from 'vitest'
import { createEventBus, nextEventId } from '../events/bus'
import { createHistoryService } from './service'

function makeKernel() {
  const events = createEventBus()
  const history = createHistoryService(events)
  return { events, history }
}

describe('History Platform (TASK-ENGINEERING-002)', () => {
  it('records every event as a structured, derived entry', () => {
    const { events, history } = makeKernel()
    events.publish({
      id: nextEventId(),
      type: 'operation.started',
      ts: '2026-01-01T00:00:00.000Z',
      actor: 'operation',
      target: 'spreadsheet.read',
      detail: { operationId: 'spreadsheet.read', stepId: 'read' },
    })
    events.publish({
      id: nextEventId(),
      type: 'operation.completed',
      ts: '2026-01-01T00:00:05.000Z',
      actor: 'operation',
      target: 'spreadsheet.read',
      detail: { operationId: 'spreadsheet.read', stepId: 'read', ok: true, artifactIds: [], durationMs: 5000 },
    })

    const entries = history.list()
    expect(entries).toHaveLength(2)
    const completed = entries.find((e) => e.type === 'operation.completed')!
    expect(completed.operationId).toBe('spreadsheet.read')
    expect(completed.status).toBe('completed')
    expect(completed.durationMs).toBe(5000)
  })

  it('derives entity ids from event actor and detail', () => {
    const { events, history } = makeKernel()
    events.publish({
      id: nextEventId(),
      type: 'artifact.created',
      ts: '2026-01-01T00:00:00.000Z',
      actor: 'artifact',
      target: 'art-1',
      detail: { artifactId: 'art-1', name: 'a.csv', type: 'spreadsheet', format: 'csv', size: 10 },
    })
    events.publish({
      id: nextEventId(),
      type: 'runtime.failed',
      ts: '2026-01-01T00:00:01.000Z',
      actor: 'runtime',
      target: 'opencode',
      detail: { runtimeId: 'opencode', capability: 'summarize', error: 'boom', durationMs: 5 },
    })
    events.publish({
      id: nextEventId(),
      type: 'sdk.completed',
      ts: '2026-01-01T00:00:02.000Z',
      actor: 'sdk',
      target: 'spreadsheet',
      detail: { sdkId: 'spreadsheet', operationId: 'spreadsheet.read', stepId: 'read', ok: true, durationMs: 1 },
    })

    const entries = history.list()
    expect(entries.find((e) => e.type === 'artifact.created')!.artifactId).toBe('art-1')
    expect(entries.find((e) => e.type === 'runtime.failed')!.runtimeId).toBe('opencode')
    expect(entries.find((e) => e.type === 'runtime.failed')!.status).toBe('failed')
    expect(entries.find((e) => e.type === 'sdk.completed')!.sdkId).toBe('spreadsheet')
  })

  it('summarizes counts by type and supports lookup by id', () => {
    const { events, history } = makeKernel()
    const id = nextEventId()
    events.publish({
      id,
      type: 'task.created',
      ts: '2026-01-01T00:00:00.000Z',
      actor: 'task',
      target: 'task-1',
      detail: { title: 'T', workflowId: 'w', createdBy: 'user' },
    })
    expect(history.get(id)?.type).toBe('task.created')
    expect(history.summary().total).toBe(1)
    expect(history.summary().byType['task.created']).toBe(1)
  })
})
