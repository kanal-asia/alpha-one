import { describe, expect, it } from 'vitest'
import { listThemeCatalog, __deckTest } from './deck'

function parseTextResult<T>(result: { content: Array<{ text: string }> }): T {
  return JSON.parse(result.content[0].text) as T
}

function baseDeck(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'R1 Contract Deck',
    themeId: 'ALPHA_LIGHT_EXECUTIVE',
    slides: [{ slideKey: 'cover', title: 'Cover', narrativeRole: 'cover' }],
    ...overrides,
  }
}

function r1Fixture(): Record<string, unknown> {
  return {
    title: 'Alpha One 2027 Strategy',
    themeId: 'ALPHA_LIGHT_EXECUTIVE',
    slideCount: 10,
    slides: [
      { slideKey: 'cover', narrativeRole: 'cover', title: 'Alpha One', subtitle: 'Business Growth Strategy 2027' },
      {
        slideKey: 'summary',
        narrativeRole: 'executive summary',
        title: 'Executive Summary',
        preferredArchetype: 'EXECUTIVE_SUMMARY',
        bullets: [
          { text: 'Scale the workspace into the operating layer for growing teams.' },
          { text: 'Focus on acquisition quality, expansion revenue, and partner leverage.' },
          { text: 'Protect product velocity while improving onboarding outcomes.' },
        ],
      },
      {
        slideKey: 'kpi',
        title: 'Four KPI Dashboard',
        headlineMetrics: [
          { factId: 'kpi_arr', label: 'ARR', value: 'Rp 12B' },
          { factId: 'kpi_orgs', label: 'Organizations', value: '2,500' },
          { factId: 'kpi_retention', label: 'Retention', value: '92%' },
          { factId: 'kpi_users', label: 'Monthly Active Users', value: '18,000' },
        ],
      },
      {
        slideKey: 'funnel',
        narrativeRole: 'acquisition funnel',
        title: 'Acquisition Funnel',
        stages: [
          { stageId: 'st_visitors', label: 'Visitors', value: '1,200,000', order: 1 },
          { stageId: 'st_leads', label: 'Qualified Leads', value: '240,000', order: 2 },
          { stageId: 'st_trials', label: 'Product Trials', value: '72,000', order: 3 },
          { stageId: 'st_activated', label: 'Activated Teams', value: '36,000', order: 4 },
          { stageId: 'st_paid', label: 'Paid Organizations', value: '18,000', order: 5 },
        ],
      },
      {
        slideKey: 'comparison',
        title: '2026 vs 2027 Comparison',
        comparisonGroups: [
          {
            groupId: 'g_2026',
            name: '2026',
            items: [
              { factId: 'c26_arr', label: 'ARR', value: 'Rp 6B' },
              { factId: 'c26_orgs', label: 'Organizations', value: '1,400' },
              { factId: 'c26_retention', label: 'Retention', value: '88%' },
              { factId: 'c26_nps', label: 'NPS', value: '42' },
            ],
          },
          {
            groupId: 'g_2027',
            name: '2027',
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
        slideKey: 'roadmap',
        narrativeRole: 'roadmap',
        title: 'Four-Stage Roadmap',
        stages: [
          { stageId: 'rd_q1', label: 'Q1 Foundation', description: 'Identity and onboarding', order: 1 },
          { stageId: 'rd_q2', label: 'Q2 Scale', description: 'Partner channel', order: 2 },
          { stageId: 'rd_q3', label: 'Q3 Optimize', description: 'Retention loops', order: 3 },
          { stageId: 'rd_q4', label: 'Q4 Dominate', description: 'Enterprise motion', order: 4 },
        ],
      },
      {
        slideKey: 'pillars',
        title: 'Three Strategic Pillars',
        pillars: [
          { pillarId: 'pil_content', name: 'Content Engine', items: ['Editorial calendar', 'Video series'] },
          { pillarId: 'pil_ads', name: 'Performance Ads', items: ['Paid search', 'Paid social'] },
          { pillarId: 'pil_community', name: 'Community Flywheel', items: ['Advocacy loops', 'Referrals'] },
        ],
      },
      {
        slideKey: 'distribution',
        title: 'Channel Distribution',
        distributionItems: [
          { factId: 'ch_ads', label: 'Performance Ads', value: '42', unit: '%' },
          { factId: 'ch_partners', label: 'Strategic Partners', value: '28', unit: '%' },
          { factId: 'ch_organic', label: 'Organic Content', value: '18', unit: '%' },
          { factId: 'ch_referrals', label: 'Customer Referrals', value: '12', unit: '%' },
        ],
      },
      {
        slideKey: 'allocation',
        title: 'Investment Allocation',
        distributionItems: [
          { factId: 'alloc_product', label: 'Product & Engineering', value: '50', unit: '%', amount: 'Rp2', amountUnit: 'miliar' },
          { factId: 'alloc_sales', label: 'Sales & Marketing', value: '25', unit: '%', amount: 'Rp1', amountUnit: 'miliar' },
          { factId: 'alloc_success', label: 'Customer Success', value: '15', unit: '%', amount: 'Rp600', amountUnit: 'juta' },
          { factId: 'alloc_ops', label: 'Operations', value: '10', unit: '%', amount: 'Rp400', amountUnit: 'juta' },
        ],
        aggregate: { factId: 'alloc_total', label: 'Aggregate Total', value: '100%', unit: 'Rp4 miliar' },
      },
      {
        slideKey: 'closing',
        title: 'Closing Insight',
        closingThesis: {
          eyebrow: 'Thesis',
          statement: 'Satu workspace untuk menghubungkan pekerjaan, data, tools, dan AI dalam satu lingkungan terpadu.',
        },
      },
    ],
  }
}

function mockPresentationFromPlan(plan: ReturnType<typeof __deckTest.compileDeckPlan>, firstId = 'first_live') {
  return {
    presentationId: 'P_MOCK',
    // Real Google presentations always carry pageSize; the default 16:9
    // canvas (9144000x5143500 EMU = 960x540 PT) exercises the EMU path.
    pageSize: {
      width: { magnitude: 9144000, unit: 'EMU' },
      height: { magnitude: 5143500, unit: 'EMU' },
    },
    slides: plan.slides.map((slide, i) => ({
      objectId: i === 0 ? firstId : slide.pageObjectId,
      pageElements: [
        {
          objectId: `txt_${i}`,
          shape: {
            text: {
              textElements: (slide.sourceFacts.length > 0 ? slide.sourceFacts : [{ label: slide.input.title, value: '', unit: '' }]).map((fact) => ({ textRun: { content: `${fact.label} ${fact.value ?? ''} ${fact.unit ?? ''}\n` } })),
            },
          },
        },
      ],
    })),
  }
}

describe('TASK-095-R1 deck semantic contract', () => {
  it('01 typed bullet adaptation stays narrative-only', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [{ slideKey: 's', title: 'Summary', bullets: [{ text: 'Narrative one' }, { text: 'Narrative two' }] }] }))
    expect(plan.slides[0].topology).toBe('BULLETS')
    expect(plan.slides[0].input.bullets).toEqual(['Narrative one', 'Narrative two'])
    expect(plan.slides[0].input.columns).toBeUndefined()
  })

  it('02 five-stage funnel maps directly to stages', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[3]] }))
    expect(plan.slides[0].selectedArchetype).toBe('PROCESS_FUNNEL')
    expect(plan.slides[0].input.stages).toHaveLength(5)
  })

  it('03 two-period comparison produces two groups', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[4]] }))
    expect(plan.slides[0].selectedArchetype).toBe('COMPARISON')
    expect(plan.slides[0].input.columns).toHaveLength(2)
  })

  it('04 three-pillar hierarchy maps one column per pillar', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[6]] }))
    expect(plan.slides[0].selectedArchetype).toBe('PILLARS_STRATEGY')
    expect(plan.slides[0].input.columns).toHaveLength(3)
    expect(plan.slides[0].input.columns?.[0].items).toHaveLength(2)
  })

  it('05 pillars without shared goal pass', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[6]] }))
    expect(plan.slides[0].input.sharedGoal).toBeUndefined()
    expect(plan.perSlide[0].status).not.toBe('GEOMETRY_FAILED')
  })

  it('06 pillars with shared goal preserve it', () => {
    const slide = { ...(r1Fixture().slides as any[])[6], sharedGoal: 'Grow together.' }
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [slide] }))
    expect(plan.slides[0].input.sharedGoal).toBe('Grow together.')
  })

  it('07 four-item distribution has four peers', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[7]] }))
    expect(plan.slides[0].topology).toBe('DISTRIBUTION')
    expect(plan.slides[0].peerCount).toBe(4)
  })

  it('08 distribution aggregate remains separate', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[8]] }))
    expect(plan.slides[0].peerCount).toBe(4)
    expect(plan.slides[0].aggregateCount).toBe(1)
    expect(plan.slides[0].input.bullets).toBeUndefined()
  })

  it('09 closing thesis maps directly to closing field', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[9]] }))
    expect(plan.slides[0].selectedArchetype).toBe('CLOSING_INSIGHT')
    expect(plan.slides[0].input.closing).toBe('Satu workspace untuk menghubungkan pekerjaan, data, tools, dan AI dalam satu lingkungan terpadu.')
  })

  it('10 annotation fallback is not used for closing', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [{ slideKey: 'c', title: 'Close', closingThesis: { statement: 'Exact thesis' }, annotations: ['Do not use me'] }] }))
    expect(plan.slides[0].input.closing).toBe('Exact thesis')
  })

  it('11 no bullets and columns duplication from same fact list', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [{ slideKey: 'compat', title: 'Compat', items: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }] }] }))
    expect(plan.slides[0].input.columns).toHaveLength(2)
    expect(plan.slides[0].input.bullets).toBeUndefined()
  })

  it('12 aggregate is never inside bullets', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[8]] }))
    expect(JSON.stringify(plan.slides[0].input.bullets ?? [])).not.toContain('Aggregate Total')
  })

  it('13 nine source facts are preserved', () => {
    const slide = { slideKey: 'nine', title: 'Nine', headlineMetrics: Array.from({ length: 9 }, (_, i) => ({ factId: `m${i}`, label: `Metric ${i}`, value: String(i) })) }
    const spec = __deckTest.validateDeckSpec(baseDeck({ slides: [slide] }))
    const adapted = __deckTest.adaptSlide(spec.slides[0], __deckTest.slideIdFor('nine', 0), 'EXECUTIVE_NAVY', 0, 1)
    expect(adapted.sourceFacts).toHaveLength(9)
  })

  it('14 twelve source facts are preserved', () => {
    const metrics = Array.from({ length: 12 }, (_, i) => ({ factId: `m${i}`, label: `Metric ${i}`, value: String(i) }))
    const spec = __deckTest.validateDeckSpec(baseDeck({ slides: [{ slideKey: 'many', title: 'Many Metrics', headlineMetrics: metrics }] }))
    const adapted = __deckTest.adaptSlide(spec.slides[0], __deckTest.slideIdFor('many', 0), 'EXECUTIVE_NAVY', 0, 1)
    expect(adapted.sourceFacts).toHaveLength(12)
  })

  it('15 source capacity fails explicitly', () => {
    const bullets = Array.from({ length: 65 }, (_, i) => ({ text: `Bullet ${i}` }))
    const spec = __deckTest.validateDeckSpec(baseDeck({ slides: [{ slideKey: 'too-many', title: 'Too Many', bullets }] }))
    expect(() => __deckTest.adaptSlide(spec.slides[0], __deckTest.slideIdFor('too-many', 0), 'EXECUTIVE_NAVY', 0, 1)).toThrow(/SOURCE_FACT_CAPACITY_EXCEEDED/)
  })

  it('16 source notes do not increase peer count', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [{ slideKey: 'notes', title: 'Notes', distributionItems: [{ factId: 'a', label: 'A', value: '50', unit: '%' }, { factId: 'b', label: 'B', value: '50', unit: '%' }], sourceNotes: ['Source note'] }] }))
    expect(plan.slides[0].peerCount).toBe(2)
  })

  it('17 duplicate slide key fails', () => {
    expect(() => __deckTest.validateDeckSpec(baseDeck({ slides: [{ slideKey: 'x', title: 'A' }, { slideKey: 'x', title: 'B' }] }))).toThrow(/DUPLICATE_SLIDE_KEY/)
  })

  it('18 normalized key collision from case fails', () => {
    expect(() => __deckTest.validateDeckSpec(baseDeck({ slides: [{ slideKey: 'A', title: 'A' }, { slideKey: 'a', title: 'B' }] }))).toThrow(/DUPLICATE_SLIDE_KEY/)
  })

  it('19 long truncated keys stay unique with hash suffix', () => {
    const a = __deckTest.slideIdFor('x'.repeat(80) + 'A', 0)
    const b = __deckTest.slideIdFor('x'.repeat(80) + 'B', 1)
    expect(a).not.toBe(b)
    expect(a.length).toBeLessThanOrEqual(50)
  })

  it('20 duplicate fact id fails', () => {
    expect(() => __deckTest.validateDeckSpec(baseDeck({ slides: [{ slideKey: 'dup', title: 'Dup', distributionItems: [{ factId: 'same', label: 'A', value: '1' }, { factId: 'same', label: 'B', value: '2' }] }] }))).toThrow(/DUPLICATE_FACT_ID/)
  })

  it('21 twenty-slide id compilation is unique', () => {
    const slides = Array.from({ length: 20 }, (_, i) => ({ slideKey: `slide-${i}`, title: `Slide ${i}`, bullets: [{ text: `Text ${i}` }] }))
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides }))
    expect(new Set(plan.plannedSlideIds).size).toBe(20)
  })

  it('22 media is rejected while unsupported', () => {
    expect(() => __deckTest.validateDeckSpec(baseDeck({ slides: [{ slideKey: 'm', title: 'Media', media: [{ type: 'image', url: 'https://example.com/a.png', altText: 'A' }] }] }))).toThrow(/MEDIA_NOT_IMPLEMENTED/)
  })

  it('23 theme media capability is honest', () => {
    const catalog = parseTextResult<{ themes: Array<{ supportsImages: boolean; mediaSupported: boolean }> }>(listThemeCatalog())
    expect(catalog.themes.every((t) => !t.supportsImages && !t.mediaSupported)).toBe(true)
  })

  it('24 theme readiness is not overclaimed', () => {
    const catalog = parseTextResult<{ themes: Array<{ status: string; previewStatus: string; renderedQaStatus: string }>; productionReadyCount: number }>(listThemeCatalog())
    expect(catalog.productionReadyCount).toBe(0)
    expect(catalog.themes.some((t) => t.status === 'structural_only')).toBe(true)
    expect(catalog.themes.every((t) => t.renderedQaStatus === 'unproven')).toBe(true)
  })

  it.each([
    ['25 STAGING_REPAIR rejected', { failurePolicy: 'STAGING_REPAIR' }, /FAILURE_POLICY_NOT_IMPLEMENTED/],
    ['26 PARTIAL_EXPLICIT rejected', { failurePolicy: 'PARTIAL_EXPLICIT' }, /FAILURE_POLICY_NOT_IMPLEMENTED/],
    ['27 RENDERED_REQUIRED rejected', { visualQaPolicy: 'RENDERED_REQUIRED' }, /VISUAL_QA_POLICY_NOT_IMPLEMENTED/],
    ['28 HUMAN_REQUIRED rejected', { visualQaPolicy: 'HUMAN_REQUIRED' }, /VISUAL_QA_POLICY_NOT_IMPLEMENTED/],
    ['29 outputFolderId rejected', { outputFolderId: 'folder' }, /OUTPUT_FOLDER_ROUTING_NOT_IMPLEMENTED/],
  ])('%s', (_name, extra, re) => {
    expect(() => __deckTest.validateDeckSpec(baseDeck(extra as Record<string, unknown>))).toThrow(re)
  })

  it('30 recursive group text readback is meaningful', () => {
    const slides = __deckTest.summarizeSlides({ presentationId: 'p', slides: [{ objectId: 's', pageElements: [{ objectId: 'g', elementGroup: { children: [{ objectId: 't', shape: { text: { textElements: [{ textRun: { content: 'Nested' } }] } } }] } }] }] })
    expect(slides[0].meaningful).toBe(true)
    expect(slides[0].visibleTextCount).toBe(1)
  })

  it('31 decoration-only slide is rejected as not meaningful', () => {
    const slides = __deckTest.summarizeSlides({ presentationId: 'p', slides: [{ objectId: 's', pageElements: [{ objectId: 'BG_1', shape: {} }] }] })
    expect(slides[0].meaningful).toBe(false)
  })

  it('32 image-only semantic slide is meaningful', () => {
    const slides = __deckTest.summarizeSlides({ presentationId: 'p', slides: [{ objectId: 's', pageElements: [{ objectId: 'img', image: { sourceUrl: 'https://example.com/a.png' } }] }] })
    expect(slides[0].meaningful).toBe(true)
  })

  it('33 empty placeholder is excluded', () => {
    const slides = __deckTest.summarizeSlides({ presentationId: 'p', slides: [{ objectId: 's', pageElements: [{ objectId: 'empty', shape: { text: { textElements: [] } } }] }] })
    expect(slides[0].meaningful).toBe(false)
  })

  it('34 post-write fact omission is detected', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[8]] }))
    const pres = mockPresentationFromPlan(plan)
    ;(pres.slides[0].pageElements[0].shape.text.textElements as any[]).pop()
    const fidelity = __deckTest.evaluateSemanticFidelity(plan, pres, new Map([[plan.plannedSlideIds[0], 'first_live']]))
    expect(fidelity.status).toBe('FAILED')
  })

  it('35 post-write changed value is detected', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[7]] }))
    const pres = mockPresentationFromPlan(plan)
    ;(pres.slides[0].pageElements[0].shape.text.textElements as any[])[0] = { textRun: { content: 'Performance Ads 41 %' } }
    const fidelity = __deckTest.evaluateSemanticFidelity(plan, pres, new Map([[plan.plannedSlideIds[0], 'first_live']]))
    expect(fidelity.status).toBe('FAILED')
  })

  it('36 post-write aggregate missing fails', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[8]] }))
    const pres = mockPresentationFromPlan(plan)
    pres.slides[0].pageElements[0].shape.text.textElements = pres.slides[0].pageElements[0].shape.text.textElements.filter((x: any) => !x.textRun.content.includes('Aggregate Total'))
    const fidelity = __deckTest.evaluateSemanticFidelity(plan, pres, new Map([[plan.plannedSlideIds[0], 'first_live']]))
    expect(fidelity.perSlide[0].aggregateRenderedCount).toBe(0)
    expect(fidelity.status).toBe('FAILED')
  })

  it('37 global fidelity is not hardcoded', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [(r1Fixture().slides as any[])[7]] }))
    const fidelity = __deckTest.evaluateSemanticFidelity(plan, { presentationId: 'p', slides: [{ objectId: 'first_live', pageElements: [] }] }, new Map([[plan.plannedSlideIds[0], 'first_live']]))
    expect(fidelity.status).toBe('FAILED')
  })

  it('38 batch failure returns cleanup result', async () => {
    const result = await __deckTest.handleComposeDeckWithDeps(baseDeck(), {
      createPresentation: async () => ({ presentationId: 'created' }),
      readPresentation: async () => ({ presentationId: 'created', pageSize: { width: { magnitude: 9144000, unit: 'EMU' }, height: { magnitude: 5143500, unit: 'EMU' } }, slides: [{ objectId: 'first_live', pageElements: [] }] }),
      executeBatch: async () => { throw new Error('batch failed') },
      cleanupPresentation: async () => 'CLEANED_UP',
      now: () => 1,
    })
    expect((result.atomicLifecycle as any).cleanupOutcome).toBe('CLEANED_UP')
  })

  it('39 cleanup unavailable discloses orphan', async () => {
    const result = await __deckTest.handleComposeDeckWithDeps(baseDeck(), {
      createPresentation: async () => ({ presentationId: 'created' }),
      readPresentation: async () => ({ presentationId: 'created', pageSize: { width: { magnitude: 9144000, unit: 'EMU' }, height: { magnitude: 5143500, unit: 'EMU' } }, slides: [{ objectId: 'first_live', pageElements: [] }] }),
      executeBatch: async () => { throw new Error('batch failed') },
      now: () => 1,
    })
    expect((result.atomicLifecycle as any).orphanPresentationId).toBe('created')
  })

  it('40 call accounting scopes are separate', async () => {
    const plan = __deckTest.compileDeckPlan(baseDeck())
    const result = await __deckTest.handleComposeDeckWithDeps(baseDeck(), {
      createPresentation: async () => ({ presentationId: 'created' }),
      readPresentation: async () => mockPresentationFromPlan(plan),
      executeBatch: async (_id: string, reqs: any[]) => ({ createdIds: [], appliedRequests: reqs.length }),
      now: () => 1,
    })
    expect((result.callAccounting as any).externalMcpCalls).toBe(1)
    expect((result.callAccounting as any).googleHttpCalls).toBe(4)
    expect((result.callAccounting as any).internalSlidesPlanned).toBe(1)
  })

  it('41 full 10-slide handler integration compiles and proves structural readback', async () => {
    const plan = __deckTest.compileDeckPlan(r1Fixture())
    expect(plan.slides).toHaveLength(10)
    expect(plan.slides.map((s) => s.selectedArchetype)).toEqual([
      'COVER', 'EXECUTIVE_SUMMARY', 'KPI_DASHBOARD', 'PROCESS_FUNNEL', 'COMPARISON',
      'TIMELINE_ROADMAP', 'PILLARS_STRATEGY', 'COMPARISON', 'COMPARISON', 'CLOSING_INSIGHT',
    ])
    expect(plan.slides[3].input.stages).toHaveLength(5)
    expect(plan.slides[4].input.columns).toHaveLength(2)
    expect(plan.slides[6].input.columns).toHaveLength(3)
    expect(plan.slides[8].peerCount).toBe(4)
    expect(plan.slides[8].aggregateCount).toBe(1)
    const finalRead = mockPresentationFromPlan(plan)
    const result = await __deckTest.handleComposeDeckWithDeps(r1Fixture(), {
      createPresentation: async () => ({ presentationId: 'created' }),
      readPresentation: async () => finalRead,
      executeBatch: async (_id: string, reqs: any[]) => ({ createdIds: [], appliedRequests: reqs.length }),
      now: () => 1,
    })
    expect(result.overallVerdict).toBe('STRUCTURALLY_PROVEN_RENDERED_UNPROVEN')
    expect(result.meaningfulSlideCount).toBe(10)
    expect((result.semanticFidelity as any).status).toBe('PROVEN')
  })

  it('42 existing slides_compose_slide compatibility remains covered by shared renderer', () => {
    const plan = __deckTest.compileDeckPlan(baseDeck({ slides: [{ slideKey: 'compat', title: 'Compat', items: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }] }] }))
    expect(plan.slides[0].compatibilityMode).toBe(true)
    expect(plan.perSlide[0].warnings).toContain('COMPATIBILITY_MODE: generic items were adapted to columns; typed semantic blocks are preferred.')
  })
})
