import { describe, expect, it } from 'vitest'
import { registerSpreadsheetSdk } from '@/business/spreadsheet/sdk'
import { registerReportingSdk } from '@/business/reporting/sdk'
import { registerDocumentsSdk } from '@/business/documents/sdk'
import { parseCsv } from '@/business/spreadsheet/parse'
import { analyzeSpreadsheet } from '@/business/spreadsheet/analyze'
import { buildReport, reportToPdfLines } from '@/business/reporting/report'
import { createArtifactService } from '@/platform/artifacts/service'
import { createKernel } from '@/platform/kernel/kernel'
import { WORKFLOW_ANALYZE_SPREADSHEET_REPORT } from '@/platform/workflow/catalog'

const CSV = [
  'product,region,units,price',
  'A,North,10,5',
  'B,South,20,7.5',
  'A,West,15,4',
  'C,North,5,12',
  'D,East,30,3.5',
].join('\n')

function buildTestKernel() {
  const kernel = createKernel({
    workspace: { id: 'test', name: 'Test Workspace', path: '/tmp/test' },
    artifacts: createArtifactService(),
  })
  registerSpreadsheetSdk(kernel.operations)
  registerReportingSdk(kernel.operations)
  registerDocumentsSdk(kernel.operations)
  return kernel
}

describe('Workflow Engine ΓÇö vertical slice end-to-end', () => {
  it('runs the full analyze-and-report workflow to completion', async () => {
    const kernel = buildTestKernel()
    await kernel.start()

    const run = await kernel.runWorkflow(WORKFLOW_ANALYZE_SPREADSHEET_REPORT, {
      runId: 'run-1',
      taskId: 'task-1',
      input: { source: { name: 'sales.csv', content: CSV } },
    })

    expect(run.status).toBe('completed')
    expect(run.error).toBeNull()
    expect(run.steps).toHaveLength(6)
    for (const step of run.steps) {
      expect(step.status).toBe('completed')
    }

    // The final step attaches the PDF artifact to the output.
    const artifactId = run.output.artifactId as string
    expect(artifactId).toBeTruthy()

    const artifacts = kernel.artifacts.list()
    expect(artifacts).toHaveLength(3) // source csv, analysis.json, pdf

    const pdf = artifacts.find((a) => a.format === 'pdf')
    expect(pdf).toBeTruthy()
    expect(pdf!.type).toBe('pdf')
    expect(pdf!.mime).toBe('application/pdf')
    expect(pdf!.status).toBe('saved')
    expect(pdf!.workflowRunId).toBe('run-1')
    expect(pdf!.taskId).toBe('task-1')
  })

  it('publishes the expected event trail', async () => {
    const kernel = buildTestKernel()
    await kernel.start()

    await kernel.runWorkflow(WORKFLOW_ANALYZE_SPREADSHEET_REPORT, {
      runId: 'run-2',
      taskId: 'task-2',
      input: { source: { name: 'sales.csv', content: CSV } },
    })

    const events = kernel.events.history()
    const types = events.map((e) => e.type)
    expect(types).toContain('workspace.opened')
    expect(types).toContain('workflow.started')
    expect(types).toContain('workflow.completed')
    expect(types).toContain('operation.started')
    expect(types).toContain('operation.completed')
    expect(types).toContain('artifact.created')
    expect(types.filter((t) => t === 'operation.started')).toHaveLength(6)
    expect(types.filter((t) => t === 'operation.completed')).toHaveLength(6)
  })

  it('fails cleanly when the workflow references an unknown operation', async () => {
    const kernel = buildTestKernel()
    await kernel.start()

    const run = await kernel.runWorkflow(
      { ...WORKFLOW_ANALYZE_SPREADSHEET_REPORT, steps: [{ id: 'x', operationId: 'does.not.exist', label: 'X' }] },
      { runId: 'run-3', taskId: 'task-3', input: { source: { name: 'sales.csv', content: CSV } } },
    )

    expect(run.status).toBe('failed')
    expect(run.error).toMatch(/does\.not\.exist/)
    expect(run.steps[0].status).toBe('failed')
  })

  it('fails cleanly on malformed spreadsheet input', async () => {
    const kernel = buildTestKernel()
    await kernel.start()

    const run = await kernel.runWorkflow(WORKFLOW_ANALYZE_SPREADSHEET_REPORT, {
      runId: 'run-4',
      taskId: 'task-4',
      input: { source: { name: 'empty.csv', content: '\n\n' } },
    })

    expect(run.status).toBe('failed')
    expect(run.error).toMatch(/empty or malformed/)
  })
})

describe('Reporting SDK ΓÇö report model', () => {
  it('builds a deterministic summary with numeric highlights', () => {
    const table = parseCsv(CSV)
    const analysis = analyzeSpreadsheet(table.headers, table.rows)
    const report = buildReport({ title: 'T', source: 'sales.csv', analysis })

    expect(report.overview.rows).toBe(5)
    expect(report.overview.columns).toBe(4)
    expect(report.numericColumns).toBe(2)
    expect(report.summary).toContain('sales.csv')
    expect(report.summary).toContain('numeric')
    expect(report.columns.find((c) => c.name === 'units')!.stats.sum).toBe(80)

    const lines = reportToPdfLines(report)
    expect(lines.some((l) => l.includes('units'))).toBe(true)
  })
})
