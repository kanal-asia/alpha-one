import { describe, expect, it } from 'vitest'
import { registerSpreadsheetSdk } from '@/business/spreadsheet/sdk'
import { registerReportingSdk } from '@/business/reporting/sdk'
import { registerDocumentsSdk } from '@/business/documents/sdk'
import { createArtifactService } from '@/platform/artifacts/service'
import { createKernel } from '@/platform/kernel/kernel'

const CSV = ['product,region,units,price', 'A,North,10,5', 'B,South,20,7.5', 'A,West,15,4'].join('\n')

function buildKernel() {
  const kernel = createKernel({
    workspace: { id: 'test', name: 'Test', path: '/tmp' },
    artifacts: createArtifactService(),
  })
  registerSpreadsheetSdk(kernel.operations)
  registerReportingSdk(kernel.operations)
  registerDocumentsSdk(kernel.operations)
  return kernel
}

describe('Multiple workflows ΓÇö same engine, registry-only (TASK-ENGINEERING-002)', () => {
  it('runs the existing PDF workflow via the registry', async () => {
    const kernel = buildKernel()
    const def = kernel.workflows.get('analyze-spreadsheet-report')!
    const run = await kernel.runWorkflow(def, { runId: 'r1', taskId: null, input: { source: { name: 's.csv', content: CSV } } })
    expect(run.status).toBe('completed')
    expect(kernel.artifacts.list().filter((a) => a.format === 'pdf')).toHaveLength(1)
  })

  it('runs Spreadsheet ΓåÆ Summary JSON', async () => {
    const kernel = buildKernel()
    const def = kernel.workflows.get('spreadsheet-summary-json')!
    const run = await kernel.runWorkflow(def, { runId: 'r2', taskId: null, input: { source: { name: 's.csv', content: CSV } } })
    expect(run.status).toBe('completed')
    expect(run.steps).toHaveLength(5)
    expect(run.output.jsonArtifactId).toBeTruthy()

    const summary = kernel.artifacts.list().find((a) => a.type === 'summary')!
    expect(summary).toBeTruthy()
    expect(summary.format).toBe('json')
    const text = new TextDecoder().decode(await kernel.artifacts.readBytes(summary.id))
    expect(JSON.parse(text).overview.rows).toBe(3)
  })

  it('runs Spreadsheet ΓåÆ Statistics Report', async () => {
    const kernel = buildKernel()
    const def = kernel.workflows.get('spreadsheet-statistics-report')!
    const run = await kernel.runWorkflow(def, { runId: 'r3', taskId: null, input: { source: { name: 's.csv', content: CSV } } })
    expect(run.status).toBe('completed')
    expect(run.output.statisticsArtifactId).toBeTruthy()

    const stats = kernel.artifacts.list().find((a) => a.type === 'statistics')!
    expect(stats.format).toBe('txt')
    const text = new TextDecoder().decode(await kernel.artifacts.readBytes(stats.id))
    expect(text).toContain('Per-column statistics')
    expect(text).toContain('units')
  })

  it('publishes sdk.started / sdk.completed and workflow.failed events', async () => {
    const kernel = buildKernel()
    await kernel.runWorkflow(kernel.workflows.get('spreadsheet-summary-json')!, {
      runId: 'r4',
      taskId: null,
      input: { source: { name: 's.csv', content: CSV } },
    })
    const types = kernel.events.history().map((e) => e.type)
    expect(types.filter((t) => t === 'sdk.started').length).toBeGreaterThan(0)
    expect(types.filter((t) => t === 'sdk.completed').length).toBeGreaterThan(0)

    const failing = kernel.workflows.get('spreadsheet-summary-json')!
    const badRun = await kernel.runWorkflow(failing, {
      runId: 'r5',
      taskId: null,
      input: { source: { name: 'empty.csv', content: '\n\n' } },
    })
    expect(badRun.status).toBe('failed')
    const failedTypes = kernel.events.history().map((e) => e.type)
    expect(failedTypes).toContain('workflow.failed')
  })

  it('honors operation timeout', async () => {
    const kernel = buildKernel()
    kernel.operations.register({
      id: 'slow.op',
      domain: 'test',
      capability: 'slow',
      sdkOwner: 'test',
      name: 'Slow',
      description: 'times out',
      version: '1.0.0',
      timeoutMs: 5,
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return { ok: true, data: {} }
      },
    })
    const run = await kernel.runWorkflow(
      { ...kernel.workflows.get('spreadsheet-summary-json')!, steps: [{ id: 'slow', operationId: 'slow.op', label: 'Slow' }] },
      { runId: 'r6', taskId: null, input: { source: { name: 's.csv', content: CSV } } },
    )
    expect(run.status).toBe('failed')
    expect(run.error).toMatch(/timed out/)
  })

  it('honors operation retry policy', async () => {
    const kernel = buildKernel()
    let calls = 0
    kernel.operations.register({
      id: 'flaky.op',
      domain: 'test',
      capability: 'flaky',
      sdkOwner: 'test',
      name: 'Flaky',
      description: 'fails once then succeeds',
      version: '1.0.0',
      retryPolicy: { attempts: 3, backoffMs: 1 },
      handler: async () => {
        calls += 1
        if (calls < 2) return { ok: false, data: {}, error: 'flaky failure' }
        return { ok: true, data: { done: true } }
      },
    })
    const run = await kernel.runWorkflow(
      { ...kernel.workflows.get('spreadsheet-summary-json')!, steps: [{ id: 'flaky', operationId: 'flaky.op', label: 'Flaky' }] },
      { runId: 'r7', taskId: null, input: { source: { name: 's.csv', content: CSV } } },
    )
    expect(run.status).toBe('completed')
    expect(run.output.done).toBe(true)
    expect(calls).toBe(2)
  })
})
