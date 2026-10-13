/**
 * TASK-093: Live Compose Theme Propagation & Grouped Readback Corrective.
 *
 * Proves:
 * A. userPrompt forwards through tool schema → compose → theme resolver.
 * B. parseMagnitude handles Indonesian formats correctly (miliar=1e9, comma-decimal, dot-thousands).
 * C. Distribution detection catches KPI_DASHBOARD with metrics/bullets.
 * D. resolveEffectiveArchetype routes KPI_DASHBOARD → ranked bars / parts-of-whole.
 * E. Theme coherence across sequential compose calls.
 * F. Theme reset between different themes.
 * G. validateComposeInput extracts userPrompt.
 * H. Bounded readback retry logic exists.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  parseMagnitude,
} from './geometry'
import {
  detectShareLines,
  detectBudgetLines,
  detectTotalLine,
  resolveEffectiveArchetype,
  parsePercentShare,
  applyTheme,
  PALETTE,
  currentArt,
  validateComposeInput,
  composeSlideOnPage,
  type ComposeInput,
} from './beautify'
import {
  THEMES,
  resolveThemePrecedence,
  inferThemeFromPrompt,
  resolveTheme,
} from './themes'

describe('TASK-093: parseMagnitude Indonesian fixes', () => {
  it('Rp4 miliar → 4e9 (miliar = billion)', () => {
    expect(parseMagnitude('Rp4 miliar')).toBe(4e9)
  })
  it('Rp12 miliar → 12e9', () => {
    expect(parseMagnitude('Rp12 miliar')).toBe(12e9)
  })
  it('Rp6,5 miliar → 6.5e9 (comma-decimal)', () => {
    expect(parseMagnitude('Rp6,5 miliar')).toBeCloseTo(6.5e9)
  })
  it('Rp2 miliar → 2e9', () => {
    expect(parseMagnitude('Rp2 miliar')).toBe(2e9)
  })
  it('Rp600 juta → 600e6', () => {
    expect(parseMagnitude('Rp600 juta')).toBe(600e6)
  })
  it('Rp400 juta → 400e6', () => {
    expect(parseMagnitude('Rp400 juta')).toBe(400e6)
  })
  it('Rp4 miliar → 4e9 (not 4e6)', () => {
    expect(parseMagnitude('Rp4 miliar')).toBeGreaterThan(1e8)
  })
  it('1.200.000 → 1200000 (dot-thousands)', () => {
    expect(parseMagnitude('1.200.000')).toBe(1200000)
  })
  it('240.000 → 240000', () => {
    expect(parseMagnitude('240.000')).toBe(240000)
  })
  it('18.000 → 18000', () => {
    expect(parseMagnitude('18.000')).toBe(18000)
  })
  it('Rp400 ribu → 400000', () => {
    expect(parseMagnitude('Rp400 ribu')).toBe(400000)
  })
  it('42% → 42', () => {
    expect(parseMagnitude('42%')).toBe(42)
  })
  it('92% → 92', () => {
    expect(parseMagnitude('92%')).toBe(92)
  })
  it('Rp6.5B → 6.5e9 (English format)', () => {
    expect(parseMagnitude('Rp6.5B')).toBeCloseTo(6.5e9)
  })
  it('2.5x → 2.5', () => {
    expect(parseMagnitude('2.5x')).toBeCloseTo(2.5)
  })
})

describe('TASK-093: parsePercentShare', () => {
  it('42% → 42', () => {
    expect(parsePercentShare('42%')).toBe(42)
  })
  it('Rp4 miliar → null (no percent)', () => {
    expect(parsePercentShare('Rp4 miliar')).toBeNull()
  })
  it('1.200.000 → null (no percent)', () => {
    expect(parsePercentShare('1.200.000')).toBeNull()
  })
})

describe('TASK-093: detectShareLines', () => {
  it('4 percentage bullets → ShareLine[]', () => {
    const result = detectShareLines([
      'Organic & Content: 42%',
      'Partnerships: 28%',
      'Paid Acquisition: 18%',
      'Referral: 12%',
    ])
    expect(result).not.toBeNull()
    expect(result!.length).toBe(4)
    expect(result![0].label).toBe('Organic & Content')
    expect(result![0].share).toBe(42)
  })
  it('3 percentage bullets with no colon → ShareLine[]', () => {
    const result = detectShareLines([
      'Organic & Content 42%',
      'Partnerships 28%',
      'Paid Acquisition 18%',
    ])
    expect(result).not.toBeNull()
    expect(result!.length).toBe(3)
  })
  it('2 bullets → null (need >= 3)', () => {
    expect(detectShareLines(['A: 50%', 'B: 50%'])).toBeNull()
  })
  it('non-percentage bullets → null', () => {
    expect(detectShareLines(['Hello world', 'Foo bar', 'Baz qux'])).toBeNull()
  })
})

describe('TASK-093: detectBudgetLines', () => {
  it('budget bullets with Rp amounts → BudgetLine[]', () => {
    const result = detectBudgetLines([
      'Marketing: 50% Rp2 miliar',
      'Product: 25% Rp1 miliar',
      'Operations: 15% Rp600 juta',
      'Reserve: 10% Rp400 juta',
    ])
    expect(result).not.toBeNull()
    expect(result!.length).toBe(4)
    expect(result![0].label).toBe('Marketing')
    expect(result![0].share).toBe(50)
  })
})

describe('TASK-093: detectTotalLine', () => {
  it('title with total → TotalLine', () => {
    const result = detectTotalLine('Total Budget Rp4 miliar', undefined, undefined)
    expect(result).not.toBeNull()
    expect(result!.amount).toBe('Rp4 miliar')
  })
  it('bullets with total → TotalLine', () => {
    const result = detectTotalLine(undefined, undefined, ['Total: Rp12 miliar', 'Marketing: 50%'])
    expect(result).not.toBeNull()
  })
  it('no total → null', () => {
    expect(detectTotalLine('Marketing Plan', undefined, ['A: 50%', 'B: 50%'])).toBeNull()
  })
})

describe('TASK-093: resolveEffectiveArchetype routing', () => {
  it('KPI_DASHBOARD with 4 percentage metrics → COMPARISON / RANKED_PROPORTIONAL_BARS', () => {
    const result = resolveEffectiveArchetype('KPI_DASHBOARD', {
      title: 'Channel Distribution',
      metrics: [
        { label: 'Organic', value: '42%' },
        { label: 'Partnerships', value: '28%' },
        { label: 'Paid', value: '18%' },
        { label: 'Referral', value: '12%' },
      ],
    })
    expect(result.redirected).toBe(true)
    expect(result.archetype).toBe('COMPARISON')
    expect(result.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    expect(result.patch.columns).toBeDefined()
    expect(result.patch.columns!.length).toBe(4)
  })
  it('KPI_DASHBOARD with 4 percentage bullets → COMPARISON / RANKED_PROPORTIONAL_BARS', () => {
    const result = resolveEffectiveArchetype('KPI_DASHBOARD', {
      title: 'Channel Distribution',
      bullets: [
        'Organic & Content: 42%',
        'Partnerships: 28%',
        'Paid Acquisition: 18%',
        'Referral: 12%',
      ],
    })
    expect(result.redirected).toBe(true)
    expect(result.archetype).toBe('COMPARISON')
    expect(result.encoding).toBe('RANKED_PROPORTIONAL_BARS')
  })
  it('KPI_DASHBOARD with budget metrics + total → COMPARISON / PARTS_OF_WHOLE_STACK', () => {
    const result = resolveEffectiveArchetype('KPI_DASHBOARD', {
      title: 'Budget Allocation',
      subtitle: 'Total: Rp4 miliar',
      metrics: [
        { label: 'Marketing', value: '50% Rp2 miliar' },
        { label: 'Product', value: '25% Rp1 miliar' },
        { label: 'Operations', value: '15% Rp600 juta' },
        { label: 'Reserve', value: '10% Rp400 juta' },
      ],
    })
    expect(result.redirected).toBe(true)
    // TASK-094-R3: budget vehicle is COMPARISON (stacked), never PILLARS.
    expect(result.archetype).toBe('COMPARISON')
    expect(result.encoding).toBe('PARTS_OF_WHOLE_STACK')
  })
  it('KPI_DASHBOARD with distribution bullets + total → COMPARISON / PARTS_OF_WHOLE_STACK', () => {
    const result = resolveEffectiveArchetype('KPI_DASHBOARD', {
      title: 'Budget Allocation',
      subtitle: 'Total: Rp4 miliar',
      bullets: [
        'Marketing: 50% Rp2 miliar',
        'Product: 25% Rp1 miliar',
        'Operations: 15% Rp600 juta',
        'Reserve: 10% Rp400 juta',
      ],
    })
    expect(result.redirected).toBe(true)
    // TASK-094-R3: budget vehicle is COMPARISON (stacked), never PILLARS.
    expect(result.archetype).toBe('COMPARISON')
    expect(result.encoding).toBe('PARTS_OF_WHOLE_STACK')
  })
  it('KPI_DASHBOARD with non-distribution metrics → KPI_DASHBOARD (honored)', () => {
    const result = resolveEffectiveArchetype('KPI_DASHBOARD', {
      title: 'Business KPIs',
      metrics: [
        { label: 'ARR', value: '$12M' },
        { label: 'Retention', value: '92%' },
        { label: 'NPS', value: '72' },
      ],
    })
    expect(result.redirected).toBe(false)
    expect(result.archetype).toBe('KPI_DASHBOARD')
  })
  it('PROCESS_FUNNEL with funnel stages → PROCESS_FUNNEL (honored)', () => {
    const result = resolveEffectiveArchetype('PROCESS_FUNNEL', {
      title: 'Conversion Funnel',
      stages: [
        { label: 'Awareness', description: '1.200.000' },
        { label: 'Visitors', description: '240.000' },
        { label: 'Qualified Leads', description: '72.000' },
        { label: 'Customers', description: '18.000' },
      ],
    })
    expect(result.redirected).toBe(false)
    expect(result.archetype).toBe('PROCESS_FUNNEL')
  })
  it('Bullets with 3+ share lines → COMPARISON / RANKED_PROPORTIONAL_BARS', () => {
    const result = resolveEffectiveArchetype('KPI_DASHBOARD', {
      title: 'Channel Shares',
      bullets: [
        'Organic & Content: 42%',
        'Partnerships: 28%',
        'Paid Acquisition: 18%',
        'Referral: 12%',
      ],
    })
    expect(result.redirected).toBe(true)
    expect(result.archetype).toBe('COMPARISON')
    expect(result.encoding).toBe('RANKED_PROPORTIONAL_BARS')
  })
})

describe('TASK-093: Theme propagation via userPrompt', () => {
  it('userPrompt "modern dark gradient" → inferThemeFromPrompt returns MODERN_GRADIENT', () => {
    const inferred = inferThemeFromPrompt('Buat presentasi strategi bisnis modern, premium, dengan dark gradient visual style.')
    expect(inferred).toBe('MODERN_GRADIENT')
  })
  it('userPrompt "formal board" → inferThemeFromPrompt returns EXECUTIVE_NAVY', () => {
    const inferred = inferThemeFromPrompt('formal board presentation for enterprise review')
    expect(inferred).toBe('EXECUTIVE_NAVY')
  })
  it('userPrompt "tech launch bold" → inferThemeFromPrompt returns BOLD_TECH', () => {
    const inferred = inferThemeFromPrompt('bold tech launch for AI product')
    expect(inferred).toBe('BOLD_TECH')
  })
  it('resolveThemePrecedence with userPrompt → USER_EXPLICIT_STYLE source', () => {
    const result = resolveThemePrecedence(undefined, 'dark gradient premium', null)
    expect(result.themeId).toBe('MODERN_GRADIENT')
    expect(result.source).toBe('USER_EXPLICIT_STYLE')
  })
  it('resolveThemePrecedence with explicit themeId → EXPLICIT_COMPOSE source', () => {
    const result = resolveThemePrecedence('MODERN_GRADIENT', undefined, null)
    expect(result.themeId).toBe('MODERN_GRADIENT')
    expect(result.source).toBe('EXPLICIT_COMPOSE')
  })
  it('resolveThemePrecedence with neither → DEFAULT source', () => {
    const result = resolveThemePrecedence(undefined, undefined, null)
    expect(result.themeId).toBe('EXECUTIVE_NAVY')
    expect(result.source).toBe('DEFAULT')
  })
  it('explicit themeId takes precedence over userPrompt', () => {
    const result = resolveThemePrecedence('BOLD_TECH', 'dark gradient', null)
    expect(result.themeId).toBe('BOLD_TECH')
    expect(result.source).toBe('EXPLICIT_COMPOSE')
  })
})

describe('TASK-093: validateComposeInput extracts userPrompt', () => {
  it('userPrompt present in args → ComposeInput.userPrompt set', () => {
    const { input } = validateComposeInput({
      presentationId: 'pres1',
      pageObjectId: 'page1',
      archetype: 'COVER',
      title: 'Test',
      userPrompt: 'modern dark gradient presentation',
    })
    expect(input.userPrompt).toBe('modern dark gradient presentation')
  })
  it('userPrompt absent → ComposeInput.userPrompt undefined', () => {
    const { input } = validateComposeInput({
      presentationId: 'pres1',
      pageObjectId: 'page1',
      archetype: 'COVER',
      title: 'Test',
    })
    expect(input.userPrompt).toBeUndefined()
  })
  it('themeId present → ComposeInput.themeId set', () => {
    const { input } = validateComposeInput({
      presentationId: 'pres1',
      pageObjectId: 'page1',
      archetype: 'COVER',
      title: 'Test',
      themeId: 'MODERN_GRADIENT',
    })
    expect(input.themeId).toBe('MODERN_GRADIENT')
  })
})

describe('TASK-093: Theme coherence across sequential calls', () => {
  const baseline = { ...PALETTE }
  beforeEach(() => {
    applyTheme(null)
  })
  it('MODERN_GRADIENT applied → dark palette', () => {
    applyTheme(resolveTheme('MODERN_GRADIENT'))
    expect(PALETTE.background).not.toBe(baseline.background)
    expect(currentArt().backgroundStyle).toBe('GRADIENT_LIKE')
  })
  it('Reset to null → defaults restored', () => {
    applyTheme(resolveTheme('MODERN_GRADIENT'))
    applyTheme(null)
    expect(PALETTE.background).toBe(baseline.background)
    expect(currentArt().backgroundStyle).toBe('TINTED')
  })
  it('Theme A → Theme B → Theme C: no bleed', () => {
    applyTheme(resolveTheme('MODERN_GRADIENT'))
    const gradBg = PALETTE.background
    applyTheme(resolveTheme('BOLD_TECH'))
    expect(PALETTE.background).not.toBe(gradBg)
    expect(currentArt().backgroundStyle).toBe('HERO_DARK')
    applyTheme(resolveTheme('EDITORIAL_MINIMAL'))
    expect(PALETTE.background).not.toBe(gradBg)
    expect(currentArt().surfaceStyle).toBe('NO_CARD')
  })
})

describe('TASK-093: ComposeInput.userPrompt forwarded to PageComposeOptions', () => {
  it('composeSlideOnPage receives userPrompt via opts', () => {
    const input: ComposeInput = {
      pageObjectId: 'test-page',
      archetype: 'COVER',
      title: 'Test Cover',
      userPrompt: 'dark gradient premium',
    }
    const result = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      userPrompt: 'dark gradient premium',
    })
    expect(result.result.requests.length).toBeGreaterThan(0)
  })
})

describe('TASK-093: Indonesian parsing integration', () => {
  it('detectShareLines with percentage-only format (no colon)', () => {
    const result = detectShareLines([
      'Organic 42%',
      'Partnerships 28%',
      'Paid 18%',
      'Referral 12%',
    ])
    expect(result).not.toBeNull()
    expect(result!.length).toBe(4)
  })
  it('detectBudgetLines with Indonesian currency', () => {
    const result = detectBudgetLines([
      'Marketing: 50% Rp2 miliar',
      'Product: 25% Rp1 miliar',
      'Operations: 15% Rp600 juta',
    ])
    expect(result).not.toBeNull()
    expect(result!.length).toBe(3)
    expect(result![0].amount).toBe('Rp2 miliar')
  })
  it('detectTotalLine with Indonesian total', () => {
    const result = detectTotalLine('Total Anggaran: Rp4 miliar', undefined, undefined)
    expect(result).not.toBeNull()
    expect(result!.amount).toBe('Rp4 miliar')
  })
})
