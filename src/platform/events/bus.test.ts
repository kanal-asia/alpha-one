import { describe, expect, it } from 'vitest'
import { createEventBus } from './bus'
import type { WorkspaceEvent } from './contract'

const evt = (type: WorkspaceEvent['type'], target = 't'): WorkspaceEvent => ({
  id: `e-${Math.random()}`,
  type,
  ts: new Date().toISOString(),
  actor: 'kernel',
  target,
  detail: {},
})

describe('Event Bus (Platform Kernel)', () => {
  it('delivers events to type-scoped subscribers', () => {
    const bus = createEventBus()
    const seen: string[] = []
    bus.on('artifact.created', (e) => seen.push(e.target))
    bus.publish(evt('artifact.created', 'a1'))
    bus.publish(evt('workflow.started', 'w1'))
    expect(seen).toEqual(['a1'])
  })

  it('delivers events to wildcard subscribers', () => {
    const bus = createEventBus()
    const seen: string[] = []
    bus.on('*', (e) => seen.push(e.type))
    bus.publish(evt('runtime.started'))
    bus.publish(evt('runtime.completed'))
    expect(seen).toEqual(['runtime.started', 'runtime.completed'])
  })

  it('maintains a history snapshot', () => {
    const bus = createEventBus()
    bus.publish(evt('workspace.opened'))
    bus.publish(evt('task.created'))
    expect(bus.history()).toHaveLength(2)
    expect(bus.history()[0].type).toBe('workspace.opened')
  })

  it('unsubscribes listeners', () => {
    const bus = createEventBus()
    const seen: string[] = []
    const off = bus.on('error.occurred', (e) => seen.push(e.target))
    bus.publish(evt('error.occurred', 'x'))
    off()
    bus.publish(evt('error.occurred', 'y'))
    expect(seen).toEqual(['x'])
  })

  it('never lets a throwing subscriber break publishing', () => {
    const bus = createEventBus()
    bus.on('task.created', () => {
      throw new Error('boom')
    })
    let delivered = false
    bus.on('task.created', () => {
      delivered = true
    })
    expect(() => bus.publish(evt('task.created'))).not.toThrow()
    expect(delivered).toBe(true)
  })
})
