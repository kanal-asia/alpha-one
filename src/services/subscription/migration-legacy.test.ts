/**
 * TASK-ALPHA-SUBSCRIBER-007: migration over a legacy SUBSCRIBER-003 database.
 *
 * Pre-creates the 4-column subscriptions schema (as written by the SUB-003
 * code) with one legacy row, using raw sqlite BEFORE the persistence module
 * loads. Then proves the SUB-007 migration adds exactly the 3 lifecycle
 * columns, leaves the legacy row and values intact (NULL/0, never fabricated
 * dates), keeps the row readable, and allows subsequent writes.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-subscription-legacy-'))
process.env['ALPHA_DATA_DIR'] = TMP_DATA

const DB_PATH = join(TMP_DATA, 'data', 'alpha-one.sql')
const LEGACY_CREATED = '2026-10-01T00:00:00.000Z'

mkdirSync(dirname(DB_PATH), { recursive: true })
{
  const legacy = new DatabaseSync(DB_PATH)
  try {
    legacy.exec(`
      CREATE TABLE subscriptions (
        owner_sub TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    legacy
      .prepare(
        `INSERT INTO subscriptions
           (owner_sub, plan_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run('owner-legacy', 'member', 'active', LEGACY_CREATED, LEGACY_CREATED)
  } finally {
    legacy.close()
  }
}

const {
  closeDb,
  getSubscriptionByOwner,
  saveSubscription,
} = await import('../../lib/sqlite-persistence')

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

describe('subscription migration: legacy SUB-003 database', () => {
  it('adds exactly the lifecycle columns', async () => {
    await getSubscriptionByOwner('owner-legacy')
    expect(columnNames()).toEqual([
      'owner_sub',
      'plan_id',
      'status',
      'created_at',
      'updated_at',
      'current_period_end',
      'cancel_at_period_end',
      'canceled_at',
    ])
  })

  it('preserves the legacy row with NULL/0 lifecycle fields (no fabricated dates)', async () => {
    const row = await getSubscriptionByOwner('owner-legacy')
    expect(row).toMatchObject({
      ownerSub: 'owner-legacy',
      planId: 'member',
      status: 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: LEGACY_CREATED,
      updatedAt: LEGACY_CREATED,
    })
  })

  it('accepts writes with lifecycle fields after migration', async () => {
    const now = new Date().toISOString()
    await saveSubscription({
      ownerSub: 'owner-legacy',
      planId: 'member',
      status: 'canceled',
      currentPeriodEnd: '2026-12-31T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      canceledAt: now,
      createdAt: LEGACY_CREATED,
      updatedAt: now,
    })
    const reread = await getSubscriptionByOwner('owner-legacy')
    expect(reread).toMatchObject({
      status: 'canceled',
      currentPeriodEnd: '2026-12-31T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      canceledAt: now,
    })
  })
})
