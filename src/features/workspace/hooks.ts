/**
 * Alpha Workspace — UI-facing Workspace SDK singleton + React Query hooks.
 *
 * The UI imports `workspace` (the Workspace SDK client) and the hooks below.
 * Nothing else from the platform is reachable from components.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createWorkspaceClient, type CreateTaskPayload } from '@/platform/workspace/client'

export const workspace = createWorkspaceClient()

export const workspaceKeys = {
  health: ['workspace', 'health'] as const,
  platformHealth: ['workspace', 'platform-health'] as const,
  tasks: ['workspace', 'tasks'] as const,
  task: (id: string) => ['workspace', 'task', id] as const,
  artifacts: ['workspace', 'artifacts'] as const,
  artifact: (id: string) => ['workspace', 'artifact', id] as const,
  workflows: ['workspace', 'workflows'] as const,
  workflow: (id: string) => ['workspace', 'workflow', id] as const,
  operations: ['workspace', 'operations'] as const,
  operation: (id: string) => ['workspace', 'operation', id] as const,
  sdks: ['workspace', 'sdks'] as const,
  runtimes: ['workspace', 'runtimes'] as const,
  history: ['workspace', 'history'] as const,
  historyEntry: (id: string) => ['workspace', 'history', id] as const,
  historySummary: ['workspace', 'history-summary'] as const,
}

export function useWorkspaceHealth() {
  return useQuery({
    queryKey: workspaceKeys.health,
    queryFn: () => workspace.health(),
    refetchInterval: 15_000,
  })
}

export function usePlatformHealth() {
  return useQuery({
    queryKey: workspaceKeys.platformHealth,
    queryFn: () => workspace.platformHealth(),
    refetchInterval: 15_000,
  })
}

export function useTasks() {
  return useQuery({
    queryKey: workspaceKeys.tasks,
    queryFn: () => workspace.listTasks(),
  })
}

export function useTask(id: string) {
  return useQuery({
    queryKey: workspaceKeys.task(id),
    queryFn: () => workspace.getTask(id),
    enabled: Boolean(id),
  })
}

export function useArtifacts() {
  return useQuery({
    queryKey: workspaceKeys.artifacts,
    queryFn: () => workspace.listArtifacts(),
  })
}

export function useArtifact(id: string) {
  return useQuery({
    queryKey: workspaceKeys.artifact(id),
    queryFn: () => workspace.getArtifact(id),
    enabled: Boolean(id),
  })
}

export function useWorkflows() {
  return useQuery({
    queryKey: workspaceKeys.workflows,
    queryFn: () => workspace.listWorkflows(),
  })
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: workspaceKeys.workflow(id),
    queryFn: () => workspace.getWorkflow(id),
    enabled: Boolean(id),
  })
}

export function useOperations() {
  return useQuery({
    queryKey: workspaceKeys.operations,
    queryFn: () => workspace.listOperations(),
  })
}

export function useOperation(id: string) {
  return useQuery({
    queryKey: workspaceKeys.operation(id),
    queryFn: () => workspace.getOperation(id),
    enabled: Boolean(id),
  })
}

export function useSdks() {
  return useQuery({
    queryKey: workspaceKeys.sdks,
    queryFn: () => workspace.listSdks(),
  })
}

export function useRuntimes() {
  return useQuery({
    queryKey: workspaceKeys.runtimes,
    queryFn: () => workspace.listRuntimes(),
  })
}

export function useHistory() {
  return useQuery({
    queryKey: workspaceKeys.history,
    queryFn: () => workspace.history(),
  })
}

export function useHistoryEntry(id: string) {
  return useQuery({
    queryKey: workspaceKeys.historyEntry(id),
    queryFn: () => workspace.getHistoryEntry(id),
    enabled: Boolean(id),
  })
}

export function useHistorySummary() {
  return useQuery({
    queryKey: workspaceKeys.historySummary,
    queryFn: () => workspace.historySummary(),
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskPayload) => workspace.createTask(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
    },
  })
}
