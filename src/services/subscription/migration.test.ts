/**
 * TASK-ALPHA-SUBSCRIBER-007: subscription migration on a fresh database.
 *
 * Proves the SUB-007 schema lands on first open (7 columns), round-trips
 * the lifecycle fields, survives a close/reopen (idempotent), and preserves
 * the row across reopen. Isolated DATA_ROOT (mkdtemp).
 */
import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-subscription-migrate-'))
process.env['ALPHA_DATA_DIR'] = TMP_DATA

const {
  closeDb,
  getSubscriptionByOwner,
  saveSubscription,
} = await import('../../lib/sqlite-persistence')

const DB_PATH = join(TMP_DATA, 'data', 'alpha-one.sql')

function columnNames(): string[] {
  const db = new DatabaseSync(DB_PATH)
  try {
    const rows = db
      .prepare('PRAGMA table_info(subscriptions)')
      .all() as Array<{ name: string }>
    return rows.map((r) => r.name)
  } finally {
    db.close()
  }
}

afterAll(() => {
  closeDb()
})

describe('subscription migration: fresh database', () => {
  it('creates the lifecycle columns on first open', async () => {
    await getSubscriptionByOwner('probe-fresh')
    expect(columnNames()).toEqual([
      'owner_sub',
      'plan_id',
      'status',
      'current_period_end',
      'cancel_at_period_end',
      'canceled_at',
      'created_at',
      'updated_at',
    ])
  })

  it('round-trips lifecycle fields and survives close/reopen', async () => {
    const now = new Date().toISOString()
    await saveSubscription({
      ownerSub: 'owner-lifecycle',
      planId: 'pro',
      status: 'canceled',
      currentPeriodEnd: '2026-12-01T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      canceledAt: now,
      createdAt: now,
      updatedAt: now,
    })
    closeDb()
    const reread = await getSubscriptionByOwner('owner-lifecycle')
    expect(reread).toMatchObject({
      ownerSub: 'owner-lifecycle',
      planId: 'pro',
      status: 'canceled',
      currentPeriodEnd: '2026-12-01T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      canceledAt: now,
    })
    // Reopen is idempotent: columns unchanged, unrelated tables intact.
    expect(columnNames()).toHaveLength(8)
    closeDb()
    const db = new DatabaseSync(DB_PATH)
    try {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as Array<{ name: string }>
      const names = tables.map((t) => t.name)
      expect(names).toContain('subscriptions')
      expect(names).toContain('google_connections_credentials')
    } finally {
      db.close()
    }
  })
})
