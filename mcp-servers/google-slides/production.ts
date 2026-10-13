/**
 * TASK-096: Production theme contract for Alpha Beautify go-live.
 *
 * Single production candidate: ALPHA_NAVY_TEAL_PRODUCTION_V1 (backed by the
 * NAVY_TEAL_PRODUCTION legacy theme in themes.ts — the ONE new theme this
 * task adds; the single source of every production HEX below).
 *
 * This module owns, in one place:
 * - semantic color tokens (aliases of the backing palette roles),
 * - typography roles with enforced minima,
 * - shape/surface tokens,
 * - the five background-family variants,
 * - the ten production layout variants with capacity profiles,
 * - deterministic variant selection,
 * - production preflights (capacity + typography), enforced only when the
 *   resolved deck theme is the production theme — all other themes are
 *   completely unaffected.
 *
 * Renderers are NOT rewritten here: they already resolve every style
 * through the module-level PALETTE / ctx accents / resolve* helpers, which
 * carry exactly these token values once the production theme is applied.
 * The focused tests assert renderer-observed colors equal token values, so
 * any future literal-color drift fails loudly.
 */

import { THEMES } from './themes'
import { mixHex } from './beautify'
import type { Archetype } from './beautify'
import type { PlacedElement } from './geometry'

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const PRODUCTION_THEME_ID = 'ALPHA_NAVY_TEAL_PRODUCTION_V1'
export const PRODUCTION_BACKING_THEME_ID = 'NAVY_TEAL_PRODUCTION'
export const PRODUCTION_DESIGN_TOKEN_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Color tokens (single source: THEMES.NAVY_TEAL_PRODUCTION.palette)
// ---------------------------------------------------------------------------

const PAL = THEMES.NAVY_TEAL_PRODUCTION.palette

/** Semantic color token name → resolved HEX. */
export const PRODUCTION_COLOR_TOKENS = {
  'background.primary': PAL.background,
  'background.secondary': PAL.cardFill,
  'background.hero': PAL.background,
  'surface.card': PAL.cardFill,
  'surface.cardStrong': PAL.cardFill,
  'surface.dataTrack': PAL.line,
  'text.primary': PAL.ink,
  'text.secondary': PAL.muted,
  'text.muted': PAL.muted,
  'accent.primary': PAL.accent,
  'accent.secondary': PAL.accent2,
  'accent.comparison': PAL.accent2,
  'accent.aggregate': PAL.accent,
  'border.subtle': PAL.line,
  'border.strong': PAL.line,
  'status.positive': PAL.accent,
  'status.warning': PAL.accent2,
  'status.negative': PAL.muted,
  /**
   * Derived tokens (computed from palette roles, never scattered literals):
   * background.bandMid is the GRADIENT_LIKE mid stop
   * (mixHex(accentSoft, accent, 0.55), same call the renderer uses);
   * text.onAccent is the dark-ink side of bestTextOnFill for light accents.
   */
  'background.bandMid': mixHex(PAL.accentSoft, PAL.accent, 0.55),
  'text.onAccent': '#0F172A',
} as const

export type ProductionColorToken = keyof typeof PRODUCTION_COLOR_TOKENS

export function productionColor(token: ProductionColorToken): string {
  return PRODUCTION_COLOR_TOKENS[token]
}

/** Every token value must be a valid 6-digit HEX color. */
export function productionTokenValues(): string[] {
  return [...new Set(Object.values(PRODUCTION_COLOR_TOKENS))]
}

// ---------------------------------------------------------------------------
// Typography roles
// ---------------------------------------------------------------------------

export interface ProductionTypeRole {
  role: string
  /** Existing engine text role this maps to (renderer behavior unchanged). */
  engineRole: 'deckTitle' | 'slideTitle' | 'sectionHeading' | 'cardHeading' | 'kpiValue' | 'body' | 'caption'
  fontFamily: string
  fontSizePt: number
  bold: boolean
  colorToken: ProductionColorToken
  maxLines: number
  minSizePt: number
}

export const PRODUCTION_TYPE_ROLES: Record<string, ProductionTypeRole> = {
  coverTitle: { role: 'coverTitle', engineRole: 'deckTitle', fontFamily: 'Inter, Arial', fontSizePt: 44, bold: true, colorToken: 'text.primary', maxLines: 3, minSizePt: 28 },
  coverSubtitle: { role: 'coverSubtitle', engineRole: 'body', fontFamily: 'Inter, Arial', fontSizePt: 14, bold: false, colorToken: 'text.secondary', maxLines: 2, minSizePt: 12 },
  slideTitle: { role: 'slideTitle', engineRole: 'slideTitle', fontFamily: 'Inter, Arial', fontSizePt: 32, bold: true, colorToken: 'text.primary', maxLines: 2, minSizePt: 20 },
  eyebrow: { role: 'eyebrow', engineRole: 'sectionHeading', fontFamily: 'Inter, Arial', fontSizePt: 20, bold: true, colorToken: 'text.secondary', maxLines: 1, minSizePt: 14 },
  sectionLabel: { role: 'sectionLabel', engineRole: 'sectionHeading', fontFamily: 'Inter, Arial', fontSizePt: 20, bold: true, colorToken: 'text.primary', maxLines: 2, minSizePt: 14 },
  metricValue: { role: 'metricValue', engineRole: 'kpiValue', fontFamily: 'Inter, Arial', fontSizePt: 40, bold: true, colorToken: 'accent.primary', maxLines: 2, minSizePt: 18 },
  metricLabel: { role: 'metricLabel', engineRole: 'body', fontFamily: 'Inter, Arial', fontSizePt: 14, bold: false, colorToken: 'text.primary', maxLines: 3, minSizePt: 12 },
  cardTitle: { role: 'cardTitle', engineRole: 'cardHeading', fontFamily: 'Inter, Arial', fontSizePt: 20, bold: true, colorToken: 'text.primary', maxLines: 2, minSizePt: 12 },
  body: { role: 'body', engineRole: 'body', fontFamily: 'Inter, Arial', fontSizePt: 14, bold: false, colorToken: 'text.primary', maxLines: 6, minSizePt: 12 },
  dataLabel: { role: 'dataLabel', engineRole: 'body', fontFamily: 'Inter, Arial', fontSizePt: 14, bold: false, colorToken: 'text.primary', maxLines: 2, minSizePt: 12 },
  dataValue: { role: 'dataValue', engineRole: 'body', fontFamily: 'Inter, Arial', fontSizePt: 14, bold: true, colorToken: 'text.primary', maxLines: 1, minSizePt: 12 },
  caption: { role: 'caption', engineRole: 'caption', fontFamily: 'Inter, Arial', fontSizePt: 11, bold: false, colorToken: 'text.secondary', maxLines: 3, minSizePt: 8 },
  sourceNote: { role: 'sourceNote', engineRole: 'caption', fontFamily: 'Inter, Arial', fontSizePt: 11, bold: false, colorToken: 'text.muted', maxLines: 2, minSizePt: 8 },
  closingStatement: { role: 'closingStatement', engineRole: 'deckTitle', fontFamily: 'Inter, Arial', fontSizePt: 44, bold: true, colorToken: 'text.primary', maxLines: 6, minSizePt: 28 },
}

// ---------------------------------------------------------------------------
// Shape and surface tokens
// ---------------------------------------------------------------------------

export const PRODUCTION_SURFACE_TOKENS = {
  cardFill: PAL.cardFill,
  cardBorder: PAL.line,
  cardRadius: 'ROUND_RECTANGLE',
  dataTrackFill: PAL.line,
  activeBarFill: PAL.accent,
  dividerStyle: 'thin-accent-rule',
  timelineLine: PAL.line,
  timelineNode: PAL.accent,
  funnelStageSurface: PAL.cardFill,
  shadowBehavior: 'none-flat-dark',
  accentLine: PAL.accent,
  aggregateCalloutSurface: PAL.accentSoft,
} as const

// ---------------------------------------------------------------------------
// Background family
// ---------------------------------------------------------------------------

export type ProductionBackgroundVariant =
  | 'HERO_BACKGROUND'
  | 'CONTENT_BACKGROUND'
  | 'DATA_BACKGROUND'
  | 'SECTION_BACKGROUND'
  | 'CLOSING_BACKGROUND'

export interface ProductionBackgroundSpec {
  variant: ProductionBackgroundVariant
  /** IMAGE_GRADIENT only when a stable asset URL is supplied; else SOLID. */
  technique: 'IMAGE_GRADIENT' | 'SOLID'
  /** Solid page color used when technique is SOLID. */
  solidHex: string
}

export function productionBackgroundFor(
  productionVariant: ProductionVariantId,
  imageUrl: string | undefined
): ProductionBackgroundSpec {
  const image = typeof imageUrl === 'string' && /^https:\/\//i.test(imageUrl.trim())
  if (productionVariant === 'COVER_HERO') {
    return {
      variant: 'HERO_BACKGROUND',
      technique: image ? 'IMAGE_GRADIENT' : 'SOLID',
      solidHex: productionColor('background.primary'),
    }
  }
  if (productionVariant === 'CLOSING_STATEMENT') {
    return {
      variant: 'CLOSING_BACKGROUND',
      technique: image ? 'IMAGE_GRADIENT' : 'SOLID',
      solidHex: productionColor('background.primary'),
    }
  }
  if (productionVariant === 'RANKED_BARS_4' || productionVariant === 'ALLOCATION_4_PLUS_TOTAL') {
    return { variant: 'DATA_BACKGROUND', technique: 'SOLID', solidHex: productionColor('background.secondary') }
  }
  if (productionVariant === 'EXECUTIVE_SUMMARY_LIST') {
    return { variant: 'SECTION_BACKGROUND', technique: 'SOLID', solidHex: productionColor('background.primary') }
  }
  return { variant: 'CONTENT_BACKGROUND', technique: 'SOLID', solidHex: productionColor('background.primary') }
}

// ---------------------------------------------------------------------------
// Production layout variants + capacity profiles
// ---------------------------------------------------------------------------

export type ProductionVariantId =
  | 'COVER_HERO'
  | 'EXECUTIVE_SUMMARY_LIST'
  | 'KPI_GRID_2X2'
  | 'FUNNEL_5_TWO_ROW'
  | 'COMPARISON_2_PERIOD'
  | 'ROADMAP_4'
  | 'PILLARS_3'
  | 'RANKED_BARS_4'
  | 'ALLOCATION_4_PLUS_TOTAL'
  | 'CLOSING_STATEMENT'

export interface CapacityProfile {
  minItems: number
  maxItems: number
  maxTitleChars: number
  maxItemChars: number
  maxLines: number
  minFontPt: number
  /** The single deterministic reflow the engine may apply (or 'none'). */
  allowedReflow: 'none' | 'font-shrink-ladder' | 'two-row' | 'compact-layout'
  terminalCondition: string
}

export interface ProductionVariant {
  id: ProductionVariantId
  archetype: Archetype
  capacity: CapacityProfile
}

export const PRODUCTION_VARIANTS: Record<ProductionVariantId, ProductionVariant> = {
  COVER_HERO: {
    id: 'COVER_HERO', archetype: 'COVER',
    capacity: { minItems: 0, maxItems: 0, maxTitleChars: 200, maxItemChars: 300, maxLines: 3, minFontPt: 28, allowedReflow: 'none', terminalCondition: 'missing title' },
  },
  EXECUTIVE_SUMMARY_LIST: {
    id: 'EXECUTIVE_SUMMARY_LIST', archetype: 'EXECUTIVE_SUMMARY',
    capacity: { minItems: 1, maxItems: 5, maxTitleChars: 200, maxItemChars: 500, maxLines: 6, minFontPt: 12, allowedReflow: 'font-shrink-ladder', terminalCondition: 'CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS' },
  },
  KPI_GRID_2X2: {
    id: 'KPI_GRID_2X2', archetype: 'KPI_DASHBOARD',
    capacity: { minItems: 4, maxItems: 4, maxTitleChars: 200, maxItemChars: 120, maxLines: 2, minFontPt: 18, allowedReflow: 'font-shrink-ladder', terminalCondition: 'CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS' },
  },
  FUNNEL_5_TWO_ROW: {
    id: 'FUNNEL_5_TWO_ROW', archetype: 'PROCESS_FUNNEL',
    capacity: { minItems: 5, maxItems: 5, maxTitleChars: 200, maxItemChars: 500, maxLines: 3, minFontPt: 12, allowedReflow: 'two-row', terminalCondition: 'CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS' },
  },
  COMPARISON_2_PERIOD: {
    id: 'COMPARISON_2_PERIOD', archetype: 'COMPARISON',
    capacity: { minItems: 2, maxItems: 2, maxTitleChars: 200, maxItemChars: 500, maxLines: 6, minFontPt: 12, allowedReflow: 'font-shrink-ladder', terminalCondition: 'CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS' },
  },
  ROADMAP_4: {
    id: 'ROADMAP_4', archetype: 'TIMELINE_ROADMAP',
    capacity: { minItems: 4, maxItems: 4, maxTitleChars: 200, maxItemChars: 500, maxLines: 3, minFontPt: 12, allowedReflow: 'font-shrink-ladder', terminalCondition: 'CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS' },
  },
  PILLARS_3: {
    id: 'PILLARS_3', archetype: 'PILLARS_STRATEGY',
    capacity: { minItems: 3, maxItems: 3, maxTitleChars: 200, maxItemChars: 500, maxLines: 6, minFontPt: 12, allowedReflow: 'font-shrink-ladder', terminalCondition: 'CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS' },
  },
  RANKED_BARS_4: {
    id: 'RANKED_BARS_4', archetype: 'COMPARISON',
    capacity: { minItems: 4, maxItems: 4, maxTitleChars: 200, maxItemChars: 160, maxLines: 2, minFontPt: 12, allowedReflow: 'font-shrink-ladder', terminalCondition: 'CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS' },
  },
  ALLOCATION_4_PLUS_TOTAL: {
    id: 'ALLOCATION_4_PLUS_TOTAL', archetype: 'COMPARISON',
    capacity: { minItems: 4, maxItems: 4, maxTitleChars: 200, maxItemChars: 160, maxLines: 2, minFontPt: 12, allowedReflow: 'font-shrink-ladder', terminalCondition: 'CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS' },
  },
  CLOSING_STATEMENT: {
    id: 'CLOSING_STATEMENT', archetype: 'CLOSING_INSIGHT',
    capacity: { minItems: 1, maxItems: 1, maxTitleChars: 200, maxItemChars: 500, maxLines: 6, minFontPt: 28, allowedReflow: 'compact-layout', terminalCondition: 'CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS' },
  },
}

export type DeckTopology =
  | 'COVER'
  | 'BULLETS'
  | 'KPI'
  | 'STAGES'
  | 'COMPARISON_GROUPS'
  | 'PILLARS'
  | 'DISTRIBUTION'
  | 'CLOSING'
  | 'COMPAT_ITEMS'

/**
 * Deterministic production variant selection from deck topology.
 * DISTRIBUTION splits on aggregate presence (allocation needs the callout);
 * STAGES splits on the selected archetype (timeline vs funnel).
 */
export function productionVariantFor(
  topology: DeckTopology,
  selectedArchetype: Archetype,
  hasAggregate: boolean
): ProductionVariantId {
  switch (topology) {
    case 'COVER':
      return 'COVER_HERO'
    case 'BULLETS':
      return 'EXECUTIVE_SUMMARY_LIST'
    case 'KPI':
      return 'KPI_GRID_2X2'
    case 'STAGES':
      return selectedArchetype === 'TIMELINE_ROADMAP' ? 'ROADMAP_4' : 'FUNNEL_5_TWO_ROW'
    case 'COMPARISON_GROUPS':
      return 'COMPARISON_2_PERIOD'
    case 'PILLARS':
      return 'PILLARS_3'
    case 'DISTRIBUTION':
      return hasAggregate ? 'ALLOCATION_4_PLUS_TOTAL' : 'RANKED_BARS_4'
    case 'CLOSING':
      return 'CLOSING_STATEMENT'
    case 'COMPAT_ITEMS':
    default:
      return 'EXECUTIVE_SUMMARY_LIST'
  }
}

// ---------------------------------------------------------------------------
// Production preflights (production theme only; other themes unaffected)
// ---------------------------------------------------------------------------

export interface ProductionPreflight {
  check: string
  pass: boolean
  detail?: string
}

/** Count of mandatory content items for capacity purposes. */
export function productionItemCount(input: {
  bullets?: string[]
  metrics?: Array<unknown>
  stages?: Array<unknown>
  columns?: Array<{ items?: Array<unknown> }>
  closing?: string
}): number {
  if (input.metrics) return input.metrics.length
  if (input.stages) return input.stages.length
  if (input.columns) return input.columns.length
  if (input.bullets) return input.bullets.length
  if (input.closing) return 1
  return 0
}

/**
 * Capacity gate: item counts and title/item lengths for the variant.
 * Violations are terminal (coded by the caller) — content is never trimmed.
 */
export function preflightProductionCapacity(
  variantId: ProductionVariantId,
  input: { title: string; bullets?: string[]; metrics?: Array<{ label?: string; value?: string }>; stages?: Array<{ label?: string; description?: string }>; columns?: Array<{ name?: string; items?: string[] }>; closing?: string }
): ProductionPreflight[] {
  const out: ProductionPreflight[] = []
  const fail = (detail: string): void => {
    out.push({ check: 'PRODUCTION_CAPACITY', pass: false, detail })
  }
  const profile = PRODUCTION_VARIANTS[variantId].capacity
  if (input.title.trim().length === 0) fail(`${variantId}: missing title`)
  if (input.title.length > profile.maxTitleChars) {
    fail(`${variantId}: title ${input.title.length} chars exceeds ${profile.maxTitleChars}`)
  }
  const count = productionItemCount(input)
  // COVER_HERO carries no countable items (title/subtitle only).
  if (variantId !== 'COVER_HERO' && (count < profile.minItems || count > profile.maxItems)) {
    fail(`${variantId}: item count ${count} outside [${profile.minItems}, ${profile.maxItems}]`)
  }
  const texts: string[] = [
    ...(input.bullets ?? []),
    ...(input.metrics ?? []).flatMap((m) => [m.label ?? '', m.value ?? '']),
    ...(input.stages ?? []).flatMap((s) => [s.label ?? '', s.description ?? '']),
    ...(input.columns ?? []).flatMap((c) => [c.name ?? '', ...(c.items ?? [])]),
    ...(input.closing ? [input.closing] : []),
  ]
  for (const t of texts) {
    if (t.length > profile.maxItemChars) {
      fail(`${variantId}: item text ${t.length} chars exceeds ${profile.maxItemChars}: ${t.slice(0, 60)}`)
    }
  }
  if (out.length === 0) {
    out.push({ check: 'PRODUCTION_CAPACITY', pass: true, detail: `${variantId}: capacity ok (items=${count})` })
  }
  return out
}

/**
 * Typography gate: narrative roles must not fall below production minima.
 * Reads composed placed entries (fontPt + role); body-like roles require
 * 12pt even though the global floor is 10pt. Caption roles keep their
 * classified 8pt floor.
 *
 * Minima are DESIGN-SPACE (authored) sizes: the comparison normalizes by
 * the canvas fontScale, so a 14pt-authored body on a 0.75-scale page
 * (10.5pt rendered, proportionally identical) passes, while genuine
 * shrink-ladder degradation below the authored floor fails. Without the
 * normalization the gate could never pass on any real page.
 */
export function preflightProductionTypography(
  placed: PlacedElement[],
  fontScale = 1
): ProductionPreflight[] {
  const out: ProductionPreflight[] = []
  const scale = fontScale > 0 && Number.isFinite(fontScale) ? fontScale : 1
  for (const el of placed) {
    if (el.kind !== 'text' || el.fontPt === undefined) continue
    const role = el.role ?? 'body'
    const min =
      role === 'body' || role === 'cardHeading' ? 12
      : role === 'kpiValue' ? 18
      : role === 'deckTitle' ? 28
      : role === 'slideTitle' ? 20
      : role === 'sectionHeading' ? 14
      : 8
    if (el.fontPt / scale < min - 1e-9) {
      out.push({ check: 'PRODUCTION_TYPE_MINIMUM', pass: false, detail: `${el.id} ${role}@${el.fontPt}pt<min${min} (design-space)` })
    }
  }
  if (out.length === 0) {
    out.push({ check: 'PRODUCTION_TYPE_MINIMUM', pass: true, detail: 'all narrative roles meet production minima' })
  }
  return out
}
