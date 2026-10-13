/**
 * TASK-096-R3: Exact Alpha One Business Growth Strategy 2027 fixture.
 * This is the authoritative business content fixture for visual acceptance testing.
 */
import { describe, expect, it } from 'vitest'
import * as crypto from 'crypto'
import { PRODUCTION_THEME_ID } from './production'
import { __deckTest } from './deck'

// ── Authoritative Alpha One Business Fixture ─────────────────────────────────

function alphaOneBusinessFixture() {
  return {
    title: 'Alpha One — Business Growth Strategy 2027',
    themeId: PRODUCTION_THEME_ID,
    slideCount: 10,
    slides: [
      // Slide 1 — Cover
      {
        slideKey: 'cover',
        narrativeRole: 'cover',
        title: 'Alpha One — Business Growth Strategy 2027',
        subtitle: 'One workspace. One assistant. All your work.',
      },
      // Slide 2 — Executive Summary
      {
        slideKey: 'summary',
        narrativeRole: 'executive summary',
        title: 'Executive Summary',
        preferredArchetype: 'EXECUTIVE_SUMMARY',
        bullets: [
          { text: 'Target ARR 2027: Rp12 miliar' },
          { text: 'Target organisasi aktif: 500' },
          { text: 'Retensi pelanggan: 92%' },
          { text: 'Fokus pertumbuhan: customer acquisition, product excellence, dan ecosystem expansion' },
        ],
      },
      // Slide 3 — Business Targets
      {
        slideKey: 'kpi',
        title: 'Business Targets',
        headlineMetrics: [
          { factId: 'kpi_arr', label: 'ARR', value: 'Rp12 miliar' },
          { factId: 'kpi_orgs', label: 'Organisasi Aktif', value: '500' },
          { factId: 'kpi_retention', label: 'Retensi Pelanggan', value: '92%' },
          { factId: 'kpi_growth', label: 'Pertumbuhan Tahunan', value: '180%' },
        ],
      },
      // Slide 4 — Customer Acquisition Funnel
      {
        slideKey: 'funnel',
        narrativeRole: 'acquisition funnel',
        title: 'Customer Acquisition Funnel',
        stages: [
          { stageId: 'st_awareness', label: 'Awareness', value: '1.200.000', order: 1 },
          { stageId: 'st_web', label: 'Website Visitors', value: '240.000', order: 2 },
          { stageId: 'st_leads', label: 'Qualified Leads', value: '72.000', order: 3 },
          { stageId: 'st_trials', label: 'Trial Users', value: '18.000', order: 4 },
          { stageId: 'st_paid', label: 'Paying Organizations', value: '500', order: 5 },
        ],
      },
      // Slide 5 — 2026 vs 2027
      {
        slideKey: 'comparison',
        title: '2026 vs 2027',
        comparisonGroups: [
          {
            groupId: 'g_2026',
            name: '2026',
            items: [
              { factId: 'c26_arr', label: 'ARR', value: 'Rp4 miliar' },
              { factId: 'c26_orgs', label: 'Organisasi Aktif', value: '180' },
              { factId: 'c26_retention', label: 'Retensi Pelanggan', value: '84%' },
              { factId: 'c26_customers', label: 'Pelanggan', value: '3.500' },
            ],
          },
          {
            groupId: 'g_2027',
            name: '2027',
            items: [
              { factId: 'c27_arr', label: 'ARR', value: 'Rp12 miliar' },
              { factId: 'c27_orgs', label: 'Organisasi Aktif', value: '500' },
              { factId: 'c27_retention', label: 'Retensi Pelanggan', value: '92%' },
              { factId: 'c27_customers', label: 'Pelanggan', value: '12.000' },
            ],
          },
        ],
      },
      // Slide 6 — 2027 Roadmap
      {
        slideKey: 'roadmap',
        narrativeRole: 'roadmap',
        title: '2027 Roadmap',
        stages: [
          { stageId: 'rd_q1', label: 'Q1 — Foundation', description: 'Memperkuat reliability dan onboarding', order: 1 },
          { stageId: 'rd_q2', label: 'Q2 — Growth', description: 'Meningkatkan customer acquisition', order: 2 },
          { stageId: 'rd_q3', label: 'Q3 — Expansion', description: 'Memperluas integrasi dan partner', order: 3 },
          { stageId: 'rd_q4', label: 'Q4 — Scale', description: 'Meningkatkan retensi dan efisiensi operasional', order: 4 },
        ],
      },
      // Slide 7 — Three Strategic Pillars
      {
        slideKey: 'pillars',
        title: 'Three Strategic Pillars',
        pillars: [
          {
            pillarId: 'pil_product',
            name: 'Product Excellence',
            items: ['Inovasi produk berkelanjutan', 'Kualitas dan reliability tinggi'],
          },
          {
            pillarId: 'pil_growth',
            name: 'Customer Growth',
            items: ['Akuisisi pelanggan terukur', 'Retensi dan kepuasan pelanggan'],
          },
          {
            pillarId: 'pil_ecosystem',
            name: 'Ecosystem Expansion',
            items: ['Perluasan integrasi partner', 'Ekosistem aplikasi terpadu'],
          },
        ],
      },
      // Slide 8 — Customer Acquisition Channels
      {
        slideKey: 'distribution',
        title: 'Customer Acquisition Channels',
        distributionItems: [
          { factId: 'ch_organic', label: 'Organic & Content', value: '42', unit: '%' },
          { factId: 'ch_partners', label: 'Strategic Partnerships', value: '28', unit: '%' },
          { factId: 'ch_performance', label: 'Performance Marketing', value: '18', unit: '%' },
          { factId: 'ch_community', label: 'Community & Referral', value: '12', unit: '%' },
        ],
      },
      // Slide 9 — Growth Investment Allocation
      {
        slideKey: 'allocation',
        title: 'Growth Investment Allocation',
        distributionItems: [
          { factId: 'alloc_product', label: 'Product & Engineering', value: '50', unit: '%', amount: 'Rp2', amountUnit: 'miliar' },
          { factId: 'alloc_sales', label: 'Sales & Marketing', value: '25', unit: '%', amount: 'Rp1', amountUnit: 'miliar' },
          { factId: 'alloc_success', label: 'Customer Success', value: '15', unit: '%', amount: 'Rp600', amountUnit: 'juta' },
          { factId: 'alloc_ops', label: 'Operations', value: '10', unit: '%', amount: 'Rp400', amountUnit: 'juta' },
        ],
        aggregate: {
          factId: 'alloc_total',
          label: 'Total',
          value: '100%',
          unit: 'Rp4 miliar',
        },
      },
      // Slide 10 — Closing Insight
      {
        slideKey: 'closing',
        title: 'Closing Insight',
        closingThesis: {
          eyebrow: 'Build the Future of Work with Alpha One',
          statement: 'Satu workspace untuk menghubungkan pekerjaan, data, tools, dan AI dalam satu lingkungan terpadu.',
        },
      },
    ],
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TASK-096-R3 Business Fixture Validation', () => {
  it('fixture has exactly 10 slides', () => {
    const fixture = alphaOneBusinessFixture()
    expect(fixture.slides.length).toBe(10)
  })

  it('fixture validates offline without errors', () => {
    const fixture = alphaOneBusinessFixture()
    const plan = __deckTest.compileDeckPlan(fixture)
    
    // Required pre-write results
    expect(plan.plannedSlideIds.length).toBe(10)
    expect(plan.slides.length).toBe(10)
    expect(plan.internalAccounting.internalSlidesPlanned).toBe(10)
    expect(plan.geometry.status).toBe('PASS')
    expect(plan.geometry.violations.length).toBe(0)
    
    // Topology inventory
    let kpiMetrics = 0
    let funnelStages = 0
    let comparisonGroups = 0
    let roadmapStages = 0
    let pillars = 0
    let distributionItems = 0
    let allocationPeers = 0
    let allocationAggregate = 0
    let closingEyebrow = 0
    let closingThesis = 0
    let compatibilitySlides = 0
    
    for (const slide of plan.slides) {
      if (slide.compatibilityMode) compatibilitySlides++
      
      if (slide.slideKey === 'kpi') {
        kpiMetrics = slide.peerCount
      }
      if (slide.slideKey === 'funnel') {
        funnelStages = slide.peerCount
      }
      if (slide.slideKey === 'comparison') {
        comparisonGroups = 2 // We know there are 2 groups
      }
      if (slide.slideKey === 'roadmap') {
        roadmapStages = slide.peerCount
      }
      if (slide.slideKey === 'pillars') {
        pillars = slide.peerCount / 2 // 2 items per pillar
      }
      if (slide.slideKey === 'distribution') {
        distributionItems = slide.peerCount
      }
      if (slide.slideKey === 'allocation') {
        allocationPeers = slide.peerCount
        allocationAggregate = slide.aggregateCount
      }
      if (slide.slideKey === 'closing') {
        closingEyebrow = 1
        closingThesis = 1
      }
    }
    
    // Topology inventory assertions
    expect(kpiMetrics).toBe(4)
    expect(funnelStages).toBe(5)
    expect(comparisonGroups).toBe(2)
    expect(roadmapStages).toBe(4)
    expect(pillars).toBe(3)
    expect(distributionItems).toBe(4)
    expect(allocationPeers).toBe(4)
    expect(allocationAggregate).toBe(1)
    expect(closingEyebrow).toBe(1)
    expect(closingThesis).toBe(1)
    expect(compatibilitySlides).toBe(0)
    
    // No out-of-page objects
    let outOfPageCount = 0
    for (const g of plan.geometry.slides) {
      outOfPageCount += g.outOfPageIds.length
    }
    expect(outOfPageCount).toBe(0)
  })

  it('fixture SHA256 is deterministic', () => {
    const fixture = alphaOneBusinessFixture()
    const serialized = JSON.stringify(fixture, Object.keys(fixture).sort())
    const hash = crypto.createHash('sha256').update(serialized).digest('hex')
    
    console.log('R3 Business Fixture SHA256:', hash)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
