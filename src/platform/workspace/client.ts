/**
 * Alpha Workspace ΓÇö Workspace SDK (browser client)
 *
 * The UI depends ONLY on this facade. It mirrors the server Workspace Service
 * over the `/api/ws` HTTP API. The UI never imports the kernel, the workflow
 * engine, a runtime adapter or a business SDK directly.
 */
import type { ArtifactRecord } from '../artifacts/types'
import type { HistoryEntry } from '../history/service'
import type { PlatformHealth } from '../health/service'
import type { OperationDefinition } from '../registries/operation-registry'
import type { WorkflowDefinition, WorkflowRun } from '../workflow/types'
import type { Task, TaskWithRun } from './service'

const BASE = '/api/ws'

export interface WorkspaceClient {
  health(): Promise<HealthPayload>
  platformHealth(): Promise<PlatformHealth>
  createTask(input: CreateTaskPayload): Promise<TaskWithRun>
  listTasks(): Promise<Task[]>
  getTask(id: string): Promise<TaskWithRun | null>
  listArtifacts(): Promise<ArtifactRecord[]>
  getArtifact(id: string): Promise<ArtifactRecord | null>
  artifactContentUrl(id: string): string
  listWorkflows(): Promise<WorkflowDefinition[]>
  getWorkflow(id: string): Promise<WorkflowDefinition | null>
  runWorkflow(input: { workflowId: string; input: Record<string, unknown> }): Promise<WorkflowRun>
  listOperations(): Promise<OperationDefinition[]>
  getOperation(id: string): Promise<OperationDefinition | null>
  listSdks(): Promise<SdkPayload[]>
  listRuntimes(): Promise<RuntimePayload[]>
  history(): Promise<HistoryEntry[]>
  getHistoryEntry(id: string): Promise<HistoryEntry | null>
  historySummary(): Promise<{ total: number; byType: Record<string, number> }>
}

export interface HealthPayload {
  status: 'ok' | 'degraded'
  kernelId: string
  version: string
  workspace: { id: string; name: string; path: string }
  registered: {
    operations: number
    runtimes: number
    sdks: number
    entities: number
    workflows: number
    artifacts: number
  }
  checkedAt: string
}

export interface CreateTaskPayload {
  title: string
  description?: string
  workflowId: string
  input: Record<string, unknown>
  createdBy?: 'user' | 'assistant'
}

export interface SdkPayload {
  id: string
  name: string
  description: string
  version: string
  operations: string[]
}

export interface RuntimePayload {
  id: string
  label: string
  available: boolean
}

export function createWorkspaceClient(base = BASE): WorkspaceClient {
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${base}${path}`)
    if (!res.ok) throw new Error(`Request failed: ${path} (${res.status})`)
    return (await res.json()) as T
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? `Request failed: ${path} (${res.status})`)
    }
    return (await res.json()) as T
  }

  return {
    async health() {
      return get<HealthPayload>('/health')
    },
    async platformHealth() {
      return get<PlatformHealth>('/health/platform')
    },
    async createTask(input) {
      return post<TaskWithRun>('/tasks', input)
    },
    async listTasks() {
      const data = await get<{ tasks: Task[] }>('/tasks')
      return data.tasks
    },
    async getTask(id) {
      return get<TaskWithRun | null>(`/tasks/${id}`)
    },
    async listArtifacts() {
      const data = await get<{ artifacts: ArtifactRecord[] }>('/artifacts')
      return data.artifacts
    },
    async getArtifact(id) {
      return get<ArtifactRecord | null>(`/artifacts/${id}`)
    },
    artifactContentUrl(id) {
      return `${base}/artifacts/${id}/content`
    },
    async listWorkflows() {
      const data = await get<{ workflows: WorkflowDefinition[] }>('/workflows')
      return data.workflows
    },
    async getWorkflow(id) {
      return get<WorkflowDefinition | null>(`/workflows/${id}`)
    },
    async runWorkflow(input) {
      return post<WorkflowRun>(`/workflows/${input.workflowId}/run`, { input: input.input })
    },
    async listOperations() {
      const data = await get<{ operations: OperationDefinition[] }>('/operations')
      return data.operations
    },
    async getOperation(id) {
      return get<OperationDefinition | null>(`/operations/${id}`)
    },
    async listSdks() {
      const data = await get<{ sdks: SdkPayload[] }>('/sdks')
      return data.sdks
    },
    async listRuntimes() {
      const data = await get<{ runtimes: RuntimePayload[] }>('/runtimes')
      return data.runtimes
    },
    async history() {
      const data = await get<{ events: HistoryEntry[] }>('/history')
      return data.events
    },
    async getHistoryEntry(id) {
      return get<HistoryEntry | null>(`/history/${id}`)
    },
    async historySummary() {
      const data = await get<{ total: number; byType: Record<string, number> }>('/history/summary')
      return data
    },
  }
}

export type { WorkflowRun, TaskWithRun, WorkflowDefinition }
