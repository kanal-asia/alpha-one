/**
 * Alpha Workspace ΓÇö Workflow Contract (Workflow Platform, TASK-ENGINEERING-002)
 *
 * A Workflow is an ordered list of steps. Each step resolves to exactly one
 * registered Operation. The engine executes steps sequentially and passes each
 * step's `data` output as the next step's input. Artifacts are never passed
 * between steps directly ΓÇö only artifact ids (references) flow through `data`.
 *
 * Workflows are declared once, in the Workflow Registry (registry.ts). They are
 * never hardcoded in the engine or the UI.
 */
import type { TaskStatus } from '../events/contract'
import type { OperationSchema } from '../registries/operation-registry'
import type { ArtifactType } from '../artifacts/types'

export type { TaskStatus }

export interface WorkflowStep {
  /** Stable step id inside the workflow. */
  id: string
  /** Canonical operation id, e.g. `spreadsheet.read`. */
  operationId: string
  /** Human label shown in the UI/history. */
  label: string
  /** Optional static input merged into the step input before execution. */
  input?: Record<string, unknown>
}

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  version: string
  /** Grouping for the catalog UI, e.g. `Spreadsheet`, `Reporting`. */
  category: string
  tags: string[]
  /** `active` workflows are runnable from the UI. */
  status: 'active' | 'draft' | 'deprecated'
  /** Expected input shape. */
  inputContract: OperationSchema
  /** Guaranteed output shape. */
  outputContract: OperationSchema
  /** Artifact types this workflow may produce. */
  artifactTypes: ArtifactType[]
  steps: WorkflowStep[]
}

export interface WorkflowStepRun {
  stepId: string
  operationId: string
  label: string
  status: TaskStatus
  startedAt: string | null
  completedAt: string | null
  input: Record<string, unknown>
  output: Record<string, unknown>
  /** Artifact ids produced by this step. */
  artifactIds: string[]
  error: string | null
}

export interface WorkflowRun {
  id: string
  workflowId: string
  taskId: string | null
  status: TaskStatus
  startedAt: string
  completedAt: string | null
  input: Record<string, unknown>
  output: Record<string, unknown>
  steps: WorkflowStepRun[]
  error: string | null
}
