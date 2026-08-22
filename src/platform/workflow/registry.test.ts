import { describe, expect, it } from 'vitest'
import { createWorkflowRegistry } from './registry'
import { registerCatalogWorkflows, WORKFLOW_CATALOG } from './catalog'

describe('Workflow Registry (TASK-ENGINEERING-002)', () => {
  it('registers, lists and looks up workflows', () => {
    const registry = createWorkflowRegistry()
    const [wf] = WORKFLOW_CATALOG
    registry.register(wf)
    expect(registry.has(wf.id)).toBe(true)
    expect(registry.get(wf.id)).toBe(wf)
    expect(registry.list()).toHaveLength(1)
  })

  it('rejects duplicate workflow ids', () => {
    const registry = createWorkflowRegistry()
    registry.register(WORKFLOW_CATALOG[0])
    expect(() => registry.register(WORKFLOW_CATALOG[0])).toThrow(/already registered/)
  })

  it('seeds the catalog with three runnable workflows', () => {
    const registry = createWorkflowRegistry()
    registerCatalogWorkflows(registry)
    expect(registry.list()).toHaveLength(3)
    const ids = registry.list().map((w) => w.id)
    expect(ids).toContain('analyze-spreadsheet-report')
    expect(ids).toContain('spreadsheet-summary-json')
    expect(ids).toContain('spreadsheet-statistics-report')

    for (const workflow of registry.list()) {
      expect(workflow.category).toBeTruthy()
      expect(workflow.status).toBe('active')
      expect(workflow.inputContract.properties.source).toBeTruthy()
      expect(workflow.artifactTypes.length).toBeGreaterThan(0)
      expect(workflow.steps.length).toBeGreaterThan(0)
    }
  })
})
