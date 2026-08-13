export type RuntimeConnectionState =
  | 'stopped'
  | 'starting_runtime'
  | 'checking_opencode'
  | 'loading_models'
  | 'ready'
  | 'busy'
  | 'stopping'
  | 'api_offline'
  | 'cli_not_installed'
  | 'model_discovery_failed'
  | 'error'

export type RuntimeLogLevel = 'info' | 'warn' | 'error'

export interface RuntimeLog {
  id: string
  ts: string
  stage: string
  level: RuntimeLogLevel
  message: string
}

export interface RuntimeCliInfo {
  installed: boolean
  version: string | null
  executablePath: string | null
  resolvedCommand: string | null
  probeMs: number | null
}

export interface RuntimeWorkspaceInfo {
  path: string
  name: string
  isGit: boolean
  gitBranch: string | null
  packageManager: string | null
  packageManagerVersion: string | null
  hasPackageJson: boolean
  projectName: string | null
}

export interface RuntimeModelsInfo {
  total: number
  free: number
  providers: number
  source: string
  loadedAt: string | null
  defaultModel: string | null
  warnings: string[]
}

export interface RuntimeSnapshot {
  lifecycle:
    | 'stopped'
    | 'starting'
    | 'healthy'
    | 'loading_models'
    | 'ready'
    | 'busy'
    | 'stopping'
    | 'error'
  stage: string
  api: { up: boolean; port: number; pid: number | null }
  cli: RuntimeCliInfo
  health: {
    state: string
    cliReachable: boolean
    version: string | null
    probeMs: number | null
    checkedAt: string
    notes: string[]
  }
  workspace: RuntimeWorkspaceInfo | null
  models: RuntimeModelsInfo
  error: string | null
  logs: RuntimeLog[]
  updatedAt: string
}

export const CONNECTION_LABEL: Record<RuntimeConnectionState, string> = {
  stopped: 'Stopped',
  starting_runtime: 'Starting Runtime...',
  checking_opencode: 'Checking OpenCode...',
  loading_models: 'Loading Models...',
  ready: 'Ready',
  busy: 'Busy',
  stopping: 'Stopping...',
  api_offline: 'API Offline',
  cli_not_installed: 'CLI Not Installed',
  model_discovery_failed: 'Model Discovery Failed',
  error: 'Runtime Error',
}

export function deriveConnection(snapshot: RuntimeSnapshot | null): RuntimeConnectionState {
  if (!snapshot) return 'api_offline'
  switch (snapshot.lifecycle) {
    case 'stopped':
      return 'stopped'
    case 'stopping':
      return 'stopping'
    case 'starting':
      return 'starting_runtime'
    case 'healthy':
      return 'checking_opencode'
    case 'loading_models':
      return 'loading_models'
    case 'busy':
      return 'busy'
    case 'ready':
      return snapshot.models.total === 0 ? 'model_discovery_failed' : 'ready'
    case 'error':
      return snapshot.cli?.installed === false ? 'cli_not_installed' : 'error'
    default:
      return 'starting_runtime'
  }
}
