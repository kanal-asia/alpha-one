/**
 * Alpha Workspace ΓÇö Workflow Catalog
 *
 * Seed data for the Workflow Registry. This is the ONLY place workflows are
 * declared. Adding a new capability never touches the engine or a runtime
 * adapter ΓÇö it is a registry change only.
 *
 * Three workflows prove the platform is reusable:
 *   1. analyze-spreadsheet-report     ΓåÆ Spreadsheet ΓåÆ PDF report
 *   2. spreadsheet-summary-json       ΓåÆ Spreadsheet ΓåÆ summary JSON
 *   3. spreadsheet-statistics-report  ΓåÆ Spreadsheet ΓåÆ statistics report
 */
import type { WorkflowDefinition } from './types'
import type { WorkflowRegistry } from './registry'

export const WORKFLOW_ANALYZE_SPREADSHEET_REPORT: WorkflowDefinition = {
  id: 'analyze-spreadsheet-report',
  name: 'Analyze Spreadsheet & Generate PDF Report',
  description:
    'Imports a local spreadsheet, reads and analyzes it, generates a report and exports it as a PDF artifact.',
  version: '1.0.0',
  category: 'Spreadsheet',
  tags: ['spreadsheet', 'report', 'pdf', 'local'],
  status: 'active',
  inputContract: {
    type: 'object',
    properties: {
      source: { type: 'object', description: '{ name, content } of the CSV source' },
    },
    required: ['source'],
  },
  outputContract: {
    type: 'object',
    properties: {
      pdfArtifactId: { type: 'string', description: 'Id of the exported PDF artifact' },
      artifactId: { type: 'string', description: 'Id of the saved PDF artifact' },
      artifactName: { type: 'string', description: 'Name of the saved PDF artifact' },
    },
  },
  artifactTypes: ['spreadsheet', 'analysis', 'pdf'],
  steps: [
    { id: 'import', operationId: 'spreadsheet.import', label: 'Import Spreadsheet' },
    { id: 'read', operationId: 'spreadsheet.read', label: 'Read Spreadsheet' },
    { id: 'analyze', operationId: 'spreadsheet.analyze', label: 'Analyze Spreadsheet' },
    { id: 'generate', operationId: 'report.generate', label: 'Generate Report' },
    { id: 'export-pdf', operationId: 'report.export.pdf', label: 'Export Report to PDF' },
    { id: 'save', operationId: 'documents.pdf.save', label: 'Save PDF Artifact' },
  ],
}

export const WORKFLOW_SPREADSHEET_SUMMARY_JSON: WorkflowDefinition = {
  id: 'spreadsheet-summary-json',
  name: 'Spreadsheet ΓåÆ Summary JSON',
  description:
    'Imports a local spreadsheet, analyzes it and produces a deterministic summary as a JSON artifact.',
  version: '1.0.0',
  category: 'Spreadsheet',
  tags: ['spreadsheet', 'summary', 'json', 'local'],
  status: 'active',
  inputContract: {
    type: 'object',
    properties: {
      source: { type: 'object', description: '{ name, content } of the CSV source' },
    },
    required: ['source'],
  },
  outputContract: {
    type: 'object',
    properties: {
      jsonArtifactId: { type: 'string', description: 'Id of the summary JSON artifact' },
      jsonName: { type: 'string', description: 'Name of the summary JSON artifact' },
      jsonSize: { type: 'number', description: 'Size in bytes' },
    },
  },
  artifactTypes: ['spreadsheet', 'analysis', 'summary'],
  steps: [
    { id: 'import', operationId: 'spreadsheet.import', label: 'Import Spreadsheet' },
    { id: 'read', operationId: 'spreadsheet.read', label: 'Read Spreadsheet' },
    { id: 'analyze', operationId: 'spreadsheet.analyze', label: 'Analyze Spreadsheet' },
    { id: 'generate', operationId: 'report.generate', label: 'Generate Report' },
    { id: 'export-json', operationId: 'report.export.json', label: 'Export Summary JSON' },
  ],
}

export const WORKFLOW_SPREADSHEET_STATISTICS_REPORT: WorkflowDefinition = {
  id: 'spreadsheet-statistics-report',
  name: 'Spreadsheet ΓåÆ Statistics Report',
  description:
    'Imports a local spreadsheet, analyzes it and produces a full deterministic statistics report artifact.',
  version: '1.0.0',
  category: 'Spreadsheet',
  tags: ['spreadsheet', 'statistics', 'report', 'local'],
  status: 'active',
  inputContract: {
    type: 'object',
    properties: {
      source: { type: 'object', description: '{ name, content } of the CSV source' },
    },
    required: ['source'],
  },
  outputContract: {
    type: 'object',
    properties: {
      statisticsArtifactId: { type: 'string', description: 'Id of the statistics report artifact' },
      statisticsName: { type: 'string', description: 'Name of the statistics report artifact' },
      statisticsSize: { type: 'number', description: 'Size in bytes' },
    },
  },
  artifactTypes: ['spreadsheet', 'analysis', 'statistics'],
  steps: [
    { id: 'import', operationId: 'spreadsheet.import', label: 'Import Spreadsheet' },
    { id: 'read', operationId: 'spreadsheet.read', label: 'Read Spreadsheet' },
    { id: 'analyze', operationId: 'spreadsheet.analyze', label: 'Analyze Spreadsheet' },
    { id: 'generate', operationId: 'report.generate', label: 'Generate Report' },
    { id: 'export-statistics', operationId: 'report.export.statistics', label: 'Export Statistics Report' },
  ],
}

export const WORKFLOW_CATALOG: WorkflowDefinition[] = [
  WORKFLOW_ANALYZE_SPREADSHEET_REPORT,
  WORKFLOW_SPREADSHEET_SUMMARY_JSON,
  WORKFLOW_SPREADSHEET_STATISTICS_REPORT,
]

/** Register every catalog workflow into a registry. */
export function registerCatalogWorkflows(registry: WorkflowRegistry): void {
  for (const workflow of WORKFLOW_CATALOG) {
    registry.register(workflow)
  }
}

/** Backwards-compatible lookup helper (Sprint 1 API). */
export function getWorkflow(id: string): WorkflowDefinition | null {
  return WORKFLOW_CATALOG.find((w) => w.id === id) ?? null
}
