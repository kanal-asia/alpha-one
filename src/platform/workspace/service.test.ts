import { describe, expect, it } from 'vitest'
import { registerSpreadsheetSdk } from '@/business/spreadsheet/sdk'
import { registerReportingSdk } from '@/business/reporting/sdk'
import { registerDocumentsSdk } from '@/business/documents/sdk'
import { createArtifactService } from '@/platform/artifacts/service'
import { createKernel } from '@/platform/kernel/kernel'
import { createWorkspaceService } from './service'

const CSV = ['product,units', 'A,10', 'B,20'].join('\n')

function buildService() {
  const kernel = createKernel({
    workspace: { id: 'test', name: 'Test', path: '/tmp' },
    artifacts: createArtifactService(),
  })
  registerSpreadsheetSdk(kernel.operations)
  registerReportingSdk(kernel.operations)
  registerDocumentsSdk(kernel.operations)
  return createWorkspaceService(kernel)
}

describe('Workspace Service (server facade)', () => {
  it('creates a task, runs the workflow and updates status', async () => {
    const service = buildService()
    const { task, run } = await service.createTask({
      title: 'Sales report',
      workflowId: 'analyze-spreadsheet-report',
      input: { source: { name: 'sales.csv', content: CSV } },
      createdBy: 'user',
    })

    expect(task.title).toBe('Sales report')
    expect(task.createdBy).toBe('user')
    expect(task.status).toBe('completed')
    expect(task.runId).toBe(run?.id)
    expect(run?.status).toBe('completed')

    const fetched = service.getTask(task.id)
    expect(fetched?.task.title).toBe('Sales report')
    expect(fetched?.run?.steps).toHaveLength(6)
  })

  it('rejects unknown workflows', async () => {
    const service = buildService()
    await expect(
      service.createTask({
        title: 'x',
        workflowId: 'nope',
        input: {},
        createdBy: 'assistant',
      }),
    ).rejects.toThrow(/Unknown workflow/)
  })

  it('exposes artifacts with readable bytes', async () => {
    const service = buildService()
    await service.createTask({
      title: 'Sales report',
      workflowId: 'analyze-spreadsheet-report',
      input: { source: { name: 'sales.csv', content: CSV } },
      createdBy: 'user',
    })

    const artifacts = service.listArtifacts()
    expect(artifacts).toHaveLength(3)

    const pdf = artifacts.find((a) => a.format === 'pdf')!
    const bytes = await service.readArtifactBytes(pdf.id)
    const text = new TextDecoder().decode(bytes)
    expect(text.startsWith('%PDF')).toBe(true)

    const source = artifacts.find((a) => a.name === 'sales.csv')!
    expect(source.status).toBe('created')
  })

  it('tracks history events through the facade', async () => {
    const service = buildService()
    await service.createTask({
      title: 'Sales report',
      workflowId: 'analyze-spreadsheet-report',
      input: { source: { name: 'sales.csv', content: CSV } },
      createdBy: 'assistant',
    })

    const history = service.history()
    const types = history.map((e) => e.type)
    expect(types).toContain('task.created')
    expect(types).toContain('task.completed')
    expect(types).toContain('workflow.completed')
  })

  it('reports kernel health with registered counts', async () => {
    const service = buildService()
    const health = service.health()
    expect(health.status).toBe('ok')
    expect(health.registered.operations).toBe(9)
    expect(health.registered.sdks).toBe(0)
  })
})
