/**
 * TASK-092-R1: Art Direction Depth Corrective — comprehensive differentiation tests.
 * Proves: same content + same archetype + different theme → materially different
 * professional art direction (not merely different colors).
 *
 * Test categories (§55):
 * A. Background behavior differs by theme.
 * B. Typography treatment differs by theme.
 * C. Surface style differs by theme.
 * D. Shape/border treatment differs by theme.
 * E. Decorative motif differs by theme.
 * F. Data-viz treatment differs by theme.
 * G. Editorial Minimal uses fewer/no cards.
 * H. Modern Gradient emits layered/gradient-like background requests.
 * I. Bold Tech uses sharper geometry.
 * J. Premium Monochrome remains materially monochrome.
 * K. Same facts across themes.
 * L. Same encoding across themes.
 * M. No theme state bleed.
 * N. Contrast safe under dark themes.
 * O. Cover differs beyond palette.
 * P. KPI differs beyond palette.
 * Q. Ranked bars differ beyond palette.
 * R. Parts-of-whole differs beyond palette.
 * S. Pillars shared goal preserved across themes.
 * T. Closing facts preserved across themes.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  THEMES,
  THEME_IDS,
  type AlphaTheme,
  type ArtDirection,
} from './themes'
import {
  applyTheme,
  PALETTE,
  composeSlideOnPage,
  composeSlide,
  currentArt,
  resolveCardShapeType,
  resolveCardOutlineWeight,
  resolveCardFill,
  resolveBarFill,
  resolveBarTrackFill,
  resolveSegmentFill,
  resolveDensityMul,
  resolveMetricScale,
  resolveFontFamily,
  resolveTextFill,
  resolveFunnelStageFill,
  buildDecorativeRequests,
  buildBackgroundRequests,
  type ComposeInput,
} from './beautify'

const BASELINE_PALETTE = { ...PALETTE }

beforeEach(() => {
  Object.assign(PALETTE, BASELINE_PALETTE)
})

// Helper: get theme and apply it
function useTheme(id: string): AlphaTheme {
  const t = THEMES[id]
  expect(t).toBeDefined()
  applyTheme(t)
  return t
}

// Helper: get all request shapes from a compose result
function shapeRequests(result: ReturnType<typeof composeSlideOnPage>): Array<{ shapeType: string; fillHex?: string; outlineHex?: string }> {
  return result.result.requests
    .filter((r: any) => r.createShape)
    .map((r: any) => ({
      shapeType: r.createShape.shapeType,
      fillHex: r.updateShapeProperties?.shapeProperties?.shapeBackgroundFill?.solidFill?.color?.rgbColor,
    }))
}

// Helper: get all font families from a compose result
function fontFamilies(result: ReturnType<typeof composeSlideOnPage>): string[] {
  const fonts: string[] = []
  for (const r of result.result.requests) {
    const req = r as any
    if (req.updateTextStyle?.style?.fontFamily) {
      fonts.push(req.updateTextStyle.style.fontFamily)
    }
  }
  return fonts
}

// Helper: unique fill hexes from shapes
function uniqueShapeFills(result: ReturnType<typeof composeSlideOnPage>): Set<string> {
  const fills = new Set<string>()
  for (const r of result.result.requests) {
    if ((r as any).createShape) {
      const fill = (r as any).updateShapeProperties?.shapeProperties?.shapeBackgroundFill?.solidFill?.color?.rgbColor
      if (fill) fills.add(fill)
    }
  }
  return fills
}

// ---------------------------------------------------------------------------
// A. Background behavior differs by theme
// ---------------------------------------------------------------------------

describe('A: background behavior differs by theme', () => {
  const kpi: ComposeInput = {
    pageObjectId: 'P_BG',
    archetype: 'KPI_DASHBOARD',
    title: 'Metrics',
    metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }],
  }

  it('MODERN_GRADIENT emits background shapes (GRADIENT_LIKE)', () => {
    useTheme('MODERN_GRADIENT')
    const r = composeSlideOnPage(kpi, { alphaThemeId: 'MODERN_GRADIENT' })
    // GRADIENT_LIKE background adds shapes — IDs contain 'BG_' prefix segment
    const bgShapes = r.result.requests.filter((req: any) =>
      req.createShape && (req.createShape.objectId ?? '').includes('_BG_')
    )
    expect(bgShapes.length).toBeGreaterThanOrEqual(1)
  })

  it('BOLD_TECH emits hero-dark background shapes', () => {
    useTheme('BOLD_TECH')
    const r = composeSlideOnPage(kpi, { alphaThemeId: 'BOLD_TECH' })
    const bgShapes = r.result.requests.filter((req: any) =>
      req.createShape && (req.createShape.objectId ?? '').includes('_BG_')
    )
    expect(bgShapes.length).toBeGreaterThanOrEqual(1)
  })

  it('EDITORIAL_MINIMAL uses flat light (no extra bg shapes)', () => {
    useTheme('EDITORIAL_MINIMAL')
    const r = composeSlideOnPage(kpi, { alphaThemeId: 'EDITORIAL_MINIMAL' })
    const bgShapes = r.result.requests.filter((req: any) =>
      req.createShape && (req.createShape.objectId ?? '').includes('_BG_')
    )
    expect(bgShapes.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// B. Typography treatment differs by theme
// ---------------------------------------------------------------------------

describe('B: typography treatment differs by theme', () => {
  const cover: ComposeInput = {
    pageObjectId: 'P_TYPO',
    archetype: 'COVER',
    title: 'Alpha One',
    subtitle: 'Strategy 2027',
  }

  it('EDITORIAL_MINIMAL uses Georgia for titles', () => {
    useTheme('EDITORIAL_MINIMAL')
    const r = composeSlideOnPage(cover, { alphaThemeId: 'EDITORIAL_MINIMAL' })
    const fonts = fontFamilies(r)
    expect(fonts).toContain('Georgia')
  })

  it('DATA_INTELLIGENCE uses Courier New for metrics', () => {
    useTheme('DATA_INTELLIGENCE')
    const kpi: ComposeInput = {
      pageObjectId: 'P_TYPO_DI',
      archetype: 'KPI_DASHBOARD',
      title: 'Metrics',
      metrics: [{ label: 'Revenue', value: 'Rp12B' }, { label: 'Growth', value: '31%' }],
    }
    const r = composeSlideOnPage(kpi, { alphaThemeId: 'DATA_INTELLIGENCE' })
    const fonts = fontFamilies(r)
    expect(fonts).toContain('Courier New')
  })

  it('EXECUTIVE_NAVY uses deck default (no custom font)', () => {
    useTheme('EXECUTIVE_NAVY')
    const r = composeSlideOnPage(cover, { alphaThemeId: 'EXECUTIVE_NAVY' })
    const fonts = fontFamilies(r)
    expect(fonts.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// C. Surface style differs by theme
// ---------------------------------------------------------------------------

describe('C: surface style differs by theme', () => {
  const kpi: ComposeInput = {
    pageObjectId: 'P_SURF',
    archetype: 'KPI_DASHBOARD',
    title: 'Metrics',
    metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }],
  }

  it('EDITORIAL_MINIMAL: NO_CARD → no card fill shapes', () => {
    useTheme('EDITORIAL_MINIMAL')
    const r = composeSlideOnPage(kpi, { alphaThemeId: 'EDITORIAL_MINIMAL' })
    expect(resolveCardFill()).toBeUndefined()
    // KPIBG shapes should have no fill
    const kpiBgs = r.result.requests.filter((req: any) =>
      req.createShape && (req.createShape.objectId ?? '').startsWith('KPIBG')
    )
    for (const bg of kpiBgs) {
      const fill = (bg as any).updateShapeProperties?.shapeProperties?.shapeBackgroundFill?.solidFill?.color?.rgbColor
      expect(fill).toBeUndefined()
    }
  })

  it('MODERN_GRADIENT: DARK_PANEL → cardFill present', () => {
    useTheme('MODERN_GRADIENT')
    expect(resolveCardFill()).toBe('#1E293B')
  })

  it('WARM_STRATEGY: SOFT_FILL → accentSoft as card fill', () => {
    useTheme('WARM_STRATEGY')
    expect(resolveCardFill()).toBe('#FEE2E2')
  })
})

// ---------------------------------------------------------------------------
// D. Shape/border treatment differs by theme
// ---------------------------------------------------------------------------

describe('D: shape/border treatment differs by theme', () => {
  it('BOLD_TECH: SHARP → RECTANGLE', () => {
    useTheme('BOLD_TECH')
    expect(resolveCardShapeType()).toBe('RECTANGLE')
  })

  it('EDITORIAL_MINIMAL: THIN_OUTLINE → 0.5pt', () => {
    useTheme('EDITORIAL_MINIMAL')
    expect(resolveCardOutlineWeight()).toBe(0.5)
  })

  it('PREMIUM_MONOCHROME: THIN_OUTLINE → 0.5pt', () => {
    useTheme('PREMIUM_MONOCHROME')
    expect(resolveCardOutlineWeight()).toBe(0.5)
  })

  it('EXECUTIVE_NAVY: ROUNDED → ROUND_RECTANGLE, 1pt', () => {
    useTheme('EXECUTIVE_NAVY')
    expect(resolveCardShapeType()).toBe('ROUND_RECTANGLE')
    expect(resolveCardOutlineWeight()).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// E. Decorative motif differs by theme
// ---------------------------------------------------------------------------

describe('E: decorative motif differs by theme', () => {
  const region = { x: 0, y: 0, w: 960, h: 540 }

  it('each theme produces different decorative shapes', () => {
    const motifCounts = new Map<string, number>()
    for (const id of THEME_IDS) {
      useTheme(id)
      const motifs = buildDecorativeRequests({ g: { page: { sx: 1, sy: 1 } } } as any, region)
      motifCounts.set(id, motifs.length)
    }
    // At least 2 different motif counts across themes (some share counts)
    const uniqueCounts = new Set(motifCounts.values())
    expect(uniqueCounts.size).toBeGreaterThanOrEqual(2)
  })

  it('MODERN_GRADIENT: LAYERED_HERO produces hero + strip', () => {
    useTheme('MODERN_GRADIENT')
    const motifs = buildDecorativeRequests({ g: { page: { sx: 1, sy: 1 } } } as any, region)
    expect(motifs.length).toBe(2)
    expect(motifs[0].prefix).toBe('DECO_HERO')
    expect(motifs[1].prefix).toBe('DECO_STRIP')
  })

  it('BOLD_TECH: ANGULAR_ACCENT produces sharp accent', () => {
    useTheme('BOLD_TECH')
    const motifs = buildDecorativeRequests({ g: { page: { sx: 1, sy: 1 } } } as any, region)
    expect(motifs.length).toBe(1)
    expect(motifs[0].prefix).toBe('DECO_ANG')
  })
})

// ---------------------------------------------------------------------------
// F. Data-viz treatment differs by theme
// ---------------------------------------------------------------------------

describe('F: data-viz treatment differs by theme', () => {
  it('bar fills differ between LUMINOUS and STANDARD', () => {
    useTheme('MODERN_GRADIENT') // LUMINOUS
    const luminous0 = resolveBarFill(0)
    const luminous1 = resolveBarFill(1)
    useTheme('EXECUTIVE_NAVY') // STANDARD
    const standard0 = resolveBarFill(0)
    // LUMINOUS alternates accent/accent2
    expect(luminous0).not.toBe(luminous1)
    // STANDARD always uses accent
    expect(standard0).toBe(PALETTE.accent)
  })

  it('bar track differs between DARK_PANEL and standard', () => {
    useTheme('MODERN_GRADIENT')
    const darkTrack = resolveBarTrackFill()
    useTheme('EXECUTIVE_NAVY')
    const lightTrack = resolveBarTrackFill()
    expect(darkTrack).not.toBe(lightTrack)
  })

  it('segment fills differ between ANALYTICAL and STANDARD', () => {
    useTheme('DATA_INTELLIGENCE') // ANALYTICAL
    const analytical0 = resolveSegmentFill(0, 4)
    const analytical1 = resolveSegmentFill(1, 4)
    applyTheme(null) // reset
    useTheme('EXECUTIVE_NAVY') // STANDARD
    const standard0 = resolveSegmentFill(0, 4)
    // ANALYTICAL starts with accent2
    expect(analytical0).toBe('#3B82F6') // DATA_INTELLIGENCE accent2
    expect(analytical1).toBe('#10B981') // DATA_INTELLIGENCE accent
    expect(standard0).toBe('#1E3A5F') // EXECUTIVE_NAVY accent
  })
})

// ---------------------------------------------------------------------------
// G. Editorial Minimal uses fewer/no cards (no-card proof)
// ---------------------------------------------------------------------------

describe('G: Editorial Minimal no-card proof', () => {
  const kpi: ComposeInput = {
    pageObjectId: 'P_EM_NC',
    archetype: 'KPI_DASHBOARD',
    title: 'Metrics',
    metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }, { label: 'C', value: '3' }],
  }

  it('EDITORIAL_MINIMAL has zero card fill shapes in KPI', () => {
    useTheme('EDITORIAL_MINIMAL')
    const r = composeSlideOnPage(kpi, { alphaThemeId: 'EDITORIAL_MINIMAL' })
    const cardFills = r.result.requests.filter((req: any) => {
      if (!(req as any).createShape) return false
      const id = (req as any).createShape.objectId ?? ''
      return id.includes('KPIBG')
    })
    // All KPIBG shapes should have no fill (NO_CARD)
    for (const card of cardFills) {
      const updateReq = r.result.requests.find((req: any) =>
        req.updateShapeProperties?.objectId === card.createShape.objectId
      )
      const fill = updateReq?.updateShapeProperties?.shapeProperties?.shapeBackgroundFill?.solidFill?.color?.rgbColor
      expect(fill).toBeUndefined()
    }
  })

  it('EXECUTIVE_NAVY has card fill shapes in KPI', () => {
    useTheme('EXECUTIVE_NAVY')
    expect(resolveCardFill()).toBe('#F1F5F9')
    const r = composeSlideOnPage(kpi, { alphaThemeId: 'EXECUTIVE_NAVY' })
    const cardFills = r.result.requests.filter((req: any) => {
      if (!(req as any).createShape) return false
      const id = (req as any).createShape.objectId ?? ''
      return id.includes('KPIBG')
    })
    // At least one card should have a fill
    const withFill = cardFills.filter((card: any) => {
      const updateReq = r.result.requests.find((req: any) =>
        req.updateShapeProperties?.objectId === card.createShape.objectId
      )
      const fill = updateReq?.updateShapeProperties?.shapeProperties?.shapeBackgroundFill?.solidFill?.color?.rgbColor
      return fill !== undefined
    })
    expect(withFill.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// H. Modern Gradient layered/gradient-like background proof
// ---------------------------------------------------------------------------

describe('H: Modern Gradient layered background proof', () => {
  it('cover emits at least 2 background shapes under MODERN_GRADIENT', () => {
    useTheme('MODERN_GRADIENT')
    const r = composeSlideOnPage(
      { pageObjectId: 'P_MG_BG', archetype: 'COVER', title: 'Test', subtitle: 'Sub' },
      { alphaThemeId: 'MODERN_GRADIENT' }
    )
    const bgShapes = r.result.requests.filter((req: any) =>
      (req as any).createShape && ((req as any).createShape.objectId ?? '').includes('_BG_')
    )
    expect(bgShapes.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// I. Bold Tech uses sharper geometry
// ---------------------------------------------------------------------------

describe('I: Bold Tech sharper geometry proof', () => {
  it('card shapes are RECTANGLE (not ROUND_RECTANGLE) under BOLD_TECH', () => {
    useTheme('BOLD_TECH')
    expect(resolveCardShapeType()).toBe('RECTANGLE')
  })

  it('KPI cards use RECTANGLE shape under BOLD_TECH', () => {
    useTheme('BOLD_TECH')
    const r = composeSlideOnPage(
      { pageObjectId: 'P_BT_KPI', archetype: 'KPI_DASHBOARD', title: 'Test', metrics: [{ label: 'A', value: '1' }] },
      { alphaThemeId: 'BOLD_TECH' }
    )
    const kpiCards = r.result.requests.filter((req: any) =>
      (req as any).createShape && ((req as any).createShape.objectId ?? '').startsWith('KPIBG')
    )
    for (const card of kpiCards) {
      expect((card as any).createShape.shapeType).toBe('RECTANGLE')
    }
  })
})

// ---------------------------------------------------------------------------
// J. Premium Monochrome remains materially monochrome
// ---------------------------------------------------------------------------

describe('J: Premium Monochrome proof', () => {
  it('dominant fills are monochrome (white/gray/black)', () => {
    useTheme('PREMIUM_MONOCHROME')
    const r = composeSlideOnPage(
      { pageObjectId: 'P_PM', archetype: 'KPI_DASHBOARD', title: 'Test', metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }] },
      { alphaThemeId: 'PREMIUM_MONOCHROME' }
    )
    const fills = uniqueShapeFills(r)
    // All fills should be monochrome (no bright accent colors)
    for (const fill of fills) {
      // Parse hex
      const hex = fill.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      // Monochrome: R ≈ G ≈ B (within 30 units)
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b))
      expect(maxDiff).toBeLessThanOrEqual(30)
    }
  })
})

// ---------------------------------------------------------------------------
// K. Same facts across themes
// ---------------------------------------------------------------------------

describe('K: same facts across themes', () => {
  const kpi: ComposeInput = {
    pageObjectId: 'P_FACTS',
    archetype: 'KPI_DASHBOARD',
    title: 'Business Metrics',
    metrics: [
      { label: 'Revenue', value: 'Rp 12B' },
      { label: 'Organizations', value: '2,500' },
      { label: 'Retention', value: '92%' },
    ],
  }

  const themes = ['EXECUTIVE_NAVY', 'MODERN_GRADIENT', 'EDITORIAL_MINIMAL', 'BOLD_TECH', 'PREMIUM_MONOCHROME']

  for (const themeId of themes) {
    it(`text content identical under ${themeId}`, () => {
      useTheme(themeId)
      const r = composeSlideOnPage(kpi, { alphaThemeId: themeId })
      const texts = r.result.requests
        .filter((req: any) => (req as any).insertText)
        .map((req: any) => (req as any).insertText.text)
      expect(texts).toContain('Business Metrics')
      expect(texts).toContain('Rp 12B')
      expect(texts).toContain('2,500')
      expect(texts).toContain('92%')
    })
  }
})

// ---------------------------------------------------------------------------
// L. Same encoding across themes
// ---------------------------------------------------------------------------

describe('L: same encoding across themes', () => {
  const themes = ['EXECUTIVE_NAVY', 'MODERN_GRADIENT', 'EDITORIAL_MINIMAL', 'BOLD_TECH']

  for (const themeId of themes) {
    it(`KPI_GRID encoding under ${themeId}`, () => {
      useTheme(themeId)
      const r = composeSlideOnPage(
        { pageObjectId: 'P_ENC', archetype: 'KPI_DASHBOARD', title: 'Test', metrics: [{ label: 'A', value: '1' }] },
        { alphaThemeId: themeId }
      )
      expect(r.result.expected.encoding).toBe('KPI_GRID')
    })
  }
})

// ---------------------------------------------------------------------------
// M. No theme state bleed
// ---------------------------------------------------------------------------

describe('M: no theme state bleed', () => {
  it('compose A then B then default — no token bleed', () => {
    // Theme A
    useTheme('MODERN_GRADIENT')
    expect(PALETTE.background).toBe('#0F172A')
    composeSlideOnPage(
      { pageObjectId: 'P_BLEED_A', archetype: 'KPI_DASHBOARD', title: 'A', metrics: [{ label: 'X', value: '1' }] },
      { alphaThemeId: 'MODERN_GRADIENT' }
    )
    // Theme B
    useTheme('BOLD_TECH')
    expect(PALETTE.background).toBe('#030712')
    composeSlideOnPage(
      { pageObjectId: 'P_BLEED_B', archetype: 'KPI_DASHBOARD', title: 'B', metrics: [{ label: 'Y', value: '2' }] },
      { alphaThemeId: 'BOLD_TECH' }
    )
    // Default
    applyTheme(null)
    expect(PALETTE.background).toBe('#FFFFFF')
    expect(PALETTE.accent).toBe('#2563EB')
  })

  it('art direction resets between calls', () => {
    useTheme('BOLD_TECH')
    expect(currentArt().shapeStyle).toBe('SHARP')
    composeSlideOnPage(
      { pageObjectId: 'P_BLEED2', archetype: 'KPI_DASHBOARD', title: 'X', metrics: [{ label: 'A', value: '1' }] },
      { alphaThemeId: 'BOLD_TECH' }
    )
    useTheme('EDITORIAL_MINIMAL')
    expect(currentArt().shapeStyle).toBe('THIN_OUTLINE')
    expect(currentArt().surfaceStyle).toBe('NO_CARD')
  })
})

// ---------------------------------------------------------------------------
// N. Contrast safe under dark themes
// ---------------------------------------------------------------------------

describe('N: contrast safe under dark themes', () => {
  const darkThemes = ['MODERN_GRADIENT', 'BOLD_TECH', 'DATA_INTELLIGENCE']

  for (const themeId of darkThemes) {
    it(`${themeId}: text fills are readable on dark backgrounds`, () => {
      useTheme(themeId)
      const white = resolveTextFill('white')
      const ink = resolveTextFill('ink')
      // On dark panels, 'white' should return ink (which is light)
      expect(white).toBe(PALETTE.ink)
      // Ink should be light enough to read on dark background
      const hex = PALETTE.ink.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      expect(luminance).toBeGreaterThan(0.5) // Light text on dark bg
    })
  }
})

// ---------------------------------------------------------------------------
// O. Cover differs beyond palette
// ---------------------------------------------------------------------------

describe('O: Cover differs beyond palette', () => {
  const cover: ComposeInput = {
    pageObjectId: 'P_COVER',
    archetype: 'COVER',
    title: 'Alpha One',
    subtitle: 'Strategy 2027',
    closing: 'Build the future.',
  }

  it('MODERN_GRADIENT cover has background shapes, EXECUTIVE_NAVY does not', () => {
    useTheme('MODERN_GRADIENT')
    const rMG = composeSlideOnPage(cover, { alphaThemeId: 'MODERN_GRADIENT' })
    const bgMG = rMG.result.requests.filter((req: any) =>
      (req as any).createShape && ((req as any).createShape.objectId ?? '').includes('_BG_')
    ).length

    useTheme('EXECUTIVE_NAVY')
    const rEN = composeSlideOnPage(cover, { alphaThemeId: 'EXECUTIVE_NAVY' })
    const bgEN = rEN.result.requests.filter((req: any) =>
      (req as any).createShape && ((req as any).createShape.objectId ?? '').includes('_BG_')
    ).length

    expect(bgMG).toBeGreaterThan(bgEN)
  })
})

// ---------------------------------------------------------------------------
// P. KPI differs beyond palette
// ---------------------------------------------------------------------------

describe('P: KPI differs beyond palette', () => {
  const kpi: ComposeInput = {
    pageObjectId: 'P_KPI_DIFF',
    archetype: 'KPI_DASHBOARD',
    title: 'Metrics',
    metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }],
  }

  it('shape types differ between BOLD_TECH and EXECUTIVE_NAVY', () => {
    useTheme('BOLD_TECH')
    const rBT = composeSlideOnPage(kpi, { alphaThemeId: 'BOLD_TECH' })
    const shapesBT = rBT.result.requests.filter((req: any) => (req as any).createShape)
    const shapeTypesBT = shapesBT.map((s: any) => s.createShape.shapeType)
    const hasRect = shapeTypesBT.includes('RECTANGLE')

    useTheme('EXECUTIVE_NAVY')
    const rEN = composeSlideOnPage(kpi, { alphaThemeId: 'EXECUTIVE_NAVY' })
    const shapesEN = rEN.result.requests.filter((req: any) => (req as any).createShape)
    const shapeTypesEN = shapesEN.map((s: any) => s.createShape.shapeType)
    const hasRoundRect = shapeTypesEN.includes('ROUND_RECTANGLE')

    // BOLD_TECH uses RECTANGLE; EXECUTIVE_NAVY uses ROUND_RECTANGLE
    expect(hasRect).toBe(true)
    expect(hasRoundRect).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Q. Ranked bars differ beyond palette
// ---------------------------------------------------------------------------

describe('Q: ranked bars differ beyond palette', () => {
  const bars: ComposeInput = {
    pageObjectId: 'P_BARS',
    archetype: 'COMPARISON',
    title: 'Channels',
    columns: [
      { name: 'Ads', items: ['42%'] },
      { name: 'Partners', items: ['28%'] },
      { name: 'Organic', items: ['18%'] },
      { name: 'Referrals', items: ['12%'] },
    ],
  }

  it('MODERN_GRADIENT has bar tracks, EDITORIAL_MINIMAL has different track', () => {
    useTheme('MODERN_GRADIENT')
    const rMG = composeSlideOnPage(bars, { alphaThemeId: 'MODERN_GRADIENT' })
    const trackMG = resolveBarTrackFill()

    useTheme('EDITORIAL_MINIMAL')
    const rEM = composeSlideOnPage(bars, { alphaThemeId: 'EDITORIAL_MINIMAL' })
    const trackEM = resolveBarTrackFill()

    expect(trackMG).not.toBe(trackEM)
  })
})

// ---------------------------------------------------------------------------
// R. Parts-of-whole differs beyond palette
// ---------------------------------------------------------------------------

describe('R: parts-of-whole differs beyond palette', () => {
  it('segment fills differ between DATA_INTELLIGENCE and EXECUTIVE_NAVY', () => {
    useTheme('DATA_INTELLIGENCE')
    const segDI = [resolveSegmentFill(0, 4), resolveSegmentFill(1, 4), resolveSegmentFill(2, 4)]

    useTheme('EXECUTIVE_NAVY')
    const segEN = [resolveSegmentFill(0, 4), resolveSegmentFill(1, 4), resolveSegmentFill(2, 4)]

    // At least one segment fill differs
    const diffs = segDI.filter((s, i) => s !== segEN[i])
    expect(diffs.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// S. Pillars shared goal preserved across themes
// ---------------------------------------------------------------------------

describe('S: pillars shared goal preserved across themes', () => {
  const pillars: ComposeInput = {
    pageObjectId: 'P_PIL',
    archetype: 'PILLARS_STRATEGY',
    title: 'Strategy',
    columns: [
      { name: 'Pillar 1', items: ['A'] },
      { name: 'Pillar 2', items: ['B'] },
    ],
    sharedGoal: 'Build the future.',
  }

  const themes = ['EXECUTIVE_NAVY', 'MODERN_GRADIENT', 'EDITORIAL_MINIMAL']

  for (const themeId of themes) {
    it(`shared goal present under ${themeId}`, () => {
      useTheme(themeId)
      const r = composeSlideOnPage(pillars, { alphaThemeId: themeId })
      const texts = r.result.requests
        .filter((req: any) => (req as any).insertText)
        .map((req: any) => (req as any).insertText.text)
      expect(texts).toContain('Build the future.')
    })
  }
})

// ---------------------------------------------------------------------------
// T. Closing facts preserved across themes
// ---------------------------------------------------------------------------

describe('T: closing facts preserved across themes', () => {
  const closing: ComposeInput = {
    pageObjectId: 'P_CLOSE',
    archetype: 'CLOSING_INSIGHT',
    title: 'Thank You',
    closing: 'Build the future together.',
  }

  const themes = ['EXECUTIVE_NAVY', 'MODERN_GRADIENT', 'BOLD_TECH', 'EDITORIAL_MINIMAL']

  for (const themeId of themes) {
    it(`closing text preserved under ${themeId}`, () => {
      useTheme(themeId)
      const r = composeSlideOnPage(closing, { alphaThemeId: themeId })
      const texts = r.result.requests
        .filter((req: any) => (req as any).insertText)
        .map((req: any) => (req as any).insertText.text)
      expect(texts).toContain('Build the future together.')
    })
  }
})

// ---------------------------------------------------------------------------
// Theme Art-Direction Matrix
// ---------------------------------------------------------------------------

describe('Theme Art-Direction Matrix', () => {
  it('all 8 themes have meaningful art direction differences', () => {
    const matrix: Array<{ id: string; bg: string; surface: string; shape: string; typo: string; deco: string; dataviz: string; density: string }> = []
    for (const id of THEME_IDS) {
      const t = THEMES[id]
      matrix.push({
        id,
        bg: t.art.backgroundStyle,
        surface: t.art.surfaceStyle,
        shape: t.art.shapeStyle,
        typo: t.art.typographyPersonality,
        deco: t.art.decorativeMotif,
        dataviz: t.art.dataVizStyle,
        density: t.art.density,
      })
    }
    // Each dimension has at least 2 unique values across themes
    const dims = ['bg', 'surface', 'shape', 'typo', 'deco', 'dataviz', 'density'] as const
    for (const dim of dims) {
      const values = new Set(matrix.map((m) => m[dim]))
      expect(values.size).toBeGreaterThanOrEqual(2)
    }
  })
})

// ---------------------------------------------------------------------------
// Density behavior
// ---------------------------------------------------------------------------

describe('Density behavior', () => {
  it('SPACIOUS vs COMPACT produce different multipliers', () => {
    useTheme('WARM_STRATEGY') // SPACIOUS
    const spacious = resolveDensityMul()
    useTheme('BOLD_TECH') // COMPACT
    const compact = resolveDensityMul()
    expect(spacious).toBeGreaterThan(compact)
  })
})

// ---------------------------------------------------------------------------
// Metric treatment
// ---------------------------------------------------------------------------

describe('Metric treatment', () => {
  it('HERO_NUMBER produces larger metric scale than CARD_PANEL', () => {
    useTheme('MODERN_GRADIENT') // HERO_NUMBER
    const hero = resolveMetricScale()
    useTheme('EXECUTIVE_NAVY') // CARD_PANEL
    const card = resolveMetricScale()
    expect(hero).toBeGreaterThan(card)
  })
})

// ---------------------------------------------------------------------------
// Theme metadata consistency
// ---------------------------------------------------------------------------

describe('Theme metadata consistency', () => {
  for (const id of THEME_IDS) {
    it(`${id}: metadata describes actual runtime behavior`, () => {
      const t = THEMES[id]
      // If visualTraits mention "dark", mode should be DARK
      if (t.meta.visualTraits.some((v) => v.includes('dark'))) {
        expect(t.meta.mode).toBe('DARK')
      }
      // If visualTraits mention "typography-led", surface should be NO_CARD or MINIMAL_RULE
      if (t.meta.visualTraits.some((v) => v.includes('typography-led'))) {
        expect(['NO_CARD', 'MINIMAL_RULE']).toContain(t.art.surfaceStyle)
      }
      // If visualTraits mention "sharper", shape should be SHARP
      if (t.meta.visualTraits.some((v) => v.includes('sharper'))) {
        expect(t.art.shapeStyle).toBe('SHARP')
      }
    })
  }
})
