/**
 * TASK-086 Phase 23: deterministic machine benchmark (no Google traffic).
 * Runs all eight archetypes across page geometries, records per-scenario:
 * PAGE_GEOMETRY / PLACEHOLDER_OWNERSHIP / PREWRITE_QA / REFLOW_USED /
 * synthetic READBACK_QA / FINAL_GEOMETRY_STATUS.
 * Exit non-zero when any unresolved BLOCKING prewrite finding remains.
 */
import { composeSlideOnPage, type ComposeInput } from './beautify.js'
import { hasBlocking, qaReadback, resolvePageGeometry } from './geometry.js'

interface Scenario {
  name: string
  input: Omit<ComposeInput, 'pageObjectId'>
  placeholders?: Array<{ objectId: string; type: string; text: string; rect?: { x: number; y: number; w: number; h: number } }>
}

const LAYOUT_PLACEHOLDERS = [
  { objectId: 'PH_TITLE', type: 'TITLE', text: '', rect: { x: 48, y: 30, w: 864, h: 84 } },
  { objectId: 'PH_BODY', type: 'BODY', text: 'Click to add text', rect: { x: 48, y: 150, w: 864, h: 342 } },
  { objectId: 'PH_FOOTER', type: 'FOOTER', text: 'Confidential', rect: { x: 48, y: 510, w: 300, h: 20 } },
]

const TITLE_AND_BODY_PLACEHOLDERS = [
  { objectId: 'PH_TITLE', type: 'TITLE', text: '', rect: { x: 48, y: 30, w: 864, h: 84 } },
  { objectId: 'PH_BODY', type: 'BODY', text: '', rect: { x: 48, y: 150, w: 864, h: 342 } },
]

const SCENARIOS: Scenario[] = [
  { name: 'COVER', input: { archetype: 'COVER', title: 'Growth Vision 2026', subtitle: 'Digital Marketing', closing: 'Scale what compounds.' } },
  {
    name: 'EXECUTIVE_SUMMARY',
    input: { archetype: 'EXECUTIVE_SUMMARY', title: 'Priorities', bullets: ['Grow organic reach', 'Improve conversion', 'Retain customers'] },
  },
  {
    name: 'KPI_DASHBOARD',
    input: {
      archetype: 'KPI_DASHBOARD', title: 'Snapshot',
      metrics: [
        { label: 'ROAS', value: '4.0x' }, { label: 'CAC', value: 'Rp82K' },
        { label: 'CTR', value: '2.1%' }, { label: 'Revenue', value: 'Rp480M' },
        { label: 'Growth', value: '31%' }, { label: 'NPS', value: '62' },
      ],
    },
  },
  {
    name: 'PROCESS_FUNNEL',
    input: {
      archetype: 'PROCESS_FUNNEL', title: 'Acquisition Funnel',
      stages: [
        { label: 'Impressions', description: 'Top of funnel reach' },
        { label: 'Clicks', description: 'Ad engagement' },
        { label: 'Landing Page', description: 'Visit the offer' },
        { label: 'Add to Cart', description: 'Consideration' },
        { label: 'Purchases', description: 'Conversion' },
        { label: 'Repeat Purchase', description: 'Loyalty loop' },
      ],
    },
  },
  {
    name: 'COMPARISON',
    input: {
      archetype: 'COMPARISON', title: 'Channel Mix',
      columns: [
        { name: 'Meta Ads', items: ['Facebook/Instagram reach', 'ROAS 4.0x'] },
        { name: 'Google Ads', items: ['Search intent', 'CAC Rp82K'] },
        { name: 'TikTok Ads', items: ['Short video', 'CTR 2.1%'] },
        { name: 'Email Marketing', items: ['Newsletter', 'Open 31%'] },
      ],
    },
  },
  {
    name: 'TIMELINE_ROADMAP',
    input: {
      archetype: 'TIMELINE_ROADMAP', title: 'Roadmap',
      stages: [
        { label: 'Q1 Launch', description: 'Ship the MVP to early adopters' },
        { label: 'Q2 Scale', description: 'Grow to ten thousand users' },
        { label: 'Q3 Monetize', description: 'Launch paid tiers' },
        { label: 'Q4 Expand', description: 'Open two new regions' },
      ],
    },
  },
  {
    name: 'PILLARS_STRATEGY',
    input: {
      archetype: 'PILLARS_STRATEGY', title: 'Growth Ecosystem',
      columns: [
        { name: 'Content', items: ['SEO library', 'Newsletter'] },
        { name: 'Media', items: ['Paid social', 'Retargeting'] },
        { name: 'Product', items: ['Onboarding', 'Referrals'] },
      ],
    },
  },
  {
    name: 'CLOSING_INSIGHT',
    input: { archetype: 'CLOSING_INSIGHT', title: 'Takeaway', closing: 'System beats tactics when every channel compounds.', subtitle: 'Execute with focus.' },
  },
  {
    name: 'COMPARISON_LONG_HEADING',
    input: {
      archetype: 'COMPARISON', title: 'Channel Mix',
      columns: [
        { name: 'Meta Ads (Facebook/Instagram)', items: ['Feed reach', 'ROAS 4.0x'] },
        { name: 'Google Ads (Search)', items: ['Intent capture', 'CAC Rp82K'] },
      ],
    },
  },
  {
    name: 'TIMELINE_LONG_HEADING',
    input: {
      archetype: 'TIMELINE_ROADMAP', title: 'Roadmap',
      stages: [
        { label: 'Month 1: Foundation', description: 'Ship the minimum viable product' },
        { label: 'Month 2: Expansion', description: 'Grow to new segments' },
      ],
    },
  },
]

const PAGES: Array<{ label: string; w: number; h: number; placeholders: Scenario['placeholders'] }> = [
  { label: '16:9 blank 960x540', w: 960, h: 540, placeholders: [] },
  { label: '16:9 layout 960x540', w: 960, h: 540, placeholders: LAYOUT_PLACEHOLDERS },
  { label: 'TITLE_AND_BODY 960x540', w: 960, h: 540, placeholders: TITLE_AND_BODY_PLACEHOLDERS },
  { label: '16:9 small 720x405', w: 720, h: 405, placeholders: [] },
  { label: '4:3 720x540', w: 720, h: 540, placeholders: [] },
  { label: 'custom 1000x500', w: 1000, h: 500, placeholders: [] },
]

// Minimum-font boundary: a 480×270 page forces every role below absolute
// readability minimums — fail-closed (GEOMETRY_FAILED) is correct here.
const MINFONT_PAGE = { label: 'min-font boundary 480x270', w: 480, h: 270, placeholders: [] as Scenario['placeholders'] }

// Impossible-fit boundary: 300-char thesis can never fit readably —
// fail-closed (GEOMETRY_FAILED) is the CORRECT verdict, counted separately.
const IMPOSSIBLE = {
  name: 'CLOSING_IMPOSSIBLE_THESIS',
  input: {
    archetype: 'CLOSING_INSIGHT' as const,
    title: 'Takeaway',
    closing: 'Growth compounds when acquisition, activation, retention, referral and revenue loops reinforce each other across every channel and cohort quarter after quarter without pause while teams execute with discipline and focus on what matters most for durable advantage over multi-year horizons together.',
  },
}

let failures = 0
let reflowed = 0
let clearedTotal = 0
for (const page of PAGES) {
  for (const sc of SCENARIOS) {
    const composed = composeSlideOnPage(
      { pageObjectId: 'BENCH_SLIDE', ...sc.input },
      { pageWidthPt: page.w, pageHeightPt: page.h, ...(sc.placeholders || page.placeholders ? { placeholders: (sc.placeholders ?? page.placeholders) as NonNullable<Scenario['placeholders']> } : {}) }
    )
    const blocking = composed.prewriteQa.filter((f) => !f.pass && f.severity === 'BLOCKING')
    // Synthetic readback: planned placements + created ids present, cleared gone.
    // Synthetic readback: mirror executeBatch semantics — only createShape /
    // createLine replies carry objectIds (mutations address existing ids).
    const createdIds = composed.result.requests
      .map((r) => ({ kind: Object.keys(r)[0], body: r[Object.keys(r)[0]] as Record<string, unknown> }))
      .filter((e) => (e.kind === 'createShape' || e.kind === 'createLine') && typeof e.body.objectId === 'string')
      .map((e) => e.body.objectId as string)
    const clearedIds = composed.ownership.filter((d) => d.decision === 'CLEAR').map((d) => d.objectId)
    const readbackQa = qaReadback({
      page: resolvePageGeometry(page.w, page.h),
      expectedTexts: [],
      expectedIds: createdIds,
      clearedIds,
      elements: (composed.result.placed ?? []).map((p) => ({ objectId: p.id, rectPt: p.rect, ...(p.text ? { text: p.text } : {}) })),
      ownership: composed.ownership,
    })
    const readbackBlocking = readbackQa.filter((f) => !f.pass && f.severity === 'BLOCKING')
    const status = blocking.length === 0 && readbackBlocking.length === 0 ? composed.finalStatus : 'GEOMETRY_FAILED'
    if (status === 'GEOMETRY_FAILED') failures += 1
    if (composed.reflowAttempts > 1) reflowed += 1
    clearedTotal += composed.ownership.filter((d) => d.decision === 'CLEAR').length
    const ownership = composed.ownership.map((d) => `${d.type.split('_')[0]}→${d.decision}`).join(',') || 'none(blank)'
    console.log(
      `[${page.label}] ${sc.name}: aspect=${composed.layout.page.aspect} ownership=[${ownership}] ` +
      `prewrite_blocking=${blocking.length} reflows=${composed.reflowAttempts}(${composed.reflowReasons.join(';') || 'none'}) ` +
      `readback_blocking=${readbackBlocking.length} FINAL=${status}`
    )
    for (const b of [...blocking, ...readbackBlocking]) console.log(`    BLOCKING ${b.check}: ${b.detail ?? ''}`)
  }
}
console.log(failures === 0 ? 'RESPONSIVE_GEOMETRY_MACHINE_GATE_PASS' : `MACHINE GATE FAIL: ${failures} scenario(s) with unresolved BLOCKING findings`)

// Impossible-fit boundary (expected fail-closed, not counted as failure).
{
  const composed = composeSlideOnPage(
    { pageObjectId: 'BENCH_IMPOSSIBLE', ...IMPOSSIBLE.input },
    { pageWidthPt: 960, pageHeightPt: 540 }
  )
  const ok = composed.finalStatus === 'GEOMETRY_FAILED'
  console.log(`[${IMPOSSIBLE.name}] FINAL=${composed.finalStatus} (expected GEOMETRY_FAILED): ${ok ? 'FAIL_CLOSED_OK' : 'UNEXPECTED_PASS'}`)
  if (!ok) failures += 1
}

// Minimum-font boundary probe (expected fail-closed, reported separately:
// absolute readability minimums hold below ~0.625 page scale).
{
  let minfontFailed = 0
  for (const sc of SCENARIOS.slice(0, 8)) {
    const composed = composeSlideOnPage(
      { pageObjectId: 'BENCH_MINFONT', ...sc.input },
      { pageWidthPt: MINFONT_PAGE.w, pageHeightPt: MINFONT_PAGE.h }
    )
    if (composed.finalStatus === 'GEOMETRY_FAILED') minfontFailed += 1
  }
  console.log(`[${MINFONT_PAGE.label}] fail-closed=${minfontFailed}/8`)
}

const total = PAGES.length * SCENARIOS.length
console.log(`scenarios=${total} pass=${total - failures} blocking=${failures} reflowed=${reflowed} cleared_placeholders=${clearedTotal} impossible_fit=fail-closed`)
process.exit(failures === 0 ? 0 : 1)
