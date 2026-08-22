/**
 * Alpha Workspace ΓÇö Artifact Service (Artifact Registry)
 *
 * Owns artifact records (metadata) and their bytes. Only this service can read
 * artifact bytes. Artifacts are immutable once created; the lifecycle goes
 * created ΓåÆ saved (attached to a task / workflow output) ΓåÆ deleted (tombstone).
 * Deletion is logical ΓÇö bytes stay on disk for audit/immutability reasons.
 */
import { createMemoryStorage, type ArtifactStorage } from './storage'
import { nextEventId, type EventBus } from '../events/bus'
import type { ArtifactInput, ArtifactRecord } from './types'

export interface StorageInfo {
  location: string
  ok: boolean
}

export interface ArtifactService {
  create(input: ArtifactInput): Promise<ArtifactRecord>
  get(id: string): ArtifactRecord | null
  list(): ArtifactRecord[]
  readBytes(id: string): Promise<Uint8Array>
  /** Mark an artifact as saved (attached to a run/task). */
  save(id: string, opts?: { workflowRunId?: string | null; taskId?: string | null }): void
  /** Record that an operation consumed (read) an artifact reference. */
  consume(id: string, operationId: string): void
  /** Link `childId` as a derivation of `parentId` (both directions). */
  link(childId: string, parentId: string): void
  /** Tombstone an artifact (logical delete). */
  delete(id: string): void
  /** Storage capability info for the health platform. */
  storageInfo(): StorageInfo
  /** Attach the event bus so artifact events are published. */
  setEventBus(bus: EventBus): void
}

let seq = 0

function nextArtifactId(): string {
  seq += 1
  return `art-${Date.now()}-${seq}`
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(0, 80)
}

export function createArtifactService(storage?: ArtifactStorage): ArtifactService {
  const store = storage ?? createMemoryStorage()
  const records = new Map<string, ArtifactRecord>()
  let events: EventBus | null = null

  return {
    async create(input) {
      const id = nextArtifactId()
      const ref = `${id}.${input.format}`
      await store.write(ref, input.bytes)
      const record: ArtifactRecord = {
        id,
        name: safeName(input.name),
        type: input.type,
        format: input.format,
        mime: input.mime,
        size: input.bytes.byteLength,
        storage: 'local',
        ref,
        producer: input.producer,
        createdBy: input.producer,
        consumers: [],
        workflowRunId: input.workflowRunId ?? null,
        taskId: input.taskId ?? null,
        status: 'created',
        lifecycle: 'created',
        parentArtifactId: input.parentArtifactId ?? null,
        childArtifactIds: [],
        meta: input.meta ?? {},
        createdAt: new Date().toISOString(),
        deletedAt: null,
      }
      records.set(id, record)
      if (record.parentArtifactId) {
        const parent = records.get(record.parentArtifactId)
        if (parent && !parent.childArtifactIds.includes(id)) {
          parent.childArtifactIds.push(id)
        }
      }
      events?.publish({
        id: nextEventId(),
        type: 'artifact.created',
        ts: record.createdAt,
        actor: 'artifact',
        target: id,
        detail: {
          artifactId: id,
          name: record.name,
          type: record.type,
          format: record.format,
          size: record.size,
        },
      })
      return record
    },

    get(id) {
      return records.get(id) ?? null
    },

    list() {
      return [...records.values()]
    },

    async readBytes(id) {
      const record = records.get(id)
      if (!record) throw new Error(`Artifact not found: ${id}`)
      if (record.status === 'deleted') {
        throw new Error(`Artifact deleted: ${id}`)
      }
      return store.read(record.ref)
    },

    save(id, opts) {
      const record = records.get(id)
      if (!record || record.status === 'deleted') return
      if (opts?.workflowRunId !== undefined) record.workflowRunId = opts.workflowRunId
      if (opts?.taskId !== undefined) record.taskId = opts.taskId
      record.status = 'saved'
      record.lifecycle = 'saved'
      events?.publish({
        id: nextEventId(),
        type: 'artifact.saved',
        ts: new Date().toISOString(),
        actor: 'artifact',
        target: id,
        detail: { artifactId: id, workflowRunId: record.workflowRunId, taskId: record.taskId },
      })
    },

    consume(id, operationId) {
      const record = records.get(id)
      if (!record || record.status === 'deleted') return
      if (!record.consumers.includes(operationId)) {
        record.consumers.push(operationId)
      }
    },

    link(childId, parentId) {
      const child = records.get(childId)
      const parent = records.get(parentId)
      if (!child || !parent) return
      if (child.status === 'deleted') return
      child.parentArtifactId = parentId
      if (!parent.childArtifactIds.includes(childId)) {
        parent.childArtifactIds.push(childId)
      }
    },

    delete(id) {
      const record = records.get(id)
      if (!record || record.status === 'deleted') return
      record.status = 'deleted'
      record.lifecycle = 'deleted'
      record.deletedAt = new Date().toISOString()
      events?.publish({
        id: nextEventId(),
        type: 'artifact.deleted',
        ts: record.deletedAt,
        actor: 'artifact',
        target: id,
        detail: { artifactId: id },
      })
    },

    storageInfo() {
      return { location: storage ? (storage as { location?: string }).location ?? 'local' : 'memory', ok: true }
    },

    setEventBus(bus) {
      events = bus
    },
  }
}
