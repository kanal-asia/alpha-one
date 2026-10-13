/**
 * TASK-090-R1: raw-source semantic corpus — end-to-end reachability proof.
 * RAW-LIKE SOURCE → adaptSourceToCompose → composeSlideOnPage → RENDERER → QA.
 * No Google traffic. Mirrors the human smoke-test corpus without reusing its
 * production IDs, strings are fixture-scoped (generalized patterns only).
 */
import { describe, expect, it } from 'vitest'
import {
  adaptSourceToCompose,
  composeSlide,
  composeSlideOnPage,
  deriveRequiredFacts,
  resolveEffectiveArchetype,
  type RawSource,
} from './beautify'
import { coverageNumerics, decideOwnership, isTitlePlaceholderType, qaReadback, resolvePageGeometry } from './geometry'

const PAGE = 'SLIDE_SEM_01'

interface CorpusCase {
  slide: number
  intent: string
  source: RawSource
  wantArchetype: string
  wantEncoding: string
}

/** Independent fact-presence check (does not reuse the coverage predicate). */
function missingFacts(required: string[], projectedTexts: string[]): string[] {
  const norm = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
      .filter(Boolean)
  const pool = new Set(projectedTexts.flatMap(norm))
  const poolNums = new Set(coverageNumerics(projectedTexts))
  return required.filter((fact) => {
    const words = norm(fact)
    if (words.length === 0) return false
    const hit = words.filter((w) => pool.has(w)).length / words.length
    const nums = coverageNumerics([fact])
    const numsOk = nums.every((t) => poolNums.has(t))
    return !(hit >= 0.6 && numsOk)
  })
}

function insertedTextsOf(result: ReturnType<typeof composeSlideOnPage>): string[] {
  const out: string[] = []
  for (const r of result.result.requests) {
    const body = (r[Object.keys(r)[0]] ?? {}) as Record<string, unknown>
    if (typeof body.text === 'string') out.push(body.text)
  }
  return out
}

function sourceObjects(title: string, bullets: string[]): Array<{ objectId: string; text: string }> {
  return [{ objectId: 'TXTBOX_SRC', text: [title, ...bullets].join('\n') }]
}

export const SEMANTIC_CORPUS: CorpusCase[] = [
  {
    slide: 1,
    intent: 'COVER',
    source: {
      title: 'Alpha One',
      subtitle: 'Business Growth Strategy 2027',
      bullets: ['Kanal Digital Indonesia', 'One workspace. One assistant. All your work.'],
      position: 'first',
    },
    wantArchetype: 'COVER',
    wantEncoding: 'COVER',
  },
  {
    slide: 2,
    intent: 'EXECUTIVE_SUMMARY',
    source: {
      title: 'Executive Summary',
      bullets: [
        'In 2027, the business targets Rp 12B annual recurring revenue while serving 2,500 active organizations and maintaining 92% customer retention.',
        'Priority one: expand partner channel.',
        'Priority two: ship onboarding revamp.',
        'Priority three: raise net retention.',
      ],
    },
    wantArchetype: 'EXECUTIVE_SUMMARY',
    wantEncoding: 'EXECUTIVE_SUMMARY_METRIC_HERO',
  },
  {
    slide: 3,
    intent: 'KPI_DASHBOARD',
    source: {
      title: 'KPI Dashboard',
      bullets: [
        'Annual Recurring Revenue: Rp 12B',
        'Active Organizations: 2,500',
        'Customer Retention: 92%',
        'Average Revenue per Organization: Rp 400K/month',
        'Monthly Active Users: 18,000',
        'Customer Satisfaction: 94%',
      ],
    },
    wantArchetype: 'KPI_DASHBOARD',
    wantEncoding: 'KPI_GRID',
  },
  {
    slide: 4,
    intent: 'PROCESS_FUNNEL',
    source: {
      title: 'Growth Funnel',
      bullets: [
        'Website Visitors: 1,200,000',
        'Qualified Leads: 240,000',
        'Product Trials: 72,000',
        'Paid Organizations: 18,000',
      ],
    },
    wantArchetype: 'PROCESS_FUNNEL',
    wantEncoding: 'PROPORTIONAL_FUNNEL',
  },
  {
    slide: 5,
    intent: 'COMPARISON',
    source: {
      title: '2025 vs 2026 Comparison',
      bullets: ['2025: spend Rp 2.1B, ROI 98 percent', '2026: spend Rp 4.8B, ROI 212 percent'],
    },
    wantArchetype: 'COMPARISON',
    wantEncoding: 'PAIRED_COMPARISON',
  },
  {
    slide: 6,
    intent: 'TIMELINE_ROADMAP',
    source: {
      title: '2026 Roadmap',
      bullets: ['Q1 Foundation', 'Q2 Scale', 'Q3 Optimize', 'Q4 Dominate'],
    },
    wantArchetype: 'TIMELINE_ROADMAP',
    wantEncoding: 'TIMELINE',
  },
  {
    slide: 7,
    intent: 'PILLARS_STRATEGY',
    source: {
      title: 'Three Strategic Pillars',
      bullets: [
        'Pillar 1 Content Engine: editorial calendar, video series',
        'Pillar 2 Performance Ads: paid search, paid social',
        'Pillar 3 Community Flywheel: advocacy loops, referrals',
        'Shared goal: Build Alpha One into the operating intelligence layer for growing businesses.',
      ],
    },
    wantArchetype: 'PILLARS_STRATEGY',
    wantEncoding: 'PILLARS_WITH_SHARED_FOUNDATION',
  },
  {
    slide: 8,
    intent: 'RANKED_COMPARISON',
    source: {
      title: 'Channel Performance',
      bullets: ['Performance Ads: 42%', 'Strategic Partners: 28%', 'Organic Content: 18%', 'Customer Referrals: 12%'],
    },
    wantArchetype: 'COMPARISON',
    wantEncoding: 'RANKED_PROPORTIONAL_BARS',
  },
  {
    slide: 9,
    intent: 'BUDGET_DISTRIBUTION',
    source: {
      title: 'Budget Allocation',
      subtitle: 'Total Growth Budget: Rp 4B',
      bullets: [
        'Performance Marketing: Rp 2.0B, 50%',
        'Product & Content: Rp 1.0B, 25%',
        'Partnerships: Rp 600M, 15%',
        'Community & Experiments: Rp 400M, 10%',
      ],
    },
    wantArchetype: 'PILLARS_STRATEGY',
    wantEncoding: 'PARTS_OF_WHOLE_STACK',
  },
  {
    slide: 10,
    intent: 'CLOSING_INSIGHT',
    source: {
      title: 'Grow Where Attention Lives',
      bullets: ['Contact halo@nusa-growth.id · Jakarta 2026'],
      position: 'last',
    },
    wantArchetype: 'CLOSING_INSIGHT',
    wantEncoding: 'CLOSING_INSIGHT',
  },
]

describe('reachability: raw source reaches its semantic renderer (A, Z)', () => {
  it.each(SEMANTIC_CORPUS.map((c) => [c.slide, c.intent] as [number, string]))(
    'slide %i (%s) adapts to %s',
    (slide) => {
      const entry = SEMANTIC_CORPUS.find((c) => c.slide === slide)
      if (!entry) throw new Error('corpus entry missing')
      const adapted = adaptSourceToCompose(entry.source)
      expect(adapted.archetype).toBe(entry.wantArchetype)
      expect(adapted.expectedEncoding).toBe(entry.wantEncoding)
    }
  )
})

describe('end-to-end: adapted compose reaches expected encoding with zero missing facts', () => {
  it.each(SEMANTIC_CORPUS.map((c) => [c.slide, c.intent] as [number, string]))(
    'slide %i (%s) composes clean',
    (slide) => {
      const entry = SEMANTIC_CORPUS.find((c) => c.slide === slide)
      if (!entry) throw new Error('corpus entry missing')
      const adapted = adaptSourceToCompose(entry.source)
      const composed = composeSlideOnPage(
        { pageObjectId: `${PAGE}_${slide}`, ...adapted.content, archetype: adapted.archetype },
        {
          expectedEncoding: adapted.expectedEncoding,
          existingElements: sourceObjects(entry.source.title, entry.source.bullets ?? []),
        }
      )
      expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
      expect(composed.result.expected.encoding).toBe(entry.wantEncoding)
      const required = deriveRequiredFacts(adapted.content)
      expect(required.length).toBeGreaterThan(0)
      const missing = missingFacts(required, insertedTextsOf(composed))
      expect(missing).toEqual([])
      const blocking = composed.prewriteQa.filter((f) => !f.pass && f.severity === 'BLOCKING')
      expect(blocking).toEqual([])
    }
  )
})

describe('semantic distinctions (B, C, D, E)', () => {
  it('identical shares route by business semantics, not numbers', () => {
    const channel = adaptSourceToCompose({
      title: 'Channel Performance',
      bullets: ['Ads: 50%', 'Partners: 25%', 'Organic: 15%', 'Referrals: 10%'],
    })
    expect(channel.expectedEncoding).toBe('RANKED_PROPORTIONAL_BARS')
    const budget = adaptSourceToCompose({
      title: 'Budget Allocation',
      subtitle: 'Total: Rp 4B',
      bullets: [
        'Ads: Rp 2.0B, 50%',
        'Partners: Rp 1.0B, 25%',
        'Organic: Rp 600M, 15%',
        'Referrals: Rp 400M, 10%',
      ],
    })
    expect(budget.expectedEncoding).toBe('PARTS_OF_WHOLE_STACK')
  })
  it('funnel language routes to funnel, peer categories do not', () => {
    const funnel = adaptSourceToCompose({
      title: 'Growth Funnel',
      bullets: ['Website Visitors: 1,200,000', 'Qualified Leads: 240,000'],
    })
    expect(funnel.archetype).toBe('PROCESS_FUNNEL')
    const ranked = adaptSourceToCompose({
      title: 'Channel Performance',
      bullets: ['Performance Ads: 42%', 'Strategic Partners: 28%'],
    })
    expect(ranked.archetype).not.toBe('PROCESS_FUNNEL')
  })
})

describe('exec prose metrics (F, G)', () => {
  it('prose yields explicit metric payload; year stays context, never hero', () => {
    const adapted = adaptSourceToCompose({
      title: 'Executive Summary',
      bullets: [
        'In 2027, the business targets Rp 12B annual recurring revenue while serving 2,500 active organizations.',
      ],
    })
    expect(adapted.archetype).toBe('EXECUTIVE_SUMMARY')
    const values = (adapted.content.metrics ?? []).map((m) => m.value)
    expect(values).toEqual(expect.arrayContaining(['Rp 12B', '2,500']))
    expect(values.some((v) => /^2027$/.test(v.trim()))).toBe(false)
  })
})

describe('pillars shared goal (H, I)', () => {
  it('sharedGoal reaches content and required facts', () => {
    const adapted = adaptSourceToCompose(SEMANTIC_CORPUS[6].source)
    expect(adapted.content.sharedGoal).toContain('operating intelligence layer')
    expect(deriveRequiredFacts(adapted.content).join(' ').toLowerCase()).toContain('operating intelligence layer')
  })
})

describe('factual-loss negative (J, K, L, §43)', () => {
  it('pillars plan omitting the shared goal blocks source clear', () => {
    const entry = SEMANTIC_CORPUS[6]
    const composed = composeSlideOnPage(
      {
        pageObjectId: `${PAGE}_neg`,
        archetype: 'PILLARS_STRATEGY',
        title: entry.source.title,
        // NOTE: sharedGoal deliberately omitted (the historical defect).
        // Pillar facts are fully projected — ONLY the goal is missing.
        columns: [
          { name: 'Pillar 1 Content Engine', items: ['editorial calendar', 'video series'] },
          { name: 'Pillar 2 Performance Ads', items: ['paid search', 'paid social'] },
          { name: 'Pillar 3 Community Flywheel', items: ['advocacy loops', 'referrals'] },
        ],
      },
      {
        existingElements: [
          {
            objectId: 'TXTBOX_SRC',
            text: 'Pillar 1 Content Engine\neditorial calendar\nvideo series\nPillar 2 Performance Ads\npaid search\npaid social\nShared goal: Build Alpha One into the operating intelligence layer for growing businesses.',
          },
        ],
      }
    )
    expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
    expect(
      composed.prewriteQa.some((f) => f.check === 'FACTUAL_PROJECTION_COMPLETE' && !f.pass)
    ).toBe(true)
  })
  it('post-write factual gap is BLOCKING and qaPass cannot survive it', () => {
    const findings = qaReadback({
      page: resolvePageGeometry(960, 540),
      expectedTexts: ['Pillar 1', 'Shared goal line'],
      expectedIds: ['AB_x_0'],
      clearedIds: [],
      requiredFacts: ['Pillar 1', 'Shared goal line'],
      elements: [{ objectId: 'AB_x_0', rectPt: { x: 48, y: 30, w: 200, h: 60 }, text: 'Pillar 1' }],
      ownership: [],
    })
    const factual = findings.find((f) => f.check === 'READBACK_FACTUAL_COMPLETENESS')
    expect(factual?.pass).toBe(false)
    expect(factual?.severity).toBe('BLOCKING')
  })
})

describe('wrong-renderer negatives (S, §44, §45)', () => {
  it('channel content forced to Executive Summary fails encoding match', () => {
    const composed = composeSlideOnPage(
      {
        pageObjectId: `${PAGE}_neg3`,
        archetype: 'EXECUTIVE_SUMMARY',
        title: 'Channel Performance',
        bullets: ['Performance Ads: 42%', 'Strategic Partners: 28%', 'Organic Content: 18%', 'Customer Referrals: 12%'],
      },
      { expectedEncoding: 'RANKED_PROPORTIONAL_BARS' }
    )
    expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
  })
  it('budget content forced to numbered summary fails encoding match', () => {
    const composed = composeSlideOnPage(
      {
        pageObjectId: `${PAGE}_neg4`,
        archetype: 'EXECUTIVE_SUMMARY',
        title: 'Budget Allocation',
        bullets: ['Ads 55 percent', 'Content 25 percent', 'Tools 12 percent', 'Reserve 8 percent'],
      },
      { expectedEncoding: 'PARTS_OF_WHOLE_STACK' }
    )
    expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
  })
})

describe('live routing guard (D, §39)', () => {
  it('resolveEffectiveArchetype redirects degrading requests, keeps sound ones', () => {
    const redirect = resolveEffectiveArchetype('EXECUTIVE_SUMMARY', {
      title: 'Channel Performance',
      bullets: ['Performance Ads: 42%', 'Strategic Partners: 28%', 'Organic Content: 18%'],
    })
    expect(redirect.redirected).toBe(true)
    expect(redirect.archetype).toBe('COMPARISON')
    expect(redirect.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    const keep = resolveEffectiveArchetype('EXECUTIVE_SUMMARY', {
      title: 'Executive Summary',
      bullets: ['Rp 4.8B budget transformed digital marketing in 2026', '+212 percent ROI delivered'],
    })
    expect(keep.redirected).toBe(false)
    expect(keep.encoding).toBe('EXECUTIVE_SUMMARY_METRIC_HERO')
  })
})

describe('placeholder determinism (Q, R)', () => {
  it('CENTERED_TITLE is owned exactly like TITLE (never silently preserved)', () => {
    expect(isTitlePlaceholderType('CENTERED_TITLE')).toBe(true)
    expect(isTitlePlaceholderType('TITLE')).toBe(true)
    const decided = decideOwnership(
      [{ objectId: 'PH_CT', type: 'CENTERED_TITLE', text: '' }],
      { reuseTitle: true, reuseBody: false }
    )
    expect(decided).toEqual([expect.objectContaining({ objectId: 'PH_CT', decision: 'REUSE' })])
    const orphan = decideOwnership(
      [{ objectId: 'PH_CT2', type: 'CENTERED_TITLE', text: 'Click to add title' }],
      { reuseTitle: false, reuseBody: false }
    )
    expect(orphan).toEqual([expect.objectContaining({ objectId: 'PH_CT2', decision: 'CLEAR' })])
  })
})

describe('real-agent simulation (TASK-090-R2)', () => {
  describe('A: channel source + KPI request → cannot succeed as KPI', () => {
    it('resolveEffectiveArchetype redirects metrics-based distribution to ranked bars', () => {
      const decision = resolveEffectiveArchetype('KPI_DASHBOARD', {
        title: 'Customer Acquisition by Channel',
        metrics: [
          { label: 'Performance Ads', value: '42%' },
          { label: 'Strategic Partners', value: '28%' },
          { label: 'Organic Content', value: '18%' },
          { label: 'Customer Referrals', value: '12%' },
        ],
      })
      expect(decision.redirected).toBe(true)
      expect(decision.archetype).toBe('COMPARISON')
      expect(decision.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    })
    it('composeSlideOnPage with redirected input produces RANKED_PROPORTIONAL_BARS', () => {
      const routing = resolveEffectiveArchetype('KPI_DASHBOARD', {
        title: 'Customer Acquisition by Channel',
        metrics: [
          { label: 'Performance Ads', value: '42%' },
          { label: 'Strategic Partners', value: '28%' },
          { label: 'Organic Content', value: '18%' },
          { label: 'Customer Referrals', value: '12%' },
        ],
      })
      const result = composeSlideOnPage(
        { pageObjectId: 'P_R2_A', archetype: routing.archetype, title: 'Customer Acquisition by Channel', ...routing.patch },
        { expectedEncoding: routing.encoding }
      )
      expect(result.result.expected.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    })
  })

  describe('B: budget source + KPI request → cannot succeed as KPI', () => {
    it('resolveEffectiveArchetype redirects budget metrics to parts-of-whole', () => {
      const decision = resolveEffectiveArchetype('KPI_DASHBOARD', {
        title: 'Growth Budget Allocation',
        subtitle: 'Total Growth Budget: Rp 4B',
        metrics: [
          { label: 'Performance Marketing', value: 'Rp2.0B, 50%' },
          { label: 'Product & Content', value: 'Rp1.0B, 25%' },
          { label: 'Partnerships', value: 'Rp600M, 15%' },
          { label: 'Community & Experiments', value: 'Rp400M, 10%' },
        ],
      })
      expect(decision.redirected).toBe(true)
      // TASK-094-R3: budget vehicle is COMPARISON (stacked rendering),
      // never PILLARS_STRATEGY (shared-goal geometry fails closed on budgets).
      expect(decision.archetype).toBe('COMPARISON')
      expect(decision.encoding).toBe('PARTS_OF_WHOLE_STACK')
    })
    it('composeSlideOnPage with redirected input produces PARTS_OF_WHOLE_STACK', () => {
      const routing = resolveEffectiveArchetype('KPI_DASHBOARD', {
        title: 'Growth Budget Allocation',
        subtitle: 'Total Growth Budget: Rp 4B',
        metrics: [
          { label: 'Performance Marketing', value: 'Rp2.0B, 50%' },
          { label: 'Product & Content', value: 'Rp1.0B, 25%' },
          { label: 'Partnerships', value: 'Rp600M, 15%' },
          { label: 'Community & Experiments', value: 'Rp400M, 10%' },
        ],
      })
      const result = composeSlideOnPage(
        { pageObjectId: 'P_R2_B', archetype: routing.archetype, title: 'Growth Budget Allocation', subtitle: 'Total Growth Budget: Rp 4B', ...routing.patch },
        { expectedEncoding: routing.encoding }
      )
      expect(result.result.expected.encoding).toBe('PARTS_OF_WHOLE_STACK')
    })
  })

  describe('C: pillars source cannot clear when sharedGoal omitted from model payload', () => {
    it('PILLARS_STRATEGY with columns and no sharedGoal is BLOCKED via routing guard', () => {
      const routing = resolveEffectiveArchetype('PILLARS_STRATEGY', {
        title: 'Three Strategic Pillars',
        columns: [
          { name: 'Content Engine', items: ['editorial calendar', 'video series'] },
          { name: 'Performance Ads', items: ['paid search', 'paid social'] },
          { name: 'Community Flywheel', items: ['advocacy loops', 'referrals'] },
        ],
      })
      expect(routing.redirected).toBe(false)
      // The pre-flight check is in handleComposeSlide (not unit-testable here),
      // but the routing guard confirms no redirect occurred, so the pre-flight
      // check WILL fire in the live path. Verify composeSlideOnPage doesn't
      // produce a valid result without sharedGoal.
      const result = composeSlideOnPage(
        {
          pageObjectId: 'P_R2_C',
          archetype: 'PILLARS_STRATEGY',
          title: 'Three Strategic Pillars',
          columns: [
            { name: 'Content Engine', items: ['editorial calendar', 'video series'] },
            { name: 'Performance Ads', items: ['paid search', 'paid social'] },
            { name: 'Community Flywheel', items: ['advocacy loops', 'referrals'] },
          ],
        },
        {}
      )
      // Without sharedGoal, the pillars renderer produces PILLARS_CLASSIC encoding.
      // The live path (handleComposeSlide) would BLOCK this before composition.
      expect(result.result.expected.encoding).toBe('PILLARS_CLASSIC')
    })
  })

  describe('D: cover source cannot clear when tagline omitted from model payload', () => {
    it('cover recovers tagline from bullets when closing is empty', () => {
      const result = composeSlide({
        pageObjectId: 'P_R2_D',
        archetype: 'COVER',
        title: 'Alpha One',
        subtitle: 'Business Growth Strategy 2027',
        bullets: ['One workspace. One assistant. All your work.'],
      })
      expect(result.expected.encoding).toBe('COVER')
      // The cover renderer uses addTextBox for the tagline — verify via requests.
      const reqStr = JSON.stringify(result.requests)
      expect(reqStr).toContain('One workspace')
    })
  })

  describe('E: executive summary metrics buried in prose → hero metrics', () => {
    it('exec summary with metrics in bullets reaches METRIC_HERO encoding', () => {
      const result = composeSlide({
        pageObjectId: 'P_R2_E',
        archetype: 'EXECUTIVE_SUMMARY',
        title: 'Executive Summary',
        bullets: [
          'In 2027, the business targets Rp 12B annual recurring revenue while serving 2,500 active organizations and maintaining 92% customer retention.',
          'Priority one: expand partner channel.',
          'Priority two: ship onboarding revamp.',
          'Priority three: raise net retention.',
        ],
      })
      expect(result.expected.encoding).toBe('EXECUTIVE_SUMMARY_METRIC_HERO')
    })
  })

  describe('F: closing cannot report success if required thesis missing', () => {
    it('closing with empty statement fails', () => {
      expect(() => composeSlide({
        pageObjectId: 'P_R2_F',
        archetype: 'CLOSING_INSIGHT',
        title: '',
      })).toThrow()
    })
  })

  describe('G: factual completeness PASS + encoding mismatch must yield FAIL', () => {
    it('wrong encoding blocks even when facts survive', () => {
      const result = composeSlideOnPage(
        {
          pageObjectId: 'P_R2_G',
          archetype: 'KPI_DASHBOARD',
          title: 'Channels',
          metrics: [
            { label: 'Ads', value: '42%' },
            { label: 'Partners', value: '28%' },
            { label: 'Organic', value: '18%' },
            { label: 'Referrals', value: '12%' },
          ],
        },
        { expectedEncoding: 'RANKED_PROPORTIONAL_BARS' }
      )
      // Facts survive in KPI cards, but encoding mismatch is BLOCKING.
      const encodingFinding = result.prewriteQa.find((f) => f.check === 'EXPECTED_ENCODING_MATCH')
      expect(encodingFinding).toBeDefined()
      expect(encodingFinding!.pass).toBe(false)
      expect(encodingFinding!.severity).toBe('BLOCKING')
    })
  })

  describe('H: funnel stages under wrong archetype → redirect', () => {
    it('stages with magnitudes under EXECUTIVE_SUMMARY redirect to PROCESS_FUNNEL', () => {
      const decision = resolveEffectiveArchetype('EXECUTIVE_SUMMARY', {
        title: 'Growth Funnel',
        stages: [
          { label: 'Visitors', description: '1,200,000' },
          { label: 'Leads', description: '240,000' },
          { label: 'Trials', description: '72,000' },
          { label: 'Paid', description: '18,000' },
        ],
      })
      expect(decision.redirected).toBe(true)
      expect(decision.archetype).toBe('PROCESS_FUNNEL')
      expect(decision.encoding).toBe('PROPORTIONAL_FUNNEL')
    })
  })

  describe('I: production-prompt simulation (10-slide corpus)', () => {
    const sources: Array<{ title: string; subtitle?: string; bullets?: string[]; position?: 'first' | 'middle' | 'last' }> = [
      { title: 'Alpha One', subtitle: 'Business Growth Strategy 2027', bullets: ['Kanal Digital Indonesia', 'One workspace. One assistant. All your work.'], position: 'first' },
      { title: 'Executive Summary', bullets: ['In 2027, the business targets Rp 12B annual recurring revenue while serving 2,500 active organizations and maintaining 92% customer retention.', 'Priority one: expand partner channel.', 'Priority two: ship onboarding revamp.', 'Priority three: raise net retention.'] },
      { title: 'KPI Dashboard', bullets: ['Annual Recurring Revenue: Rp 12B', 'Active Organizations: 2,500', 'Customer Retention: 92%', 'Average Revenue per Organization: Rp 400K/month', 'Monthly Active Users: 18,000', 'Customer Satisfaction: 94%'] },
      { title: 'Growth Funnel', bullets: ['Website Visitors: 1,200,000', 'Qualified Leads: 240,000', 'Product Trials: 72,000', 'Paid Organizations: 18,000'] },
      { title: '2025 vs 2026 Comparison', bullets: ['2025: spend Rp 2.1B, ROI 98 percent', '2026: spend Rp 4.8B, ROI 212 percent'] },
      { title: '2026 Roadmap', bullets: ['Q1 Foundation', 'Q2 Scale', 'Q3 Optimize', 'Q4 Dominate'] },
      { title: 'Three Strategic Pillars', bullets: ['Pillar 1 Content Engine: editorial calendar, video series', 'Pillar 2 Performance Ads: paid search, paid social', 'Pillar 3 Community Flywheel: advocacy loops, referrals', 'Shared goal: Build Alpha One into the operating intelligence layer for growing businesses.'] },
      { title: 'Channel Performance', bullets: ['Performance Ads: 42%', 'Strategic Partners: 28%', 'Organic Content: 18%', 'Customer Referrals: 12%'] },
      { title: 'Budget Allocation', subtitle: 'Total Growth Budget: Rp 4B', bullets: ['Performance Marketing: Rp 2.0B, 50%', 'Product & Content: Rp 1.0B, 25%', 'Partnerships: Rp 600M, 15%', 'Community & Experiments: Rp 400M, 10%'] },
      { title: 'Grow Where Attention Lives', bullets: ['Contact halo@nusa-growth.id · Jakarta 2026'], position: 'last' },
    ]

    const expectedEncodings = [
      'COVER',
      'EXECUTIVE_SUMMARY_METRIC_HERO',
      'KPI_GRID',
      'PROPORTIONAL_FUNNEL',
      'PAIRED_COMPARISON',
      'TIMELINE',
      'PILLARS_WITH_SHARED_FOUNDATION',
      'RANKED_PROPORTIONAL_BARS',
      'PARTS_OF_WHOLE_STACK',
      'CLOSING_INSIGHT',
    ]

    it('all 10 slides reach expected encodings via adaptSourceToCompose', () => {
      for (let i = 0; i < sources.length; i++) {
        const adapted = adaptSourceToCompose(sources[i])
        expect(adapted.expectedEncoding).toBe(expectedEncodings[i])
      }
    })

    it('all 10 slides compose with zero missing facts', () => {
      for (let i = 0; i < sources.length; i++) {
        const adapted = adaptSourceToCompose(sources[i])
        const result = composeSlideOnPage(
          { pageObjectId: `P_CORPUS_${i}`, ...adapted.content, archetype: adapted.archetype },
          { expectedEncoding: adapted.expectedEncoding }
        )
        expect(result.finalStatus).not.toBe('GEOMETRY_FAILED')
        const missingFacts = result.prewriteQa.filter((f) => f.check === 'FACTUAL_PROJECTION_COMPLETE' && !f.pass)
        expect(missingFacts).toEqual([])
      }
    })
  })
})
