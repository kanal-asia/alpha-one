/**
 * TASK-086R2-R1 Phase 9: source-ownership regression — existing-slide Beautify
 * must REPLACE the source structure, never strand it next to the composition.
 *
 * Reproduced human failure: EXECUTIVE_SUMMARY compose on a slide holding one
 * source textbox yielded 11 new AB_* elements PLUS the surviving original
 * textbox (elementCount 12), while internal QA still reported qaPass:true /
 * GEOMETRY_PROVEN. Pure construction + simulated readback — no Google traffic.
 */
import { describe, expect, it } from 'vitest'
import { composeSlideOnPage, composeQaPass, expectedTextsOf } from './beautify'
import {
  decideSourceOwnership,
  isCoveredSourceText,
  qaReadback,
  resolvePageGeometry,
  sourceCoverage,
  type SourceElementInfo,
} from './geometry'

const PAGE = 'SLIDE_SRC_01'
const SRC_TEXT = 'Executive Summary\nIn 2026 Nusantara Growth Labs transformed digital marketing with a 4.8B budget, delivering 212 percent ROI and 1.4M total reach.'
const SRC_BOX: SourceElementInfo = { objectId: 'TXTBOX_SRC_1', text: SRC_TEXT }

const INPUT = {
  pageObjectId: PAGE,
  archetype: 'EXECUTIVE_SUMMARY' as const,
  title: 'Executive Summary',
  bullets: [
    'In 2026 Nusantara Growth Labs transformed digital marketing with a 4.8B budget, delivering 212 percent ROI and 1.4M total reach.',
  ],
}

function requestTargets(result: ReturnType<typeof composeSlideOnPage>): Array<{ kind: string; objectId: unknown }> {
  return result.result.requests.map((r) => {
    const kind = Object.keys(r)[0]
    return { kind, objectId: (r[kind] as Record<string, unknown>).objectId }
  })
}

describe('decideSourceOwnership: reproduced source textbox is cleared, nothing else touched', () => {
  it('covered source textbox → CLEAR; image-like and uncovered content → PRESERVE', () => {
    const decisions = decideSourceOwnership(
      [
        SRC_BOX,
        { objectId: 'IMG_LOGO', text: '' },
        { objectId: 'TXTBOX_OTHER', text: 'Unrelated quarterly picnic schedule for the Bandung office outing.' },
      ],
      { expectedTexts: expectedTextsOf(INPUT), decidedIds: new Set() }
    )
    expect(decisions.find((d) => d.objectId === 'TXTBOX_SRC_1')?.decision).toBe('CLEAR')
    expect(decisions.find((d) => d.objectId === 'IMG_LOGO')?.decision).toBe('PRESERVE')
    expect(decisions.find((d) => d.objectId === 'TXTBOX_OTHER')?.decision).toBe('PRESERVE')
  })

  it('previous-generation AB_* ids → CLEAR even when text is uncovered (no accumulation)', () => {
    const decisions = decideSourceOwnership(
      [{ objectId: 'AB_oldtag_TITLE_0', text: 'Stale composed title' }],
      { expectedTexts: ['Completely different new title'], decidedIds: new Set() }
    )
    expect(decisions[0]?.decision).toBe('CLEAR')
  })

  it('already-decided placeholders are never double-decided', () => {
    const decisions = decideSourceOwnership(
      [{ objectId: 'PH_TITLE', text: 'Executive Summary', placeholderType: 'TITLE' }],
      { expectedTexts: expectedTextsOf(INPUT), decidedIds: new Set(['PH_TITLE']) }
    )
    expect(decisions).toEqual([])
  })
})

describe('composeSlideOnPage: source CLEAR rides the first chunk', () => {
  it('deleteObject for the source textbox is emitted before any create', () => {
    const composed = composeSlideOnPage(INPUT, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      placeholders: [],
      existingElements: [SRC_BOX],
    })
    expect(composed.ownership).toContainEqual(
      expect.objectContaining({ objectId: 'TXTBOX_SRC_1', decision: 'CLEAR' })
    )
    const ops = requestTargets(composed)
    expect(ops[0]).toEqual({ kind: 'deleteObject', objectId: 'TXTBOX_SRC_1' })
    expect(ops.filter((o) => o.kind === 'deleteObject').map((o) => o.objectId)).toEqual(['TXTBOX_SRC_1'])
  })

  it('blank-slide path (no existingElements) emits no source deletions', () => {
    const composed = composeSlideOnPage(INPUT, { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] })
    expect(composed.ownership.find((d) => d.type === 'SOURCE_TEXT')).toBeUndefined()
    expect(requestTargets(composed).filter((o) => o.kind === 'deleteObject')).toEqual([])
  })
})

describe('qaReadback: surviving source content is a BLOCKING duplicate', () => {
  const page = resolvePageGeometry(960, 540)
  const expectedTexts = expectedTextsOf(INPUT)
  const newIds = ['AB_newtag_TITLE_0', 'AB_newtag_BODY_0']

  it('post-state WITH the surviving source textbox fails READBACK_NO_SOURCE_DUPLICATES', () => {
    const findings = qaReadback({
      page,
      expectedTexts,
      expectedIds: newIds,
      clearedIds: ['TXTBOX_SRC_1'],
      elements: [
        { objectId: 'TXTBOX_SRC_1', rectPt: { x: 48, y: 150, w: 400, h: 200 }, text: SRC_TEXT },
        ...newIds.map((id) => ({ objectId: id, rectPt: { x: 48, y: 30, w: 100, h: 40 }, text: 'Executive Summary' })),
      ],
      ownership: [{ objectId: 'TXTBOX_SRC_1', type: 'SOURCE_TEXT', decision: 'CLEAR', reason: 'test' }],
    })
    const dup = findings.find((f) => f.check === 'READBACK_NO_SOURCE_DUPLICATES')
    expect(dup?.pass).toBe(false)
    expect(dup?.detail).toContain('TXTBOX_SRC_1')
  })

  it('post-state with a surviving previous-generation AB_* id fails (no accumulation)', () => {
    const findings = qaReadback({
      page,
      expectedTexts,
      expectedIds: newIds,
      clearedIds: ['AB_oldtag_TITLE_0'],
      elements: [
        { objectId: 'AB_oldtag_TITLE_0', rectPt: { x: 48, y: 30, w: 100, h: 40 }, text: 'Executive Summary' },
        ...newIds.map((id) => ({ objectId: id, rectPt: { x: 48, y: 200, w: 100, h: 40 }, text: 'Executive Summary' })),
      ],
      ownership: [],
    })
    expect(findings.find((f) => f.check === 'READBACK_NO_SOURCE_DUPLICATES')?.pass).toBe(false)
  })

  it('clean post-state (only new objects) passes every check', () => {
    const findings = qaReadback({
      page,
      expectedTexts,
      expectedIds: newIds,
      clearedIds: ['TXTBOX_SRC_1'],
      composeTitle: 'Executive Summary',
      elements: [
        { objectId: newIds[0], rectPt: { x: 48, y: 30, w: 800, h: 84 }, text: 'Executive Summary' },
        { objectId: newIds[1], rectPt: { x: 48, y: 150, w: 800, h: 300 }, text: INPUT.bullets[0] },
      ],
      ownership: [{ objectId: 'TXTBOX_SRC_1', type: 'SOURCE_TEXT', decision: 'CLEAR', reason: 'test' }],
    })
    expect(findings.filter((f) => !f.pass)).toEqual([])
  })

  it('E. preserved non-AB survivor overlapping new content fails READBACK_EFFECTIVE_COLLISION_FREE', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['Executive Summary'],
      expectedIds: ['AB_newtag_TITLE_0'],
      clearedIds: [],
      elements: [
        // Preserved (title not contained, minority coverage): overlaps the title.
        { objectId: 'TXTBOX_KEEP', rectPt: { x: 40, y: 20, w: 300, h: 100 }, text: 'Picnic schedule Bandung outing' },
        { objectId: 'AB_newtag_TITLE_0', rectPt: { x: 48, y: 30, w: 800, h: 84 }, text: 'Executive Summary' },
      ],
      ownership: [{ objectId: 'TXTBOX_KEEP', type: 'SOURCE_TEXT', decision: 'PRESERVE', reason: 'test' }],
    })
    const dup = findings.find((f) => f.check === 'READBACK_NO_SOURCE_DUPLICATES')
    expect(dup?.pass).toBe(true)
    const col = findings.find((f) => f.check === 'READBACK_EFFECTIVE_COLLISION_FREE')
    expect(col?.pass).toBe(false)
    expect(col?.detail).toContain('TXTBOX_KEEP×AB_newtag_TITLE_0')
    expect(composeQaPass([{ check: 'content-preserved', pass: true }], findings)).toBe(false)
  })

  it('F. disjoint preserved content passes collision QA (preservation respected)', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['Executive Summary'],
      expectedIds: ['AB_newtag_TITLE_0'],
      clearedIds: [],
      elements: [
        { objectId: 'TXTBOX_KEEP', rectPt: { x: 48, y: 400, w: 300, h: 100 }, text: 'Picnic schedule Bandung outing' },
        { objectId: 'AB_newtag_TITLE_0', rectPt: { x: 48, y: 30, w: 800, h: 84 }, text: 'Executive Summary' },
      ],
      ownership: [{ objectId: 'TXTBOX_KEEP', type: 'SOURCE_TEXT', decision: 'PRESERVE', reason: 'test' }],
    })
    expect(findings.find((f) => f.check === 'READBACK_EFFECTIVE_COLLISION_FREE')?.pass).toBe(true)
  })

  it('designed same-center containment (badge number in ellipse) is not a collision', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['1'],
      expectedIds: ['AB_t_NUMBG_1', 'AB_t_NUM_2'],
      clearedIds: [],
      elements: [
        { objectId: 'AB_t_NUM_2', rectPt: { x: 36, y: 148.5, w: 21, h: 21 }, text: '1' },
      ],
      ownership: [],
    })
    expect(
      findings.find((f) => f.check === 'READBACK_OBJECTS_PRESENT')?.pass
    ).toBe(false)
    expect(findings.find((f) => f.check === 'READBACK_EFFECTIVE_COLLISION_FREE')?.pass).toBe(true)
  })
})

describe('composeQaPass: plan QA alone can never report PROVEN over blocking readback', () => {
  it('false when readback carries a blocking duplicate; true when readback is clean', () => {
    const page = resolvePageGeometry(960, 540)
    const bad = qaReadback({
      page,
      expectedTexts: expectedTextsOf(INPUT),
      expectedIds: ['AB_newtag_TITLE_0'],
      clearedIds: [],
      elements: [
        { objectId: 'TXTBOX_SRC_1', rectPt: { x: 48, y: 150, w: 400, h: 200 }, text: SRC_TEXT },
        { objectId: 'AB_newtag_TITLE_0', rectPt: { x: 48, y: 30, w: 100, h: 40 }, text: 'Executive Summary' },
      ],
      ownership: [],
    })
    expect(composeQaPass([{ check: 'content-preserved', pass: true }], bad)).toBe(false)
    const good = qaReadback({
      page,
      expectedTexts: ['Executive Summary'],
      expectedIds: ['AB_newtag_TITLE_0'],
      clearedIds: [],
      elements: [{ objectId: 'AB_newtag_TITLE_0', rectPt: { x: 48, y: 30, w: 100, h: 40 }, text: 'Executive Summary' }],
      ownership: [],
    })
    expect(composeQaPass([{ check: 'content-preserved', pass: true }], good)).toBe(true)
  })
})

describe('coverage predicate: title anchor + numeric backstop (C1 reproduced 0.769 case)', () => {
  // BENCH2 slide 2 reality: plan paraphrase drops 6 low-signal words
  // (nusantara,growth,labs,with,a,and) → 0.769 word coverage. The required
  // title is stable, so the heading anchor owns the element deterministically.
  const BENCH_TITLE = 'Executive Summary'
  const BENCH_EXPECTED = [
    'Executive Summary',
    '1',
    'Rp 4.8B budget transformed digital marketing in 2026',
    '2',
    'Delivering +212 percent ROI',
    '3',
    '1.4M total reach across all channels',
  ]
  it('paraphrased source containing the title → CLEAR via heading anchor', () => {
    expect(isCoveredSourceText(SRC_TEXT, BENCH_EXPECTED, BENCH_TITLE)).toBe(true)
  })
  it('compose title flows into decideSourceOwnership: BENCH2 source → CLEAR', () => {
    const decisions = decideSourceOwnership(
      [{ objectId: 'TXTBOX_1789145741516_529372', text: SRC_TEXT }],
      { expectedTexts: BENCH_EXPECTED, decidedIds: new Set(), composeTitle: BENCH_TITLE }
    )
    expect(decisions).toEqual([
      expect.objectContaining({ objectId: 'TXTBOX_1789145741516_529372', decision: 'CLEAR' }),
    ])
  })
  it('uncovered box with dropped numeric facts → PRESERVE (no content loss)', () => {
    const decisions = decideSourceOwnership(
      [{ objectId: 'TXTBOX_FACT', text: 'Secret launch budget Rp 9.9B approved March 3' }],
      { expectedTexts: BENCH_EXPECTED, decidedIds: new Set(), composeTitle: BENCH_TITLE }
    )
    expect(decisions[0]?.decision).toBe('PRESERVE')
  })
  it('majority-covered box with intact numerics → CLEAR via content backstop', () => {
    expect(
      isCoveredSourceText('Delivering +212 percent ROI with 1.4M reach', ['Delivering +212 percent ROI', '1.4M reach'], 'Other Title')
    ).toBe(true)
  })
})

describe('coverage predicate boundaries', () => {
  it('exact match clears; partial minority coverage preserves; wordless never clears', () => {
    expect(isCoveredSourceText('Executive Summary', ['Executive Summary'])).toBe(true)
    expect(isCoveredSourceText('Picnic schedule for the Bandung office outing decided Tuesday', ['Executive Summary'])).toBe(false)
    expect(isCoveredSourceText('', ['Executive Summary'])).toBe(false)
    expect(sourceCoverage('', ['x'])).toBe(-1)
  })
})
