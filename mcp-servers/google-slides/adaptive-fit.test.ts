/**
 * TASK-086R1 §18: adaptive long-text fit + ownership completeness tests.
 * Coupled title/body layout, timeline node layout, bounded redistribution,
 * hierarchy minimums, and integrity — all through composeSlideOnPage.
 */
import { describe, expect, it } from 'vitest'
import {
  checkOwnershipCompleteness,
  layoutColumnSet,
  layoutTitledColumn,
  layoutTimelineNode,
  rebalanceColumnWidths,
  checkCollisions,
  ROLE_MIN_FONT,
  type PlacedElement,
} from './geometry'
import { composeSlideOnPage } from './beautify'

const PAGE = 'SLIDE_ADAPT_01'

function compose(input: Parameters<typeof composeSlideOnPage>[0], w = 960, h = 540, placeholders: Parameters<typeof composeSlideOnPage>[1]['placeholders'] = []) {
  return composeSlideOnPage(
    { pageObjectId: PAGE, ...input },
    { pageWidthPt: w, pageHeightPt: h, ...(placeholders.length > 0 ? { placeholders } : {}) }
  )
}

function placedByPrefix(composed: ReturnType<typeof composeSlideOnPage>, prefix: string) {
  return (composed.result.placed ?? []).filter((p) => p.id.includes(prefix))
}

describe('ownership completeness (§18.6)', () => {
  it('every inventoried placeholder is classified; gaps are BLOCKING', () => {
    const placeholders = [
      { objectId: 'A', type: 'TITLE', text: '' },
      { objectId: 'B', type: 'BODY', text: '' },
    ]
    expect(
      checkOwnershipCompleteness(placeholders, [
        { objectId: 'A', type: 'TITLE', decision: 'CLEAR', reason: 't' },
      ]).pass
    ).toBe(false)
    expect(
      checkOwnershipCompleteness(placeholders, [
        { objectId: 'A', type: 'TITLE', decision: 'CLEAR', reason: 't' },
        { objectId: 'B', type: 'BODY', decision: 'CLEAR', reason: 't' },
      ]).pass
    ).toBe(true)
  })
  it('compose output always carries completeness evidence', () => {
    const composed = compose({ archetype: 'COMPARISON', title: 'T', columns: [{ name: 'A', items: ['x'] }, { name: 'B', items: ['y'] }] })
    expect(composed.prewriteQa.find((f) => f.check === 'OWNERSHIP_COMPLETENESS')?.pass).toBe(true)
  })
})

describe('long card headings (§18.8–13)', () => {
  const cols = [
    { name: 'Meta Ads', items: ['Reach', 'ROAS 4.0x'] },
    { name: 'Google Ads', items: ['Search', 'CAC Rp82K'] },
    { name: 'TikTok Ads', items: ['Video', 'CTR 2.1%'] },
    { name: 'Email Marketing', items: ['News', 'Open 31%'] },
  ]
  it('short headers keep base typography (slack before shrink)', () => {
    const composed = compose({
      archetype: 'COMPARISON', title: 'T',
      columns: [
        { name: 'A', items: ['x'] },
        { name: 'B', items: ['y'] },
      ],
    })
    const headers = placedByPrefix(composed, 'COLH')
    expect(headers.length).toBe(2)
    for (const hh of headers) expect(hh.fontPt).toBe(20)
  })
  it('Meta Ads (Facebook/Instagram): wraps, body moves down, gap preserved', () => {
    const long = [
      { name: 'Meta Ads (Facebook/Instagram)', items: ['Reach across feeds', 'Stories plus reels'] },
      { name: 'Google Ads', items: ['Search', 'Shopping'] },
    ]
    const composed = compose({ archetype: 'COMPARISON', title: 'Channels', columns: long })
    expect(composed.prewriteQa.filter((f) => !f.pass && f.severity === 'BLOCKING')).toEqual([])
    const header = placedByPrefix(composed, 'COLH0_')[0]
    const firstItem = placedByPrefix(composed, 'COLI0_')[0]
    expect(header).toBeDefined()
    expect(firstItem).toBeDefined()
    // Body starts below the MEASURED header plus the minimum gap (8pt @1x).
    expect(firstItem.rect.y).toBeGreaterThanOrEqual(header.rect.y + header.rect.h + 8 - 1.01)
    // No overlap between wrapped header and first item.
    expect(firstItem.rect.y).toBeGreaterThanOrEqual(header.rect.y + header.rect.h - 1.01)
  })
  it('font reduction stops at the card-heading minimum', () => {
    const fit = layoutTitledColumn({
      headerText: 'Supercalifragilisticexpialidocious marketing internationalization',
      headerBaseFontPt: 20,
      headerMinFontPt: ROLE_MIN_FONT.cardHeading,
      headerWidthPt: 60,
      headerTopPadPt: 12,
      minHeaderHPt: 44,
      headerPadPt: 6,
      minGapPt: 8,
      itemCount: 2,
      itemRowHPt: 36,
      maxTotalHPt: 200,
    })
    expect(fit.ok).toBe(false)
    expect(fit.headerFontPt).toBeGreaterThanOrEqual(ROLE_MIN_FONT.cardHeading)
  })
  it('impossible column fit is best-effort with ok:false for fail-closed QA', () => {
    const set = layoutColumnSet({
      columns: [{ headerText: 'Supercalifragilisticexpialidocious', itemCount: 6 }],
      availW: 120,
      availH: 100,
      gap: 24,
      minColW: 100,
      headerInsetPt: 28,
      headerBaseFontPt: 20,
      headerMinFontPt: ROLE_MIN_FONT.cardHeading,
      headerTopPadPt: 12,
      minHeaderHPt: 44,
      headerPadPt: 6,
      headerGapPt: 8,
      itemRowHPt: 36,
      minBgHPt: 300,
    })
    expect(set.ok).toBe(false)
  })
})

describe('comparison coherence (§18.14–16)', () => {
  it('bounded redistribution preserves totals and minimums without collision', () => {
    const widths = rebalanceColumnWidths({
      needs: [120, 460, 120],
      availW: 864,
      gap: 24,
      minW: 120,
    })
    expect(widths.reduce((s, w) => s + w, 0) + 2 * 24).toBeCloseTo(864, 5)
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(120 - 1e-9)
    // Laid-out columns at these widths do not collide.
    let x = 48
    const placed: PlacedElement[] = widths.map((w, i) => {
      const el: PlacedElement = { id: `col${i}`, kind: 'shape', rect: { x, y: 190, w, h: 300 } }
      x += w + 24
      return el
    })
    const findings = checkCollisions(placed)
    expect(findings.every((f) => f.pass)).toBe(true)
  })
  it('equal widths retained when nothing needs more', () => {
    expect(rebalanceColumnWidths({ needs: [100, 100], availW: 864, gap: 24, minW: 120 })).toEqual([420, 420])
  })
})

describe('timeline long labels (§18.17–20)', () => {
  function timeline(label: string, desc: string) {
    return compose({
      archetype: 'TIMELINE_ROADMAP',
      title: 'Roadmap',
      stages: [
        { label, description: desc },
        { label: 'Q2 Scale', description: 'Grow steadily' },
      ],
    })
  }
  it('Month 1: Foundation fits with separated description', () => {
    const composed = timeline('Month 1: Foundation', 'Ship the minimum viable product to early adopters')
    expect(composed.prewriteQa.filter((f) => !f.pass && f.severity === 'BLOCKING')).toEqual([])
    const label = placedByPrefix(composed, 'TLL0_')[0]
    const desc = placedByPrefix(composed, 'TLD0_')[0]
    expect(label).toBeDefined()
    expect(desc).toBeDefined()
    // Description starts below the measured label plus the minimum gap.
    expect(desc.rect.y).toBeGreaterThanOrEqual(label.rect.y + label.rect.h + 6 - 1.01)
  })
  it('alternating geometry holds: above block clears the line, below starts under it', () => {
    const composed = timeline('Month 1: Foundation begins here', 'First description text')
    const lineY = 150 + 170
    const labelAbove = placedByPrefix(composed, 'TLL0_')[0]
    const labelBelow = placedByPrefix(composed, 'TLL1_')[0]
    expect(labelAbove.rect.y + labelAbove.rect.h).toBeLessThan(lineY - 11)
    expect(labelBelow.rect.y).toBeGreaterThan(lineY + 11)
  })
})

describe('adaptive-fit integrity (§18.21–22)', () => {
  it('fitting never alters source text', () => {
    const columns = [
      { name: 'Meta Ads (Facebook/Instagram)', items: ['Reach Rp120M', 'Growth 31%'] },
      { name: 'Google Ads', items: ['Search', 'Q3 push'] },
    ]
    const composed = compose({ archetype: 'COMPARISON', title: 'T', columns })
    const inserted = (composed.result.placed ?? []).map((p) => p.text ?? '')
    for (const needle of ['Meta Ads (Facebook/Instagram)', 'Reach Rp120M', 'Growth 31%', 'Q3 push']) {
      expect(inserted.some((t) => t.includes(needle))).toBe(true)
    }
  })
})
