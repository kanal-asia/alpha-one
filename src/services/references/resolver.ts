/**
 * Reference Resolver
 *
 * Provider-neutral orchestrator. Dispatches each reference to the provider
 * resolver (`local` → LocalReferenceResolver, `google_drive` →
 * GoogleDriveReferenceResolver). The AI chat route depends only on this module
 * — never on provider-specific logic.
 */
import type {
  ReferenceAttachment,
  ReferenceResolutionError,
} from '../../features/ai/references/contract'
import {
  resolveLocalReference,
  type ResolvedLocalReference,
} from './local-resolver'
import {
  resolveDriveReference,
  type ResolvedDriveReference,
} from './drive-resolver'

export interface ResolvedReference {
  reference: ReferenceAttachment
  /** Absolute path usable by the existing context pipeline (`--file`). */
  filePath: string
  mimeType?: string
  size: number
}

export interface ReferenceContext {
  /** Canonical workspace/project root(s) allowed for local references. */
  allowedRoots: string[]
  /** Current user id for Drive session resolution. */
  userId: string
}

export interface ReferenceResolutionResult {
  resolved: ResolvedReference[]
  errors: ReferenceResolutionError[]
}

export async function resolveReferences(
  references: ReferenceAttachment[],
  ctx: ReferenceContext
): Promise<ReferenceResolutionResult> {
  const resolved: ResolvedReference[] = []
  const errors: ReferenceResolutionError[] = []

  for (const reference of references) {
    if (reference.provider === 'local') {
      const local = await resolveLocalReference(reference, ctx.allowedRoots)
      if ('filePath' in local && (local as ResolvedLocalReference).filePath) {
        resolved.push({
          reference,
          filePath: (local as ResolvedLocalReference).filePath,
          mimeType: (local as ResolvedLocalReference).mimeType,
          size: (local as ResolvedLocalReference).size ?? 0,
        })
      } else {
        errors.push(local as ReferenceResolutionError)
      }
    } else if (reference.provider === 'google_drive') {
      const drive = await resolveDriveReference(reference, ctx.userId)
      if ('filePath' in drive && (drive as ResolvedDriveReference).filePath) {
        resolved.push({
          reference,
          filePath: (drive as ResolvedDriveReference).filePath,
          mimeType: (drive as ResolvedDriveReference).mimeType,
          size: (drive as ResolvedDriveReference).size,
        })
      } else {
        errors.push(drive as ReferenceResolutionError)
      }
    } else {
      errors.push({
        code: 'REFERENCE_RESOLUTION_FAILED',
        name: reference.name ?? 'Unknown',
        message: 'Unsupported reference provider.',
      })
    }
  }

  return { resolved, errors }
}

export function uniqueResolvedPaths(resolved: ResolvedReference[]): string[] {
  return [...new Set(resolved.map((r) => r.filePath))]
}