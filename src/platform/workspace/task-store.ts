/**
 * Alpha Workspace ΓÇö Task model + in-memory task store
 */
import type { TaskStatus } from '../events/contract'

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  workflowId: string
  input: Record<string, unknown>
  runId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TaskStore {
  create(task: Task): void
  update(id: string, patch: Partial<Omit<Task, 'id'>>): Task | null
  get(id: string): Task | null
  list(): Task[]
}

let seq = 0

export function createTaskStore(): TaskStore {
  const tasks = new Map<string, Task>()
  return {
    create(task) {
      tasks.set(task.id, task)
    },
    update(id, patch) {
      const task = tasks.get(id)
      if (!task) return null
      Object.assign(task, patch, { updatedAt: new Date().toISOString() })
      return task
    },
    get(id) {
      return tasks.get(id) ?? null
    },
    list() {
      return [...tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
  }
}

export function nextTaskId(): string {
  seq += 1
  return `task-${Date.now()}-${seq}`
}
