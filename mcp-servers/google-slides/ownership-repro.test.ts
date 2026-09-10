/**
 * TASK-086R1 Phase 1: ownership reproduction — drive composeSlideOnPage with
 * realistic TITLE_SLIDE / TITLE_AND_BODY snapshots and prove what happens to
 * every native placeholder (REUSE mutations? CLEAR deletions? survivors?).
 * These tests FAIL if the ownership path leaks an orphan; they pin the fix.
 */
import { describe, expect, it } from 'vitest'
import { composeSlideOnPage } from './beautify'
import { decideOwnership, qaReadback, resolvePageGeometry, type PlaceholderInfo } from './geometry'

const PAGE = 'SLIDE_REPRO_01'

const TITLE_SLIDE: PlaceholderInfo[] = [
  { objectId: 'PH_TITLE', type: 'TITLE', text: '', rect: { x: 48, y: 30, w: 864, h: 84 } },
  { objectId: 'PH_SUB', type: 'SUBTITLE', text: 'Click to add text', rect: { x: 48, y: 150, w: 864, h: 200 } },
  { objectId: 'PH_FOOT', type: 'FOOTER', text: 'Confidential', rect: { x: 48, y: 510, w: 300, h: 20 } },
  { objectId: 'PH_NUM', type: 'SLIDE_NUMBER', text: '', rect: { x: 880, y: 510, w: 32, h: 20 } },
]

function requestKindsAndTargets(result: ReturnType<typeof composeSlideOnPage>): Array<{ kind: string; objectId: unknown }> {
  return result.result.requests.map((r) => {
    const kind = Object.keys(r)[0]
    return { kind, objectId: (r[kind] as Record<string, unknown>).objectId }
  })
}

describe('Phase 1 repro: TITLE_SLIDE + COVER composition', () => {
  it('every placeholder gets an explicit decision, none implicit', () => {
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'COVER', title: 'Growth Vision', subtitle: 'Digital Marketing', closing: 'Scale.' },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: TITLE_SLIDE }
    )
    const decided = new Set(composed.ownership.map((d) => d.objectId))
    for (const p of TITLE_SLIDE) expect(decided.has(p.objectId)).toBe(true)
    expect(composed.ownership).toEqual([
      expect.objectContaining({ objectId: 'PH_TITLE', decision: 'REUSE' }),
      expect.objectContaining({ objectId: 'PH_SUB', decision: 'CLEAR' }),
      expect.objectContaining({ objectId: 'PH_FOOT', decision: 'PRESERVE' }),
      expect.objectContaining({ objectId: 'PH_NUM', decision: 'PRESERVE' }),
    ])
  })

  it('REUSE emits set-text mutations; CLEAR emits deleteObject; no custom TITLE box', () => {
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'COVER', title: 'Growth Vision', subtitle: 'Digital Marketing', closing: 'Scale.' },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: TITLE_SLIDE }
    )
    const ops = requestKindsAndTargets(composed)
    // REUSE: deleteText ALL + insertText + style + paragraph on PH_TITLE
    expect(ops.filter((o) => o.objectId === 'PH_TITLE').map((o) => o.kind)).toEqual(
      expect.arrayContaining(['deleteText', 'insertText'])
    )
    // CLEAR: deleteObject on the orphan subtitle
    expect(ops).toContainEqual({ kind: 'deleteObject', objectId: 'PH_SUB' })
    // No competing custom TITLE box (titles tracked once, via REUSE)
    expect(composed.result.expected.titles).toEqual(['Growth Vision'])
  })

  it('simulated post-state readback has no orphans and passes', () => {
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'COVER', title: 'Growth Vision', subtitle: 'Digital Marketing', closing: 'Scale.' },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: TITLE_SLIDE }
    )
    // Simulate authoritative post-state: TITLE carries the title, SUBTITLE
    // deleted, FOOTER/NUMBER intact, custom objects present (deduplicated —
    // one request batch yields several requests per created object).
    const createdIds = [...new Set(
      composed.result.requests
        .map((r) => (r[Object.keys(r)[0]] as Record<string, unknown>).objectId)
        .filter((id): id is string => typeof id === 'string' && !String(id).startsWith('PH_'))
    )]
    const findings = qaReadback({
      page: resolvePageGeometry(960, 540),
      expectedTexts: ['Growth Vision'],
      expectedIds: createdIds,
      clearedIds: ['PH_SUB'],
      elements: [
        { objectId: 'PH_TITLE', rectPt: { x: 48, y: 30, w: 864, h: 84 }, text: 'Growth Vision', placeholderType: 'TITLE' },
        { objectId: 'PH_FOOT', rectPt: { x: 48, y: 510, w: 300, h: 20 }, text: 'Confidential', placeholderType: 'FOOTER' },
        ...createdIds.map((id) => ({ objectId: id, rectPt: { x: 60, y: 200, w: 100, h: 40 }, text: '' })),
      ],
      ownership: composed.ownership,
    })
    expect(findings.filter((f) => !f.pass)).toEqual([])
  })

  it('oversized title falls back to CLEAR + custom title (no duplicate)', () => {
    const tinyTitle: PlaceholderInfo[] = [
      { objectId: 'PH_TITLE', type: 'TITLE', text: '', rect: { x: 48, y: 30, w: 200, h: 30 } },
    ]
    const longTitle = 'Growth compounds across every channel and cohort quarter after quarter without pause ever'
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'COVER', title: longTitle },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: tinyTitle }
    )
    const dec = composed.ownership.find((d) => d.objectId === 'PH_TITLE')
    expect(dec?.decision).toBe('CLEAR')
    const ops = requestKindsAndTargets(composed)
    expect(ops).toContainEqual({ kind: 'deleteObject', objectId: 'PH_TITLE' })
    // Custom title box still created exactly once.
    expect(composed.result.expected.titles).toEqual([longTitle])
  })
})

describe('Phase 1 repro: duplicate TITLE placeholders cannot strand an orphan', () => {
  it('second TITLE placeholder is cleared when orphan, preserved when contentful', () => {
    const dupes: PlaceholderInfo[] = [
      { objectId: 'PH_T1', type: 'TITLE', text: '' },
      { objectId: 'PH_T2', type: 'TITLE', text: '' },
      { objectId: 'PH_T3', type: 'TITLE', text: 'Template kicker' },
    ]
    // First TITLE reuses; the rest must never inherit an unexecuted REUSE.
    const decisions = decideOwnership(dupes, { reuseTitle: true, reuseBody: false })
    expect(decisions[0]?.decision).toBe('REUSE')
    // NOTE: current implementation returns REUSE for all three — this test
    // documents the gap the corrective must close (only one REUSE executable).
    const reuseCount = decisions.filter((d) => d.decision === 'REUSE').length
    expect(reuseCount).toBe(1)
  })
})
