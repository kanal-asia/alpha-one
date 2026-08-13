/**
 * LocalReferenceResolver
 *
 * Validates a `local` reference against the allowed workspace/project roots and
 * produces a real filesystem path that the existing context pipeline (`--file`)
 * can consume. Never trusts an arbitrary client-supplied path: the resolved
 * path must be a file, must be readable, and must live inside an allowed root.
 */
import { resolve as resolvePath, relative, isAbsolute } from 'node:path'
import { stat, realpath, access, constants } from 'node:fs/promises'
import type {
  ReferenceAttachment,
  ReferenceResolutionError,
} from '../../features/ai/references/contract'

export interface ResolvedLocalReference {
  filePath: string
  mimeType?: string
  size?: number
}

function isPathInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Resolve a local reference. Returns the resolved absolute path on success, or
 * a structured reference error.
 */
export async function resolveLocalReference(
  reference: ReferenceAttachment,
  allowedRoots: string[]
): Promise<ResolvedLocalReference | ReferenceResolutionError> {
  const supplied = reference.path
  if (!supplied || typeof supplied !== 'string') {
    return {
      code: 'REFERENCE_RESOLUTION_FAILED',
      name: reference.name,
      message: 'The file reference is missing a path.',
    }
  }

  if (supplied.includes('\0')) {
    return {
      code: 'LOCAL_PATH_NOT_ALLOWED',
      name: reference.name,
      message: 'The file path is not allowed.',
    }
  }

  // Normalize to an absolute path.
  const candidate = resolvePath(supplied)

  const withinAllowed = allowedRoots.some((root) => isPathInside(resolvePath(root), candidate))
  if (!withinAllowed) {
    return {
      code: 'LOCAL_PATH_NOT_ALLOWED',
      name: reference.name,
      message: 'The file is outside the allowed workspace folders.',
    }
  }

  let real: string
  try {
    // Resolve symlinks so a link inside the root cannot escape it.
    real = await realpath(candidate)
  } catch {
    return {
      code: 'FILE_NOT_FOUND',
      name: reference.name,
      message: 'The file could not be found. It may have been moved or deleted.',
    }
  }

  if (!allowedRoots.some((root) => isPathInside(resolvePath(root), real))) {
    return {
      code: 'LOCAL_PATH_NOT_ALLOWED',
      name: reference.name,
      message: 'The file is outside the allowed workspace folders.',
    }
  }

  let info
  try {
    info = await stat(real)
  } catch {
    return {
      code: 'FILE_NOT_FOUND',
      name: reference.name,
      message: 'The file could not be found. It may have been moved or deleted.',
    }
  }

  if (!info.isFile()) {
    return {
      code: 'UNSUPPORTED_FILE_TYPE',
      name: reference.name,
      message: 'The reference must point to a file, not a folder.',
    }
  }

  try {
    await access(real, constants.R_OK)
  } catch {
    return {
      code: 'FILE_ACCESS_DENIED',
      name: reference.name,
      message: 'The file is not readable. Permission may have changed.',
    }
  }

  return {
    filePath: real,
    mimeType: reference.mimeType,
    size: info.size,
  }
}