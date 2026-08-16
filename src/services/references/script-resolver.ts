/**
 * Google Apps Script Reference Resolver
 *
 * Resolves Apps Script references by downloading project content on demand
 * and staging source files locally so the OpenCode CLI (`--file`) can inspect them.
 */
import { getScriptProjectContent } from '../google/script-service'
import type { ReferenceAttachment, ReferenceResolutionError } from '../../features/ai/references/contract'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export interface ResolvedScriptReference {
  filePath: string
  mimeType: string
  size: number
}

export async function resolveScriptReference(
  ref: ReferenceAttachment,
  userId: string
): Promise<ResolvedScriptReference | ReferenceResolutionError> {
  const scriptId = ref.fileId
  if (!scriptId) {
    return {
      code: 'REFERENCE_RESOLUTION_FAILED',
      name: ref.name,
      message: 'Apps Script ID is missing.',
    }
  }

  try {
    const project = await getScriptProjectContent(userId, scriptId)
    const tmpDir = join(tmpdir(), 'alpha-one-scripts', scriptId)
    mkdirSync(tmpDir, { recursive: true })

    let totalSize = 0
    for (const file of project.files) {
      const ext = file.type === 'HTML' ? 'html' : file.type === 'JSON' ? 'json' : 'gs'
      const fileName = file.name.endsWith(`.${ext}`) ? file.name : `${file.name}.${ext}`
      const filePath = join(tmpDir, fileName)
      const content = file.source ?? ''
      writeFileSync(filePath, content, 'utf8')
      totalSize += Buffer.byteLength(content, 'utf8')
    }

    const manifestPath = join(tmpDir, 'project-manifest.json')
    const manifest = {
      scriptId: project.scriptId,
      title: project.title,
      boundContainer: project.parentId ? { spreadsheetId: project.parentId, name: project.boundContainerName ?? 'Unnamed Sheet' } : null,
      files: project.files.map(f => f.name),
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

    return {
      filePath: manifestPath,
      mimeType: 'application/vnd.google-apps.script',
      size: totalSize,
    }
  } catch (err) {
    return {
      code: 'REFERENCE_RESOLUTION_FAILED',
      name: ref.name,
      message: err instanceof Error ? err.message : 'Failed to resolve Apps Script project.',
    }
  }
}
