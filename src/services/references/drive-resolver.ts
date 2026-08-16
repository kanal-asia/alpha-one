/**
 * GoogleDriveReferenceResolver
 *
 * Resolves a `google_drive` reference on demand: verifies the current user's
 * Drive session, validates the file id + type, downloads/export content only
 * when required, and writes it to a transient temp file that the existing
 * context pipeline (`--file`) consumes. No persistent download cache is
 * created.
 */
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile, mkdir } from 'node:fs/promises'
import {
  getValidAccessToken,
  getConnection,
} from '../google/oauth-service'
import { getDriveFileMeta, downloadDriveFile } from '../google/drive-service'
import type {
  ReferenceAttachment,
  ReferenceResolutionError,
} from '../../features/ai/references/contract'

export interface ResolvedDriveReference {
  filePath: string
  mimeType: string
  size: number
}

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024

function extensionFor(mimeType: string): string {
  if (mimeType.includes('csv')) return '.csv'
  if (mimeType.includes('pdf')) return '.pdf'
  if (mimeType.includes('png')) return '.png'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg'
  if (mimeType.includes('gif')) return '.gif'
  if (mimeType.includes('webp')) return '.webp'
  if (mimeType.includes('markdown')) return '.md'
  if (mimeType.includes('html')) return '.html'
  if (mimeType.includes('json')) return '.json'
  if (mimeType.includes('text')) return '.txt'
  if (mimeType.includes('video') || mimeType.includes('audio')) {
    const ext = extname((mimeType.split('/')[1] ?? 'bin').split(';')[0])
    return ext ? ext : '.bin'
  }
  return '.bin'
}

export async function resolveDriveReference(
  reference: ReferenceAttachment,
  userId: string
): Promise<ResolvedDriveReference | ReferenceResolutionError> {
  const fileId = reference.fileId
  if (!fileId || typeof fileId !== 'string') {
    return {
      code: 'REFERENCE_RESOLUTION_FAILED',
      name: reference.name,
      message: 'The Drive reference is missing a file id.',
    }
  }

  // Authoritative session + authorization check.
  const connection = await getConnection(userId)
  if (!connection) {
    return {
      code: 'DRIVE_AUTH_REQUIRED',
      name: reference.name,
      message: 'Google account is not connected.',
    }
  }
  const token = await getValidAccessToken(userId)
  if (!token) {
    return {
      code: 'DRIVE_AUTH_REQUIRED',
      name: reference.name,
      message: 'Google authorization expired. Please reconnect.',
    }
  }

  // Validate the file exists and is a file (not a folder).
  let meta
  try {
    meta = await getDriveFileMeta(userId, fileId)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('not found')) {
      return {
        code: 'FILE_NOT_FOUND',
        name: reference.name,
        message: 'The file could not be found. It may have been moved or deleted.',
      }
    }
    if (message.includes('permission') || message.includes('enabled')) {
      return {
        code: 'FILE_ACCESS_DENIED',
        name: reference.name,
        message: 'You do not have access to this file.',
      }
    }
    return {
      code: 'REFERENCE_RESOLUTION_FAILED',
      name: reference.name,
      message: 'Unable to resolve the Drive file.',
    }
  }

  if (meta.mimeType === 'application/vnd.google-apps.folder') {
    return {
      code: 'UNSUPPORTED_FILE_TYPE',
      name: reference.name,
      message: 'Attachments must reference a file, not a folder.',
    }
  }

  // Fetch content on demand.
  let content
  try {
    content = await downloadDriveFile(userId, fileId)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('permission')) {
      return {
        code: 'FILE_ACCESS_DENIED',
        name: reference.name,
        message: 'You do not have access to this file.',
      }
    }
    return {
      code: 'REFERENCE_RESOLUTION_FAILED',
      name: reference.name,
      message: 'Unable to read the Drive file content.',
    }
  }

  if (content.data.length > MAX_DOWNLOAD_BYTES) {
    return {
      code: 'UNSUPPORTED_FILE_TYPE',
      name: reference.name,
      message: 'The file is too large to attach as a reference.',
    }
  }

  // Transient temp file for the existing context pipeline (--file). This is
  // OS-temp scoped, not application persistent storage.
  const tmpRoot = join(tmpdir(), 'alpha-one-references')
  await mkdir(tmpRoot, { recursive: true })
  const name = (reference.name || 'file').replace(/[^\w.-]/g, '_').slice(0, 80)
  const safeName = extname(name) ? name : `${name}${extensionFor(content.mimeType)}`
  const filePath = join(tmpRoot, `${Date.now()}-${safeName}`)
  await writeFile(filePath, content.data)

  return {
    filePath,
    mimeType: content.mimeType,
    size: content.data.length,
  }
}