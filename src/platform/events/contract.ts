/**
 * Alpha Workspace ΓÇö Event Contract (Platform Kernel, TASK-ENGINEERING-001)
 *
 * Every meaningful thing that happens inside the workspace is a WorkspaceEvent.
 * The event contract is the shared vocabulary between the Kernel, the Workflow
 * Engine, the Operation Registry, the Runtime adapters and the History feature.
 *
 * Rules:
 *   1. Events are immutable once published.
 *   2. An event never carries artifact *content* ΓÇö only references (ids).
 *   3. `type` is a fixed union. New event types require an explicit contract
 *      change (this file) so the history store stays typed.
 */

export type WorkspaceEventType =
  | 'workspace.opened'
  | 'task.created'
  | 'task.completed'
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'operation.started'
  | 'operation.completed'
  | 'artifact.created'
  | 'artifact.saved'
  | 'artifact.deleted'
  | 'runtime.started'
  | 'runtime.completed'
  | 'runtime.failed'
  | 'sdk.started'
  | 'sdk.completed'
  | 'error.occurred'

export type WorkspaceEventActor =
  | 'kernel'
  | 'task'
  | 'workflow'
  | 'operation'
  | 'sdk'
  | 'artifact'
  | 'runtime'
  | 'user'
  | 'assistant'

/** Status shared by tasks and workflow runs. */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface WorkspaceEvent<T = unknown> {
  /** Stable id. */
  id: string
  type: WorkspaceEventType
  /** ISO-8601 timestamp. */
  ts: string
  /** Which layer raised the event. */
  actor: WorkspaceEventActor
  /** Id of the entity the event is about (task/run/artifact/operation...). */
  target: string
  /** Free-form detail. Never includes artifact bytes. */
  detail: T
}

export type WorkspaceEventListener = (event: WorkspaceEvent) => void

/** Strongly-typed payloads for each event type. */
export interface EventDetailMap {
  'workspace.opened': { workspaceId: string; kernelVersion: string; at: string }
  'task.created': { title: string; workflowId: string; createdBy: string }
  'task.completed': { status: TaskStatus; runId: string | null }
  'workflow.started': { workflowId: string; steps: number }
  'workflow.completed': {
    status: 'completed' | 'failed'
    steps: number
    completedSteps: number
    error: string | null
  }
  'workflow.failed': {
    workflowId: string
    steps: number
    completedSteps: number
    error: string
  }
  'operation.started': { operationId: string; stepId: string; sdkId?: string }
  'operation.completed': {
    operationId: string
    stepId: string
    sdkId?: string
    ok: boolean
    artifactIds: string[]
    durationMs?: number
  }
  'artifact.created': { artifactId: string; name: string; type: string; format: string; size: number }
  'artifact.saved': { artifactId: string; workflowRunId: string | null; taskId: string | null }
  'artifact.deleted': { artifactId: string }
  'runtime.started': { runtimeId: string; capability: string }
  'runtime.completed': {
    runtimeId: string
    capability: string
    ok: boolean
    error: string | null
  }
  'runtime.failed': { runtimeId: string; capability: string; error: string; durationMs: number }
  'sdk.started': { sdkId: string; operationId: string; stepId: string }
  'sdk.completed': { sdkId: string; operationId: string; stepId: string; ok: boolean; durationMs: number }
  'error.occurred': { source: string; message: string; operationId?: string; runId?: string }
}
