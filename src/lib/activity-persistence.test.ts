import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * TASK-ALPHA-LOCAL-072: canonical persistence + ingestion endpoint proof.
 *
 * Uses an isolated temp data root (ALPHA_DATA_DIR) — never the VPS DB, never
 * the desktop credential DB. Seeds one identity, then proves first/subsequent
 * semantics, unknown-identity rejection, input validation, and the HTTP
 * endpoint contract against a locally booted infra server.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'alpha-activity-db-'))
process.env.ALPHA_DATA_DIR = DATA_DIR

const { upsertConnectionMetadata, recordGoogleActivity } = await import(
  '@/lib/sqlite-persistence'
)

const SUB = 'sub-activity-1'
const T1 = '2026-09-04T10:00:00.000Z'
const T2 = '2026-09-04T11:30:00.000Z'

describe('recordGoogleActivity', () => {
  it('seeds baseline with null activity fields', async () => {
    await upsertConnectionMetadata({
      providerUserId: SUB,
      email: 'tester@example.com',
      observedAt: T1,
    })
    const again = await recordGoogleActivity({
      providerUserId: 'nobody-missing',
      toolName: 'gmail_gmail_search_messages',
      occurredAt: T1,
    })
    expect(again.updated).toBe(false)
    expect(again.activityCount).toBe(0)
  })

  it('first event initializes first=last, count=1, tool', async () => {
    const r = await recordGoogleActivity({
      providerUserId: SUB,
      toolName: 'gmail_gmail_search_messages',
      occurredAt: T1,
    })
    expect(r.updated).toBe(true)
    expect(r.firstActivityAt).toBe(T1)
    expect(r.lastActivityAt).toBe(T1)
    expect(r.activityCount).toBe(1)
    expect(r.lastActivityTool).toBe('gmail_gmail_search_messages')
  })

  it('second event preserves first, advances last, count+1, tool replaced', async () => {
    const r = await recordGoogleActivity({
      providerUserId: SUB,
      toolName: 'google-drive_drive_list_files',
      occurredAt: T2,
    })
    expect(r.updated).toBe(true)
    expect(r.firstActivityAt).toBe(T1)
    expect(r.lastActivityAt).toBe(T2)
    expect(r.activityCount).toBe(2)
    expect(r.lastActivityTool).toBe('google-drive_drive_list_files')
  })

  it('rejects malformed events without touching the row', async () => {
    await expect(
      recordGoogleActivity({
        providerUserId: SUB,
        toolName: 'bad tool!',
        occurredAt: T2,
      })
    ).rejects.toThrow()
    await expect(
      recordGoogleActivity({
        providerUserId: SUB,
        toolName: 'gmail_gmail_search_messages',
        occurredAt: 'not-a-date',
      })
    ).rejects.toThrow()
    await expect(
      recordGoogleActivity({
        providerUserId: '',
        toolName: 'gmail_gmail_search_messages',
        occurredAt: T2,
      })
    ).rejects.toThrow()
    const r = await recordGoogleActivity({
      providerUserId: SUB,
      toolName: 'gmail_gmail_search_messages',
      occurredAt: '2026-09-04T12:00:00.000Z',
    })
    // Only the two valid events above counted.
    expect(r.activityCount).toBe(3)
  })
})

describe('POST /google/activity endpoint', () => {
  let proc: ChildProcess | null = null
  let port = 0

  beforeAll(async () => {
    port = await new Promise<number>((resolve, reject) => {
      const s = createServer()
      s.once('error', reject)
      s.listen(0, '127.0.0.1', () => {
        const p = (s.address() as { port: number }).port
        s.close(() => resolve(p))
      })
    })
    proc = spawn(
      process.execPath,
      [join(process.cwd(), 'dist/server/alpha-infra-server.js')],
      {
        env: {
          ...process.env,
          PORT: String(port),
          GOOGLE_CLIENT_ID: 'test-client',
          GOOGLE_CLIENT_SECRET: 'test-secret',
          GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/cb',
          ALPHA_DATA_DIR: DATA_DIR,
          NODE_PATH: join(process.cwd(), 'node_modules'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }
    )
    const deadline = Date.now() + 30000
    for (;;) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) break
      } catch {
        /* booting */
      }
      if (Date.now() > deadline) throw new Error('infra server did not boot')
      await new Promise((r) => setTimeout(r, 500))
    }
  }, 60000)

  afterAll(async () => {
    proc?.kill()
  })

  async function postActivity(body: unknown): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`http://127.0.0.1:${port}/google/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, json: await res.json().catch(() => ({})) }
  }

  it('accepts a valid event for a known identity', async () => {
    const out = await postActivity({
      provider: 'google',
      provider_user_id: SUB,
      tool_name: 'google-docs_docs_get_document',
      occurred_at: '2026-09-04T13:00:00.000Z',
    })
    expect(out.status).toBe(200)
    const j = out.json as Record<string, unknown>
    expect(j.updated).toBe(true)
    expect(j.activity_count).toBe(4)
    expect(j.last_activity_tool).toBe('google-docs_docs_get_document')
  })

  it('rejects unknown identity without fabricating (404)', async () => {
    const out = await postActivity({
      provider: 'google',
      provider_user_id: 'ghost-sub',
      tool_name: 'gmail_gmail_search_messages',
      occurred_at: T2,
    })
    expect(out.status).toBe(404)
  })

  it('rejects malformed payloads (400)', async () => {
    for (const body of [
      { provider: 'github', provider_user_id: SUB, tool_name: 't', occurred_at: T2 },
      { provider: 'google', provider_user_id: '', tool_name: 't', occurred_at: T2 },
      { provider: 'google', provider_user_id: SUB, tool_name: 'bad name!', occurred_at: T2 },
      { provider: 'google', provider_user_id: SUB, tool_name: 't', occurred_at: 'yesterday' },
      {},
    ]) {
      const out = await postActivity(body)
      expect(out.status).toBe(400)
    }
  })
})
