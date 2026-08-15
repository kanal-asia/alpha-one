import {
  type ConnectParams,
  type HealthState,
  type Provider,
  type ProviderConfig,
  type ProviderInfo,
  type ProviderState,
  type ProviderStatus,
  stateOf,
} from './types/Provider'

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/docs.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations.readonly',
]

const info: ProviderInfo = {
  id: 'google-workspace',
  name: 'Google Workspace',
  description: 'Connect Google Drive, Docs, Sheets, and Slides to the workspace.',
  version: '1.0.0',
  category: 'cloud',
}

export interface GoogleConnection {
  account: string
  scopes: string[]
}

export class GoogleWorkspaceProvider implements Provider {
  readonly info: ProviderInfo = info
  private status: ProviderStatus = 'unknown'
  private health: HealthState = 'unknown'
  private connection: GoogleConnection | null = null

  constructor(private config: Partial<ProviderConfig> = {}) {}

  async initialize(): Promise<void> {
    this.health = await this.healthCheck()
  }

  async healthCheck(): Promise<HealthState> {
    this.health = this.connection ? 'healthy' : 'unknown'
    return this.health
  }

  async detect(): Promise<boolean> {
    this.status = 'detecting'
    const available = Boolean(this.config.enabled) || this.connection !== null
    this.status = available ? 'connected' : 'disconnected'
    return available
  }

  get scopes(): string[] {
    return (this.config.options?.scopes as string[]) ?? DEFAULT_SCOPES
  }

  async connect(params?: ConnectParams): Promise<ProviderState> {
    const account = (params?.account as string) ?? 'user@example.com'
    // Local-first: a real implementation would perform OAuth here. We treat a
    // configured/provided account as a successful connection.
    if (!account) {
      this.status = 'error'
      return stateOf(this.info, 'error', 'unhealthy', {
        error: 'An account email is required to connect.',
      })
    }
    this.connection = { account, scopes: this.scopes }
    this.status = 'connected'
    this.health = 'healthy'
    return stateOf(this.info, 'connected', 'healthy', {
      version: this.info.version,
    })
  }

  async disconnect(): Promise<void> {
    this.connection = null
    this.status = 'disconnected'
    this.health = 'unknown'
  }

  getConnection(): GoogleConnection | null {
    return this.connection
  }

  getStatus(): ProviderStatus {
    return this.status
  }

  getVersion(): string | null {
    return this.info.version
  }

  getHealth(): HealthState {
    return this.health
  }

  async dispose(): Promise<void> {
    await this.disconnect()
  }
}
