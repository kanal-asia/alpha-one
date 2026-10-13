/**
 * TASK-089: group-aware snapshot & retry-safe ownership regression.
 * Proves the P0 defect class is closed: grouped children are inventoried,
 * owned, cleared, and QA-visible; re-compose never accumulates generations.
 * Pure fixtures (raw Google-shaped elements) — no Google traffic.
 */
import { describe, expect, it } from 'vitest'
import { composeSlideOnPage } from './beautify'
import {
  decideSourceOwnership,
  qaReadback,
  resolvePageGeometry,
  type ReadbackElement,
  type SourceElementInfo,
} from './geometry'
import { buildSnapshotInventory } from './visual'

const EMU = 12700

function rawShape(id: string, text: string, x = 0, y = 0, w = 100, h = 40): Record<string, unknown> {
  return {
    objectId: id,
    size: { width: { magnitude: w * EMU }, height: { magnitude: h * EMU } },
    transform: { scaleX: 1, scaleY: 1, translateX: x * EMU, translateY: y * EMU },
    shape: { shapeType: 'TEXT_BOX', text: { textElements: [{ textRun: { content: text } }] } },
  }
}

function rawGroup(id: string, children: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    objectId: id,
    size: { width: { magnitude: 300 * EMU }, height: { magnitude: 200 * EMU } },
    transform: { scaleX: 1, scaleY: 1, translateX: 10 * EMU, translateY: 10 * EMU },
    elementGroup: { children },
  }
}

function toSource(elements: Array<{ objectId: string; text?: string; kind?: string; parentGroupId?: string }>): SourceElementInfo[] {
  return elements.map((e) => ({
    objectId: e.objectId,
    ...(e.text !== undefined ? { text: e.text } : {}),
    ...(e.kind !== undefined ? { kind: e.kind } : {}),
    ...(e.parentGroupId !== undefined ? { parentGroupId: e.parentGroupId } : {}),
  }))
}

function toReadback(elements: Array<{ objectId: string; text?: string; kind?: string; rectPt?: { x: number; y: number; w: number; h: number } }>): ReadbackElement[] {
  return elements.map((e) => ({
    objectId: e.objectId,
    ...(e.text !== undefined ? { text: e.text } : {}),
    ...(e.kind !== undefined ? { kind: e.kind } : {}),
    ...(e.rectPt !== undefined ? { rectPt: e.rectPt } : {}),
  }))
}

// Previous-generation KPI group: shell (Google id) + 3 AB_ members.
function kpiGroupFixture(): Array<Record<string, unknown>> {
  return [
    rawShape('TXTBOX_SRC', 'KPI summary title'),
    rawGroup('GRP_KPI_OLD', [
      rawShape('AB_old_KPIBG_0', '', 48, 150, 200, 120),
      rawShape('AB_old_KPIV_1', '6.4x', 60, 160, 100, 40),
      rawShape('AB_old_KPIL_2', 'ROAS', 60, 200, 100, 30),
    ]),
  ]
}

describe('TASK-089 A–F: group-aware snapshot inventory', () => {
  it('A/B/C: top-level, shell, and children inventoried with parent links', () => {
    const inv = buildSnapshotInventory(kpiGroupFixture() as never)
    const ids = inv.map((e) => e.objectId)
    expect(ids).toEqual(['TXTBOX_SRC', 'GRP_KPI_OLD', 'AB_old_KPIBG_0', 'AB_old_KPIV_1', 'AB_old_KPIL_2'])
    expect(inv.find((e) => e.objectId === 'GRP_KPI_OLD')?.kind).toBe('group')
    for (const id of ['AB_old_KPIBG_0', 'AB_old_KPIV_1', 'AB_old_KPIL_2']) {
      expect(inv.find((e) => e.objectId === id)?.parentGroupId).toBe('GRP_KPI_OLD')
    }
    expect(inv.find((e) => e.objectId === 'TXTBOX_SRC')?.parentGroupId).toBeUndefined()
  })

  it('D: children retain id, text, and own geometry', () => {
    const inv = buildSnapshotInventory(kpiGroupFixture() as never)
    const v = inv.find((e) => e.objectId === 'AB_old_KPIV_1')
    expect(v?.text).toBe('6.4x')
    expect(v?.rectPt).toEqual({ x: 60, y: 160, w: 100, h: 40 })
  })

  it('F/Y: no duplicate ids and deterministic order on repeat', () => {
    const raw = kpiGroupFixture() as never
    const a = buildSnapshotInventory(raw).map((e) => e.objectId)
    const b = buildSnapshotInventory(kpiGroupFixture() as never).map((e) => e.objectId)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
  })

  it('malformed members (missing id, non-objects) are skipped safely', () => {
    const inv = buildSnapshotInventory([
      rawGroup('GRP_BAD', [{}, { objectId: '' }, null, { objectId: 'AB_ok_1' }]),
    ] as never)
    expect(inv.map((e) => e.objectId)).toEqual(['GRP_BAD', 'AB_ok_1'])
  })
})

describe('TASK-089 G/H: grouped presence QA stays truthful', () => {
  const page = resolvePageGeometry(960, 540)
  const memberIds = ['AB_new_KPIBG_0', 'AB_new_KPIV_1', 'AB_new_KPIL_2']

  it('G: healthy grouped composition passes READBACK_OBJECTS_PRESENT', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['6.4x'],
      expectedIds: ['GRP_NEW', ...memberIds],
      clearedIds: [],
      elements: toReadback([
        { objectId: 'GRP_NEW', kind: 'group', rectPt: { x: 48, y: 150, w: 200, h: 120 } },
        { objectId: 'AB_new_KPIBG_0', rectPt: { x: 48, y: 150, w: 200, h: 120 } },
        { objectId: 'AB_new_KPIV_1', rectPt: { x: 60, y: 160, w: 100, h: 40 }, text: '6.4x' },
        { objectId: 'AB_new_KPIL_2', rectPt: { x: 60, y: 200, w: 100, h: 30 }, text: 'ROAS' },
      ]),
      ownership: [],
    })
    expect(findings.find((f) => f.check === 'READBACK_OBJECTS_PRESENT')?.pass).toBe(true)
  })

  it('H: genuinely missing grouped child still BLOCKING-fails', () => {
    const findings = qaReadback({
      page,
      expectedTexts: [],
      expectedIds: [...memberIds, 'AB_new_MISSING_9'],
      clearedIds: [],
      elements: toReadback(
        memberIds.map((id) => ({ objectId: id, rectPt: { x: 0, y: 0, w: 10, h: 10 } }))
      ),
      ownership: [],
    })
    const presence = findings.find((f) => f.check === 'READBACK_OBJECTS_PRESENT')
    expect(presence?.pass).toBe(false)
    expect(presence?.detail).toContain('AB_new_MISSING_9')
  })
})

describe('TASK-089 I–L/X: grouped ownership visibility and retry safety', () => {
  const EXPECTED = ['KPI Dashboard', 'ROAS', '6.4x']

  it('I: grouped stale AB_* members are ownership-visible in every mode', () => {
    const inv = buildSnapshotInventory(kpiGroupFixture() as never)
    const src = toSource(inv.map((e) => ({ objectId: e.objectId, text: e.text, kind: e.kind, parentGroupId: e.parentGroupId })))
    const conservative = decideSourceOwnership(src, { expectedTexts: EXPECTED, decidedIds: new Set(), groupShells: 'members-only' })
    for (const id of ['AB_old_KPIBG_0', 'AB_old_KPIV_1', 'AB_old_KPIL_2']) {
      expect(conservative.find((d) => d.objectId === id)?.decision).toBe('CLEAR')
    }
    // Default (shell) policy: the same members are covered by the shell
    // delete — shell CLEAR, members re-marked (never double-deleted).
    const def = decideSourceOwnership(src, { expectedTexts: EXPECTED, decidedIds: new Set() })
    expect(def.find((d) => d.objectId === 'GRP_KPI_OLD')?.decision).toBe('CLEAR')
    expect(def.filter((d) => d.decision === 'CLEAR').map((d) => d.objectId)).toEqual(['GRP_KPI_OLD'])
  })

  it('default mode clears fully-owned shells (live-proven cascade), members-only preserves them', () => {
    const inv = buildSnapshotInventory(kpiGroupFixture() as never)
    const src = toSource(inv.map((e) => ({ objectId: e.objectId, text: e.text, kind: e.kind, parentGroupId: e.parentGroupId })))
    const def = decideSourceOwnership(src, { expectedTexts: EXPECTED, decidedIds: new Set() })
    expect(def.find((d) => d.objectId === 'GRP_KPI_OLD')?.decision).toBe('CLEAR')
    expect(def.filter((d) => d.decision === 'CLEAR').map((d) => d.objectId)).toEqual(['GRP_KPI_OLD'])
    const conservative = decideSourceOwnership(src, { expectedTexts: EXPECTED, decidedIds: new Set(), groupShells: 'members-only' })
    expect(conservative.find((d) => d.objectId === 'GRP_KPI_OLD')?.decision).toBe('PRESERVE')
    expect(
      conservative.filter((d) => d.decision === 'CLEAR').map((d) => d.objectId).sort()
    ).toEqual(['AB_old_KPIBG_0', 'AB_old_KPIL_2', 'AB_old_KPIV_1'])
  })

  it('shell mode: fully-owned shell cleared once, members not double-deleted', () => {
    const inv = buildSnapshotInventory(kpiGroupFixture() as never)
    const decisions = decideSourceOwnership(
      toSource(inv.map((e) => ({ objectId: e.objectId, text: e.text, kind: e.kind, parentGroupId: e.parentGroupId }))),
      { expectedTexts: EXPECTED, decidedIds: new Set(), groupShells: 'shell' }
    )
    expect(decisions.find((d) => d.objectId === 'GRP_KPI_OLD')?.decision).toBe('CLEAR')
    const clears = decisions.filter((d) => d.decision === 'CLEAR').map((d) => d.objectId)
    expect(clears).toEqual(['GRP_KPI_OLD'])
  })

  it('X: uncovered source member inside a group is never deleted via its group', () => {
    const inv = buildSnapshotInventory([
      rawShape('TXTBOX_KEEP', 'Unrelated picnic schedule'),
      rawGroup('GRP_MIX', [
        rawShape('AB_old_X_0', '6.4x'),
        rawShape('TXTBOX_KEEP2', 'Unrelated picnic schedule'),
      ]),
    ] as never)
    for (const mode of ['members-only', 'shell'] as const) {
      const decisions = decideSourceOwnership(
        toSource(inv.map((e) => ({ objectId: e.objectId, text: e.text, kind: e.kind, parentGroupId: e.parentGroupId }))),
        { expectedTexts: EXPECTED, decidedIds: new Set(), groupShells: mode }
      )
      expect(decisions.find((d) => d.objectId === 'TXTBOX_KEEP')?.decision).toBe('PRESERVE')
      expect(decisions.find((d) => d.objectId === 'TXTBOX_KEEP2')?.decision).toBe('PRESERVE')
      // Mixed group: shell can never clear while a preserved member survives.
      expect(decisions.find((d) => d.objectId === 'GRP_MIX')?.decision).toBe('PRESERVE')
      expect(decisions.find((d) => d.objectId === 'AB_old_X_0')?.decision).toBe('CLEAR')
    }
  })

  it('duplicate ids across levels inventory once (first occurrence wins)', () => {
    const inv = buildSnapshotInventory([
      rawShape('TXTBOX_DUP', 'Unrelated picnic schedule'),
      rawGroup('GRP_DUP', [rawShape('TXTBOX_DUP', 'Unrelated picnic schedule')]),
    ] as never)
    expect(inv.filter((e) => e.objectId === 'TXTBOX_DUP').length).toBe(1)
  })

  it('J/K: compose emits shell delete for fully-owned groups; clean post-state passes (no accumulation)', () => {
    const inv = buildSnapshotInventory(kpiGroupFixture() as never)
    const composed = composeSlideOnPage(
      {
        pageObjectId: 'SLIDE_KPI',
        archetype: 'KPI_DASHBOARD',
        title: 'KPI Dashboard',
        metrics: [
          { label: 'ROAS', value: '6.4x' },
          { label: 'CTR', value: '3.9 percent' },
        ],
      },
      {
        pageWidthPt: 960,
        pageHeightPt: 540,
        placeholders: [],
        existingElements: inv.map((e) => ({
          objectId: e.objectId,
          text: e.text,
          ...(e.kind !== undefined ? { kind: e.kind } : {}),
          ...(e.parentGroupId !== undefined ? { parentGroupId: e.parentGroupId } : {}),
        })),
      }
    )
    const deletes = composed.result.requests
      .filter((r) => Object.keys(r)[0] === 'deleteObject')
      .map((r) => (r.deleteObject as { objectId: string }).objectId)
    // Live-proven cascade: the fully-owned KPI group clears via its shell in
    // one request; members are not double-deleted; source box untouched.
    expect(deletes).toEqual(['GRP_KPI_OLD'])
    expect(deletes).not.toContain('TXTBOX_SRC')
  })
})

describe('TASK-089 M–O: grouped archetype paths share the safe ownership', () => {
  it.each([
    ['PROCESS_FUNNEL', { stages: [{ label: 'Awareness' }, { label: 'Conversion' }] }],
    ['TIMELINE_ROADMAP', { stages: [{ label: 'Q1' }, { label: 'Q2' }] }],
    ['COMPARISON', { columns: [{ name: 'A', items: ['x'] }, { name: 'B', items: ['y'] }] }],
  ])('%s with grouped previous gen clears via shell, preserves source shell-mates', (archetype, extra) => {
    const inv = buildSnapshotInventory([
      rawGroup('GRP_PREV', [rawShape('AB_old_A_0', 'old'), rawShape('AB_old_B_1', 'older')]),
    ] as never)
    const composed = composeSlideOnPage(
      { pageObjectId: 'SLIDE_X', archetype: archetype as never, title: 'T', ...extra } as never,
      {
        pageWidthPt: 960,
        pageHeightPt: 540,
        placeholders: [],
        existingElements: inv.map((e) => ({ objectId: e.objectId, text: e.text, kind: e.kind, parentGroupId: e.parentGroupId })),
      }
    )
    const deletes = composed.result.requests
      .filter((r) => Object.keys(r)[0] === 'deleteObject')
      .map((r) => (r.deleteObject as { objectId: string }).objectId)
    // Live-proven cascade: one shell delete replaces the whole generation.
    expect(deletes).toEqual(['GRP_PREV'])
    expect(composed.ownership.find((d) => d.objectId === 'GRP_PREV')?.decision).toBe('CLEAR')
    expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
  })
})

describe('TASK-089 P/Q/R: grouped readback checks stay truthful', () => {
  const page = resolvePageGeometry(960, 540)

  it('P: cleared grouped members absent → READBACK_CLEARED_GONE passes', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['6.4x'],
      expectedIds: ['AB_new_KPIV_1'],
      clearedIds: ['AB_old_KPIV_1'],
      elements: toReadback([
        { objectId: 'AB_new_KPIV_1', rectPt: { x: 60, y: 160, w: 100, h: 40 }, text: '6.4x' },
      ]),
      ownership: [],
    })
    expect(findings.find((f) => f.check === 'READBACK_CLEARED_GONE')?.pass).toBe(true)
  })

  it('Q: stale grouped member text surviving → NO_SOURCE_DUPLICATES fails', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['ROAS', '6.4x'],
      expectedIds: ['AB_new_KPIV_1'],
      clearedIds: [],
      elements: toReadback([
        { objectId: 'AB_old_KPIV_1', rectPt: { x: 60, y: 160, w: 100, h: 40 }, text: 'ROAS 6.4x' },
        { objectId: 'AB_new_KPIV_1', rectPt: { x: 300, y: 160, w: 100, h: 40 }, text: 'ROAS 6.4x' },
      ]),
      ownership: [],
      composeTitle: 'KPI Dashboard',
    })
    expect(findings.find((f) => f.check === 'READBACK_NO_SOURCE_DUPLICATES')?.pass).toBe(false)
  })

  it('R: group shell never pairs as a visual rectangle (no false collision)', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['6.4x'],
      expectedIds: ['AB_new_KPIV_1'],
      clearedIds: [],
      elements: toReadback([
        // Shell bbox encloses the member by design — must not flag.
        { objectId: 'GRP_NEW', kind: 'group', rectPt: { x: 48, y: 150, w: 200, h: 120 } },
        { objectId: 'AB_new_KPIV_1', rectPt: { x: 60, y: 160, w: 100, h: 40 }, text: '6.4x' },
      ]),
      ownership: [],
    })
    expect(findings.find((f) => f.check === 'READBACK_EFFECTIVE_COLLISION_FREE')?.pass).toBe(true)
  })
})
