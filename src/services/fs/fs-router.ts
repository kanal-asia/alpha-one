/**
 * Local Filesystem Router
 *
 * Minimal local-first directory browser used by the AI Assistant project
 * folder picker. Server-side module because browser File System Access API
 * handles cannot expose real filesystem paths on Windows. This endpoint only
 * returns directory listings (name + resolved absolute path), never file
 * contents, and is intended for the user's own machine (localhost dev server).
 */
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { Router, type Request, type Response } from 'express'

export interface DirEntry {
  name: string
  path: string
}

export interface FileEntry extends DirEntry {
  size: number
  modifiedTime: string
}

export interface DirListResponse {
  root: string
  current: string
  parent: string | null
  directories: DirEntry[]
}

export interface EntryListResponse {
  root: string
  current: string
  parent: string | null
  directories: DirEntry[]
  files: FileEntry[]
}

function isWindowsPlatform(): boolean {
  return process.platform === 'win32'
}

async function driveRoots(): Promise<string[]> {
  if (!isWindowsPlatform()) return ['/']
  const roots: string[] = []
  for (let i = 65; i <= 90; i += 1) {
    const root = `${String.fromCharCode(i)}:\\`
    try {
      await fs.access(root)
      roots.push(root)
    } catch {
      // drive letter not currently accessible; skip it
    }
  }
  return roots
}

function isRootPath(p: string): boolean {
  if (!isWindowsPlatform()) return p === '/'
  return /^[A-Za-z]:\\$/.test(p)
}

/**
 * Explicit local filesystem boundary for the browsing endpoints.
 *
 * Only absolute, well-formed paths may be listed. Relative paths, paths with
 * embedded NUL bytes, and traversal segments (`..`) are rejected up front so
 * the picker cannot be used to escape the intended local scope or probe
 * arbitrary locations with malformed input.
 */
function isSafeAbsolutePath(p: string): boolean {
  if (p.includes('\0')) return false
  const isAbsolute =
    p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')
  if (!isAbsolute) return false
  const segments = p.split(/[\\/]+/)
  return !segments.some((s) => s === '..')
}

export function createFsRouter(): Router {
  const router = Router()

  /**
   * GET /api/fs/dirs?path=<absolute directory>
   * Lists sub-directories under `path`. Without `path`, returns drive roots
   * (Windows) or `/`.
   */
  router.get('/dirs', async (req: Request, res: Response) => {
    try {
      const raw = typeof req.query.path === 'string' ? req.query.path : undefined
      const requested = raw ? raw.trim() : ''

      if (!requested) {
        const roots = await driveRoots()
        return res.json({
          root: isWindowsPlatform() ? 'This PC' : '/',
          current: isWindowsPlatform() ? 'This PC' : '/',
          parent: null,
          directories: roots.map((r) => ({ name: r, path: r })),
        } satisfies DirListResponse)
      }

      if (!isSafeAbsolutePath(requested)) {
        return res.status(400).json({ error: 'Invalid path.' })
      }

      const stat = await fs.stat(requested)
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: `Not a directory: ${requested}` })
      }

      const entries = await fs.readdir(requested, { withFileTypes: true })
      const directories: DirEntry[] = entries
        .filter((e) => e.isDirectory())
        .map((e) => ({ name: e.name, path: join(requested, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name))

      const isRoot = isRootPath(requested)
      const parent = isRoot ? null : dirname(requested)

      return res.json({
        root: isWindowsPlatform() ? 'This PC' : '/',
        current: requested,
        parent,
        directories,
      } satisfies DirListResponse)
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to list directories.',
      })
    }
  })

  /**
   * GET /api/fs/entries?path=<absolute directory>
   * Lists sub-directories and files under `path`. Without `path`, returns
   * drive roots (Windows) or `/`.
   */
  router.get('/entries', async (req: Request, res: Response) => {
    try {
      const raw = typeof req.query.path === 'string' ? req.query.path : undefined
      const requested = raw ? raw.trim() : ''

      if (!requested) {
        const roots = await driveRoots()
        return res.json({
          root: isWindowsPlatform() ? 'This PC' : '/',
          current: isWindowsPlatform() ? 'This PC' : '/',
          parent: null,
          directories: roots.map((r) => ({ name: r, path: r })),
          files: [],
        } satisfies EntryListResponse)
      }

      if (!isSafeAbsolutePath(requested)) {
        return res.status(400).json({ error: 'Invalid path.' })
      }

      const stat = await fs.stat(requested)
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: `Not a directory: ${requested}` })
      }

      const entries = await fs.readdir(requested, { withFileTypes: true })
      const directories: DirEntry[] = []
      const files: FileEntry[] = []

      for (const entry of entries) {
        if (entry.isDirectory()) {
          directories.push({ name: entry.name, path: join(requested, entry.name) })
        } else if (entry.isFile()) {
          try {
            const info = await fs.stat(join(requested, entry.name))
            files.push({
              name: entry.name,
              path: join(requested, entry.name),
              size: info.size,
              modifiedTime: info.mtime.toISOString(),
            })
          } catch {
            // skip unreadable file entries
          }
        }
      }

      directories.sort((a, b) => a.name.localeCompare(b.name))
      files.sort((a, b) => a.name.localeCompare(b.name))

      const isRoot = isRootPath(requested)
      const parent = isRoot ? null : dirname(requested)

      return res.json({
        root: isWindowsPlatform() ? 'This PC' : '/',
        current: requested,
        parent,
        directories,
        files,
      } satisfies EntryListResponse)
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to list entries.',
      })
    }
  })

  return router
}