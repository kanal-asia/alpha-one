/**
 * Alpha Workspace ΓÇö Health Platform (TASK-ENGINEERING-002)
 *
 * A dedicated health service that reports the status of every platform
 * component: kernel, SDKs, runtime, workflows, artifacts and storage. The
 * Workspace SDK exposes this to the UI without the UI ever touching a runtime.
 */
import type { ArtifactService } from '../artifacts/service'
import type { RuntimeGateway } from '../runtime/gateway'
import type { WorkflowRegistry } from '../workflow/registry'

export interface ComponentHealth {
  status: 'ok' | 'degraded' | 'down' | 'unavailable'
  detail?: string
}

export interface PlatformHealth {
  kernel: ComponentHealth & { version: string }
  sdks: ComponentHealth & { total: number; available: number }
  runtime: ComponentHealth & { total: number; available: number }
  workflow: ComponentHealth & { total: number; active: number }
  artifact: ComponentHealth & { total: number; sizeBytes: number }
  storage: ComponentHealth & { location: string }
}

export interface HealthService {
  check(): Promise<PlatformHealth>
}

export function createHealthService(deps: {
  kernel: { id: string; version: string }
  sdks: { list(): unknown[] }
  runtimes: RuntimeGateway
  workflows: WorkflowRegistry
  artifacts: ArtifactService
}): HealthService {
  return {
    async check() {
      const [runtimeAvail, storage] = await Promise.all([
        deps.runtimes.available(),
        Promise.resolve(deps.artifacts.storageInfo()),
      ])

      const sdkList = deps.sdks.list()
      const workflowList = deps.workflows.list()
      const artifactList = deps.artifacts.list()

      const runtimeTotal = runtimeAvail.length
      const runtimeOk = runtimeAvail.filter((r) => r.available).length
      const runtimeStatus: ComponentHealth['status'] =
        runtimeTotal === 0 ? 'unavailable' : runtimeOk === runtimeTotal ? 'ok' : 'degraded'

      const sizeBytes = artifactList.reduce((acc, a) => acc + (a.size ?? 0), 0)

      return {
        kernel: { status: 'ok', version: deps.kernel.version },
        sdks: {
          status: sdkList.length > 0 ? 'ok' : 'degraded',
          total: sdkList.length,
          available: sdkList.length,
        },
        runtime: {
          status: runtimeStatus,
          total: runtimeTotal,
          available: runtimeOk,
          detail: runtimeTotal > 0 && runtimeOk < runtimeTotal ? `${runtimeOk}/${runtimeTotal} runtimes ready` : undefined,
        },
        workflow: {
          status: workflowList.some((w) => w.status === 'active') ? 'ok' : 'degraded',
          total: workflowList.length,
          active: workflowList.filter((w) => w.status === 'active').length,
        },
        artifact: { status: 'ok', total: artifactList.length, sizeBytes },
        storage: { status: storage.ok ? 'ok' : 'down', location: storage.location },
      }
    },
  }
}
