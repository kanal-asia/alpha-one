/**
 * Alpha Workspace ΓÇö Platform bootstrap (server side)
 *
 * Composes the Kernel with the business SDKs, registers SDK/entity metadata,
 * and wires the OpenCode runtime adapter. This is the single assembly point
 * used by the API server.
 */
import { createArtifactService } from '../artifacts/service'
import { registerSpreadsheetSdk } from '../../business/spreadsheet/sdk'
import { registerReportingSdk } from '../../business/reporting/sdk'
import { registerDocumentsSdk } from '../../business/documents/sdk'
import { createKernel, type Kernel } from '../kernel/kernel'
import { createOpenCodeRuntimeAdapter } from '../runtime/adapters/opencode'
import { createLocalStorage } from './local-storage'

export interface BootstrapOptions {
  workspace: { id: string; name: string; path: string }
  /** Directory for artifact bytes. Falls back to memory when omitted. */
  artifactsDir?: string
  /** Register the OpenCode runtime adapter (defaults to true on node). */
  withOpenCode?: boolean
}

export function bootstrapPlatform(opts: BootstrapOptions): Kernel {
  const storage = opts.artifactsDir
    ? createLocalStorage(opts.artifactsDir)
    : undefined
  const artifacts = createArtifactService(storage)
  const kernel = createKernel({
    workspace: opts.workspace,
    artifacts,
    version: '0.1.0',
  })

  registerSpreadsheetSdk(kernel.operations)
  registerReportingSdk(kernel.operations)
  registerDocumentsSdk(kernel.operations)

  kernel.sdks.register({
    id: 'spreadsheet',
    name: 'Spreadsheet SDK',
    description: 'Import, read and analyze local spreadsheets.',
    version: '1.0.0',
    operations: ['spreadsheet.import', 'spreadsheet.read', 'spreadsheet.analyze'],
  })
  kernel.sdks.register({
    id: 'reporting',
    name: 'Reporting SDK',
    description: 'Generate reports and export them (PDF, summary JSON, statistics).',
    version: '1.0.0',
    operations: ['report.generate', 'report.export.pdf', 'report.export.json', 'report.export.statistics'],
  })
  kernel.sdks.register({
    id: 'documents',
    name: 'Documents SDK',
    description: 'Create and save PDF documents.',
    version: '1.0.0',
    operations: ['documents.pdf.create', 'documents.pdf.save'],
  })

  kernel.entities.register({ id: 'task', name: 'Task', description: 'A unit of work created by a user or the assistant.' })
  kernel.entities.register({ id: 'workflow', name: 'Workflow', description: 'An ordered set of operations.' })
  kernel.entities.register({ id: 'workflow-run', name: 'Workflow Run', description: 'A single execution of a workflow.' })
  kernel.entities.register({ id: 'artifact', name: 'Artifact', description: 'An immutable output unit (spreadsheet, analysis, PDF).' })
  kernel.entities.register({ id: 'event', name: 'Event', description: 'An immutable record of workspace activity.' })
  kernel.entities.register({ id: 'operation', name: 'Operation', description: 'The single executable unit of the platform.' })
  kernel.entities.register({ id: 'runtime', name: 'Runtime', description: 'An execution engine for AI capabilities.' })

  if (opts.withOpenCode !== false) {
    kernel.runtimes.register(createOpenCodeRuntimeAdapter())
  }

  return kernel
}
