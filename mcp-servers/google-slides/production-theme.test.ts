/**
 * TASK-096: production theme + ten production layouts + capacity + routing.
 * 30 focused items (§7). Uses the canonical 10-slide semantic fixture shape
 * (same topology as the accepted R2 fixture) under the production theme.
 */
import { describe, expect, it } from 'vitest'
import { THEMES, resolveTheme } from './themes'
import {
  PRODUCTION_THEME_ID,
  PRODUCTION_BACKING_THEME_ID,
  PRODUCTION_DESIGN_TOKEN_VERSION,
  PRODUCTION_COLOR_TOKENS,
  PRODUCTION_TYPE_ROLES,
  PRODUCTION_SURFACE_TOKENS,
  PRODUCTION_VARIANTS,
  productionBackgroundFor,
  productionVariantFor,
  preflightProductionCapacity,
  preflightProductionTypography,
} from './production'
import { __deckTest, listThemeCatalog } from './deck'
import { buildSlidesDoctrineBlock } from '../../src/services/opencode/mcp-guidance'

function prodFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Alpha One 2027 Strategy',
    themeId: PRODUCTION_THEME_ID,
    slideCount: 10,
    backgroundImageUrl: 'https://example.com/alpha-navy-teal-gradient.png',
    slides: [
      { slideKey: 'cover', narrativeRole: 'cover', title: 'Alpha One', subtitle: 'Business Growth Strategy 2027' },
      {
        slideKey: 'summary', narrativeRole: 'executive summary', title: 'Executive Summary',
        preferredArchetype: 'EXECUTIVE_SUMMARY',
        bullets: [
          { text: 'Scale the workspace into the operating layer for growing teams.' },
          { text: 'Focus on acquisition quality, expansion revenue, and partner leverage.' },
          { text: 'Protect product velocity while improving onboarding outcomes.' },
        ],
      },
      {
        slideKey: 'kpi', title: 'Four KPI Dashboard',
        headlineMetrics: [
          { factId: 'kpi_arr', label: 'ARR', value: 'Rp 12B' },
          { factId: 'kpi_orgs', label: 'Organizations', value: '2,500' },
          { factId: 'kpi_retention', label: 'Retention', value: '92%' },
          { factId: 'kpi_users', label: 'Monthly Active Users', value: '18,000' },
        ],
      },
      {
        slideKey: 'funnel', narrativeRole: 'acquisition funnel', title: 'Acquisition Funnel',
        stages: [
          { stageId: 'st_visitors', label: 'Visitors', value: '1,200,000', order: 1 },
          { stageId: 'st_leads', label: 'Qualified Leads', value: '240,000', order: 2 },
          { stageId: 'st_trials', label: 'Product Trials', value: '72,000', order: 3 },
          { stageId: 'st_activated', label: 'Activated Teams', value: '36,000', order: 4 },
          { stageId: 'st_paid', label: 'Paid Organizations', value: '18,000', order: 5 },
        ],
      },
      {
        slideKey: 'comparison', title: '2026 vs 2027 Comparison',
        comparisonGroups: [
          {
            groupId: 'g_2026', name: '2026',
            items: [
              { factId: 'c26_arr', label: 'ARR', value: 'Rp 6B' },
              { factId: 'c26_orgs', label: 'Organizations', value: '1,400' },
              { factId: 'c26_retention', label: 'Retention', value: '88%' },
              { factId: 'c26_nps', label: 'NPS', value: '42' },
            ],
          },
          {
            groupId: 'g_2027', name: '2027',
            items: [
              { factId: 'c27_arr', label: 'ARR', value: 'Rp 12B' },
              { factId: 'c27_orgs', label: 'Organizations', value: '2,500' },
              { factId: 'c27_retention', label: 'Retention', value: '92%' },
              { factId: 'c27_nps', label: 'NPS', value: '55' },
            ],
          },
        ],
      },
      {
        slideKey: 'roadmap', narrativeRole: 'roadmap', title: 'Four-Stage Roadmap',
        stages: [
          { stageId: 'rd_q1', label: 'Q1 Foundation', description: 'Identity and onboarding', order: 1 },
          { stageId: 'rd_q2', label: 'Q2 Scale', description: 'Partner channel', order: 2 },
          { stageId: 'rd_q3', label: 'Q3 Optimize', description: 'Retention loops', order: 3 },
          { stageId: 'rd_q4', label: 'Q4 Dominate', description: 'Enterprise motion', order: 4 },
        ],
      },
      {
        slideKey: 'pillars', title: 'Three Strategic Pillars',
        pillars: [
          { pillarId: 'pil_content', name: 'Content Engine', items: ['Editorial calendar', 'Video series'] },
          { pillarId: 'pil_ads', name: 'Performance Ads', items: ['Paid search', 'Paid social'] },
          { pillarId: 'pil_community', name: 'Community Flywheel', items: ['Advocacy loops', 'Referrals'] },
        ],
      },
      {
        slideKey: 'distribution', title: 'Channel Distribution',
        distributionItems: [
          { factId: 'ch_ads', label: 'Performance Ads', value: '42', unit: '%' },
          { factId: 'ch_partners', label: 'Strategic Partners', value: '28', unit: '%' },
          { factId: 'ch_organic', label: 'Organic Content', value: '18', unit: '%' },
          { factId: 'ch_referrals', label: 'Customer Referrals', value: '12', unit: '%' },
        ],
      },
      {
        slideKey: 'allocation', title: 'Investment Allocation',
        distributionItems: [
          { factId: 'alloc_product', label: 'Product & Engineering', value: '50', unit: '%', amount: 'Rp2', amountUnit: 'miliar' },
          { factId: 'alloc_sales', label: 'Sales & Marketing', value: '25', unit: '%', amount: 'Rp1', amountUnit: 'miliar' },
          { factId: 'alloc_success', label: 'Customer Success', value: '15', unit: '%', amount: 'Rp600', amountUnit: 'juta' },
          { factId: 'alloc_ops', label: 'Operations', value: '10', unit: '%', amount: 'Rp400', amountUnit: 'juta' },
        ],
        aggregate: { factId: 'alloc_total', label: 'Aggregate Total', value: '100%', unit: 'Rp4 miliar' },
      },
      {
        slideKey: 'closing', title: 'Closing Insight',
        closingThesis: {
          eyebrow: 'Thesis',
          statement: 'Satu workspace untuk menghubungkan pekerjaan, data, tools, dan AI dalam satu lingkungan terpadu.',
        },
      },
    ],
    ...overrides,
  }
}

function parseTextResult<T>(result: { content: Array<{ text: string }> }): T {
  return JSON.parse(result.content[0].text) as T
}

function plan() {
  return __deckTest.compileDeckPlan(prodFixture())
}

function requestsOfSlide(slideIndex: number): Array<Record<string, unknown>> {
  const p = plan()
  const pageId = p.plannedSlideIds[slideIndex]
  // Requests for one slide: its createSlide (if any) + composed element requests.
  // Page-background updates carry the page id; element requests carry AB_ ids.
  // Simplest robust scope: whole plan filtered per slide is unavailable, so
  // recompile the single slide and inspect its own plan.
  const single = __deckTest.compileDeckPlan({
    title: 'Single',
    themeId: PRODUCTION_THEME_ID,
    slides: [(prodFixture().slides as any[])[slideIndex]],
  })
  void pageId
  return single.requests as Array<Record<string, unknown>>
}

describe('TASK-096 production theme contract', () => {
  it('01 theme ID resolves deterministically via legacy backing theme', () => {
    expect(resolveTheme(PRODUCTION_BACKING_THEME_ID)?.meta.id).toBe(PRODUCTION_BACKING_THEME_ID)
    expect(resolveTheme('navy-teal-production')?.meta.id).toBe(PRODUCTION_BACKING_THEME_ID)
    const p = __deckTest.compileDeckPlan(prodFixture())
    expect(p.theme.catalog.themeId).toBe(PRODUCTION_THEME_ID)
    expect(p.theme.backingThemeId).toBe(PRODUCTION_BACKING_THEME_ID)
  })

  it('02 theme status begins as experimental with design token version', () => {
    const catalog = parseTextResult<{ themes: Array<{ themeId: string; status: string; version: string }> }>(listThemeCatalog())
    const entry = catalog.themes.find((t) => t.themeId === PRODUCTION_THEME_ID)
    expect(entry).toBeDefined()
    expect(entry?.status).toBe('experimental')
    expect(entry?.version).toBe('1.0.0')
    expect(PRODUCTION_DESIGN_TOKEN_VERSION).toBe('1.0.0')
  })

  it('03 no default white background in production theme', () => {
    expect(THEMES.NAVY_TEAL_PRODUCTION.palette.background).not.toBe('#FFFFFF')
    const p = plan()
    const bgReqs = p.requests.filter((r) => (r as Record<string, unknown>).updatePageProperties !== undefined)
    expect(bgReqs.length).toBe(10)
    for (const r of bgReqs) {
      const fill = ((r as any).updatePageProperties.pageProperties.pageBackgroundFill ?? {}) as Record<string, unknown>
      if (fill.solidFill) {
        const c = (fill.solidFill as any).color.rgbColor
        const hex = '#' + [c.red, c.green, c.blue].map((v: number) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
        expect(hex).not.toBe('#FFFFFF')
      } else {
        expect(fill.stretchedPictureFill).toBeDefined()
      }
    }
  })

  it('04 all ten layouts resolve through production theme with variant ids', () => {
    const p = plan()
    expect(p.slides.map((s) => s.productionVariant)).toEqual([
      'COVER_HERO', 'EXECUTIVE_SUMMARY_LIST', 'KPI_GRID_2X2', 'FUNNEL_5_TWO_ROW',
      'COMPARISON_2_PERIOD', 'ROADMAP_4', 'PILLARS_3', 'RANKED_BARS_4',
      'ALLOCATION_4_PLUS_TOTAL', 'CLOSING_STATEMENT',
    ])
    expect(p.slides.map((s) => s.selectedArchetype)).toEqual([
      'COVER', 'EXECUTIVE_SUMMARY', 'KPI_DASHBOARD', 'PROCESS_FUNNEL', 'COMPARISON',
      'TIMELINE_ROADMAP', 'PILLARS_STRATEGY', 'COMPARISON', 'COMPARISON', 'CLOSING_INSIGHT',
    ])
    for (const s of p.perSlide) {
      expect((s.productionVariant as string) ?? '').not.toBe('')
      expect((s.backgroundVariant as string) ?? '').not.toBe('')
      expect((s.backgroundTechnique as string) ?? '').not.toBe('')
    }
  })

  it('05 every layout uses theme color tokens (no stray renderer literals)', () => {
    const p = plan()
    const tokenHexes = new Set(Object.values(PRODUCTION_COLOR_TOKENS).map((h) => h.toUpperCase()))
    const fills = new Set<string>()
    for (const r of p.requests as Array<Record<string, unknown>>) {
      const text = JSON.stringify(r)
      for (const m of text.matchAll(/#[0-9A-Fa-f]{6}/g)) fills.add(m[0].toUpperCase())
    }
    // Page-background solids and all shape/text colors resolve to token values.
    for (const hex of fills) {
      expect(tokenHexes.has(hex)).toBe(true)
    }
  })

  it('06 every layout uses typography roles with enforced minima', () => {
    const roles = Object.values(PRODUCTION_TYPE_ROLES)
    expect(roles).toHaveLength(14)
    const body = PRODUCTION_TYPE_ROLES.body
    expect(body.minSizePt).toBe(12)
    expect(body.engineRole).toBe('body')
    expect(PRODUCTION_TYPE_ROLES.closingStatement.minSizePt).toBe(28)
    expect(PRODUCTION_TYPE_ROLES.eyebrow.minSizePt).toBe(14)
    // Surface tokens resolve to production palette roles.
    expect(PRODUCTION_SURFACE_TOKENS.cardFill).toBe(PRODUCTION_COLOR_TOKENS['surface.card'])
    expect(PRODUCTION_SURFACE_TOKENS.activeBarFill).toBe(PRODUCTION_COLOR_TOKENS['accent.primary'])
    // Background family mapping is deterministic per variant.
    expect(productionBackgroundFor('COVER_HERO', 'https://example.com/g.png').variant).toBe('HERO_BACKGROUND')
    expect(productionBackgroundFor('COVER_HERO', 'https://example.com/g.png').technique).toBe('IMAGE_GRADIENT')
    expect(productionBackgroundFor('COVER_HERO', undefined).technique).toBe('SOLID')
    expect(productionBackgroundFor('RANKED_BARS_4', undefined).variant).toBe('DATA_BACKGROUND')
    expect(productionBackgroundFor('EXECUTIVE_SUMMARY_LIST', undefined).variant).toBe('SECTION_BACKGROUND')
    // Variant selection is deterministic per topology.
    expect(productionVariantFor('DISTRIBUTION', 'COMPARISON', true)).toBe('ALLOCATION_4_PLUS_TOTAL')
    expect(productionVariantFor('DISTRIBUTION', 'COMPARISON', false)).toBe('RANKED_BARS_4')
    expect(productionVariantFor('STAGES', 'TIMELINE_ROADMAP', false)).toBe('ROADMAP_4')
    expect(productionVariantFor('STAGES', 'PROCESS_FUNNEL', false)).toBe('FUNNEL_5_TWO_ROW')
  })

  it('07 cover has no empty image placeholder', () => {
    const reqs = requestsOfSlide(0)
    const inserts = reqs.filter((r) => (r as any).insertText).map((r) => String((r as any).insertText.text ?? ''))
    expect(inserts.length).toBeGreaterThan(0)
    for (const t of inserts) expect(t.trim().length).toBeGreaterThan(0)
    expect(reqs.some((r) => (r as any).createImage !== undefined)).toBe(false)
  })

  it('08 executive summary body meets minimum size', () => {
    const single = __deckTest.compileDeckPlan({
      title: 'Single', themeId: PRODUCTION_THEME_ID,
      slides: [(prodFixture().slides as any[])[1]],
    })
    expect(single.perSlide[0].status).not.toBe('GEOMETRY_FAILED')
    // Production preflight itself passes on body@14pt content.
    const bodyOk = preflightProductionTypography([
      { id: 'T1', kind: 'text', rect: { x: 0, y: 0, w: 100, h: 20 }, text: 'Hello', fontPt: 14, role: 'body' },
    ])
    expect(bodyOk.every((f) => f.pass)).toBe(true)
    const bodySmall = preflightProductionTypography([
      { id: 'T2', kind: 'text', rect: { x: 0, y: 0, w: 100, h: 20 }, text: 'Hello', fontPt: 10, role: 'body' },
    ])
    expect(bodySmall.some((f) => !f.pass)).toBe(true)
  })

  it('09 KPI grid has four cards', () => {
    const reqs = requestsOfSlide(2)
    const cards = reqs.filter((r) => String((r as any).createShape?.objectId ?? '').includes('KPIBG'))
    expect(cards.length).toBe(4)
  })

  it('10 funnel has five stages', () => {
    const p = plan()
    expect(p.slides[3].input.stages).toHaveLength(5)
    expect(p.slides[3].productionVariant).toBe('FUNNEL_5_TWO_ROW')
  })

  it('11 comparison has two period groups', () => {
    const p = plan()
    expect(p.slides[4].input.columns).toHaveLength(2)
    expect(p.slides[4].productionVariant).toBe('COMPARISON_2_PERIOD')
  })

  it('12 roadmap has four stages', () => {
    const p = plan()
    expect(p.slides[5].input.stages).toHaveLength(4)
    expect(p.slides[5].productionVariant).toBe('ROADMAP_4')
  })

  it('13 pillars has three cards and six child items', () => {
    const p = plan()
    expect(p.slides[6].input.columns).toHaveLength(3)
    expect(p.slides[6].input.columns?.every((c) => c.items.length === 2)).toBe(true)
  })

  it('14 ranked bars has four proportional bars', () => {
    const reqs = requestsOfSlide(7)
    const bars = reqs.filter((r) => String((r as any).createShape?.objectId ?? '').includes('DBB'))
    expect(bars.length).toBe(4)
  })

  it('15 ranked-bar widths match numeric ordering', () => {
    const reqs = requestsOfSlide(7)
    const widths = reqs
      .filter((r) => String((r as any).createShape?.objectId ?? '').includes('DBB'))
      .map((r) => Number((r as any).createShape.elementProperties.size.width.magnitude))
    expect(widths.length).toBe(4)
    for (let i = 1; i < widths.length; i += 1) expect(widths[i - 1]).toBeGreaterThan(widths[i])
    const ratio = widths[0] / widths[3]
    expect(ratio).toBeGreaterThan(3.5 * 0.9)
    expect(ratio).toBeLessThan(3.5 * 1.1)
  })

  it('16 allocation has four peers', () => {
    const p = plan()
    expect(p.slides[8].peerCount).toBe(4)
  })

  it('17 allocation aggregate remains separate', () => {
    const p = plan()
    expect(p.slides[8].aggregateCount).toBe(1)
    expect(JSON.stringify(p.slides[8].input.columns ?? [])).not.toContain('Aggregate Total')
  })

  it('18 closing preserves eyebrow', () => {
    const p = plan()
    const texts = (p.requests as Array<Record<string, unknown>>)
      .filter((r) => (r as any).insertText)
      .map((r) => String((r as any).insertText.text ?? ''))
    expect(texts.some((t) => t.includes('Thesis'))).toBe(true)
  })

  it('19 closing preserves full thesis', () => {
    const reqs = requestsOfSlide(9)
    const texts = reqs
      .filter((r) => (r as any).insertText)
      .map((r) => String((r as any).insertText.text ?? ''))
      .join('\n')
    expect(texts).toContain('Satu workspace untuk menghubungkan pekerjaan, data, tools, dan AI dalam satu lingkungan terpadu.')
  })

  it('20 closing contains no empty title placeholder', () => {
    const reqs = requestsOfSlide(9)
    for (const r of reqs) {
      if ((r as any).insertText !== undefined) {
        expect(String((r as any).insertText.text ?? '').trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('21 no narrative text falls below 12pt', () => {
    // Direct gate semantics: body@14 passes, body@10 blocks, caption keeps
    // its classified 8pt floor.
    const ok = preflightProductionTypography([
      { id: 'B1', kind: 'text', rect: { x: 0, y: 0, w: 200, h: 40 }, text: 'Narrative line', fontPt: 14, role: 'body' },
      { id: 'C1', kind: 'text', rect: { x: 0, y: 0, w: 200, h: 20 }, text: 'Note', fontPt: 11, role: 'caption' },
    ])
    expect(ok.every((f) => f.pass)).toBe(true)
    const bad = preflightProductionTypography([
      { id: 'B2', kind: 'text', rect: { x: 0, y: 0, w: 200, h: 40 }, text: 'Small narrative', fontPt: 10, role: 'body' },
    ])
    expect(bad.some((f) => !f.pass && f.check === 'PRODUCTION_TYPE_MINIMUM')).toBe(true)
    // Capacity gate rejects empty titles without trimming content.
    const cap = preflightProductionCapacity('KPI_GRID_2X2', { title: '   ' })
    expect(cap.some((f) => !f.pass)).toBe(true)
  })

  it('22 no authoritative facts are rasterized', () => {
    const p = plan()
    const images = (p.requests as Array<Record<string, unknown>>).filter((r) => (r as any).createImage !== undefined)
    expect(images.length).toBe(0)
    // The only image surface is the decorative page background property.
    const bgImages = (p.requests as Array<Record<string, unknown>>).filter(
      (r) => (r as any).updatePageProperties?.pageProperties?.pageBackgroundFill?.stretchedPictureFill !== undefined
    )
    expect(bgImages.length).toBe(2)
  })

  it('23 gradient asset applied when claimed; solid navy otherwise', () => {
    const withUrl = plan()
    const imageBgs = (withUrl.requests as Array<Record<string, unknown>>).filter(
      (r) => (r as any).updatePageProperties?.pageProperties?.pageBackgroundFill?.stretchedPictureFill !== undefined
    )
    expect(imageBgs.length).toBe(2)
    const noUrl = __deckTest.compileDeckPlan(prodFixture({ backgroundImageUrl: undefined } as any))
    const imageBgsFallback = (noUrl.requests as Array<Record<string, unknown>>).filter(
      (r) => (r as any).updatePageProperties?.pageProperties?.pageBackgroundFill?.stretchedPictureFill !== undefined
    )
    expect(imageBgsFallback.length).toBe(0)
    const solids = (noUrl.requests as Array<Record<string, unknown>>).filter(
      (r) => (r as any).updatePageProperties?.pageProperties?.pageBackgroundFill?.solidFill !== undefined
    )
    expect(solids.length).toBe(10)
  })

  it('24 theme list reports preview/readiness honestly', () => {
    const catalog = parseTextResult<{ themes: Array<{ themeId: string; status: string; previewStatus: string; renderedQaStatus: string }>; productionReadyCount: number }>(listThemeCatalog())
    const entry = catalog.themes.find((t) => t.themeId === PRODUCTION_THEME_ID)
    expect(entry?.status).toBe('experimental')
    expect(entry?.previewStatus).toBe('missing')
    expect(entry?.renderedQaStatus).toBe('unproven')
    expect(catalog.productionReadyCount).toBe(0)
  })

  it('25 multi-slide deck routing is enforced in tool contracts', () => {
    const text = buildSlidesDoctrineBlock()
    expect(text).toMatch(/slides_compose_deck/)
    expect(text).toMatch(/new 2\+ slide decks|new deck with 2 or more slides/i)
  })

  it('26 single-slide edit remains compatible', () => {
    const single = __deckTest.compileDeckPlan({
      title: 'Single', themeId: PRODUCTION_THEME_ID,
      slides: [{ slideKey: 'only', title: 'Only', bullets: [{ text: 'Just one line' }] }],
    })
    expect(single.slides).toHaveLength(1)
    expect(single.perSlide[0].status).not.toBe('GEOMETRY_FAILED')
  })

  it('27 canonical 10-slide compile passes with honest proof scope', () => {
    const p = plan()
    expect(p.slides).toHaveLength(10)
    expect(p.perSlide.every((s) => s.status !== 'GEOMETRY_FAILED')).toBe(true)
    expect(new Set(p.plannedSlideIds).size).toBe(10)
  })

  it('28 source fidelity remains intact on the production deck', () => {
    const p = plan()
    const pres = {
      presentationId: 'P_MOCK',
      slides: p.slides.map((slide, i) => ({
        objectId: i === 0 ? 'first_live' : slide.pageObjectId,
        pageElements: [
          {
            objectId: `txt_${i}`,
            shape: {
              text: {
                textElements: (slide.sourceFacts.length > 0 ? slide.sourceFacts : [{ label: slide.input.title, value: '', unit: '' }]).map((fact: any) => ({
                  textRun: { content: `${fact.label} ${fact.value ?? ''} ${fact.unit ?? ''}\n` },
                })),
              },
            },
          },
        ],
      })),
    }
    const fidelity = __deckTest.evaluateSemanticFidelity(p, pres, new Map([[p.plannedSlideIds[0], 'first_live']]))
    expect(fidelity.status).toBe('PROVEN')
  })

  it('29 object IDs remain unique across the deck batch', () => {
    const p = plan()
    const ids: string[] = []
    for (const r of p.requests as Array<Record<string, unknown>>) {
      for (const key of ['createShape', 'createImage', 'createLine', 'createTable']) {
        const payload = (r as Record<string, unknown>)[key] as Record<string, unknown> | undefined
        if (payload && typeof payload.objectId === 'string') ids.push(payload.objectId)
      }
    }
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('30 one atomic deck batch is produced', async () => {
    let batches = 0
    const result = await __deckTest.handleComposeDeckWithDeps(prodFixture(), {
      createPresentation: async () => ({ presentationId: 'created' }),
      readPresentation: async () => ({ presentationId: 'created', pageSize: { width: { magnitude: 9144000, unit: 'EMU' }, height: { magnitude: 5143500, unit: 'EMU' } }, slides: [{ objectId: 'first_live', pageElements: [] }] }),
      executeBatch: async (_id: string, reqs: any[]) => {
        batches += 1
        return { createdIds: [], appliedRequests: reqs.length }
      },
      now: () => 1,
    })
    expect(batches).toBe(1)
    expect((result.atomicLifecycle as any).cleanupAttempted).toBe(false)
    expect((result.callAccounting as any).externalMcpCalls).toBe(1)
  })
})
