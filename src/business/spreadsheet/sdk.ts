/**
 * Alpha Workspace ΓÇö Spreadsheet SDK
 *
 * Operations:
 *   - spreadsheet.import  : register a local spreadsheet as a source artifact
 *   - spreadsheet.read    : read + parse a source artifact into a table
 *   - spreadsheet.analyze : compute deterministic statistics (BZ-3)
 *
 * Local files only. No Google Sheets / remote sources in this sprint.
 * Every operation receives its full state through the Execution Context ΓÇö no
 * global state.
 */
import type {
  OperationContext,
  OperationDefinition,
  OperationRegistry,
} from '../../platform/registries/operation-registry'
import { analyzeSpreadsheet } from './analyze'
import { parseCsv, type ParsedTable } from './parse'

const VERSION = '1.0.0'
const SDK = 'spreadsheet'

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

export function registerSpreadsheetSdk(registry: OperationRegistry): void {
  const importOp: OperationDefinition = {
    id: 'spreadsheet.import',
    domain: 'spreadsheet',
    capability: 'import',
    sdkOwner: SDK,
    name: 'Import Spreadsheet',
    description: 'Registers a local spreadsheet (CSV) as a source artifact.',
    version: VERSION,
    inputSchema: {
      type: 'object',
      properties: { source: { type: 'object', description: '{ name, content } of the CSV source' } },
      required: ['source'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sourceArtifactId: { type: 'string' },
        sourceName: { type: 'string' },
        rowCountHint: { type: 'number' },
      },
    },
    artifactContract: { produces: [{ type: 'spreadsheet', format: 'csv', mime: 'text/csv' }] },
    permission: 'artifact.create',
    tags: ['spreadsheet', 'import', 'local'],
    handler: async (ctx: OperationContext, input: Record<string, unknown>) => {
      const source = input.source as { name?: string; content?: string } | undefined
      const name = source?.name ?? 'spreadsheet.csv'
      const content = source?.content ?? ''
      const artifact = await ctx.artifacts.create({
        name,
        type: 'spreadsheet',
        format: 'csv',
        mime: 'text/csv',
        bytes: new TextEncoder().encode(content),
        producer: 'spreadsheet.import',
        workflowRunId: ctx.runId,
        taskId: ctx.taskId,
      })
      return {
        ok: true,
        data: { sourceArtifactId: artifact.id, sourceName: artifact.name, rowCountHint: content.split(/\r?\n/).length - 1 },
        artifactIds: [artifact.id],
      }
    },
  }

  const readOp: OperationDefinition = {
    id: 'spreadsheet.read',
    domain: 'spreadsheet',
    capability: 'read',
    sdkOwner: SDK,
    name: 'Read Spreadsheet',
    description: 'Reads a spreadsheet artifact and parses it into a table.',
    version: VERSION,
    dependsOn: ['spreadsheet.import'],
    inputSchema: {
      type: 'object',
      properties: {
        sourceArtifactId: { type: 'string' },
        sourceName: { type: 'string' },
        source: { type: 'object' },
      },
    },
    outputSchema: { type: 'object', properties: { table: { type: 'object' } } },
    artifactContract: { consumes: ['spreadsheet'] },
    permission: 'artifact.read',
    tags: ['spreadsheet', 'read', 'local'],
    handler: async (ctx: OperationContext, input: Record<string, unknown>) => {
      const sourceArtifactId = String(input.sourceArtifactId ?? input.source ?? '')
      ctx.artifacts.consume(sourceArtifactId, 'spreadsheet.read')
      const bytes = await ctx.artifacts.readBytes(sourceArtifactId)
      const table: ParsedTable = parseCsv(decodeText(bytes))
      if (table.headers.length === 0) {
        return { ok: false, data: {}, error: 'The spreadsheet is empty or malformed.' }
      }
      return {
        ok: true,
        data: { table },
      }
    },
  }

  const analyzeOp: OperationDefinition = {
    id: 'spreadsheet.analyze',
    domain: 'spreadsheet',
    capability: 'analyze',
    sdkOwner: SDK,
    name: 'Analyze Spreadsheet',
    description: 'Computes deterministic statistics for every column.',
    version: VERSION,
    dependsOn: ['spreadsheet.read'],
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'object' },
        sourceArtifactId: { type: 'string' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { analysis: { type: 'object' }, analysisArtifactId: { type: 'string' } },
    },
    artifactContract: {
      produces: [{ type: 'analysis', format: 'json', mime: 'application/json' }],
      consumes: ['spreadsheet'],
    },
    permission: 'artifact.create',
    tags: ['spreadsheet', 'analyze', 'statistics'],
    handler: async (ctx: OperationContext, input: Record<string, unknown>) => {
      const table = input.table as ParsedTable | undefined
      if (!table) return { ok: false, data: {}, error: 'No table provided to analyze.' }
      const analysis = analyzeSpreadsheet(table.headers, table.rows)
      const artifact = await ctx.artifacts.create({
        name: 'analysis.json',
        type: 'analysis',
        format: 'json',
        mime: 'application/json',
        bytes: new TextEncoder().encode(JSON.stringify(analysis, null, 2)),
        producer: 'spreadsheet.analyze',
        parentArtifactId: typeof input.sourceArtifactId === 'string' ? input.sourceArtifactId : null,
        workflowRunId: ctx.runId,
        taskId: ctx.taskId,
      })
      return {
        ok: true,
        data: { analysis, analysisArtifactId: artifact.id },
        artifactIds: [artifact.id],
      }
    },
  }

  registry.register(importOp)
  registry.register(readOp)
  registry.register(analyzeOp)
}
