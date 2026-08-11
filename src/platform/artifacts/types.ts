/**
 * Alpha Workspace — Artifact Contract (Artifact Registry, TASK-ENGINEERING-002)
 *
 * An artifact is an immutable, addressable unit of output produced by an
 * operation. The registry stores METADATA plus a reference to where the bytes
 * live (storage + ref). Content is read through the ArtifactService only —
 * it is never embedded in events and never handed to a Runtime adapter.
 *
 * The contract tracks provenance (producer/consumer), structure (parent/child)
 * and lifecycle (created → saved → deleted). Versioning and remote storage are
 * deliberately out of scope for this sprint.
 */

export type ArtifactType =
  | 'source'
  | 'spreadsheet'
  | 'analysis'
  | 'summary'
  | 'statistics'
  | 'report'
  | 'document'
  | 'pdf'
  | 'presentation'

export type ArtifactStatus = 'created' | 'saved' | 'deleted'

export interface ArtifactRecord {
  /** Stable id, e.g. `art-...`. */
  id: string
  name: string
  type: ArtifactType
  /** Concrete file format, e.g. `csv`, `json`, `pdf`, `txt`. */
  format: string
  mime: string
  size: number
  /** Where the bytes are stored. `local` = workspace artifact store. */
  storage: 'local' | 'memory'
  /** Storage reference (relative path for local, none for memory). */
  ref: string
  /** Canonical operation id that produced this artifact. */
  producer: string
  /** Free-form producer label kept for Sprint-1 compatibility. */
  createdBy: string
  /** Operation ids that read/consumed this artifact (references only). */
  consumers: string[]
  workflowRunId: string | null
  taskId: string | null
  status: ArtifactStatus
  /** Explicit lifecycle mirror of `status` (created → saved → deleted). */
  lifecycle: ArtifactStatus
  /** Parent artifact id (e.g. a derived analysis points at its source). */
  parentArtifactId: string | null
  /** Child artifact ids derived from this one. */
  childArtifactIds: string[]
  meta: Record<string, unknown>
  createdAt: string
  deletedAt: string | null
}

export interface ArtifactInput {
  name: string
  type: ArtifactType
  format: string
  mime: string
  bytes: Uint8Array
  /** Canonical operation id that produced this artifact. */
  producer: string
  /** Parent artifact (derivation chain). */
  parentArtifactId?: string | null
  workflowRunId?: string | null
  taskId?: string | null
  meta?: Record<string, unknown>
}
