/**
 * Alpha Workspace ΓÇö In-memory Event Bus (Platform Kernel)
 *
 * A synchronous, dependency-free bus. Subscribers are notified in registration
 * order. The History feature subscribes here; publishing never awaits anything
 * beyond the subscriber itself.
 */
import type {
  WorkspaceEvent,
  WorkspaceEventListener,
  WorkspaceEventType,
} from './contract'

export interface EventBus {
  /** Subscribe. Returns an unsubscribe function. */
  on(type: WorkspaceEventType | '*', listener: WorkspaceEventListener): () => void
  /** Publish an event to matching subscribers. Never throws to the publisher. */
  publish(event: WorkspaceEvent): void
  /** Snapshot of every event published so far (History feature). */
  history(): WorkspaceEvent[]
  clear(): void
}

let seq = 0

export function createEventBus(): EventBus {
  const listeners = new Map<WorkspaceEventType | '*', Set<WorkspaceEventListener>>()
  const history: WorkspaceEvent[] = []

  return {
    on(type, listener) {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
      return () => {
        set.delete(listener)
      }
    },

    publish(event) {
      history.push(event)
      const set = listeners.get(event.type)
      if (set) {
        for (const listener of set) {
          try {
            listener(event)
          } catch {
            // A subscriber must never break publishing.
          }
        }
      }
      const wildcard = listeners.get('*')
      if (wildcard) {
        for (const listener of wildcard) {
          try {
            listener(event)
          } catch {
            // ignore
          }
        }
      }
    },

    history() {
      return [...history]
    },

    clear() {
      history.length = 0
      listeners.clear()
    },
  }
}

/** Builds an event id. */
export function nextEventId(): string {
  seq += 1
  return `evt-${Date.now()}-${seq}`
}
