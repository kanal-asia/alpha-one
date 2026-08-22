/**
 * Alpha Workspace ΓÇö Workflow Registry
 *
 * The single, official registry for every workflow in the platform. The Workflow
 * Engine, the Workspace SDK and the UI all read workflows from here ΓÇö workflows
 * are never hardcoded elsewhere. Adding a new business capability is a registry
 * change only: no engine or runtime changes are required.
 */
import type { WorkflowDefinition } from './types'

export interface WorkflowRegistry {
  register(workflow: WorkflowDefinition): void
  get(id: string): WorkflowDefinition | null
  list(): WorkflowDefinition[]
  has(id: string): boolean
}

export function createWorkflowRegistry(): WorkflowRegistry {
  const workflows = new Map<string, WorkflowDefinition>()
  return {
    register(workflow) {
      if (workflows.has(workflow.id)) {
        throw new Error(`Workflow already registered: ${workflow.id}`)
      }
      workflows.set(workflow.id, workflow)
    },
    get(id) {
      return workflows.get(id) ?? null
    },
    list() {
      return [...workflows.values()]
    },
    has(id) {
      return workflows.has(id)
    },
  }
}
