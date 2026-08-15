/**
 * Google Sheets API Router
 *
 * Express router handling Google Sheets operations.
 * All Google API calls use server-side tokens from the authenticated user's
 * OAuth connection.
 */
import { Router, type Request, type Response } from 'express'
import {
  getSpreadsheetMeta,
  listSheets,
  readRange,
  writeRange,
  appendRows,
  createSpreadsheet,
} from './sheets-service'
import { checkDriveConnection } from './drive-service'

export function createGoogleSheetsRouter(): Router {
  const router = Router()

  /**
   * Helper: require connected account or return 401.
   */
  async function requireConnection(userId: string): Promise<boolean> {
    const status = await checkDriveConnection(userId)
    return status.connected
  }

  /**
   * GET /api/google/sheets/:spreadsheetId
   * Get spreadsheet metadata (title, worksheets).
   */
  router.get('/:spreadsheetId', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      if (!(await requireConnection(userId))) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }

      const { spreadsheetId } = req.params
      if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        return res.status(400).json({ error: 'spreadsheetId is required.' })
      }

      const meta = await getSpreadsheetMeta(userId, spreadsheetId)
      return res.json(meta)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to get spreadsheet metadata.',
      })
    }
  })

  /**
   * GET /api/google/sheets/:spreadsheetId/sheets
   * List worksheets in a spreadsheet.
   */
  router.get('/:spreadsheetId/sheets', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      if (!(await requireConnection(userId))) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }

      const { spreadsheetId } = req.params
      if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        return res.status(400).json({ error: 'spreadsheetId is required.' })
      }

      const sheets = await listSheets(userId, spreadsheetId)
      return res.json({ sheets })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list worksheets.',
      })
    }
  })

  /**
   * GET /api/google/sheets/:spreadsheetId/values
   * Read a range of values. Requires ?range= param in A1 notation.
   */
  router.get('/:spreadsheetId/values', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      if (!(await requireConnection(userId))) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }

      const { spreadsheetId } = req.params
      const range = req.query.range as string

      if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        return res.status(400).json({ error: 'spreadsheetId is required.' })
      }
      if (!range || typeof range !== 'string') {
        return res.status(400).json({ error: 'range query parameter is required (A1 notation).' })
      }

      const result = await readRange(userId, spreadsheetId, range)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to read range.',
      })
    }
  })

  /**
   * PUT /api/google/sheets/:spreadsheetId/values
   * Write values to a range. Body: { range, values }
   */
  router.put('/:spreadsheetId/values', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      if (!(await requireConnection(userId))) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }

      const { spreadsheetId } = req.params
      const { range, values } = req.body ?? {}

      if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        return res.status(400).json({ error: 'spreadsheetId is required.' })
      }
      if (!range || typeof range !== 'string') {
        return res.status(400).json({ error: 'range is required (A1 notation).' })
      }
      if (!Array.isArray(values)) {
        return res.status(400).json({ error: 'values must be a 2D array.' })
      }

      const result = await writeRange(userId, spreadsheetId, range, values)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to write range.',
      })
    }
  })

  /**
   * POST /api/google/sheets/:spreadsheetId/values/append
   * Append rows. Body: { range, values }
   */
  router.post('/:spreadsheetId/values/append', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      if (!(await requireConnection(userId))) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }

      const { spreadsheetId } = req.params
      const { range, values } = req.body ?? {}

      if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        return res.status(400).json({ error: 'spreadsheetId is required.' })
      }
      if (!range || typeof range !== 'string') {
        return res.status(400).json({ error: 'range is required (A1 notation).' })
      }
      if (!Array.isArray(values)) {
        return res.status(400).json({ error: 'values must be a 2D array.' })
      }

      const result = await appendRows(userId, spreadsheetId, range, values)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to append rows.',
      })
    }
  })

  /**
   * POST /api/google/sheets/create
   * Create a new spreadsheet. Body: { title }
   */
  router.post('/create', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      if (!(await requireConnection(userId))) {
        return res.status(401).json({ error: 'Google account not connected.' })
      }

      const { title } = req.body ?? {}
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'title is required.' })
      }

      const meta = await createSpreadsheet(userId, title)
      return res.json(meta)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to create spreadsheet.',
      })
    }
  })

  return router
}

/**
 * Extract user ID from request.
 * Local-first: single user, fixed ID.
 */
function getUserId(_req: Request): string {
  return 'local-user'
}
