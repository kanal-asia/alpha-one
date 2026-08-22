/**
 * Alpha Workspace ΓÇö Documents SDK
 *
 * Operations:
 *   - documents.pdf.create: build a PDF artifact from generic content
 *   - documents.pdf.save  : mark a PDF artifact as saved to the task output
 */
import { buildPdf } from './pdf'
import type {
  OperationContext,
  OperationDefinition,
  OperationRegistry,
} from '../../platform/registries/operation-registry'

const VERSION = '1.0.0'
const SDK = 'documents'

export function registerDocumentsSdk(registry: OperationRegistry): void {
  const createOp: OperationDefinition = {
    id: 'documents.pdf.create',
    domain: 'documents',
    capability: 'pdf-create',
    sdkOwner: SDK,
    name: 'Create PDF',
    description: 'Creates a PDF artifact from title + lines.',
    version: VERSION,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        lines: { type: 'array' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        pdfArtifactId: { type: 'string' },
        pdfName: { type: 'string' },
        pdfSize: { type: 'number' },
      },
    },
    artifactContract: { produces: [{ type: 'pdf', format: 'pdf', mime: 'application/pdf' }] },
    permission: 'artifact.create',
    tags: ['documents', 'pdf', 'create'],
    handler: async (ctx: OperationContext, input: Record<string, unknown>) => {
      const title = String(input.title ?? 'Document')
      const subtitle = input.subtitle != null ? String(input.subtitle) : undefined
      const lines = Array.isArray(input.lines)
        ? (input.lines as unknown[]).map((l) => String(l))
        : []
      const bytes = buildPdf({ title, subtitle, lines })
      const artifact = await ctx.artifacts.create({
        name: `${slugify(title)}.pdf`,
        type: 'pdf',
        format: 'pdf',
        mime: 'application/pdf',
        bytes,
        producer: 'documents.pdf.create',
        workflowRunId: ctx.runId,
        taskId: ctx.taskId,
      })
      return {
        ok: true,
        data: { pdfArtifactId: artifact.id, pdfName: artifact.name, pdfSize: artifact.size },
        artifactIds: [artifact.id],
      }
    },
  }

  const saveOp: OperationDefinition = {
    id: 'documents.pdf.save',
    domain: 'documents',
    capability: 'pdf-save',
    sdkOwner: SDK,
    name: 'Save PDF',
    description: 'Attaches a PDF artifact to the task / workflow output.',
    version: VERSION,
    dependsOn: ['documents.pdf.create'],
    inputSchema: {
      type: 'object',
      properties: { pdfArtifactId: { type: 'string' } },
      required: ['pdfArtifactId'],
    },
    outputSchema: {
      type: 'object',
      properties: { artifactId: { type: 'string' }, artifactName: { type: 'string' } },
    },
    artifactContract: { consumes: ['pdf'] },
    permission: 'artifact.save',
    tags: ['documents', 'pdf', 'save'],
    handler: async (ctx: OperationContext, input: Record<string, unknown>) => {
      const pdfArtifactId = String(input.pdfArtifactId ?? '')
      const record = ctx.artifacts.get(pdfArtifactId)
      if (!record) return { ok: false, data: {}, error: `Unknown artifact: ${pdfArtifactId}` }
      ctx.artifacts.consume(pdfArtifactId, 'documents.pdf.save')
      ctx.artifacts.save(pdfArtifactId, { workflowRunId: ctx.runId, taskId: ctx.taskId })
      return {
        ok: true,
        data: { artifactId: pdfArtifactId, artifactName: record.name },
      }
    },
  }

  registry.register(createOp)
  registry.register(saveOp)
}

function slugify(text: string): string {
  return text.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'document'
}
