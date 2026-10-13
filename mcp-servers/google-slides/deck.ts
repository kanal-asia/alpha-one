/**
 * TASK-095-R1: Deck-level Alpha Beautify composition foundation.
 *
 * This module keeps deck semantics typed until the final renderer adapter.
 * It reuses the existing single-slide planner/compiler, but owns deck
 * topology validation, deterministic lifecycle, source inventory, recursive
 * readback, post-write semantic fidelity, and honest capability reporting.
 */

import { googleRequest } from '../shared/google/rest'
import {
  buildCreateSlide,
  buildUpdatePageBackground,
  executeBatch,
  textResult,
  type GoogleRequest,
  type McpTextResult,
} from './visual'
import {
  ARCHETYPES,
  composeSlideOnPage,
  expectedEncodingFor,
  fingerprintFacts,
  type Archetype,
  type ColumnDatum,
  type ComposeInput,
  type MetricDatum,
  type SlideContent,
  type StageDatum,
} from './beautify'
import { DEFAULT_THEME_ID, THEMES, resolveTheme, resolveThemePrecedence, type AlphaTheme } from './themes'
import { EMU_PER_PT, GOOGLE_DEFAULT_PAGE_PT, pageDimensionPt, pageSizeMatches, resolvePageGeometry, type AuthoritativePageSize } from './geometry'
import {
  PRODUCTION_THEME_ID,
  productionBackgroundFor,
  productionVariantFor,
  preflightProductionCapacity,
  preflightProductionTypography,
  type DeckTopology,
} from './production'


const MAX_DECK_SLIDES = 20
const MAX_TITLE = 200
const MAX_SHORT_TEXT = 300
const MAX_FACT_TEXT = 500
const SOURCE_FACT_FORWARD_LIMIT = 64

export type FailurePolicy = 'ALL_OR_NOTHING'
export type VisualQaPolicy = 'STRUCTURAL_ONLY'
export type BackgroundTechnique = 'SOLID' | 'TONAL_BANDS' | 'IMAGE_GRADIENT' | 'PHOTO_OVERLAY' | 'TEMPLATE_INHERITED'
export type ThemeStatus = 'structural_only' | 'experimental' | 'production' | 'disabled'
export type SemanticTopology =
  | 'COVER'
  | 'BULLETS'
  | 'KPI'
  | 'STAGES'
  | 'COMPARISON_GROUPS'
  | 'PILLARS'
  | 'DISTRIBUTION'
  | 'CLOSING'
  | 'COMPAT_ITEMS'

export interface BulletItem {
  text: string
  sourceReference?: string
  order?: number
}

export interface FactItem {
  factId?: string
  label: string
  value?: string
  unit?: string
  period?: string
  category?: string
  order?: number
  sourceText?: string
  sourceReference?: string
}

export interface AggregateFact {
  factId?: string
  label: string
  value: string
  unit?: string
  sourceText?: string
  sourceReference?: string
}

export interface StageSpec {
  stageId: string
  label: string
  value?: string
  unit?: string
  description?: string
  order: number
  sourceText?: string
  sourceReference?: string
}

export interface ComparisonItem {
  factId: string
  label: string
  value: string
  unit?: string
  sourceText?: string
  sourceReference?: string
}

export interface ComparisonGroup {
  groupId: string
  name: string
  items: ComparisonItem[]
}

export interface PillarSpec {
  pillarId: string
  name: string
  items: Array<string | FactItem>
  sourceReference?: string
}

export interface DistributionItem {
  factId: string
  label: string
  value: string
  unit?: string
  amount?: string
  amountUnit?: string
  sourceText?: string
  sourceReference?: string
  order?: number
}

export interface ClosingThesis {
  eyebrow?: string
  statement: string
  sourceReference?: string
}

export interface MediaItem {
  mediaId?: string
  type: 'image'
  url: string
  sourceUrl?: string
  license?: string
  attribution?: string
  altText?: string
  placementRole?: string
}

export interface DeckSlideSpec {
  slideKey: string
  narrativeRole?: string
  title: string
  subtitle?: string
  bullets?: BulletItem[]
  stages?: StageSpec[]
  comparisonGroups?: ComparisonGroup[]
  pillars?: PillarSpec[]
  distributionItems?: DistributionItem[]
  /** Compatibility-only generic facts. Prefer typed blocks above. */
  items?: FactItem[]
  aggregate?: AggregateFact
  headlineMetrics?: FactItem[]
  annotations?: string[]
  sharedGoal?: string
  sourceNotes?: string[]
  closingThesis?: ClosingThesis
  media?: MediaItem[]
  preferredArchetype?: Archetype
  importance?: 'low' | 'normal' | 'high'
}

export interface DeckSpec {
  title: string
  purpose?: string
  audience?: string
  locale?: string
  themeId?: string
  slideCount?: number
  requestedSlideCount?: number
  slides: DeckSlideSpec[]
  failurePolicy: FailurePolicy
  visualQaPolicy: VisualQaPolicy
  /**
   * TASK-096: stable https URL of the decorative production gradient asset.
   * Optional; when present and the production theme is resolved, hero and
   * closing slides use it as a stretched picture page background. Without
   * it, all slides fall back to solid navy and the gradient criterion fails.
   */
  backgroundImageUrl?: string
}

export interface SourceFactIdentity {
  factId: string
  kind: 'peer' | 'aggregate' | 'metric' | 'stage' | 'comparison' | 'pillar' | 'bullet' | 'closing'
  label: string
  value?: string
  unit?: string
  period?: string
  category?: string
  sourceText: string
}

export interface SlideAdaptation {
  slideKey: string
  pageObjectId: string
  topology: SemanticTopology
  input: ComposeInput
  selectedArchetype: Archetype
  variant: string
  /** TASK-096: production layout variant id (COVER_HERO, KPI_GRID_2X2, ...). */
  productionVariant: string
  reason: string
  peerCount: number
  aggregateCount: number
  sourceFacts: SourceFactIdentity[]
  sourceFingerprint: string
  compatibilityMode: boolean
  warnings: string[]
}

export interface CompiledDeckPlan {
  spec: DeckSpec
  theme: ThemeResolution
  plannedSlideIds: string[]
  slides: SlideAdaptation[]
  requests: GoogleRequest[]
  perSlide: Array<Record<string, unknown>>
  /**
   * TASK-096-R1: the design-canvas size every renderer assumed. The handler
   * must verify it against the authoritative presentation pageSize after
   * creation and fail terminally on mismatch — assumption is never trusted.
   */
  assumedPageSize: AuthoritativePageSize
  /** TASK-096-R1: post-compile deck geometry verification (pre-write). */
  geometry: DeckGeometryVerification
  internalAccounting: {
    internalSlidesPlanned: number
    internalRendererCalls: number
    variantsEvaluated: number
    compiledSubrequests: number
    preflightChecks: number
  }
}

export interface SlideGeometryRecord {
  slideKey: string
  pageObjectId: string
  pageBounds: { x: number; y: number; w: number; h: number }
  /** Present only when a full-page background update targets this slide. */
  backgroundBounds: { x: number; y: number; w: number; h: number } | null
  backgroundKind: 'page-property' | 'missing'
  contentBounds: { x: number; y: number; w: number; h: number } | null
  meaningfulObjectCount: number
  outOfPageIds: string[]
  negativeDimensionIds: string[]
  geometryStatus: 'PASS' | 'FAIL'
}

export interface DeckGeometryVerification {
  pageBounds: { x: number; y: number; w: number; h: number }
  slides: SlideGeometryRecord[]
  status: 'PASS' | 'FAIL'
  violations: string[]
}

interface PresentationRead {
  presentationId: string
  title?: string
  pageSize?: {
    width?: { magnitude?: number; unit?: string }
    height?: { magnitude?: number; unit?: string }
  }
  slides?: GoogleSlideRead[]
}

interface GoogleSlideRead {
  objectId?: string
  pageElements?: GooglePageElementRead[]
}

interface GooglePageElementRead {
  objectId?: string
  shape?: { text?: { textElements?: Array<{ textRun?: { content?: string } }> }; shapeType?: string }
  image?: { contentUrl?: string; sourceUrl?: string }
  table?: { rows?: number; columns?: number; tableRows?: unknown[] }
  sheetsChart?: unknown
  line?: unknown
  elementGroup?: { children?: GooglePageElementRead[] }
}

export interface MeaningfulSlideSummary {
  objectId: string
  meaningfulObjectCount: number
  decorativeObjectCount: number
  visibleTextCount: number
  imageCount: number
  chartCount: number
  semanticMarkCount: number
  emptyContainerCount: number
  meaningful: boolean
  reason: string
}

export interface SlideFidelityResult {
  slideKey: string
  status: 'PROVEN' | 'FAILED' | 'UNPROVEN'
  peerSourceCount: number
  peerRenderedCount: number
  aggregateSourceCount: number
  aggregateRenderedCount: number
  omittedIdentities: string[]
  changedIdentities: string[]
  aggregateIdentity?: string
}

interface ThemeCatalogEntry {
  themeId: string
  displayName: string
  version: string
  description: string
  tone: string
  supportedArchetypes: string[]
  palette: AlphaTheme['palette']
  fontFamilies: string[]
  backgroundTechnique: BackgroundTechnique
  previewUrl: string | null
  previewStatus: 'missing' | 'available'
  renderedQaStatus: 'unproven' | 'proven'
  templateCopySupported: boolean
  mediaSupported: boolean
  supportsImages: boolean
  templateSource: string
  status: ThemeStatus
  backingThemeId: string
}

interface ThemeResolution {
  catalog: ThemeCatalogEntry
  backingThemeId: string
  source: string
}

const THEME_CATALOG: ThemeCatalogEntry[] = [
  {
    themeId: 'ALPHA_NAVY_TEAL_PRODUCTION_V1',
    displayName: 'Alpha Navy Teal Production',
    version: '1.0.0',
    description: 'Production go-live theme: deep navy canvas, teal primary accent, cyan/violet support, warm gold aggregate highlight. Image-gradient hero/closing surfaces with solid navy content fields.',
    tone: 'dark, premium, navy-teal, production',
    supportedArchetypes: [...ARCHETYPES],
    palette: THEMES.NAVY_TEAL_PRODUCTION.palette,
    fontFamilies: ['Inter', 'Arial'],
    backgroundTechnique: 'IMAGE_GRADIENT',
    previewUrl: null,
    previewStatus: 'missing',
    renderedQaStatus: 'unproven',
    templateCopySupported: false,
    mediaSupported: false,
    supportsImages: false,
    templateSource: 'BUILT_IN_SHAPE_THEME',
    status: 'experimental',
    backingThemeId: 'NAVY_TEAL_PRODUCTION',
  },
  {
    themeId: 'ALPHA_DARK_GRADIENT',
    displayName: 'Alpha Dark Gradient',
    version: '1.0.0',
    description: 'Premium navy and teal deck style using editable tonal bands. Structural composition only; rendered visual proof is pending.',
    tone: 'dark, premium, technology',
    supportedArchetypes: [...ARCHETYPES],
    palette: THEMES.MODERN_GRADIENT.palette,
    fontFamilies: ['Inter', 'Arial'],
    backgroundTechnique: 'TONAL_BANDS',
    previewUrl: null,
    previewStatus: 'missing',
    renderedQaStatus: 'unproven',
    templateCopySupported: false,
    mediaSupported: false,
    supportsImages: false,
    templateSource: 'BUILT_IN_SHAPE_THEME',
    status: 'structural_only',
    backingThemeId: 'MODERN_GRADIENT',
  },
  {
    themeId: 'ALPHA_DARK_MINIMAL',
    displayName: 'Alpha Dark Minimal',
    version: '1.0.0',
    description: 'Dark solid fields with restrained analytical accents. Structural composition only.',
    tone: 'dark, restrained, analytical',
    supportedArchetypes: [...ARCHETYPES],
    palette: THEMES.DATA_INTELLIGENCE.palette,
    fontFamilies: ['Inter', 'Arial'],
    backgroundTechnique: 'SOLID',
    previewUrl: null,
    previewStatus: 'missing',
    renderedQaStatus: 'unproven',
    templateCopySupported: false,
    mediaSupported: false,
    supportsImages: false,
    templateSource: 'BUILT_IN_SHAPE_THEME',
    status: 'structural_only',
    backingThemeId: 'DATA_INTELLIGENCE',
  },
  {
    themeId: 'ALPHA_LIGHT_EXECUTIVE',
    displayName: 'Alpha Light Executive',
    version: '1.0.0',
    description: 'White and slate consulting style. Structural composition only.',
    tone: 'light, executive, consulting',
    supportedArchetypes: [...ARCHETYPES],
    palette: THEMES.EXECUTIVE_NAVY.palette,
    fontFamilies: ['Inter', 'Arial'],
    backgroundTechnique: 'SOLID',
    previewUrl: null,
    previewStatus: 'missing',
    renderedQaStatus: 'unproven',
    templateCopySupported: false,
    mediaSupported: false,
    supportsImages: false,
    templateSource: 'BUILT_IN_SHAPE_THEME',
    status: 'structural_only',
    backingThemeId: 'EXECUTIVE_NAVY',
  },
  {
    themeId: 'ALPHA_MODERN_TECH',
    displayName: 'Alpha Modern Tech',
    version: '0.1.0',
    description: 'Dark technology direction reserved until rendered proof exists.',
    tone: 'dark, technology, launch',
    supportedArchetypes: [...ARCHETYPES],
    palette: THEMES.BOLD_TECH.palette,
    fontFamilies: ['Inter', 'Arial'],
    backgroundTechnique: 'TONAL_BANDS',
    previewUrl: null,
    previewStatus: 'missing',
    renderedQaStatus: 'unproven',
    templateCopySupported: false,
    mediaSupported: false,
    supportsImages: false,
    templateSource: 'BUILT_IN_SHAPE_THEME',
    status: 'disabled',
    backingThemeId: 'BOLD_TECH',
  },
  {
    themeId: 'ALPHA_WARM_EDITORIAL',
    displayName: 'Alpha Warm Editorial',
    version: '0.1.0',
    description: 'Warm neutral, story-led presentation system pending proof.',
    tone: 'light, warm, editorial',
    supportedArchetypes: [...ARCHETYPES],
    palette: THEMES.WARM_STRATEGY.palette,
    fontFamilies: ['Inter', 'Arial'],
    backgroundTechnique: 'SOLID',
    previewUrl: null,
    previewStatus: 'missing',
    renderedQaStatus: 'unproven',
    templateCopySupported: false,
    mediaSupported: false,
    supportsImages: false,
    templateSource: 'BUILT_IN_SHAPE_THEME',
    status: 'disabled',
    backingThemeId: 'WARM_STRATEGY',
  },
  {
    themeId: 'ALPHA_BOLD_MARKETING',
    displayName: 'Alpha Bold Marketing',
    version: '0.1.0',
    description: 'High-contrast marketing direction pending proof.',
    tone: 'bold, high-contrast, launch',
    supportedArchetypes: [...ARCHETYPES],
    palette: THEMES.KANAL_BRAND.palette,
    fontFamilies: ['Inter', 'Arial'],
    backgroundTechnique: 'SOLID',
    previewUrl: null,
    previewStatus: 'missing',
    renderedQaStatus: 'unproven',
    templateCopySupported: false,
    mediaSupported: false,
    supportsImages: false,
    templateSource: 'BUILT_IN_SHAPE_THEME',
    status: 'disabled',
    backingThemeId: 'KANAL_BRAND',
  },
]

function fail(message: string): never {
  throw new Error(`Alpha Beautify deck: ${message}`)
}

function codedFail(code: string, detail: string): never {
  throw new Error(`Alpha Beautify deck: ${code}: ${detail}`)
}

function asString(v: unknown, label: string, maxLen: number, required = true): string {
  if (v === undefined || v === null) {
    if (required) fail(`${label} is required.`)
    return ''
  }
  if (typeof v !== 'string' || v.trim() === '') fail(`${label} must be a non-empty string.`)
  const s = v.trim()
  if (s.length > maxLen) fail(`${label} must be at most ${maxLen} characters.`)
  return s
}

function optString(v: unknown, label: string, maxLen: number): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  return asString(v, label, maxLen)
}

function asOrder(v: unknown, label: string, fallback: number): number {
  if (v === undefined || v === null) return fallback
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0 || n > 10_000) fail(`${label} must be a non-negative integer.`)
  return n
}

function asPolicy(raw: Record<string, unknown>): { failurePolicy: FailurePolicy; visualQaPolicy: VisualQaPolicy } {
  const failurePolicy = raw.failurePolicy === undefined || raw.failurePolicy === null ? 'ALL_OR_NOTHING' : String(raw.failurePolicy).trim().toUpperCase()
  if (failurePolicy !== 'ALL_OR_NOTHING') codedFail('FAILURE_POLICY_NOT_IMPLEMENTED', `${failurePolicy} is not supported by the foundation runtime.`)
  const visualQaPolicy = raw.visualQaPolicy === undefined || raw.visualQaPolicy === null ? 'STRUCTURAL_ONLY' : String(raw.visualQaPolicy).trim().toUpperCase()
  if (visualQaPolicy !== 'STRUCTURAL_ONLY') codedFail('VISUAL_QA_POLICY_NOT_IMPLEMENTED', `${visualQaPolicy} is not supported by the foundation runtime.`)
  if (optString(raw.outputFolderId, 'outputFolderId', 120)) {
    codedFail('OUTPUT_FOLDER_ROUTING_NOT_IMPLEMENTED', 'outputFolderId cannot be accepted until Drive routing is implemented.')
  }
  return { failurePolicy: 'ALL_OR_NOTHING', visualQaPolicy: 'STRUCTURAL_ONLY' }
}

function parseBullet(v: unknown, label: string, index: number): BulletItem {
  if (typeof v === 'string') return { text: asString(v, label, MAX_FACT_TEXT), order: index }
  if (!v || typeof v !== 'object') fail(`${label} must be an object.`)
  const rec = v as Record<string, unknown>
  return {
    text: asString(rec.text, `${label}.text`, MAX_FACT_TEXT),
    order: asOrder(rec.order, `${label}.order`, index),
    ...(optString(rec.sourceReference, `${label}.sourceReference`, 300) ? { sourceReference: optString(rec.sourceReference, `${label}.sourceReference`, 300) } : {}),
  }
}

function parseFactItem(v: unknown, label: string): FactItem {
  if (!v || typeof v !== 'object') fail(`${label} must be an object.`)
  const rec = v as Record<string, unknown>
  return {
    ...(optString(rec.factId, `${label}.factId`, 120) ? { factId: optString(rec.factId, `${label}.factId`, 120) } : {}),
    label: asString(rec.label, `${label}.label`, 160),
    ...(optString(rec.value, `${label}.value`, 80) ? { value: optString(rec.value, `${label}.value`, 80) } : {}),
    ...(optString(rec.unit, `${label}.unit`, 40) ? { unit: optString(rec.unit, `${label}.unit`, 40) } : {}),
    ...(optString(rec.period, `${label}.period`, 80) ? { period: optString(rec.period, `${label}.period`, 80) } : {}),
    ...(optString(rec.category, `${label}.category`, 120) ? { category: optString(rec.category, `${label}.category`, 120) } : {}),
    ...(typeof rec.order === 'number' && Number.isFinite(rec.order) ? { order: rec.order } : {}),
    ...(optString(rec.sourceText, `${label}.sourceText`, MAX_FACT_TEXT) ? { sourceText: optString(rec.sourceText, `${label}.sourceText`, MAX_FACT_TEXT) } : {}),
    ...(optString(rec.sourceReference, `${label}.sourceReference`, 300) ? { sourceReference: optString(rec.sourceReference, `${label}.sourceReference`, 300) } : {}),
  }
}

function parseFactItems(v: unknown, label: string, maxItems: number): FactItem[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) fail(`${label} must be an array.`)
  if (v.length > maxItems) fail(`${label} supports at most ${maxItems} entries.`)
  return v.map((item, i) => parseFactItem(item, `${label}[${i}]`))
}

function parseAggregate(v: unknown, label: string): AggregateFact | undefined {
  if (v === undefined || v === null) return undefined
  if (!v || typeof v !== 'object') fail(`${label} must be an object.`)
  const rec = v as Record<string, unknown>
  return {
    ...(optString(rec.factId, `${label}.factId`, 120) ? { factId: optString(rec.factId, `${label}.factId`, 120) } : {}),
    label: asString(rec.label, `${label}.label`, 120),
    value: asString(rec.value, `${label}.value`, 80),
    ...(optString(rec.unit, `${label}.unit`, 40) ? { unit: optString(rec.unit, `${label}.unit`, 40) } : {}),
    ...(optString(rec.sourceText, `${label}.sourceText`, MAX_FACT_TEXT) ? { sourceText: optString(rec.sourceText, `${label}.sourceText`, MAX_FACT_TEXT) } : {}),
    ...(optString(rec.sourceReference, `${label}.sourceReference`, 300) ? { sourceReference: optString(rec.sourceReference, `${label}.sourceReference`, 300) } : {}),
  }
}

function parseStages(v: unknown, label: string): StageSpec[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) fail(`${label} must be an array.`)
  if (v.length > 8) fail(`${label} supports at most 8 entries.`)
  return v.map((item, i) => {
    if (!item || typeof item !== 'object') fail(`${label}[${i}] must be an object.`)
    const rec = item as Record<string, unknown>
    return {
      stageId: asString(rec.stageId, `${label}[${i}].stageId`, 120),
      label: asString(rec.label, `${label}[${i}].label`, 160),
      order: asOrder(rec.order, `${label}[${i}].order`, i),
      ...(optString(rec.value, `${label}[${i}].value`, 80) ? { value: optString(rec.value, `${label}[${i}].value`, 80) } : {}),
      ...(optString(rec.unit, `${label}[${i}].unit`, 40) ? { unit: optString(rec.unit, `${label}[${i}].unit`, 40) } : {}),
      ...(optString(rec.description, `${label}[${i}].description`, MAX_FACT_TEXT) ? { description: optString(rec.description, `${label}[${i}].description`, MAX_FACT_TEXT) } : {}),
      ...(optString(rec.sourceText, `${label}[${i}].sourceText`, MAX_FACT_TEXT) ? { sourceText: optString(rec.sourceText, `${label}[${i}].sourceText`, MAX_FACT_TEXT) } : {}),
      ...(optString(rec.sourceReference, `${label}[${i}].sourceReference`, 300) ? { sourceReference: optString(rec.sourceReference, `${label}[${i}].sourceReference`, 300) } : {}),
    }
  }).sort((a, b) => a.order - b.order)
}

function parseComparisonGroups(v: unknown, label: string): ComparisonGroup[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) fail(`${label} must be an array.`)
  if (v.length > 5) fail(`${label} supports at most 5 groups.`)
  return v.map((group, i) => {
    if (!group || typeof group !== 'object') fail(`${label}[${i}] must be an object.`)
    const rec = group as Record<string, unknown>
    if (!Array.isArray(rec.items) || rec.items.length === 0) fail(`${label}[${i}].items must be a non-empty array.`)
    return {
      groupId: asString(rec.groupId, `${label}[${i}].groupId`, 120),
      name: asString(rec.name, `${label}[${i}].name`, 120),
      items: rec.items.map((item, j): ComparisonItem => {
        if (!item || typeof item !== 'object') fail(`${label}[${i}].items[${j}] must be an object.`)
        const itemRec = item as Record<string, unknown>
        return {
          factId: asString(itemRec.factId, `${label}[${i}].items[${j}].factId`, 120),
          label: asString(itemRec.label, `${label}[${i}].items[${j}].label`, 160),
          value: asString(itemRec.value, `${label}[${i}].items[${j}].value`, 80),
          ...(optString(itemRec.unit, `${label}[${i}].items[${j}].unit`, 40) ? { unit: optString(itemRec.unit, `${label}[${i}].items[${j}].unit`, 40) } : {}),
          ...(optString(itemRec.sourceText, `${label}[${i}].items[${j}].sourceText`, MAX_FACT_TEXT) ? { sourceText: optString(itemRec.sourceText, `${label}[${i}].items[${j}].sourceText`, MAX_FACT_TEXT) } : {}),
          ...(optString(itemRec.sourceReference, `${label}[${i}].items[${j}].sourceReference`, 300) ? { sourceReference: optString(itemRec.sourceReference, `${label}[${i}].items[${j}].sourceReference`, 300) } : {}),
        }
      }),
    }
  })
}

function parsePillars(v: unknown, label: string): PillarSpec[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) fail(`${label} must be an array.`)
  if (v.length > 5) fail(`${label} supports at most 5 entries.`)
  return v.map((pillar, i) => {
    if (!pillar || typeof pillar !== 'object') fail(`${label}[${i}] must be an object.`)
    const rec = pillar as Record<string, unknown>
    if (!Array.isArray(rec.items) || rec.items.length === 0) fail(`${label}[${i}].items must be a non-empty array.`)
    return {
      pillarId: asString(rec.pillarId, `${label}[${i}].pillarId`, 120),
      name: asString(rec.name, `${label}[${i}].name`, 120),
      items: rec.items.map((item, j) => (typeof item === 'string' ? asString(item, `${label}[${i}].items[${j}]`, MAX_FACT_TEXT) : parseFactItem(item, `${label}[${i}].items[${j}]`))),
      ...(optString(rec.sourceReference, `${label}[${i}].sourceReference`, 300) ? { sourceReference: optString(rec.sourceReference, `${label}[${i}].sourceReference`, 300) } : {}),
    }
  })
}

function parseDistributionItems(v: unknown, label: string): DistributionItem[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) fail(`${label} must be an array.`)
  if (v.length > 12) fail(`${label} supports at most 12 entries.`)
  return v.map((item, i) => {
    if (!item || typeof item !== 'object') fail(`${label}[${i}] must be an object.`)
    const rec = item as Record<string, unknown>
    return {
      factId: asString(rec.factId, `${label}[${i}].factId`, 120),
      label: asString(rec.label, `${label}[${i}].label`, 160),
      value: asString(rec.value, `${label}[${i}].value`, 80),
      order: asOrder(rec.order, `${label}[${i}].order`, i),
      ...(optString(rec.unit, `${label}[${i}].unit`, 40) ? { unit: optString(rec.unit, `${label}[${i}].unit`, 40) } : {}),
      ...(optString(rec.amount, `${label}[${i}].amount`, 80) ? { amount: optString(rec.amount, `${label}[${i}].amount`, 80) } : {}),
      ...(optString(rec.amountUnit, `${label}[${i}].amountUnit`, 40) ? { amountUnit: optString(rec.amountUnit, `${label}[${i}].amountUnit`, 40) } : {}),
      ...(optString(rec.sourceText, `${label}[${i}].sourceText`, MAX_FACT_TEXT) ? { sourceText: optString(rec.sourceText, `${label}[${i}].sourceText`, MAX_FACT_TEXT) } : {}),
      ...(optString(rec.sourceReference, `${label}[${i}].sourceReference`, 300) ? { sourceReference: optString(rec.sourceReference, `${label}[${i}].sourceReference`, 300) } : {}),
    }
  }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function parseClosing(v: unknown, label: string): ClosingThesis | undefined {
  if (v === undefined || v === null) return undefined
  if (!v || typeof v !== 'object') fail(`${label} must be an object.`)
  const rec = v as Record<string, unknown>
  return {
    statement: asString(rec.statement, `${label}.statement`, 500),
    ...(optString(rec.eyebrow, `${label}.eyebrow`, 120) ? { eyebrow: optString(rec.eyebrow, `${label}.eyebrow`, 120) } : {}),
    ...(optString(rec.sourceReference, `${label}.sourceReference`, 300) ? { sourceReference: optString(rec.sourceReference, `${label}.sourceReference`, 300) } : {}),
  }
}

function parseMedia(v: unknown, label: string): MediaItem[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) fail(`${label} must be an array.`)
  if (v.length > 0) codedFail('MEDIA_NOT_IMPLEMENTED', 'Deck media is rejected until URL image insertion is fully verified.')
  return undefined
}

function parseSlide(v: unknown, index: number): DeckSlideSpec {
  if (!v || typeof v !== 'object') fail(`slides[${index}] must be an object.`)
  const rec = v as Record<string, unknown>
  const preferred = optString(rec.preferredArchetype, `slides[${index}].preferredArchetype`, 60)
  if (preferred && !(ARCHETYPES as readonly string[]).includes(preferred)) {
    fail(`slides[${index}].preferredArchetype must be one of ${ARCHETYPES.join(', ')}.`)
  }
  return {
    slideKey: asString(rec.slideKey, `slides[${index}].slideKey`, 120),
    ...(optString(rec.narrativeRole, `slides[${index}].narrativeRole`, 120) ? { narrativeRole: optString(rec.narrativeRole, `slides[${index}].narrativeRole`, 120) } : {}),
    title: asString(rec.title, `slides[${index}].title`, MAX_TITLE),
    ...(optString(rec.subtitle, `slides[${index}].subtitle`, MAX_SHORT_TEXT) ? { subtitle: optString(rec.subtitle, `slides[${index}].subtitle`, MAX_SHORT_TEXT) } : {}),
    ...(Array.isArray(rec.bullets) ? { bullets: rec.bullets.map((b, i) => parseBullet(b, `slides[${index}].bullets[${i}]`, i)) } : {}),
    ...(parseStages(rec.stages, `slides[${index}].stages`) ? { stages: parseStages(rec.stages, `slides[${index}].stages`) } : {}),
    ...(parseComparisonGroups(rec.comparisonGroups, `slides[${index}].comparisonGroups`) ? { comparisonGroups: parseComparisonGroups(rec.comparisonGroups, `slides[${index}].comparisonGroups`) } : {}),
    ...(parsePillars(rec.pillars, `slides[${index}].pillars`) ? { pillars: parsePillars(rec.pillars, `slides[${index}].pillars`) } : {}),
    ...(parseDistributionItems(rec.distributionItems, `slides[${index}].distributionItems`) ? { distributionItems: parseDistributionItems(rec.distributionItems, `slides[${index}].distributionItems`) } : {}),
    ...(parseFactItems(rec.items, `slides[${index}].items`, 12) ? { items: parseFactItems(rec.items, `slides[${index}].items`, 12) } : {}),
    ...(parseAggregate(rec.aggregate, `slides[${index}].aggregate`) ? { aggregate: parseAggregate(rec.aggregate, `slides[${index}].aggregate`) } : {}),
    ...(parseFactItems(rec.headlineMetrics, `slides[${index}].headlineMetrics`, 12) ? { headlineMetrics: parseFactItems(rec.headlineMetrics, `slides[${index}].headlineMetrics`, 12) } : {}),
    ...(Array.isArray(rec.annotations) ? { annotations: rec.annotations.map((a, i) => asString(a, `slides[${index}].annotations[${i}]`, MAX_FACT_TEXT)) } : {}),
    ...(optString(rec.sharedGoal, `slides[${index}].sharedGoal`, MAX_SHORT_TEXT) ? { sharedGoal: optString(rec.sharedGoal, `slides[${index}].sharedGoal`, MAX_SHORT_TEXT) } : {}),
    ...(Array.isArray(rec.sourceNotes) ? { sourceNotes: rec.sourceNotes.map((n, i) => asString(n, `slides[${index}].sourceNotes[${i}]`, MAX_FACT_TEXT)) } : {}),
    ...(parseClosing(rec.closingThesis, `slides[${index}].closingThesis`) ? { closingThesis: parseClosing(rec.closingThesis, `slides[${index}].closingThesis`) } : {}),
    ...(parseMedia(rec.media, `slides[${index}].media`) ? { media: parseMedia(rec.media, `slides[${index}].media`) } : {}),
    ...(preferred ? { preferredArchetype: preferred as Archetype } : {}),
    ...(rec.importance === 'low' || rec.importance === 'normal' || rec.importance === 'high' ? { importance: rec.importance } : {}),
  }
}

export function validateDeckSpec(raw: Record<string, unknown>): DeckSpec {
  const slidesRaw = raw.slides
  if (!Array.isArray(slidesRaw) || slidesRaw.length === 0) fail('slides must be a non-empty array.')
  if (slidesRaw.length > MAX_DECK_SLIDES) fail(`slides supports at most ${MAX_DECK_SLIDES} entries.`)
  const requestedSlideCount = raw.slideCount === undefined && raw.requestedSlideCount === undefined ? slidesRaw.length : Number(raw.slideCount ?? raw.requestedSlideCount)
  if (!Number.isInteger(requestedSlideCount) || requestedSlideCount < 1 || requestedSlideCount > MAX_DECK_SLIDES) {
    fail(`slideCount must be an integer between 1 and ${MAX_DECK_SLIDES}.`)
  }
  if (requestedSlideCount !== slidesRaw.length) {
    fail(`slideCount (${requestedSlideCount}) must exactly match slides.length (${slidesRaw.length}) for ALL_OR_NOTHING deck composition.`)
  }
  const policies = asPolicy(raw)
  const spec: DeckSpec = {
    title: asString(raw.title, 'title', MAX_TITLE),
    ...(optString(raw.purpose, 'purpose', 300) ? { purpose: optString(raw.purpose, 'purpose', 300) } : {}),
    ...(optString(raw.audience, 'audience', 300) ? { audience: optString(raw.audience, 'audience', 300) } : {}),
    ...(optString(raw.locale, 'locale', 40) ? { locale: optString(raw.locale, 'locale', 40) } : {}),
    ...(optString(raw.themeId, 'themeId', 80) ? { themeId: optString(raw.themeId, 'themeId', 80) } : {}),
    requestedSlideCount,
    slideCount: requestedSlideCount,
    slides: slidesRaw.map(parseSlide),
    failurePolicy: policies.failurePolicy,
    visualQaPolicy: policies.visualQaPolicy,
    ...(optString(raw.backgroundImageUrl, 'backgroundImageUrl', 2000) ? { backgroundImageUrl: optString(raw.backgroundImageUrl, 'backgroundImageUrl', 2000) } : {}),
  }
  if (spec.backgroundImageUrl !== undefined && !/^https:\/\//i.test(spec.backgroundImageUrl)) {
    fail('backgroundImageUrl must be a stable https URL.')
  }
  validateDeckIdentities(spec)
  return spec
}

function normalizeThemeId(themeId: string | undefined): ThemeResolution {
  if (themeId) {
    const requested = themeId.trim().toUpperCase().replace(/[\s-]+/g, '_')
    const catalog = THEME_CATALOG.find((t) => t.themeId === requested || t.backingThemeId === requested)
    if (catalog && catalog.status !== 'disabled') return { catalog, backingThemeId: catalog.backingThemeId, source: 'EXPLICIT_CATALOG' }
    const direct = resolveTheme(requested)
    if (direct) {
      const fallbackCatalog = THEME_CATALOG.find((t) => t.backingThemeId === direct.meta.id) ?? THEME_CATALOG[2]
      if (fallbackCatalog.status !== 'disabled') return { catalog: fallbackCatalog, backingThemeId: direct.meta.id, source: 'EXPLICIT_LEGACY' }
    }
    fail(`themeId ${themeId} is unavailable. Available structural themes: ${THEME_CATALOG.filter((t) => t.status !== 'disabled').map((t) => t.themeId).join(', ')}.`)
  }
  const defaultCatalog = THEME_CATALOG.find((t) => t.themeId === 'ALPHA_NAVY_TEAL_PRODUCTION_V1')
    ?? THEME_CATALOG.find((t) => t.backingThemeId === DEFAULT_THEME_ID) ?? THEME_CATALOG[2]
  return { catalog: defaultCatalog, backingThemeId: defaultCatalog.backingThemeId, source: 'DEFAULT' }
}

function uniqueOrFail(values: string[], code: string, label: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    const norm = value.trim().toUpperCase()
    if (seen.has(norm)) codedFail(code, `${label} duplicates ${value}.`)
    seen.add(norm)
  }
}

function factIdOf(prefix: string, label: string, idx: number): string {
  return `${prefix}:${label}:${idx}`.toUpperCase().replace(/\s+/g, '_')
}

function validateDeckIdentities(spec: DeckSpec): void {
  uniqueOrFail(spec.slides.map((s) => s.slideKey), 'DUPLICATE_SLIDE_KEY', 'slideKey')
  const normalized = spec.slides.map((s, i) => slideIdFor(s.slideKey, i))
  uniqueOrFail(normalized, 'NORMALIZED_OBJECT_ID_COLLISION', 'normalized slide id')
  for (const slide of spec.slides) validateSlideTopologyAndIds(slide)
}

function primaryTopologies(slide: DeckSlideSpec): SemanticTopology[] {
  const out: SemanticTopology[] = []
  if (slide.closingThesis) out.push('CLOSING')
  if (slide.stages?.length) out.push('STAGES')
  if (slide.comparisonGroups?.length) out.push('COMPARISON_GROUPS')
  if (slide.pillars?.length) out.push('PILLARS')
  if (slide.distributionItems?.length) out.push('DISTRIBUTION')
  if (slide.headlineMetrics?.length) out.push('KPI')
  if (slide.bullets?.length) out.push('BULLETS')
  if (slide.items?.length) out.push('COMPAT_ITEMS')
  return out
}

function validateSlideTopologyAndIds(slide: DeckSlideSpec): void {
  const primaries = primaryTopologies(slide)
  const role = `${slide.narrativeRole ?? ''} ${slide.preferredArchetype ?? ''}`.toUpperCase()
  const allowedPair =
    primaries.length === 2 &&
    primaries.includes('BULLETS') &&
    primaries.includes('KPI') &&
    (role.includes('EXECUTIVE_SUMMARY') || slide.preferredArchetype === 'EXECUTIVE_SUMMARY')
  if (primaries.length > 1 && !allowedPair) {
    codedFail('CONFLICTING_SEMANTIC_TOPOLOGY', `${slide.slideKey} supplies conflicting primary topologies: ${primaries.join(', ')}.`)
  }
  const ids: string[] = []
  ids.push(...(slide.items ?? []).map((x, i) => x.factId ?? factIdOf('item', x.label, i)))
  ids.push(...(slide.headlineMetrics ?? []).map((x, i) => x.factId ?? factIdOf('metric', x.label, i)))
  ids.push(...(slide.stages ?? []).map((x) => x.stageId))
  ids.push(...(slide.comparisonGroups ?? []).flatMap((g) => [g.groupId, ...g.items.map((x) => x.factId)]))
  ids.push(...(slide.pillars ?? []).flatMap((p) => [p.pillarId, ...p.items.map((x, i) => typeof x === 'string' ? factIdOf(p.pillarId, x, i) : x.factId ?? factIdOf(p.pillarId, x.label, i))]))
  ids.push(...(slide.distributionItems ?? []).map((x) => x.factId))
  if (slide.aggregate?.factId) ids.push(slide.aggregate.factId)
  uniqueOrFail(ids, 'DUPLICATE_FACT_ID', `semantic id in ${slide.slideKey}`)
  if (slide.aggregate && slide.distributionItems?.some((item) => item.label.trim().toLowerCase() === slide.aggregate?.label.trim().toLowerCase())) {
    codedFail('AGGREGATE_MISMATCH', `${slide.slideKey} duplicates aggregate label among peers.`)
  }
}

function factText(item: { label: string; value?: string; unit?: string }): string {
  const value = [item.value, item.unit].filter(Boolean).join(' ').trim()
  return [item.label, value].filter(Boolean).join(': ')
}

function aggregateText(item: AggregateFact): string {
  return [item.label, [item.value, item.unit].filter(Boolean).join(' ')].filter(Boolean).join(': ')
}

function identityText(f: SourceFactIdentity): string {
  return [f.label, [f.value, f.unit].filter(Boolean).join(' ')].filter(Boolean).join(': ')
}

function sourceIdentity(kind: SourceFactIdentity['kind'], factId: string, label: string, value?: string, unit?: string, extra?: Partial<SourceFactIdentity>): SourceFactIdentity {
  return {
    factId,
    kind,
    label,
    ...(value ? { value } : {}),
    ...(unit ? { unit } : {}),
    sourceText: extra?.sourceText ?? [label, [value, unit].filter(Boolean).join(' ')].filter(Boolean).join(': '),
    ...(extra?.period ? { period: extra.period } : {}),
    ...(extra?.category ? { category: extra.category } : {}),
  }
}

function sourceFactsOf(slide: DeckSlideSpec, topology: SemanticTopology): SourceFactIdentity[] {
  const facts: SourceFactIdentity[] = []
  if (slide.bullets) facts.push(...slide.bullets.map((b, i) => sourceIdentity('bullet', factIdOf('bullet', b.text, i), b.text, undefined, undefined, { sourceText: b.text })))
  if (slide.headlineMetrics) facts.push(...slide.headlineMetrics.map((m, i) => sourceIdentity('metric', m.factId ?? factIdOf('metric', m.label, i), m.label, m.value, m.unit, { sourceText: m.sourceText, period: m.period, category: m.category })))
  if (slide.stages) facts.push(...slide.stages.map((s) => sourceIdentity('stage', s.stageId, s.label, s.value, s.unit, { sourceText: s.sourceText ?? [s.label, s.description, [s.value, s.unit].filter(Boolean).join(' ')].filter(Boolean).join(': ') })))
  if (slide.comparisonGroups) facts.push(...slide.comparisonGroups.flatMap((g) => g.items.map((x) => sourceIdentity('comparison', x.factId, x.label, x.value, x.unit, { sourceText: x.sourceText, period: g.name }))))
  if (slide.pillars) {
    for (const p of slide.pillars) {
      p.items.forEach((item, i) => {
        if (typeof item === 'string') facts.push(sourceIdentity('pillar', factIdOf(p.pillarId, item, i), item, undefined, undefined, { sourceText: item, category: p.name }))
        else facts.push(sourceIdentity('pillar', item.factId ?? factIdOf(p.pillarId, item.label, i), item.label, item.value, item.unit, { sourceText: item.sourceText, category: p.name }))
      })
    }
  }
  if (slide.distributionItems) {
    facts.push(...slide.distributionItems.map((x) => {
      const amount = [x.amount, x.amountUnit].filter(Boolean).join(' ').trim()
      const share = [x.value, x.unit].filter(Boolean).join('').trim()
      return sourceIdentity('peer', x.factId, x.label, x.value, x.unit, {
        sourceText: x.sourceText ?? (amount ? `${x.label}: ${amount}, ${share}` : `${x.label}: ${share}`),
        category: x.label,
      })
    }))
  }
  if (topology === 'COMPAT_ITEMS' && slide.items) facts.push(...slide.items.map((x, i) => sourceIdentity('peer', x.factId ?? factIdOf('item', x.label, i), x.label, x.value, x.unit, { sourceText: x.sourceText, period: x.period, category: x.category })))
  if (slide.aggregate) facts.push(sourceIdentity('aggregate', slide.aggregate.factId ?? factIdOf('aggregate', slide.aggregate.label, 0), slide.aggregate.label, slide.aggregate.value, slide.aggregate.unit, { sourceText: slide.aggregate.sourceText }))
  if (slide.closingThesis) facts.push(sourceIdentity('closing', factIdOf('closing', slide.closingThesis.statement, 0), slide.closingThesis.statement, undefined, undefined, { sourceText: slide.closingThesis.statement }))
  if (facts.length > SOURCE_FACT_FORWARD_LIMIT) codedFail('SOURCE_FACT_CAPACITY_EXCEEDED', `${slide.slideKey} has ${facts.length} source facts; limit is ${SOURCE_FACT_FORWARD_LIMIT}.`)
  return facts
}

function chooseTopology(slide: DeckSlideSpec, index: number, total: number): SemanticTopology {
  if (slide.closingThesis) return 'CLOSING'
  if (slide.distributionItems?.length) return 'DISTRIBUTION'
  if (slide.comparisonGroups?.length) return 'COMPARISON_GROUPS'
  if (slide.pillars?.length) return 'PILLARS'
  if (slide.stages?.length) return /timeline|roadmap|milestone/i.test(`${slide.narrativeRole ?? ''} ${slide.title}`) ? 'STAGES' : 'STAGES'
  if (slide.headlineMetrics?.length) return slide.preferredArchetype === 'EXECUTIVE_SUMMARY' || slide.bullets?.length ? 'KPI' : 'KPI'
  if (slide.bullets?.length) return 'BULLETS'
  if (slide.items?.length) return 'COMPAT_ITEMS'
  if (index === 0 || /cover/i.test(`${slide.narrativeRole ?? ''} ${slide.title}`)) return 'COVER'
  if (index === total - 1) return 'CLOSING'
  return 'BULLETS'
}

function archetypeFor(slide: DeckSlideSpec, topology: SemanticTopology, index: number, total: number): { archetype: Archetype; reason: string } {
  if (slide.preferredArchetype) return { archetype: slide.preferredArchetype, reason: 'preferredArchetype accepted after topology validation' }
  const role = `${slide.narrativeRole ?? ''} ${slide.title}`.toLowerCase()
  if (topology === 'COVER') return { archetype: 'COVER', reason: 'cover topology' }
  if (topology === 'KPI') return { archetype: 'KPI_DASHBOARD', reason: 'headlineMetrics topology' }
  if (topology === 'STAGES') return { archetype: /timeline|roadmap|milestone|q[1-4]/.test(role) ? 'TIMELINE_ROADMAP' : 'PROCESS_FUNNEL', reason: 'ordered stages topology' }
  if (topology === 'COMPARISON_GROUPS') return { archetype: 'COMPARISON', reason: 'comparisonGroups topology' }
  if (topology === 'PILLARS') return { archetype: 'PILLARS_STRATEGY', reason: 'pillars topology' }
  if (topology === 'DISTRIBUTION') return { archetype: 'COMPARISON', reason: 'distribution topology using proportional comparison renderer' }
  if (topology === 'CLOSING') return { archetype: 'CLOSING_INSIGHT', reason: 'closingThesis topology' }
  if (topology === 'COMPAT_ITEMS') return { archetype: 'COMPARISON', reason: 'compatibility items topology adapted to comparison columns' }
  if (index === 0 && /cover|title|intro/.test(role)) return { archetype: 'COVER', reason: 'first cover/title slide' }
  if (index === total - 1 && /closing|conclusion|insight|thank/.test(role)) return { archetype: 'CLOSING_INSIGHT', reason: 'last closing slide' }
  return { archetype: 'EXECUTIVE_SUMMARY', reason: 'narrative bullet topology' }
}

function contentFor(slide: DeckSlideSpec, topology: SemanticTopology): SlideContent {
  if (topology === 'COVER') return { title: slide.title, ...(slide.subtitle ? { subtitle: slide.subtitle } : {}) }
  if (topology === 'BULLETS') return { title: slide.title, ...(slide.subtitle ? { subtitle: slide.subtitle } : {}), bullets: (slide.bullets ?? []).map((b) => b.text) }
  if (topology === 'KPI') {
    return {
      title: slide.title,
      ...(slide.subtitle ? { subtitle: slide.subtitle } : {}),
      metrics: (slide.headlineMetrics ?? []).map((m): MetricDatum => ({ label: m.label, value: [m.value, m.unit].filter(Boolean).join(' ').trim() || m.label })),
      ...(slide.annotations?.length ? { bullets: slide.annotations } : {}),
    }
  }
  if (topology === 'STAGES') {
    return {
      title: slide.title,
      ...(slide.subtitle ? { subtitle: slide.subtitle } : {}),
      stages: (slide.stages ?? []).map((s): StageDatum => ({
        label: s.label,
        ...(s.description || s.value ? { description: [s.description, [s.value, s.unit].filter(Boolean).join(' ')].filter(Boolean).join(' — ') } : {}),
      })),
    }
  }
  if (topology === 'COMPARISON_GROUPS') {
    return {
      title: slide.title,
      ...(slide.subtitle ? { subtitle: slide.subtitle } : {}),
      columns: (slide.comparisonGroups ?? []).map((g): ColumnDatum => ({
        name: g.name,
        items: g.items.map((x) => `${x.label}: ${[x.value, x.unit].filter(Boolean).join(' ')}`),
      })),
    }
  }
  if (topology === 'PILLARS') {
    return {
      title: slide.title,
      ...(slide.subtitle ? { subtitle: slide.subtitle } : {}),
      columns: (slide.pillars ?? []).map((p): ColumnDatum => ({
        name: p.name,
        items: p.items.map((x) => typeof x === 'string' ? x : factText(x)),
      })),
      ...(slide.sharedGoal ? { sharedGoal: slide.sharedGoal } : {}),
    }
  }
  if (topology === 'DISTRIBUTION') {
    const cols = (slide.distributionItems ?? []).map((d): ColumnDatum => ({
      name: d.amount ? `${d.label} ${d.value}${d.unit ?? ''}` : d.label,
      items: [[d.amount, d.amountUnit].filter(Boolean).join(' ') || [d.value, d.unit].filter(Boolean).join(' ')],
    }))
    return {
      title: slide.title,
      ...(slide.aggregate ? { subtitle: aggregateText(slide.aggregate) } : slide.subtitle ? { subtitle: slide.subtitle } : {}),
      columns: cols,
    }
  }
  if (topology === 'CLOSING') {
    const statement = slide.closingThesis?.statement ?? ''
    return {
      title: slide.closingThesis?.eyebrow ?? slide.title,
      ...(slide.subtitle ? { subtitle: slide.subtitle } : {}),
      closing: statement,
    }
  }
  // Explicit compatibility path for old generic items.
  return {
    title: slide.title,
    ...(slide.subtitle ? { subtitle: slide.subtitle } : {}),
    columns: (slide.items ?? []).map((m): ColumnDatum => ({ name: m.label, items: [[m.value, m.unit].filter(Boolean).join(' ').trim() || m.label] })),
  }
}

export function adaptSlide(slide: DeckSlideSpec, pageObjectId: string, themeId: string, index: number, total: number): SlideAdaptation {
  const topology = chooseTopology(slide, index, total)
  const route = archetypeFor(slide, topology, index, total)
  const content = contentFor(slide, topology)
  const sourceFacts = sourceFactsOf(slide, topology)
  const sourceFactLines = sourceFacts.filter((f) => f.kind !== 'aggregate').map((f) => f.sourceText)
  const input: ComposeInput = {
    pageObjectId,
    archetype: route.archetype,
    title: content.title,
    ...(content.subtitle ? { subtitle: content.subtitle } : {}),
    ...(content.bullets ? { bullets: content.bullets } : {}),
    ...(content.metrics ? { metrics: content.metrics } : {}),
    ...(content.stages ? { stages: content.stages as StageDatum[] } : {}),
    ...(content.columns ? { columns: content.columns } : {}),
    ...(content.closing ? { closing: content.closing } : {}),
    ...(content.sharedGoal ? { sharedGoal: content.sharedGoal } : {}),
    themeId,
    ...(sourceFactLines.length > 0 ? { sourceFacts: sourceFactLines } : {}),
  }
  const peerCount = sourceFacts.filter((f) => f.kind === 'peer' || f.kind === 'comparison' || f.kind === 'pillar' || f.kind === 'stage' || f.kind === 'metric').length
  const aggregateCount = sourceFacts.filter((f) => f.kind === 'aggregate').length
  // TASK-096: deterministic production layout variant for this topology.
  const productionVariant = productionVariantFor(
    topology as DeckTopology,
    route.archetype,
    (slide.aggregate ? 1 : 0) > 0
  )
  return {
    slideKey: slide.slideKey,
    pageObjectId,
    topology,
    input,
    selectedArchetype: route.archetype,
    variant: expectedEncodingFor(route.archetype, content),
    productionVariant,
    reason: route.reason,
    peerCount,
    aggregateCount,
    sourceFacts,
    sourceFingerprint: fingerprintFacts(content) + `|SRC:${sourceFacts.map((f) => `${f.factId}:${identityText(f)}`).join('|')}`,
    compatibilityMode: topology === 'COMPAT_ITEMS',
    warnings: topology === 'COMPAT_ITEMS' ? ['COMPATIBILITY_MODE: generic items were adapted to columns; typed semantic blocks are preferred.'] : [],
  }
}

function hashKey(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(0, 6)
}

export function slideIdFor(slideKey: string, index: number): string {
  const clean = slideKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^_+/, '').replace(/_+/g, '_') || 'SLIDE'
  const suffix = hashKey(slideKey)
  const stem = clean.slice(0, 33)
  return `A95_S${String(index + 1).padStart(2, '0')}_${stem}_${suffix}`.slice(0, 50)
}

function collectCreatedObjectIds(requests: GoogleRequest[]): string[] {
  const out: string[] = []
  for (const req of requests) {
    const rec = req as Record<string, unknown>
    const createSlide = rec.createSlide as Record<string, unknown> | undefined
    if (typeof createSlide?.objectId === 'string') out.push(createSlide.objectId)
    const createShape = rec.createShape as Record<string, unknown> | undefined
    if (typeof createShape?.objectId === 'string') out.push(createShape.objectId)
    const createImage = rec.createImage as Record<string, unknown> | undefined
    if (typeof createImage?.objectId === 'string') out.push(createImage.objectId)
    const createLine = rec.createLine as Record<string, unknown> | undefined
    if (typeof createLine?.objectId === 'string') out.push(createLine.objectId)
    const createTable = rec.createTable as Record<string, unknown> | undefined
    if (typeof createTable?.objectId === 'string') out.push(createTable.objectId)
    const groupObjects = rec.groupObjects as Record<string, unknown> | undefined
    if (typeof groupObjects?.groupObjectId === 'string') out.push(groupObjects.groupObjectId)
  }
  return out
}

/**
 * TASK-096-R1: read the authoritative page size from a presentation read.
 * Fails closed on missing/non-finite/unsupported units — raw pixels or
 * inches must never flow into PT geometry.
 */
export function pageSizePtOfPresentation(pres: PresentationRead): AuthoritativePageSize {
  const w = pres.pageSize?.width
  const h = pres.pageSize?.height
  if (!w || !h) throw new Error('Alpha Beautify deck: PAGE_SIZE_UNREADABLE: presentation carries no pageSize.')
  return {
    wPt: pageDimensionPt(w.magnitude, w.unit, 'pageSize.width'),
    hPt: pageDimensionPt(h.magnitude, h.unit, 'pageSize.height'),
    unit: 'PT',
  }
}

interface ParsedElement {
  objectId: string
  x: number
  y: number
  w: number
  h: number
}

function emuToPt(magnitude: unknown, unit: unknown): number | null {
  if (typeof magnitude !== 'number' || !Number.isFinite(magnitude)) return null
  if (unit === 'EMU') return magnitude / EMU_PER_PT
  if (unit === 'PT') return magnitude
  return null
}

function parseElementBounds(rec: Record<string, unknown>): ParsedElement | null {
  const payload = (rec.createShape ?? rec.createTextBox ?? rec.createImage ?? rec.createTable ?? rec.createLine) as
    | Record<string, unknown>
    | undefined
  if (!payload || typeof payload.objectId !== 'string') return null
  const ep = payload.elementProperties as Record<string, unknown> | undefined
  const size = ep?.size as Record<string, unknown> | undefined
  const transform = ep?.transform as Record<string, unknown> | undefined
  const wMag = (size?.width ?? size?.widthEmu) as Record<string, unknown> | undefined
  const hMag = (size?.height ?? size?.heightEmu) as Record<string, unknown> | undefined
  // Lines carry x1/y1/x2/y2 instead of size+translate; normalize to a box.
  if (rec.createLine !== undefined) {
    const x1 = emuToPt(payload.x1, 'EMU')
    const y1 = emuToPt(payload.y1, 'EMU')
    const x2 = emuToPt(payload.x2, 'EMU')
    const y2 = emuToPt(payload.y2, 'EMU')
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null
    return {
      objectId: payload.objectId as string,
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.max(Math.abs(x2 - x1), 1 / EMU_PER_PT),
      h: Math.max(Math.abs(y2 - y1), 1 / EMU_PER_PT),
    }
  }
  const w = emuToPt((wMag as Record<string, unknown> | undefined)?.magnitude, (wMag as Record<string, unknown> | undefined)?.unit)
  const h = emuToPt((hMag as Record<string, unknown> | undefined)?.magnitude, (hMag as Record<string, unknown> | undefined)?.unit)
  const x = emuToPt(transform?.translateX, transform?.unit)
  const y = emuToPt(transform?.translateY, transform?.unit)
  if (w === null || h === null || x === null || y === null) return null
  const sx = typeof transform?.scaleX === 'number' && Number.isFinite(transform.scaleX) ? (transform.scaleX as number) : 1
  const sy = typeof transform?.scaleY === 'number' && Number.isFinite(transform.scaleY) ? (transform.scaleY as number) : 1
  return { objectId: payload.objectId as string, x, y, w: w * sx, h: h * sy }
}

/**
 * TASK-096-R1: post-compile deck geometry verification (pre-write).
 * Splits the compiled batch at createSlide boundaries and asserts per
 * slide: element bounds inside the page with non-negative dimensions, and
 * — only when the plan promises page backgrounds (production theme) —
 * exactly one full-page background update per slide. Page properties cover
 * the whole page by construction, so presence + correct target is the check;
 * themes that never emit backgrounds are not failed for their absence.
 */
export function verifyDeckGeometry(
  plan: CompiledDeckPlan,
  opts?: { requireBackground?: boolean }
): DeckGeometryVerification {
  const page = { x: 0, y: 0, w: plan.assumedPageSize.wPt, h: plan.assumedPageSize.hPt }
  const violations: string[] = []
  // Segment requests per slide: slide 0 owns everything before the first
  // createSlide; each createSlide opens the next segment.
  const segments: Array<{ slideIndex: number; requests: GoogleRequest[] }> = [{ slideIndex: 0, requests: [] }]
  for (const req of plan.requests) {
    const rec = req as Record<string, unknown>
    if (rec.createSlide !== undefined) {
      segments.push({ slideIndex: segments.length, requests: [] })
      continue
    }
    segments[segments.length - 1].requests.push(req)
  }
  if (segments.length !== plan.slides.length) {
    violations.push(`request segmentation produced ${segments.length} segments for ${plan.slides.length} slides`)
  }
  const requireBackground = opts?.requireBackground === true
  const slides: SlideGeometryRecord[] = plan.slides.map((slide, i) => {
    const seg = segments[i] ?? { slideIndex: i, requests: [] as GoogleRequest[] }
    const bgReqs = seg.requests.filter(
      (r) => (r as Record<string, unknown>).updatePageProperties !== undefined
    )
    const requireBackground = opts?.requireBackground === true
    if (requireBackground && bgReqs.length !== 1) {
      violations.push(`${slide.slideKey}: expected exactly 1 page-background update, found ${bgReqs.length}`)
    } else if (bgReqs.length > 1) {
      violations.push(`${slide.slideKey}: expected at most 1 page-background update, found ${bgReqs.length}`)
    } else if (bgReqs.length === 1) {
      const target = ((bgReqs[0] as Record<string, unknown>).updatePageProperties as Record<string, unknown>)?.objectId
      if (target !== slide.pageObjectId && target !== plan.plannedSlideIds[i]) {
        violations.push(`${slide.slideKey}: page-background targets ${String(target)}, expected slide page`)
      }
    }
    const elements: ParsedElement[] = []
    for (const r of seg.requests) {
      const parsed = parseElementBounds(r as Record<string, unknown>)
      if (parsed) elements.push(parsed)
    }
    const outOfPageIds: string[] = []
    const negativeDimensionIds: string[] = []
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const el of elements) {
      if (!(el.w >= 0) || !(el.h >= 0)) {
        negativeDimensionIds.push(el.objectId)
        continue
      }
      if (el.w === 0 || el.h === 0) {
        negativeDimensionIds.push(el.objectId)
        continue
      }
      if (el.x < -1 || el.y < -1 || el.x + el.w > page.w + 1 || el.y + el.h > page.h + 1) {
        outOfPageIds.push(el.objectId)
      }
      minX = Math.min(minX, el.x)
      minY = Math.min(minY, el.y)
      maxX = Math.max(maxX, el.x + el.w)
      maxY = Math.max(maxY, el.y + el.h)
    }
    if (outOfPageIds.length > 0) {
      violations.push(`${slide.slideKey}: ${outOfPageIds.length} object(s) outside page bounds: ${outOfPageIds.slice(0, 5).join(', ')}`)
    }
    if (negativeDimensionIds.length > 0) {
      violations.push(`${slide.slideKey}: ${negativeDimensionIds.length} object(s) with non-positive dimensions: ${negativeDimensionIds.slice(0, 5).join(', ')}`)
    }
    const rec: SlideGeometryRecord = {
      slideKey: slide.slideKey,
      pageObjectId: slide.pageObjectId,
      pageBounds: { ...page },
      backgroundBounds: bgReqs.length === 1 ? { ...page } : null,
      backgroundKind: bgReqs.length === 1 ? 'page-property' : 'missing',
      contentBounds:
        elements.length > 0 && Number.isFinite(minX)
          ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
          : null,
      meaningfulObjectCount: elements.length,
      outOfPageIds,
      negativeDimensionIds,
      geometryStatus:
        (!requireBackground || bgReqs.length === 1) && outOfPageIds.length === 0 && negativeDimensionIds.length === 0
          ? 'PASS'
          : 'FAIL',
    }
    return rec
  })
  const status = violations.length === 0 && slides.every((s) => s.geometryStatus === 'PASS') ? 'PASS' : 'FAIL'
  return { pageBounds: { ...page }, slides, status, violations }
}

export function compileDeckPlan(raw: Record<string, unknown>): CompiledDeckPlan {
  const spec = validateDeckSpec(raw)
  const theme = normalizeThemeId(spec.themeId)
  const themeResolution = resolveThemePrecedence(theme.backingThemeId, null, null)
  const plannedSlideIds = spec.slides.map((s, i) => slideIdFor(s.slideKey, i))
  uniqueOrFail(plannedSlideIds, 'NORMALIZED_OBJECT_ID_COLLISION', 'planned slide id')
  const slides = spec.slides.map((slide, i) => adaptSlide(slide, plannedSlideIds[i], themeResolution.themeId, i, spec.slides.length))
  const requests: GoogleRequest[] = []
  const perSlide: Array<Record<string, unknown>> = []
  let preflightChecks = 0
  // TASK-096: production gates apply only when the resolved catalog theme is
  // the production theme — every other theme compiles exactly as before.
  const isProduction = theme.catalog.themeId === PRODUCTION_THEME_ID
  for (let i = 0; i < slides.length; i += 1) {
    if (i > 0) requests.push(buildCreateSlide({ slideObjectId: plannedSlideIds[i], insertionIndex: i }))
    if (isProduction) {
      // Capacity preflight BEFORE composition: content that cannot fit the
      // production variant fails terminally here (pre-write, zero writes).
      const capacity = preflightProductionCapacity(
        slides[i].productionVariant as Parameters<typeof preflightProductionCapacity>[0],
        {
          title: slides[i].input.title,
          ...(slides[i].input.subtitle ? { subtitle: slides[i].input.subtitle } : {}),
          ...(slides[i].input.bullets ? { bullets: slides[i].input.bullets } : {}),
          ...(slides[i].input.metrics ? { metrics: slides[i].input.metrics } : {}),
          ...(slides[i].input.stages ? { stages: slides[i].input.stages } : {}),
          ...(slides[i].input.columns ? { columns: slides[i].input.columns } : {}),
          ...(slides[i].input.closing ? { closing: slides[i].input.closing } : {}),
        }
      )
      preflightChecks += capacity.length
      const capacityBlock = capacity.find((f) => !f.pass)
      if (capacityBlock) codedFail('PRODUCTION_CAPACITY_EXCEEDED', `${slides[i].slideKey}: ${capacityBlock.detail}`)
    }
    const composed = composeSlideOnPage(slides[i].input, {
      // TASK-096-R1: compose against the authoritative Google default page,
      // never the 960x540 design reference (which oversizes every coordinate
      // 4/3 on the real 720x405pt page). Verified post-create by the handler.
      pageWidthPt: GOOGLE_DEFAULT_PAGE_PT.w,
      pageHeightPt: GOOGLE_DEFAULT_PAGE_PT.h,
      alphaThemeId: themeResolution.themeId,
      expectedEncoding: slides[i].variant,
    })
    preflightChecks += composed.prewriteQa.length
    if (composed.finalStatus === 'GEOMETRY_FAILED') codedFail('CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS', `${slides[i].slideKey} failed preflight.`)
    if (isProduction) {
      // Typography preflight AFTER composition: narrative roles must meet
      // production minima (body 12pt even though the global floor is 10pt).
      // Normalized by the deck fontScale (design-space comparison).
      const typo = preflightProductionTypography(
        composed.result.placed ?? [],
        resolvePageGeometry(GOOGLE_DEFAULT_PAGE_PT.w, GOOGLE_DEFAULT_PAGE_PT.h).fontScale
      )
      preflightChecks += typo.length
      const typoBlock = typo.find((f) => !f.pass)
      if (typoBlock) codedFail('PRODUCTION_TYPE_MINIMUM', `${slides[i].slideKey}: ${typoBlock.detail}`)
    }
    requests.push(...composed.result.requests)
    // TASK-096: resolved page background per slide. Hero/closing use the
    // decorative image-gradient asset when a stable URL was supplied;
    // everything else uses solid production navy. Reported per slide.
    const bgSpec = isProduction
      ? productionBackgroundFor(
          slides[i].productionVariant as Parameters<typeof productionBackgroundFor>[0],
          spec.backgroundImageUrl
        )
      : null
    if (bgSpec) {
      requests.push(
        buildUpdatePageBackground(
          plannedSlideIds[i],
          bgSpec.technique === 'IMAGE_GRADIENT' && spec.backgroundImageUrl
            ? { backgroundImageUrl: spec.backgroundImageUrl }
            : { backgroundHex: bgSpec.solidHex }
        )
      )
    }
    perSlide.push({
      slideKey: slides[i].slideKey,
      pageObjectId: plannedSlideIds[i],
      semanticTopology: slides[i].topology,
      selectedArchetype: slides[i].selectedArchetype,
      variant: slides[i].variant,
      productionVariant: slides[i].productionVariant,
      ...(bgSpec ? { backgroundVariant: bgSpec.variant, backgroundTechnique: bgSpec.technique } : {}),
      routeReason: slides[i].reason,
      peerCount: slides[i].peerCount,
      aggregateCount: slides[i].aggregateCount,
      sourceFactCount: slides[i].sourceFacts.length,
      sourceFingerprint: slides[i].sourceFingerprint,
      compatibilityMode: slides[i].compatibilityMode,
      warnings: slides[i].warnings,
      prewriteQa: composed.prewriteQa,
      status: composed.finalStatus,
    })
  }
  uniqueOrFail(collectCreatedObjectIds(requests), 'NORMALIZED_OBJECT_ID_COLLISION', 'compiled object id')
  // TASK-096-R1: the whole compile assumed the design canvas. Record the
  // assumption explicitly, then verify deck geometry (background coverage +
  // in-page bounds per slide) before any Google write.
  const assumedPageSize: AuthoritativePageSize = { wPt: GOOGLE_DEFAULT_PAGE_PT.w, hPt: GOOGLE_DEFAULT_PAGE_PT.h, unit: 'PT' }
  const plan: CompiledDeckPlan = {
    spec,
    theme: { catalog: theme.catalog, backingThemeId: themeResolution.themeId, source: theme.source },
    plannedSlideIds,
    slides,
    requests,
    perSlide,
    assumedPageSize,
    geometry: {
      pageBounds: { x: 0, y: 0, w: GOOGLE_DEFAULT_PAGE_PT.w, h: GOOGLE_DEFAULT_PAGE_PT.h },
      slides: [],
      status: 'PASS',
      violations: [],
    },
    internalAccounting: {
      internalSlidesPlanned: slides.length,
      internalRendererCalls: slides.length,
      variantsEvaluated: slides.length,
      compiledSubrequests: requests.length,
      preflightChecks,
    },
  }
  plan.geometry = verifyDeckGeometry(plan, { requireBackground: isProduction })
  if (plan.geometry.status !== 'PASS') {
    codedFail('DECK_GEOMETRY_PREFLIGHT_FAILED', plan.geometry.violations.slice(0, 5).join(' | '))
  }
  // TASK-096-R1 §9: per-slide geometry evidence rides the perSlide records.
  plan.perSlide.forEach((rec, i) => {
    const g = plan.geometry.slides[i]
    if (g) {
      rec.geometryStatus = g.geometryStatus
      rec.backgroundBounds = g.backgroundBounds
      rec.contentBounds = g.contentBounds
      rec.meaningfulObjectCount = g.meaningfulObjectCount
      rec.outOfPageIds = g.outOfPageIds
    }
  })
  return plan
}

async function createPresentation(token: string, title: string): Promise<{ presentationId: string }> {
  return googleRequest<{ presentationId: string }>({ method: 'POST', url: 'https://slides.googleapis.com/v1/presentations', body: { title }, token })
}

async function readPresentation(token: string, presentationId: string): Promise<PresentationRead> {
  return googleRequest<PresentationRead>({ method: 'GET', url: `https://slides.googleapis.com/v1/presentations/${presentationId}`, token })
}

interface DeckDeps {
  createPresentation: (title: string) => Promise<{ presentationId: string }>
  readPresentation: (presentationId: string) => Promise<PresentationRead>
  executeBatch: (presentationId: string, requests: GoogleRequest[]) => Promise<{ createdIds: string[]; appliedRequests: number }>
  cleanupPresentation?: (presentationId: string) => Promise<'CLEANED_UP' | 'UNAVAILABLE' | 'FAILED'>
  now?: () => number
}

function textOfElement(el: GooglePageElementRead): string {
  return (el.shape?.text?.textElements ?? []).map((te) => te.textRun?.content ?? '').join('').trim()
}

function isDecorativeId(id: string): boolean {
  return /(^|_)(BG|DECO|MOTIF|ACCENT|CBAR|PILBASE|DBT|STKC|STKS|STG|DOT|ARW|TLBASE)/i.test(id)
}

function visitElements(elements: GooglePageElementRead[] | undefined, cb: (el: GooglePageElementRead) => void): void {
  for (const el of elements ?? []) {
    cb(el)
    visitElements(el.elementGroup?.children, cb)
  }
}

export function summarizeSlides(pres: PresentationRead): MeaningfulSlideSummary[] {
  return (pres.slides ?? []).map((slide) => {
    let meaningfulObjectCount = 0
    let decorativeObjectCount = 0
    let visibleTextCount = 0
    let imageCount = 0
    let chartCount = 0
    let semanticMarkCount = 0
    let emptyContainerCount = 0
    visitElements(slide.pageElements, (el) => {
      const id = el.objectId ?? ''
      const text = textOfElement(el)
      if (text) {
        visibleTextCount += 1
        meaningfulObjectCount += 1
        return
      }
      if (el.image) {
        imageCount += 1
        meaningfulObjectCount += 1
        return
      }
      if (el.sheetsChart) {
        chartCount += 1
        meaningfulObjectCount += 1
        return
      }
      if (el.table) {
        meaningfulObjectCount += 1
        return
      }
      if (el.line && !isDecorativeId(id)) {
        semanticMarkCount += 1
        meaningfulObjectCount += 1
        return
      }
      if (el.shape && !text) emptyContainerCount += 1
      decorativeObjectCount += 1
    })
    const meaningful = meaningfulObjectCount > 0 && visibleTextCount + imageCount + chartCount + semanticMarkCount > 0
    return {
      objectId: slide.objectId ?? '',
      meaningfulObjectCount,
      decorativeObjectCount,
      visibleTextCount,
      imageCount,
      chartCount,
      semanticMarkCount,
      emptyContainerCount,
      meaningful,
      reason: meaningful ? 'meaning-bearing content found recursively' : 'no recursive meaning-bearing content',
    }
  }).filter((s) => s.objectId)
}

function textBySlide(pres: PresentationRead): Map<string, string> {
  const out = new Map<string, string>()
  for (const slide of pres.slides ?? []) {
    const texts: string[] = []
    visitElements(slide.pageElements, (el) => {
      const text = textOfElement(el)
      if (text) texts.push(text)
    })
    if (slide.objectId) out.set(slide.objectId, texts.join('\n'))
  }
  return out
}

export function evaluateSemanticFidelity(plan: CompiledDeckPlan, pres: PresentationRead, slideIdMap?: Map<string, string>): { status: 'PROVEN' | 'FAILED' | 'UNPROVEN'; perSlide: SlideFidelityResult[] } {
  const textMap = textBySlide(pres)
  const perSlide = plan.slides.map((slide): SlideFidelityResult => {
    const runtimeId = slideIdMap?.get(slide.pageObjectId) ?? slide.pageObjectId
    const rendered = textMap.get(runtimeId) ?? ''
    if (!rendered) {
      return {
        slideKey: slide.slideKey,
        status: slide.sourceFacts.length === 0 ? 'UNPROVEN' : 'FAILED',
        peerSourceCount: slide.sourceFacts.filter((f) => f.kind !== 'aggregate').length,
        peerRenderedCount: 0,
        aggregateSourceCount: slide.sourceFacts.filter((f) => f.kind === 'aggregate').length,
        aggregateRenderedCount: 0,
        omittedIdentities: slide.sourceFacts.map((f) => f.factId),
        changedIdentities: [],
      }
    }
    const omitted = slide.sourceFacts.filter((f) => !rendered.includes(f.label) || (f.value !== undefined && !rendered.includes(f.value))).map((f) => f.factId)
    const peerSource = slide.sourceFacts.filter((f) => f.kind !== 'aggregate')
    const aggregateSource = slide.sourceFacts.filter((f) => f.kind === 'aggregate')
    const aggregateRendered = aggregateSource.filter((f) => rendered.includes(f.label) && (f.value === undefined || rendered.includes(f.value))).length
    return {
      slideKey: slide.slideKey,
      status: omitted.length === 0 ? 'PROVEN' : 'FAILED',
      peerSourceCount: peerSource.length,
      peerRenderedCount: peerSource.length - omitted.filter((id) => peerSource.some((f) => f.factId === id)).length,
      aggregateSourceCount: aggregateSource.length,
      aggregateRenderedCount: aggregateRendered,
      omittedIdentities: omitted,
      changedIdentities: [],
      ...(aggregateSource[0] ? { aggregateIdentity: aggregateSource[0].factId } : {}),
    }
  })
  const factBearing = perSlide.filter((s) => s.peerSourceCount + s.aggregateSourceCount > 0)
  const status = factBearing.length === 0 ? 'UNPROVEN' : factBearing.every((s) => s.status === 'PROVEN') ? 'PROVEN' : 'FAILED'
  return { status, perSlide }
}

function replaceFirstSlideId(requests: GoogleRequest[], plannedFirst: string, actualFirst: string): GoogleRequest[] {
  return requests.map((req) => JSON.parse(JSON.stringify(req).replaceAll(plannedFirst, actualFirst)) as GoogleRequest)
}

async function handleComposeDeckWithDeps(args: Record<string, unknown>, deps: DeckDeps): Promise<Record<string, unknown>> {
  const now = deps.now ?? (() => Date.now())
  const startedAt = now()
  const plan = compileDeckPlan(args)
  let createdId: string | null = null
  let cleanupAttempted = false
  let cleanupOutcome: 'NOT_ATTEMPTED' | 'CLEANED_UP' | 'UNAVAILABLE' | 'FAILED' = 'NOT_ATTEMPTED'
  try {
    const created = await deps.createPresentation(plan.spec.title)
    createdId = created.presentationId
    const initial = await deps.readPresentation(createdId)
    const initialSlideId = initial.slides?.[0]?.objectId
    if (!initialSlideId) throw new Error('INITIAL_READ_NO_SLIDE')
    // TASK-096-R1: the compile assumed the design canvas. Verify against the
    // authoritative presentation pageSize before writing anything — a
    // mismatch would displace the whole composition, so it fails terminally
    // (with the standard cleanup path) instead of writing displaced content.
    let actualPageSize: AuthoritativePageSize | null = null
    try {
      actualPageSize = pageSizePtOfPresentation(initial)
    } catch {
      actualPageSize = null
    }
    const pageSizeMatch =
      actualPageSize !== null && pageSizeMatches(plan.assumedPageSize, actualPageSize)
    if (!pageSizeMatch) {
      throw new Error(
        `Alpha Beautify deck: PAGE_SIZE_MISMATCH: assumed ${plan.assumedPageSize.wPt}x${plan.assumedPageSize.hPt}pt but presentation reports ${
          actualPageSize ? `${actualPageSize.wPt}x${actualPageSize.hPt}pt` : 'unreadable pageSize'
        }.`
      )
    }
    const slideIdMap = new Map<string, string>([[plan.plannedSlideIds[0], initialSlideId]])
    const requests = replaceFirstSlideId(plan.requests, plan.plannedSlideIds[0], initialSlideId)
    plan.perSlide[0].pageObjectId = initialSlideId
    const writeStarted = now()
    const batch = await deps.executeBatch(createdId, requests)
    const writeMs = now() - writeStarted
    const finalRead = await deps.readPresentation(createdId)
    const meaningfulSlides = summarizeSlides(finalRead)
    const fidelity = evaluateSemanticFidelity(plan, finalRead, slideIdMap)
    const meaningfulCount = meaningfulSlides.filter((s) => s.meaningful).length
    const structuralProven = meaningfulSlides.length === plan.spec.slides.length && meaningfulCount === plan.spec.slides.length && fidelity.status !== 'FAILED'
    return {
      presentationId: createdId,
      url: `https://docs.google.com/presentation/d/${createdId}/edit`,
      requestedSlideCount: plan.spec.requestedSlideCount,
      meaningfulSlideCount: meaningfulCount,
      pageSize: {
        assumed: plan.assumedPageSize,
        actual: actualPageSize,
        match: pageSizeMatch,
      },
      theme: {
        requestedThemeId: plan.spec.themeId ?? null,
        resolvedThemeId: plan.theme.catalog.themeId,
        backingThemeId: plan.theme.backingThemeId,
        themeVersion: plan.theme.catalog.version,
        backgroundTechnique: plan.theme.catalog.backgroundTechnique,
        templateSource: plan.theme.catalog.templateSource,
        resolutionSource: plan.theme.source,
      },
      perSlide: plan.perSlide,
      sourceFingerprints: Object.fromEntries(plan.slides.map((s) => [s.slideKey, s.sourceFingerprint])),
      semanticFidelity: fidelity,
      batchWrite: { batchCount: 1, subrequestCount: requests.length, appliedRequests: batch.appliedRequests, createdIds: batch.createdIds, writeDurationMs: writeMs },
      structuralQa: { slides: meaningfulSlides, verdict: structuralProven ? 'LIFECYCLE_PROVEN' : 'LIFECYCLE_MISMATCH' },
      renderedQa: { status: 'UNPROVEN', policy: plan.spec.visualQaPolicy, reason: 'Rendered screenshot/PDF QA is deferred.' },
      atomicLifecycle: {
        contentAtomicity: 'GOOGLE_BATCH_ATOMIC',
        fileLifecycleAtomicity: 'CONTENT_PREPLANNED_FILE_NONATOMIC',
        presentationCreated: true,
        batchApplied: true,
        cleanupAttempted,
        cleanupOutcome,
        orphanPresentationId: null,
      },
      callAccounting: {
        externalMcpCalls: 1,
        googleHttpCalls: 4,
        ...plan.internalAccounting,
        writeAttempts: 1,
        readAttempts: 2,
        cleanupAttempts: 0,
      },
      observability: {
        transactionId: `deck_${createdId}_${startedAt}`,
        planningDurationMs: writeStarted - startedAt,
        googleWriteDurationMs: writeMs,
        totalDurationMs: now() - startedAt,
      },
      proof: {
        SOURCE_PROVEN: fidelity.status,
        PLAN_VALID: 'PROVEN',
        WRITE_APPLIED: 'PROVEN',
        STRUCTURALLY_PROVEN: structuralProven ? 'PROVEN' : 'FAILED',
        RENDERED_VISUAL_PROVEN: 'UNPROVEN',
        HUMAN_VISUAL_PROVEN: 'UNPROVEN',
      },
      warnings: [
        'Rendered visual QA is separated from structural QA and remains UNPROVEN.',
        'Template-copy masters/layouts and media insertion are not enabled in this corrective.',
      ],
      terminalErrors: [],
      overallVerdict: structuralProven ? 'STRUCTURALLY_PROVEN_RENDERED_UNPROVEN' : 'FAILED',
    }
  } catch (err) {
    if (createdId) {
      cleanupAttempted = true
      cleanupOutcome = deps.cleanupPresentation ? await deps.cleanupPresentation(createdId) : 'UNAVAILABLE'
    }
    return {
      presentationId: null,
      requestedSlideCount: (() => { try { return validateDeckSpec(args).requestedSlideCount } catch { return null } })(),
      proof: { SOURCE_PROVEN: 'UNPROVEN', PLAN_VALID: 'UNPROVEN', WRITE_APPLIED: 'FAILED', STRUCTURALLY_PROVEN: 'UNPROVEN', RENDERED_VISUAL_PROVEN: 'UNPROVEN', HUMAN_VISUAL_PROVEN: 'UNPROVEN' },
      atomicLifecycle: {
        contentAtomicity: 'NOT_APPLIED_OR_UNKNOWN',
        fileLifecycleAtomicity: cleanupOutcome === 'CLEANED_UP' ? 'FAILED_CLEANED_UP' : 'ORPHAN_PRESENTATION_POSSIBLE',
        presentationCreated: createdId !== null,
        batchApplied: false,
        cleanupAttempted,
        cleanupOutcome,
        orphanPresentationId: cleanupOutcome === 'CLEANED_UP' ? null : createdId,
      },
      callAccounting: { externalMcpCalls: 1, googleHttpCalls: createdId ? 2 : 1, internalSlidesPlanned: 0, internalRendererCalls: 0, compiledSubrequests: 0, writeAttempts: createdId ? 1 : 0, readAttempts: createdId ? 1 : 0, cleanupAttempts: cleanupAttempted ? 1 : 0 },
      terminalErrors: [{ code: cleanupOutcome === 'CLEANED_UP' ? 'FAILED_CLEANED_UP' : 'ORPHAN_PRESENTATION_POSSIBLE', message: err instanceof Error ? err.message : String(err), orphanPresentationId: cleanupOutcome === 'CLEANED_UP' ? null : createdId }],
      overallVerdict: 'FAILED',
    }
  }
}

export function listThemeCatalog(args: Record<string, unknown> = {}): McpTextResult {
  const includePreviewUrls = args.includePreviewUrls === true
  const includeCapabilities = args.includeCapabilities === true
  return textResult({
    themes: THEME_CATALOG.map((theme) => ({
      themeId: theme.themeId,
      displayName: theme.displayName,
      version: theme.version,
      description: theme.description,
      tone: theme.tone,
      supportedArchetypes: theme.supportedArchetypes,
      palette: theme.palette,
      fontFamilies: theme.fontFamilies,
      backgroundTechnique: theme.backgroundTechnique,
      ...(includePreviewUrls ? { previewUrl: theme.previewUrl, previewStatus: theme.previewStatus } : { previewStatus: theme.previewStatus }),
      supportsImages: theme.supportsImages,
      mediaSupported: theme.mediaSupported,
      templateSource: theme.templateSource,
      templateCopySupported: theme.templateCopySupported,
      renderedQaStatus: theme.renderedQaStatus,
      status: theme.status,
      ...(includeCapabilities ? { capabilities: { deckCompose: theme.status !== 'disabled', renderedQa: false, templateCopy: false, media: false } } : {}),
    })),
    productionReadyCount: THEME_CATALOG.filter((t) => t.status === 'production').length,
    note: 'Theme list is structurally usable. Visual quality, previews, media support, and production readiness are not overclaimed.',
  })
}

export async function handleComposeDeck(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const result = await handleComposeDeckWithDeps(args, {
    createPresentation: (title) => createPresentation(token, title),
    readPresentation: (presentationId) => readPresentation(token, presentationId),
    executeBatch: (presentationId, requests) => executeBatch(token, presentationId, requests),
  })
  return textResult(result)
}

export const __deckTest = {
  adaptSlide,
  chooseTopology,
  compileDeckPlan,
  evaluateSemanticFidelity,
  handleComposeDeckWithDeps,
  slideIdFor,
  summarizeSlides,
  validateDeckSpec,
}
