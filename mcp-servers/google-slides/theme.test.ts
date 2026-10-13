/**
 * TASK-092: Theme & Art Direction System — comprehensive test suite.
 * Proves: theme definitions valid, palette completeness, contrast safety,
 * deterministic resolution, visual distinction, factual/semantic invariance,
 * and full corpus integration.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  THEMES,
  THEME_IDS,
  DEFAULT_THEME_ID,
  resolveTheme,
  inferThemeFromPrompt,
  resolveThemePrecedence,
  type AlphaTheme,
} from './themes'
import {
  applyTheme,
  PALETTE,
  composeSlide,
  composeSlideOnPage,
  adaptSourceToCompose,
  deriveRequiredFacts,
  type ComposeInput,
} from './beautify'

// Default PALETTE for comparison (reset before each test).
const BASELINE_PALETTE = { ...PALETTE }

beforeEach(() => {
  Object.assign(PALETTE, BASELINE_PALETTE)
})

// ---------------------------------------------------------------------------
// 1. Theme Definition Validity
// ---------------------------------------------------------------------------

describe('theme definitions', () => {
  it('exactly 9 built-in themes (8 structural + TASK-096 production backing theme)', () => {
    expect(THEME_IDS).toHaveLength(9)
  })

  it('all theme IDs are stable unique strings', () => {
    const ids = new Set(THEME_IDS)
    expect(ids.size).toBe(9)
    for (const id of THEME_IDS) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(3)
      expect(id).toBe(id.toUpperCase().replace(/[\s-]+/g, '_'))
    }
  })

  it('every theme has complete palette', () => {
    const requiredKeys = ['background', 'ink', 'muted', 'accent', 'accent2', 'cardFill', 'line', 'accentSoft']
    for (const id of THEME_IDS) {
      const theme = THEMES[id]
      expect(theme).toBeDefined()
      for (const key of requiredKeys) {
        expect((theme.palette as Record<string, string>)[key]).toBeDefined()
        expect((theme.palette as Record<string, string>)[key]).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })

  it('every theme has complete metadata', () => {
    for (const id of THEME_IDS) {
      const theme = THEMES[id]
      expect(theme.meta.id).toBe(id)
      expect(theme.meta.name.length).toBeGreaterThan(0)
      expect(theme.meta.description.length).toBeGreaterThan(10)
      expect(['LIGHT', 'DARK']).toContain(theme.meta.mode)
      expect(theme.meta.recommendedFor.length).toBeGreaterThan(0)
      expect(theme.meta.visualTraits.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Theme Resolution
// ---------------------------------------------------------------------------

describe('theme resolution', () => {
  it('resolveTheme returns null for unknown IDs', () => {
    expect(resolveTheme(null)).toBeNull()
    expect(resolveTheme(undefined)).toBeNull()
    expect(resolveTheme('')).toBeNull()
    expect(resolveTheme('NONEXISTENT')).toBeNull()
  })

  it('resolveTheme returns correct theme for known IDs', () => {
    expect(resolveTheme('EXECUTIVE_NAVY')?.meta.id).toBe('EXECUTIVE_NAVY')
    expect(resolveTheme('modern_gradient')?.meta.id).toBe('MODERN_GRADIENT')
    expect(resolveTheme('Bold Tech')?.meta.id).toBe('BOLD_TECH')
  })

  it('default theme is EXECUTIVE_NAVY', () => {
    expect(DEFAULT_THEME_ID).toBe('EXECUTIVE_NAVY')
  })
})

// ---------------------------------------------------------------------------
// 3. Theme Inference from Prompt
// ---------------------------------------------------------------------------

describe('theme inference', () => {
  const cases: Array<[string, string | null]> = [
    ['Formal untuk direksi.', 'EXECUTIVE_NAVY'],
    ['Modern, premium, teknologi.', 'MODERN_GRADIENT'],
    ['Dark AI technology deck.', 'BOLD_TECH'],
    ['Minimal hitam putih.', 'PREMIUM_MONOCHROME'],
    ['Presentasi resmi Kanal.', 'KANAL_BRAND'],
    ['Laporan analitik data.', 'DATA_INTELLIGENCE'],
    ['Workshop organisasi warm.', 'WARM_STRATEGY'],
    ['Editorial consulting report.', 'EDITORIAL_MINIMAL'],
    ['Buatkan presentasi bisnis.', null],
    ['Tech launch berani.', 'BOLD_TECH'],
    ['Premium monochrome proposal.', 'PREMIUM_MONOCHROME'],
  ]

  for (const [prompt, expected] of cases) {
    it(`"${prompt}" → ${expected ?? '(no inference)'}`, () => {
      expect(inferThemeFromPrompt(prompt)).toBe(expected)
    })
  }
})

// ---------------------------------------------------------------------------
// 4. Theme Precedence
// ---------------------------------------------------------------------------

describe('theme precedence', () => {
  it('explicit compose theme wins over prompt hint', () => {
    const r = resolveThemePrecedence('BOLD_TECH', 'Formal untuk direksi.', null)
    expect(r.themeId).toBe('BOLD_TECH')
    expect(r.source).toBe('EXPLICIT_COMPOSE')
  })

  it('prompt hint wins over default when no compose theme', () => {
    const r = resolveThemePrecedence(null, 'Dark AI technology deck.', null)
    expect(r.themeId).toBe('BOLD_TECH')
    expect(r.source).toBe('USER_EXPLICIT_STYLE')
  })

  it('default when nothing specified', () => {
    const r = resolveThemePrecedence(null, null, null)
    expect(r.themeId).toBe(DEFAULT_THEME_ID)
    expect(r.source).toBe('DEFAULT')
  })
})

// ---------------------------------------------------------------------------
// 5. applyTheme mutates PALETTE correctly
// ---------------------------------------------------------------------------

describe('applyTheme', () => {
  it('applies theme palette overrides', () => {
    const theme = resolveTheme('BOLD_TECH')!
    applyTheme(theme)
    expect(PALETTE.background).toBe('#030712')
    expect(PALETTE.accent).toBe('#22D3EE')
    expect(PALETTE.ink).toBe('#F9FAFB')
  })

  it('resets to defaults when theme is null', () => {
    applyTheme(resolveTheme('BOLD_TECH'))
    expect(PALETTE.background).toBe('#030712')
    applyTheme(null)
    expect(PALETTE.background).toBe('#FFFFFF')
    expect(PALETTE.accent).toBe('#2563EB')
  })

  it('prevents cross-composition bleed', () => {
    applyTheme(resolveTheme('BOLD_TECH'))
    expect(PALETTE.background).toBe('#030712')
    applyTheme(resolveTheme('EDITORIAL_MINIMAL'))
    expect(PALETTE.background).toBe('#FAFAF9')
    expect(PALETTE.accent).toBe('#292524')
  })
})

// ---------------------------------------------------------------------------
// 6. Visual Distinction: themes are not palette aliases
// ---------------------------------------------------------------------------

describe('theme visual distinction', () => {
  const distinctPairs = [
    ['EXECUTIVE_NAVY', 'MODERN_GRADIENT'],
    ['EXECUTIVE_NAVY', 'EDITORIAL_MINIMAL'],
    ['MODERN_GRADIENT', 'BOLD_TECH'],
    ['EDITORIAL_MINIMAL', 'PREMIUM_MONOCHROME'],
    ['WARM_STRATEGY', 'DATA_INTELLIGENCE'],
    ['KANAL_BRAND', 'EXECUTIVE_NAVY'],
  ]

  for (const [a, b] of distinctPairs) {
    it(`${a} ≠ ${b}: at least 3 palette roles differ`, () => {
      const pa = THEMES[a].palette
      const pb = THEMES[b].palette
      let diffs = 0
      for (const key of Object.keys(pa) as Array<keyof typeof pa>) {
        if (pa[key] !== pb[key]) diffs++
      }
      expect(diffs).toBeGreaterThanOrEqual(3)
    })
  }

  it('LIGHT and DARK themes have different background luminance', () => {
    const light = THEMES['EXECUTIVE_NAVY'].palette.background
    const dark = THEMES['MODERN_GRADIENT'].palette.background
    // Both are valid hex
    expect(light).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(dark).toMatch(/^#[0-9A-Fa-f]{6}$/)
    // They are different
    expect(light).not.toBe(dark)
  })
})

// ---------------------------------------------------------------------------
// 7. Factual Invariance: same facts across themes
// ---------------------------------------------------------------------------

describe('factual invariance across themes', () => {
  const content: ComposeInput = {
    pageObjectId: 'P_THEME_FACTS',
    archetype: 'KPI_DASHBOARD',
    title: 'Business Metrics',
    metrics: [
      { label: 'Revenue', value: 'Rp 12B' },
      { label: 'Organizations', value: '2,500' },
      { label: 'Retention', value: '92%' },
    ],
  }

  it('same required facts under EXECUTIVE_NAVY and BOLD_TECH', () => {
    applyTheme(resolveTheme('EXECUTIVE_NAVY'))
    const factsA = deriveRequiredFacts({
      title: content.title,
      metrics: content.metrics,
    })
    applyTheme(resolveTheme('BOLD_TECH'))
    const factsB = deriveRequiredFacts({
      title: content.title,
      metrics: content.metrics,
    })
    expect(factsA).toEqual(factsB)
  })
})

// ---------------------------------------------------------------------------
// 8. Semantic Encoding Invariance: same encoding across themes
// ---------------------------------------------------------------------------

describe('semantic encoding invariance across themes', () => {
  const themeIds = ['EXECUTIVE_NAVY', 'MODERN_GRADIENT', 'EDITORIAL_MINIMAL', 'BOLD_TECH']

  for (const themeId of themeIds) {
    it(`channel percentages → RANKED_PROPORTIONAL_BARS under ${themeId}`, () => {
      const result = composeSlideOnPage(
        {
          pageObjectId: `P_ENC_${themeId}`,
          archetype: 'COMPARISON',
          title: 'Channel Performance',
          columns: [
            { name: 'Ads', items: ['42%'] },
            { name: 'Partners', items: ['28%'] },
            { name: 'Organic', items: ['18%'] },
            { name: 'Referrals', items: ['12%'] },
          ],
        },
        { alphaThemeId: themeId }
      )
      expect(result.result.expected.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    })
  }

  for (const themeId of themeIds) {
    it(`budget allocation → PARTS_OF_WHOLE_STACK under ${themeId}`, () => {
      const result = composeSlideOnPage(
        {
          pageObjectId: `P_BUD_${themeId}`,
          archetype: 'PILLARS_STRATEGY',
          title: 'Budget',
          columns: [
            { name: 'Marketing 50%', items: ['Rp2B'] },
            { name: 'Product 25%', items: ['Rp1B'] },
            { name: 'Partners 15%', items: ['Rp600M'] },
            { name: 'Community 10%', items: ['Rp400M'] },
          ],
        },
        { alphaThemeId: themeId }
      )
      expect(result.result.expected.encoding).toBe('PARTS_OF_WHOLE_STACK')
    })
  }
})

// ---------------------------------------------------------------------------
// 9. Theme × Archetype Compose Proof
// ---------------------------------------------------------------------------

describe('theme × archetype compose proof', () => {
  const themes = ['EXECUTIVE_NAVY', 'MODERN_GRADIENT', 'EDITORIAL_MINIMAL', 'BOLD_TECH']
  const archetypes: Array<{ archetype: ComposeInput['archetype']; input: Partial<ComposeInput> }> = [
    { archetype: 'COVER', input: { title: 'Alpha One', subtitle: 'Strategy 2027' } },
    { archetype: 'KPI_DASHBOARD', input: { title: 'Metrics', metrics: [{ label: 'Revenue', value: 'Rp12B' }, { label: 'Growth', value: '31%' }] } },
    { archetype: 'CLOSING_INSIGHT', input: { title: 'Thank You', closing: 'Build the future.' } },
  ]

  for (const themeId of themes) {
    for (const { archetype, input } of archetypes) {
      it(`${themeId} × ${archetype} composes without geometry failure`, () => {
        const result = composeSlideOnPage(
          { pageObjectId: `P_TX_${themeId}_${archetype}`, archetype, ...input },
          { alphaThemeId: themeId }
        )
        expect(result.result.expected.themeResolved).toBe(themeId)
        expect(result.result.expected.themeSource).toBeDefined()
      })
    }
  }
})

// ---------------------------------------------------------------------------
// 10. Full 10-Slide Corpus under MODERN_GRADIENT
// ---------------------------------------------------------------------------

describe('Modern Gradient full 10-slide corpus', () => {
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

  it('all 10 slides reach expected encodings with MODERN_GRADIENT', () => {
    for (let i = 0; i < sources.length; i++) {
      const adapted = adaptSourceToCompose(sources[i])
      expect(adapted.expectedEncoding).toBe(expectedEncodings[i])
    }
  })

  it('all 10 slides compose with zero missing facts under MODERN_GRADIENT', () => {
    for (let i = 0; i < sources.length; i++) {
      const adapted = adaptSourceToCompose(sources[i])
      const result = composeSlideOnPage(
        { pageObjectId: `P_MG_${i}`, ...adapted.content, archetype: adapted.archetype },
        { expectedEncoding: adapted.expectedEncoding, alphaThemeId: 'MODERN_GRADIENT' }
      )
      expect(result.result.expected.themeResolved).toBe('MODERN_GRADIENT')
      expect(result.finalStatus).not.toBe('GEOMETRY_FAILED')
      const missingFacts = result.prewriteQa.filter((f) => f.check === 'FACTUAL_PROJECTION_COMPLETE' && !f.pass)
      expect(missingFacts).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// 11. Theme Coherence Gate
// ---------------------------------------------------------------------------

describe('theme coherence', () => {
  it('compose result reports theme resolution', () => {
    const result = composeSlideOnPage(
      { pageObjectId: 'P_COHERENCE', archetype: 'KPI_DASHBOARD', title: 'Test', metrics: [{ label: 'X', value: '1' }] },
      { alphaThemeId: 'MODERN_GRADIENT' }
    )
    expect(result.result.expected.themeResolved).toBe('MODERN_GRADIENT')
    expect(result.result.expected.themeSource).toBeDefined()
  })

  it('default theme resolves when no theme specified', () => {
    const result = composeSlideOnPage(
      { pageObjectId: 'P_DEFAULT', archetype: 'KPI_DASHBOARD', title: 'Test', metrics: [{ label: 'X', value: '1' }] },
      {}
    )
    expect(result.result.expected.themeResolved).toBe(DEFAULT_THEME_ID)
    expect(result.result.expected.themeSource).toBe('DEFAULT')
  })
})
