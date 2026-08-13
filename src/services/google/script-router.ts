/**
 * Google Apps Script API Router
 *
 * Express router handling Google Apps Script project listing and discovery.
 */
import { Router, type Request, type Response } from 'express'
import { listScriptProjects } from './script-service'

export function createGoogleScriptRouter(): Router {
  const router = Router()

  /**
   * GET /api/google/script/projects
   * List accessible Google Apps Script projects via Drive API query.
   */
  router.get('/projects', async (req: Request, res: Response) => {
    try {
      const userId = 'local-user'
      const search = req.query.search as string | undefined
      const result = await listScriptProjects(userId, search)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list Apps Script projects.',
      })
    }
  })

  return router
}
