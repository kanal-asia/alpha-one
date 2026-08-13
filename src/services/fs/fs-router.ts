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

export interface DirListResponse {
  root: string
  current: string
  parent: string | null
  directories: DirEntry[]
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

  return router
}