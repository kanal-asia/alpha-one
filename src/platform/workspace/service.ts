/**
 * Alpha Workspace ΓÇö Workspace Service (server facade)
 *
 * The Workspace SDK is the ONLY surface the UI talks to. This is the server
 * half of the facade: it wraps the Kernel, the Task Store, the Workflow
 * Registry and the History service behind plain methods. The browser half
 * (client.ts) mirrors these methods over HTTP.
 */
import type { ArtifactRecord } from '../artifacts/types'
import { nextEventId } from '../events/bus'
import type { HistoryEntry } from '../history/service'
import type { PlatformHealth } from '../health/service'
import type { Kernel, KernelHealth } from '../kernel/kernel'
import type { OperationDefinition } from '../registries/operation-registry'
import { getWorkflow } from '../workflow/catalog'
import type { WorkflowDefinition, WorkflowRun } from '../workflow/types'
import { createTaskStore, nextTaskId, type Task, type TaskStore } from './task-store'

export type { Task } from './task-store'
export type { TaskStatus } from '../events/contract'

export interface CreateTaskInput {
  title: string
  description?: string
  workflowId: string
  input: Record<string, unknown>
  createdBy: 'user' | 'assistant'
}

export interface TaskWithRun {
  task: Task
  run: WorkflowRun | null
}

export interface WorkspaceService {
  createTask(input: CreateTaskInput): Promise<TaskWithRun>
  listTasks(): Task[]
  getTask(id: string): TaskWithRun | null
  listArtifacts(): ArtifactRecord[]
  getArtifact(id: string): ArtifactRecord | null
  readArtifactBytes(id: string): Promise<Uint8Array>
  listWorkflows(): WorkflowDefinition[]
  getWorkflow(id: string): WorkflowDefinition | null
  runWorkflow(input: { workflowId: string; input: Record<string, unknown> }): Promise<WorkflowRun>
  listOperations(): OperationDefinition[]
  getOperation(id: string): OperationDefinition | null
  listSdks(): Array<{ id: string; name: string; description: string; version: string; operations: string[] }>
  listRuntimes(): Promise<Array<{ id: string; label: string; available: boolean }>>
  history(): HistoryEntry[]
  getHistoryEntry(id: string): HistoryEntry | null
  historySummary(): { total: number; byType: Record<string, number> }
  health(): KernelHealth
  platformHealth(): Promise<PlatformHealth>
}

export function createWorkspaceService(kernel: Kernel): WorkspaceService {
  const tasks: TaskStore = createTaskStore()
  const runs = new Map<string, WorkflowRun>()

  return {
    async createTask(input) {
      const def = kernel.workflows.get(input.workflowId) ?? getWorkflow(input.workflowId)
      if (!def) {
        throw new Error(`Unknown workflow: ${input.workflowId}`)
      }

      const taskId = nextTaskId()
      const runId = `run-${taskId}`
      const task: Task = {
        id: taskId,
        title: input.title,
        description: input.description ?? null,
        status: 'running',
        workflowId: def.id,
        input: input.input,
        runId,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      tasks.create(task)

      kernel.events.publish({
        id: nextEventId(),
        type: 'task.created',
        ts: task.createdAt,
        actor: 'task',
        target: taskId,
        detail: { title: task.title, workflowId: def.id, createdBy: task.createdBy },
      })

      const run = await kernel.runWorkflow(def, { runId, taskId, input: input.input })
      runs.set(runId, run)

      const status = run.status
      tasks.update(taskId, { status })
      kernel.events.publish({
        id: nextEventId(),
        type: 'task.completed',
        ts: new Date().toISOString(),
        actor: 'task',
        target: taskId,
        detail: { status, runId: run.id },
      })

      return { task: tasks.get(taskId)!, run }
    },

    listTasks() {
      return tasks.list()
    },

    getTask(id) {
      const task = tasks.get(id)
      if (!task) return null
      const run = task.runId ? (runs.get(task.runId) ?? null) : null
      return { task, run }
    },

    listArtifacts() {
      return kernel.artifacts.list()
    },

    getArtifact(id) {
      return kernel.artifacts.get(id)
    },

    readArtifactBytes(id) {
      return kernel.artifacts.readBytes(id)
    },

    listWorkflows() {
      return kernel.workflows.list()
    },

    getWorkflow(id) {
      return kernel.workflows.get(id)
    },

    async runWorkflow(input) {
      const def = kernel.workflows.get(input.workflowId)
      if (!def) throw new Error(`Unknown workflow: ${input.workflowId}`)
      const runId = `run-direct-${Date.now()}`
      const run = await kernel.runWorkflow(def, { runId, taskId: null, input: input.input })
      runs.set(runId, run)
      return run
    },

    listOperations() {
      return kernel.operations.list()
    },

    getOperation(id) {
      return kernel.operations.get(id)
    },

    listSdks() {
      return kernel.sdks.list().map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        version: s.version,
        operations: s.operations,
      }))
    },

    async listRuntimes() {
      return kernel.runtime.available()
    },

    history() {
      return kernel.history.list()
    },

    getHistoryEntry(id) {
      return kernel.history.get(id)
    },

    historySummary() {
      return kernel.history.summary()
    },

    health() {
      return kernel.health()
    },

    platformHealth() {
      return kernel.platformHealth()
    },
  }
}
