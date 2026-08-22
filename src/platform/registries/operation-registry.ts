/**
 * Alpha Workspace ΓÇö Operation Contract (Operation Registry, TASK-ENGINEERING-002)
 *
 * An Operation is the single executable unit of the platform. Operations are
 * registered under a canonical `domain.capability` id. The Workflow Engine only
 * knows how to resolve an Operation by id and execute it with an Execution
 * Context and input ΓÇö it never knows the business implementation.
 *
 * The registry is the only place operations are declared. It carries rich
 * contract metadata (schemas, artifact contract, permission, timeout, retry,
 * tags) that the UI and tooling can render without executing anything.
 *
 * Rules:
 *   1. An operation returns `data` (in-memory, flows to the next step) and a
 *      list of artifact ids it produced.
 *   2. An operation may call the ArtifactService and the RuntimeGateway through
 *      the context, but never the UI and never other operations directly.
 *   3. Operations never use global state ΓÇö everything comes from the context.
 */
import type { ArtifactService } from '../artifacts/service'
import type { ArtifactType } from '../artifacts/types'
import type { RuntimeGateway } from '../runtime/gateway'

/** Minimal JSON-schema-like descriptor used for input/output contracts. */
export interface OperationSchema {
  type: 'object'
  /** Property name ΓåÆ scalar/object type hint + optional description. */
  properties: Record<string, { type: string; description?: string }>
  required?: string[]
}

/** What kinds of artifacts an operation produces / consumes. */
export interface ArtifactContract {
  produces?: Array<{ type: ArtifactType; format: string; mime: string }>
  /** Artifact *types* this operation reads (references) during execution. */
  consumes?: ArtifactType[]
}

export interface RetryPolicy {
  /** Total execution attempts (1 = no retry). */
  attempts: number
  /** Delay between attempts in ms. */
  backoffMs?: number
}

/**
 * The Execution Context every Operation receives. Carries the full run state:
 * workspace, task, workflow, user, runtime, configuration, variables and the
 * artifact references accumulated so far. Operations must not rely on any
 * module-level (global) state.
 */
export interface OperationContext {
  kernel: { id: string; version: string }
  runId: string
  taskId: string | null
  workspace: { id: string; name: string; path: string }
  /** The workflow being executed. */
  workflow: { id: string; name: string; version: string }
  /** Who requested the run. No auth in this sprint ΓÇö always a principal label. */
  user: { id: string; name: string; role: string }
  /** Resolved runtime adapter for AI capabilities (or null if unused). */
  runtime: RuntimeGateway
  /** Run-level configuration snapshot (from the kernel config registry). */
  configuration: Record<string, unknown>
  /** Mutable scratch space scoped to this run. */
  variables: Record<string, unknown>
  /** References (metadata, never bytes) to artifacts produced so far. */
  artifactRefs: Array<{ id: string; name: string; type: ArtifactType; format: string }>
  artifacts: ArtifactService
}

export interface OperationResult {
  /** Whether the step succeeded. The engine aborts the run when false. */
  ok: boolean
  /** In-memory output passed to the next step as `data`. */
  data: Record<string, unknown>
  /** Artifact ids produced by this operation. */
  artifactIds?: string[]
  error?: string
}

export type OperationHandler = (
  ctx: OperationContext,
  input: Record<string, unknown>,
) => Promise<OperationResult>

export interface OperationDefinition {
  /** Canonical id: `domain.capability`, e.g. `spreadsheet.read`. */
  id: string
  domain: string
  capability: string
  /** SDK that owns this operation, e.g. `spreadsheet`. */
  sdkOwner: string
  name: string
  description: string
  version: string
  /** Input contract (schema) for tooling/UI. */
  inputSchema?: OperationSchema
  /** Output contract (schema) for tooling/UI. */
  outputSchema?: OperationSchema
  /** What artifact kinds this operation produces/consumes. */
  artifactContract?: ArtifactContract
  /** Required permission label (enforcement out of scope this sprint). */
  permission?: string
  /** Optional per-execution timeout in ms. */
  timeoutMs?: number
  /** Optional retry policy. */
  retryPolicy?: RetryPolicy
  /** Free-form tags for filtering/discovery. */
  tags?: string[]
  /** Operation ids this operation depends on (contract metadata only). */
  dependsOn?: string[]
  handler: OperationHandler
}

export interface OperationRegistry {
  register(op: OperationDefinition): void
  get(id: string): OperationDefinition | null
  list(): OperationDefinition[]
  has(id: string): boolean
}

export function createOperationRegistry(): OperationRegistry {
  const ops = new Map<string, OperationDefinition>()
  return {
    register(op) {
      if (ops.has(op.id)) {
        throw new Error(`Operation already registered: ${op.id}`)
      }
      ops.set(op.id, op)
    },
    get(id) {
      return ops.get(id) ?? null
    },
    list() {
      return [...ops.values()]
    },
    has(id) {
      return ops.has(id)
    },
  }
}
