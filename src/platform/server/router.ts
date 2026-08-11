/**
 * Alpha Workspace — Workspace API Router (Express)
 *
 * Exposes the Workspace Service (server facade) as a thin HTTP API under
 * `/api/ws`. The browser Workspace SDK client (client.ts) is the only consumer.
 */
import { Router, type Request, type Response } from 'express'
import type { WorkspaceService } from '../workspace/service'
import { buildPresentation, type PresentationInput } from '../../business/presentation/pptx'

export function createWorkspaceRouter(service: WorkspaceService): Router {
  const router = Router()

  router.get('/health', (_req: Request, res: Response) => {
    res.json(service.health())
  })

  router.get('/health/platform', async (_req: Request, res: Response) => {
    res.json(await service.platformHealth())
  })

  router.get('/tasks', (_req: Request, res: Response) => {
    res.json({ tasks: service.listTasks() })
  })

  router.post('/tasks', async (req: Request, res: Response) => {
    const { title, description, workflowId, input, createdBy } = req.body ?? {}
    if (!title || !workflowId || !input || typeof input !== 'object') {
      return res.status(400).json({ error: '`title`, `workflowId` and `input` are required.' })
    }
    try {
      const result = await service.createTask({
        title: String(title),
        description: description != null ? String(description) : undefined,
        workflowId: String(workflowId),
        input,
        createdBy: createdBy === 'assistant' ? 'assistant' : 'user',
      })
      return res.json(result)
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create task.' })
    }
  })

  router.get('/tasks/:id', (req: Request, res: Response) => {
    const result = service.getTask(req.params.id)
    if (!result) return res.status(404).json({ error: 'Task not found.' })
    return res.json(result)
  })

  router.get('/artifacts', (_req: Request, res: Response) => {
    res.json({ artifacts: service.listArtifacts() })
  })

  router.get('/artifacts/:id', (req: Request, res: Response) => {
    const artifact = service.getArtifact(req.params.id)
    if (!artifact) return res.status(404).json({ error: 'Artifact not found.' })
    return res.json(artifact)
  })

  router.get('/artifacts/:id/content', async (req: Request, res: Response) => {
    const artifact = service.getArtifact(req.params.id)
    if (!artifact) return res.status(404).json({ error: 'Artifact not found.' })
    try {
      const bytes = await service.readArtifactBytes(artifact.id)
      res.setHeader('Content-Type', artifact.mime)
      res.setHeader('Content-Disposition', `inline; filename="${artifact.name}"`)
      res.send(Buffer.from(bytes))
    } catch {
      res.status(500).json({ error: 'Failed to read artifact bytes.' })
    }
  })

  router.get('/workflows', (_req: Request, res: Response) => {
    res.json({ workflows: service.listWorkflows() })
  })

  router.get('/workflows/:id', (req: Request, res: Response) => {
    const workflow = service.getWorkflow(req.params.id)
    if (!workflow) return res.status(404).json({ error: 'Workflow not found.' })
    return res.json(workflow)
  })

  router.post('/workflows/:id/run', async (req: Request, res: Response) => {
    const input = (req.body ?? {}).input ?? {}
    try {
      const run = await service.runWorkflow({ workflowId: req.params.id, input })
      return res.json(run)
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to run workflow.' })
    }
  })

  router.get('/operations', (_req: Request, res: Response) => {
    res.json({ operations: service.listOperations() })
  })

  router.get('/operations/:id', (req: Request, res: Response) => {
    const operation = service.getOperation(req.params.id)
    if (!operation) return res.status(404).json({ error: 'Operation not found.' })
    return res.json(operation)
  })

  router.get('/sdks', (_req: Request, res: Response) => {
    res.json({ sdks: service.listSdks() })
  })

  router.get('/runtimes', async (_req: Request, res: Response) => {
    const runtimes = await service.listRuntimes()
    res.json({ runtimes })
  })

  router.get('/history', (_req: Request, res: Response) => {
    res.json({ events: service.history() })
  })

  router.get('/history/summary', (_req: Request, res: Response) => {
    res.json(service.historySummary())
  })

  router.get('/history/:id', (req: Request, res: Response) => {
    const entry = service.getHistoryEntry(req.params.id)
    if (!entry) return res.status(404).json({ error: 'History entry not found.' })
    return res.json(entry)
  })

  // Presentation generation endpoint
  router.post('/presentations/generate', async (req: Request, res: Response) => {
    const { title, purpose, audience, style, slideCount, content } = req.body ?? {}
    if (!title || !purpose) {
      return res.status(400).json({ error: '`title` and `purpose` are required.' })
    }
    try {
      const input: PresentationInput = {
        title: String(title),
        purpose: String(purpose),
        audience: String(audience || 'General'),
        style: (style as PresentationInput['style']) || 'business',
        slideCount: Number(slideCount) || 8,
        content: String(content || ''),
      }
      const bytes = await buildPresentation(input)
      const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pptx`
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(Buffer.from(bytes))
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate presentation.' })
    }
  })

  return router
}
