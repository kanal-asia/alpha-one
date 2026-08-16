import { describe, expect, it } from 'vitest'
import { createArtifactService } from '../artifacts/service'
import { createHealthService } from './service'
import { createRuntimeRegistry } from '../runtime/contract'
import { createRuntimeGateway } from '../runtime/gateway'
import { createEventBus } from '../events/bus'
import { createWorkflowRegistry } from '../workflow/registry'
import { registerCatalogWorkflows } from '../workflow/catalog'

describe('Health Platform (TASK-ENGINEERING-002)', () => {
  it('reports every platform component', async () => {
    const runtimes = createRuntimeRegistry()
    runtimes.register({
      id: 'mock',
      label: 'Mock',
      isAvailable: async () => true,
      run: async () => ({ ok: true, data: {} }),
    })
    const workflows = createWorkflowRegistry()
    registerCatalogWorkflows(workflows)
    const artifacts = createArtifactService()
    await artifacts.create({
      name: 'a.pdf',
      type: 'pdf',
      format: 'pdf',
      mime: 'application/pdf',
      bytes: new TextEncoder().encode('pdf'),
      producer: 'documents.pdf.create',
    })

    const health = createHealthService({
      kernel: { id: 'alpha-one', version: '1.0.0' },
      sdks: { list: () => [{ id: 'spreadsheet' }, { id: 'reporting' }] },
      runtimes: createRuntimeGateway(runtimes, createEventBus()),
      workflows,
      artifacts,
    })

    const result = await health.check()
    expect(result.kernel.status).toBe('ok')
    expect(result.sdks.total).toBe(2)
    expect(result.runtime.status).toBe('ok')
    expect(result.runtime.available).toBe(1)
    expect(result.workflow.active).toBe(3)
    expect(result.artifact.total).toBe(1)
    expect(result.artifact.sizeBytes).toBeGreaterThan(0)
    expect(result.storage.location).toBe('memory')
    expect(result.storage.status).toBe('ok')
  })

  it('marks runtime degraded when some adapters are unavailable', async () => {
    const runtimes = createRuntimeRegistry()
    runtimes.register({ id: 'a', label: 'A', isAvailable: async () => true, run: async () => ({ ok: true, data: {} }) })
    runtimes.register({ id: 'b', label: 'B', isAvailable: async () => false, run: async () => ({ ok: true, data: {} }) })
    const health = createHealthService({
      kernel: { id: 'k', version: '1' },
      sdks: { list: () => [] },
      runtimes: createRuntimeGateway(runtimes, createEventBus()),
      workflows: createWorkflowRegistry(),
      artifacts: createArtifactService(),
    })
    const result = await health.check()
    expect(result.runtime.status).toBe('degraded')
    expect(result.runtime.available).toBe(1)
  })
})
