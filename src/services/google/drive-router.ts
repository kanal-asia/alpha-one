/**
 * Google Drive API Router
 *
 * Express router handling Google Drive browsing, search, and folder selection.
 * All Google API calls use server-side tokens from the authenticated user's
 * OAuth connection.
 */
import { Router, type Request, type Response } from 'express'
import {
  listDriveFolder,
  listMyDrive,
  listSharedWithMe,
  listStarred,
  listRecent,
  getFolderMeta,
  getFolderBreadcrumb,
  searchDrive,
  checkDriveConnection,
  getDriveFileThumbnail,
} from './drive-service'

export function createGoogleDriveRouter(): Router {
  const router = Router()

  /**
   * GET /api/google/drive/status
   * Returns the Drive connection status for the current user.
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      const status = await checkDriveConnection(userId)
      return res.json(status)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to check Drive status.',
      })
    }
  })

  /**
   * Helper: require connected account or return 401.
   */
  async function requireConnection(userId: string): Promise<boolean> {
    const connectionStatus = await checkDriveConnection(userId)
    if (!connectionStatus.connected) return false
    return true
  }

  /**
   * GET /api/google/drive/my-drive
   * List the user's My Drive root contents.
   */
  router.get('/my-drive', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      if (!(await requireConnection(userId))) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }
      const pageToken = req.query.pageToken as string | undefined
      const result = await listMyDrive(userId, pageToken)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list My Drive.',
      })
    }
  })

  /**
   * GET /api/google/drive/shared
   * List files shared with the user.
   */
  router.get('/shared', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      if (!(await requireConnection(userId))) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }
      const pageToken = req.query.pageToken as string | undefined
      const result = await listSharedWithMe(userId, pageToken)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list shared files.',
      })
    }
  })

  /**
   * GET /api/google/drive/starred
   * List files starred by the user.
   */
  router.get('/starred', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      if (!(await requireConnection(userId))) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }
      const pageToken = req.query.pageToken as string | undefined
      const result = await listStarred(userId, pageToken)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list starred files.',
      })
    }
  })

  /**
   * GET /api/google/drive/recent
   * List recently modified files.
   */
  router.get('/recent', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      if (!(await requireConnection(userId))) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }
      const pageToken = req.query.pageToken as string | undefined
      const result = await listRecent(userId, pageToken)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list recent files.',
      })
    }
  })

  /**
   * GET /api/google/drive/list
   * List contents of a Google Drive folder.
   * Query params:
   *   - folderId: Google Drive folder ID (optional, defaults to root)
   *   - pageToken: pagination token
   *   - search: search query (optional)
   */
  router.get('/list', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      const folderId = req.query.folderId as string | undefined
      const pageToken = req.query.pageToken as string | undefined
      const search = req.query.search as string | undefined

      // Check connection first
      const connectionStatus = await checkDriveConnection(userId)
      if (!connectionStatus.connected) {
        return res.status(401).json({
          error: connectionStatus.error ?? 'Google account not connected.',
        })
      }

      const result = await listDriveFolder(userId, folderId, pageToken, search)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list Drive contents.',
      })
    }
  })

  /**
   * GET /api/google/drive/search
   * Search Google Drive for files and folders.
   * Query params:
   *   - q: search query (required)
   *   - pageToken: pagination token
   */
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      const query = req.query.q as string | undefined
      const pageToken = req.query.pageToken as string | undefined

      if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: 'Search query is required.' })
      }

      // Check connection first
      const connectionStatus = await checkDriveConnection(userId)
      if (!connectionStatus.connected) {
        return res.status(401).json({
          error: connectionStatus.error ?? 'Google account not connected.',
        })
      }

      const result = await searchDrive(userId, query, pageToken)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to search Drive.',
      })
    }
  })

  /**
   * GET /api/google/drive/folder/:id
   * Get metadata for a specific folder.
   */
  router.get('/folder/:id', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      const folderId = req.params.id

      // Check connection first
      const connectionStatus = await checkDriveConnection(userId)
      if (!connectionStatus.connected) {
        return res.status(401).json({
          error: connectionStatus.error ?? 'Google account not connected.',
        })
      }

      const meta = await getFolderMeta(userId, folderId)
      return res.json(meta)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get folder.'
      if (message.includes('not found')) {
        return res.status(404).json({ error: message })
      }
      if (message.includes('not a folder')) {
        return res.status(400).json({ error: message })
      }
      return res.status(500).json({ error: message })
    }
  })

  /**
   * GET /api/google/drive/breadcrumb/:id
   * Get breadcrumb path for a folder.
   */
  router.get('/breadcrumb/:id', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      const folderId = req.params.id

      // Check connection first
      const connectionStatus = await checkDriveConnection(userId)
      if (!connectionStatus.connected) {
        return res.status(401).json({
          error: connectionStatus.error ?? 'Google account not connected.',
        })
      }

      const breadcrumb = await getFolderBreadcrumb(userId, folderId)
      return res.json({ breadcrumb })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to get breadcrumb.',
      })
    }
  })

  /**
   * GET /api/google/drive/thumbnail/:fileId
   * Proxy Google Drive thumbnail with server-side authentication.
   * Returns the image directly (not JSON) with appropriate caching headers.
   */
  router.get('/thumbnail/:fileId', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      const fileId = req.params.fileId

      const connectionStatus = await checkDriveConnection(userId)
      if (!connectionStatus.connected) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }

      const thumbnail = await getDriveFileThumbnail(userId, fileId)
      if (!thumbnail) {
        return res.status(404).json({ error: 'Thumbnail not available.' })
      }

      res.setHeader('Content-Type', thumbnail.contentType)
      res.setHeader('Cache-Control', 'private, max-age=3600')
      return res.send(thumbnail.data)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch thumbnail.',
      })
    }
  })

  return router
}

/**
 * Extract user ID from request.
 * In a real app, this would come from session/JWT.
 * For local-first, we use a fixed user ID.
 */
function getUserId(_req: Request): string {
  // Local-first: single user, fixed ID
  return 'local-user'
}
