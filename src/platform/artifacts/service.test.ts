import { describe, expect, it } from 'vitest'
import { createArtifactService } from './service'
import { createEventBus } from '../events/bus'

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('Artifact Service ΓÇö contract extension (TASK-ENGINEERING-002)', () => {
  it('records producer, consumers, lifecycle and provenance', async () => {
    const artifacts = createArtifactService()
    const source = await artifacts.create({
      name: 'sales.csv',
      type: 'spreadsheet',
      format: 'csv',
      mime: 'text/csv',
      bytes: bytes('a,b\n1,2'),
      producer: 'spreadsheet.import',
      workflowRunId: 'run-1',
      taskId: 'task-1',
    })
    expect(source.producer).toBe('spreadsheet.import')
    expect(source.lifecycle).toBe('created')
    expect(source.consumers).toEqual([])

    artifacts.consume(source.id, 'spreadsheet.read')
    expect(artifacts.get(source.id)!.consumers).toContain('spreadsheet.read')

    const analysis = await artifacts.create({
      name: 'analysis.json',
      type: 'analysis',
      format: 'json',
      mime: 'application/json',
      bytes: bytes('{}'),
      producer: 'spreadsheet.analyze',
      parentArtifactId: source.id,
      workflowRunId: 'run-1',
      taskId: 'task-1',
    })
    expect(analysis.parentArtifactId).toBe(source.id)
    expect(artifacts.get(source.id)!.childArtifactIds).toContain(analysis.id)

    artifacts.save(analysis.id, { workflowRunId: 'run-1', taskId: 'task-1' })
    expect(artifacts.get(analysis.id)!.status).toBe('saved')
    expect(artifacts.get(analysis.id)!.lifecycle).toBe('saved')

    artifacts.delete(source.id)
    const deleted = artifacts.get(source.id)!
    expect(deleted.status).toBe('deleted')
    expect(deleted.lifecycle).toBe('deleted')
    expect(deleted.deletedAt).toBeTruthy()
    await expect(artifacts.readBytes(source.id)).rejects.toThrow(/deleted/)
  })

  it('publishes artifact.saved and artifact.deleted events', async () => {
    const events = createEventBus()
    const artifacts = createArtifactService()
    artifacts.setEventBus(events)

    const art = await artifacts.create({
      name: 'a.pdf',
      type: 'pdf',
      format: 'pdf',
      mime: 'application/pdf',
      bytes: bytes('%PDF-1.4'),
      producer: 'documents.pdf.create',
    })
    artifacts.save(art.id)
    artifacts.delete(art.id)

    const types = events.history().map((e) => e.type)
    expect(types).toContain('artifact.created')
    expect(types).toContain('artifact.saved')
    expect(types).toContain('artifact.deleted')
  })

  it('reports storage info', () => {
    const artifacts = createArtifactService()
    expect(artifacts.storageInfo().location).toBe('memory')
    expect(artifacts.storageInfo().ok).toBe(true)
  })
})
