/**
 * Alpha Workspace — Platform Kernel
 *
 * The Kernel is the composition root of the platform. It owns the event bus,
 * the registries (workflow / operation / runtime / artifact / sdk / entity /
 * config), the artifact service, the runtime gateway, the workflow engine, the
 * history service and the health service, and exposes a minimal lifecycle
 * (start/stop/health).
 *
 * The kernel itself is environment-agnostic. A "platform" module (node/server)
 * wires concrete storage and runtime adapters into it.
 */
import type { ArtifactService } from '../artifacts/service'
import { createEventBus, type EventBus } from '../events/bus'
import { createHistoryService, type HistoryService } from '../history/service'
import { createHealthService, type PlatformHealth } from '../health/service'
import {
  createOperationRegistry,
  type OperationRegistry,
} from '../registries/operation-registry'
import {
  createConfigRegistry,
  createEntityRegistry,
  createSdkRegistry,
  type ConfigRegistry,
  type EntityRegistry,
  type SdkRegistry,
} from '../registries/metadata'
import {
  createRuntimeRegistry,
  type RuntimeRegistry,
} from '../runtime/contract'
import { createRuntimeGateway, type RuntimeGateway } from '../runtime/gateway'
import { createWorkflowEngine, type WorkflowEngine } from '../workflow/engine'
import { registerCatalogWorkflows } from '../workflow/catalog'
import { createWorkflowRegistry, type WorkflowRegistry } from '../workflow/registry'
import type { WorkflowDefinition, WorkflowRun } from '../workflow/types'

export interface WorkspaceDescriptor {
  id: string
  name: string
  path: string
}

export interface Kernel {
  readonly id: string
  readonly version: string
  readonly workspace: WorkspaceDescriptor
  readonly events: EventBus
  readonly workflows: WorkflowRegistry
  readonly operations: OperationRegistry
  readonly runtimes: RuntimeRegistry
  readonly sdks: SdkRegistry
  readonly entities: EntityRegistry
  readonly config: ConfigRegistry
  readonly artifacts: ArtifactService
  readonly runtime: RuntimeGateway
  readonly engine: WorkflowEngine
  readonly history: HistoryService
  start(): Promise<void>
  stop(): Promise<void>
  health(): KernelHealth
  platformHealth(): Promise<PlatformHealth>
  /** Runs a workflow definition, returns the run. */
  runWorkflow(def: WorkflowDefinition, opts: {
    runId: string
    taskId: string | null
    input: Record<string, unknown>
  }): Promise<WorkflowRun>
}

export interface RegisteredCounts {
  operations: number
  runtimes: number
  sdks: number
  entities: number
  workflows: number
  artifacts: number
}

export interface KernelHealth {
  status: 'ok' | 'degraded'
  kernelId: string
  version: string
  workspace: WorkspaceDescriptor
  registered: RegisteredCounts
  checkedAt: string
}

export interface KernelOptions {
  workspace: WorkspaceDescriptor
  artifacts: ArtifactService
  version?: string
  /** Optional pre-built workflow registry; defaults to the catalog. */
  workflows?: WorkflowRegistry
}

export function createKernel(opts: KernelOptions): Kernel {
  const events = createEventBus()
  opts.artifacts.setEventBus(events)
  const operations = createOperationRegistry()
  const runtimes = createRuntimeRegistry()
  const sdks = createSdkRegistry()
  const entities = createEntityRegistry()
  const config = createConfigRegistry()
  const workflows = opts.workflows ?? createWorkflowRegistry()
  if (!opts.workflows) {
    registerCatalogWorkflows(workflows)
  }
  const runtime = createRuntimeGateway(runtimes, events)
  const engine = createWorkflowEngine({
    registry: operations,
    artifacts: opts.artifacts,
    runtime,
    events,
    kernel: { id: 'alpha-one', version: opts.version ?? '0.1.0' },
  })
  const history = createHistoryService(events)
  const health = createHealthService({
    kernel: { id: 'alpha-one', version: opts.version ?? '0.1.0' },
    sdks,
    runtimes: runtime,
    workflows,
    artifacts: opts.artifacts,
  })

  let started = false

  const kernel: Kernel = {
    id: 'alpha-one',
    version: opts.version ?? '0.1.0',
    workspace: opts.workspace,
    events,
    workflows,
    operations,
    runtimes,
    sdks,
    entities,
    config,
    artifacts: opts.artifacts,
    runtime,
    engine,
    history,

    async start() {
      if (started) return
      started = true
      events.publish({
        id: `boot-${Date.now()}`,
        type: 'workspace.opened',
        ts: new Date().toISOString(),
        actor: 'kernel',
        target: opts.workspace.id,
        detail: { workspaceId: opts.workspace.id, kernelVersion: kernel.version, at: new Date().toISOString() },
      })
    },

    async stop() {
      started = false
    },

    health() {
      const total = runtimes.list().length
      const registered: RegisteredCounts = {
        operations: operations.list().length,
        runtimes: total,
        sdks: sdks.list().length,
        entities: entities.list().length,
        workflows: workflows.list().length,
        artifacts: opts.artifacts.list().length,
      }
      const hasActiveWorkflow = workflows.list().some((w) => w.status === 'active')
      const storage = opts.artifacts.storageInfo()
      return {
        status: storage.ok && hasActiveWorkflow ? 'ok' : 'degraded',
        kernelId: kernel.id,
        version: kernel.version,
        workspace: opts.workspace,
        registered,
        checkedAt: new Date().toISOString(),
      }
    },

    platformHealth() {
      return health.check()
    },

    async runWorkflow(def, runOpts) {
      return engine.run(def, {
        runId: runOpts.runId,
        taskId: runOpts.taskId,
        input: runOpts.input,
        workspace: opts.workspace,
        configuration: Object.fromEntries(config.entries().map((e) => [e.key, e.value])),
      })
    },
  }

  return kernel
}
