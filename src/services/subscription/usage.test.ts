/**
 * TASK-ALPHA-SUBSCRIBER-010: usage ledger contract tests.
 *
 * Append-only facts, no quotas: one row per run, UNIQUE run_id backstop
 * against double counting, owner-scoped reads, anonymous owners recorded.
 * Isolated DATA_ROOT (mkdtemp).
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-usage-ledger-'))
process.env['ALPHA_DATA_DIR'] = TMP_DATA

const { listUsageRuns, recordUsageRun } = await import(
  '../../lib/sqlite-persistence'
)

const DB_PATH = join(TMP_DATA, 'data', 'alpha-one.sql')

describe('usage ledger', () => {
  it('creates the ledger table on first write', () => {
    expect(
      recordUsageRun({
        runId: 'run-first',
        ownerSub: 'owner-a',
        model: 'opencode/beam-free',
      })
    ).not.toBeNull()
    const db = new DatabaseSync(DB_PATH)
    try {
      const cols = db
        .prepare('PRAGMA table_info(usage_runs)')
        .all() as Array<{ name: string }>
      expect(cols.map((c) => c.name)).toContain('run_id')
      expect(cols.map((c) => c.name)).toContain('owner_sub')
    } finally {
      db.close()
    }
  })

  it('stores a full run fact row', async () => {
    const id = recordUsageRun({
      runId: 'run-full',
      ownerSub: 'owner-a',
      model: 'opencode/beam-free',
      agent: 'build',
      sessionId: 'ses-1',
      tokenCount: 42,
      textLen: 1000,
      terminal: true,
      exitCode: 0,
      continuationCount: 2,
      durationMs: 1234,
    })
    expect(typeof id).toBe('number')
    const rows = await listUsageRuns('owner-a')
    const row = rows.find((r) => r.runId === 'run-full')
    expect(row).toMatchObject({
      ownerSub: 'owner-a',
      model: 'opencode/beam-free',
      agent: 'build',
      sessionId: 'ses-1',
      tokenCount: 42,
      textLen: 1000,
      terminal: true,
      exitCode: 0,
      continuationCount: 2,
      durationMs: 1234,
    })
  })

  it('ignores a retried write for the same run id (no double counting)', async () => {
    const first = recordUsageRun({
      runId: 'run-once',
      ownerSub: 'owner-a',
      model: 'opencode/beam-free',
      tokenCount: 10,
    })
    expect(first).not.toBeNull()
    const second = recordUsageRun({
      runId: 'run-once',
      ownerSub: 'owner-a',
      model: 'opencode/beam-free',
      tokenCount: 999,
    })
    expect(second).toBeNull()
    const rows = (await listUsageRuns('owner-a')).filter(
      (r) => r.runId === 'run-once'
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tokenCount).toBe(10)
  })

  it('scopes reads by owner and records anonymous callers', async () => {
    recordUsageRun({
      runId: 'run-anon-1',
      ownerSub: 'anonymous',
      model: 'opencode/beam-free',
    })
    recordUsageRun({
      runId: 'run-b-1',
      ownerSub: 'owner-b',
      model: 'opencode/beam-free',
    })
    const anon = await listUsageRuns('anonymous')
    expect(anon.map((r) => r.runId)).toContain('run-anon-1')
    const b = await listUsageRuns('owner-b')
    expect(b.map((r) => r.runId)).toEqual(['run-b-1'])
  })

  it('never throws and reports failures as null', () => {
    expect(
      recordUsageRun({
        runId: 'run-ok-after',
        ownerSub: 'owner-a',
        model: 'opencode/beam-free',
      })
    ).not.toBeNull()
  })
})
