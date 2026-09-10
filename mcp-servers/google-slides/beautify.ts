/**
 * TASK-085: Alpha Beautify v1 — native editable professional composition.
 *
 * Pipeline: SlidePlan (bounded, validated) -> archetype renderer ->
 * TASK-082/084 request builders -> batchUpdate -> readback -> QA.
 *
 * Deliberately NOT a second execution stack: every Google Request is built by
 * the proven builders in visual.ts. This module owns ONLY planning contracts,
 * the v1 design system, deterministic geometry, and structural QA.
 *
 * Geometry: agent-facing PT, centralized here. Canvas is 16:9 (960x540 PT);
 * all coordinates derive from shared constants — no per-slide magic numbers.
 */

import {
  buildCreateElementRequests,
  buildDeleteObject,
  buildGroupObjects,
  buildTextMutation,
  buildUpdateParagraphStyle,
  buildUpdateTextStyle,
  executeBatch,
  fetchPageSnapshot,
  textResult,
  type GoogleRequest,
  type McpTextResult,
  type PageSnapshot,
  type TextStyleInput,
} from './visual'
import {
  classifyTextFit,
  decideOwnership,
  defaultLayout,
  DESIGN_CANVAS,
  findFabricatedNumbers,
  hasBlocking,
  isTitlePlaceholderType,
  layoutColumnSet,
  layoutFor,
  layoutTimelineNode,
  rectsOverlap,
  resolvePageGeometry,
  roleFontPt,
  runPrewriteQa,
  qaReadback,
  ROLE_MIN_FONT,
  type GeometryFinding,
  type OwnershipDecision,
  type PageLayout,
  type PlacedElement,
  type PlaceholderInfo,
  type TextRole,
} from './geometry'

/**
 * MCP handler: compose one archetype slide on an existing page.
 * TASK-086 pipeline: page inspection → ownership → layout/QA/reflow →
 * execute → authoritative readback → final QA (fail-closed).
 */
export async function handleComposeSlide(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const { presentationId, input } = validateComposeInput(args)
  // 1. Page inspection: live dimensions + placeholder inventory.
  const snapshot = await fetchPageSnapshot(token, presentationId, input.pageObjectId)
  const placeholders: PlaceholderInfo[] = snapshot.elements
    .filter((e) => e.placeholderType !== undefined)
    .map((e) => ({
      objectId: e.objectId,
      type: e.placeholderType as string,
      ...(e.placeholderIndex !== undefined ? { index: e.placeholderIndex } : {}),
      text: e.text,
      ...(e.rectPt ? { rect: { x: e.rectPt.x, y: e.rectPt.y, w: e.rectPt.w, h: e.rectPt.h } } : {}),
    }))
  // 2. Responsive composition with pre-write QA + bounded reflow.
  const composed = composeSlideOnPage(input, {
    pageWidthPt: snapshot.pageWidthPt,
    pageHeightPt: snapshot.pageHeightPt,
    placeholders,
  })
  // 3. Ownership execution already rides in the first chunk (CLEAR deletions
  //    are prepended by composeSlideOnPage — see above).
  const clearIds = composed.ownership.filter((d) => d.decision === 'CLEAR').map((d) => d.objectId)
  // 4. Pre-write fail-closed (§15): deterministic geometry already proves this
  //    composition cannot fit — do NOT write, report GEOMETRY_FAILED instead.
  if (composed.finalStatus === 'GEOMETRY_FAILED') {
    const findings = qaComposedSlide({ archetype: input.archetype, content: slideContentOf(input) }, composed.result)
    return textResult({
      presentationId,
      pageObjectId: input.pageObjectId,
      archetype: input.archetype,
      batches: 0,
      appliedRequests: 0,
      createdIds: [],
      expected: composed.result.expected,
      qa: findings,
      qaPass: false,
      pageGeometry: {
        widthPt: composed.layout.page.w,
        heightPt: composed.layout.page.h,
        aspect: composed.layout.page.aspect,
      },
      placeholderOwnership: composed.ownership,
      prewriteQa: composed.prewriteQa,
      reflows: { attempts: composed.reflowAttempts, reasons: composed.reflowReasons },
      readbackQa: [],
      finalStatus: 'GEOMETRY_FAILED',
      note: 'Pre-write geometry QA blocked: composition not written. Adjust content or layout and retry.',
    })
  }
  const allRequests = composed.result.requests
  const chunks = chunkRequests(allRequests)
  const createdIds: string[] = []
  let appliedRequests = 0
  for (const requests of chunks) {
    const done = await executeBatch(token, presentationId, requests)
    createdIds.push(...done.createdIds)
    appliedRequests += done.appliedRequests
  }
  // 4. Authoritative readback + final QA.
  const readback = await fetchPageSnapshot(token, presentationId, input.pageObjectId)
  const readbackQa = qaReadback({
    page: composed.layout.page,
    expectedTexts: expectedTextsOf(slideContentOf(input)),
    expectedIds: createdIds,
    clearedIds: clearIds,
    elements: readback.elements.map((e) => ({
      objectId: e.objectId,
      ...(e.rectPt ? { rectPt: e.rectPt } : {}),
      ...(e.text ? { text: e.text } : {}),
      ...(e.placeholderType ? { placeholderType: e.placeholderType } : {}),
    })),
    ownership: composed.ownership,
  })
  const findings = qaComposedSlide({ archetype: input.archetype, content: slideContentOf(input) }, composed.result)
  const blocked =
    composed.finalStatus === 'GEOMETRY_FAILED' || hasBlocking(readbackQa)
  return textResult({
    presentationId,
    pageObjectId: input.pageObjectId,
    archetype: input.archetype,
    batches: chunks.length,
    appliedRequests,
    createdIds,
    expected: composed.result.expected,
    qa: findings,
    qaPass: findings.every((f) => f.pass),
    // TASK-086 Phase 15: structured geometry evidence (bounded).
    pageGeometry: {
      widthPt: composed.layout.page.w,
      heightPt: composed.layout.page.h,
      aspect: composed.layout.page.aspect,
    },
    placeholderOwnership: composed.ownership,
    prewriteQa: composed.prewriteQa,
    reflows: { attempts: composed.reflowAttempts, reasons: composed.reflowReasons },
    readbackQa,
    finalStatus: blocked ? 'GEOMETRY_FAILED' : composed.finalStatus,
    note: 'Verify with slides_get_page.',
  })
}

/** Every input string the composer must reproduce (integrity baseline). */
export function expectedTextsOf(content: SlideContent): string[] {
  return [
    content.title,
    ...(content.subtitle ? [content.subtitle] : []),
    ...(content.bullets ?? []),
    ...(content.metrics ?? []).flatMap((m) => [m.label, m.value, ...(m.note ? [m.note] : [])]),
    ...(content.stages ?? []).flatMap((s) => [s.label, ...(s.description ? [s.description] : [])]),
    ...(content.columns ?? []).flatMap((c) => [c.name, ...c.items]),
    ...(content.closing ? [content.closing] : []),
  ]
}

function slideContentOf(input: ComposeInput): SlideContent {
  return {
    title: input.title,
    ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
    ...(input.bullets !== undefined ? { bullets: input.bullets } : {}),
    ...(input.metrics !== undefined ? { metrics: input.metrics } : {}),
    ...(input.stages !== undefined ? { stages: input.stages } : {}),
    ...(input.columns !== undefined ? { columns: input.columns } : {}),
    ...(input.closing !== undefined ? { closing: input.closing } : {}),
  }
}

// ---------------------------------------------------------------------------
// Design system (Alpha Professional Default v1)
// ---------------------------------------------------------------------------

export const CANVAS = { width: 960, height: 540 } as const
export const MARGIN = 48
export const TITLE_BAND = { x: 48, y: 30, height: 84 } as const
export const CONTENT_TOP = 150
export const CARD_GUTTER = 24
export const ACCENT_BAR_W = 8

export const TYPE = {
  display: { fontSizePt: 44, bold: true },
  title: { fontSizePt: 32, bold: true },
  header: { fontSizePt: 20, bold: true },
  body: { fontSizePt: 14, bold: false },
  metric: { fontSizePt: 40, bold: true },
  caption: { fontSizePt: 11, bold: false },
} as const

export const PALETTE = {
  background: '#FFFFFF',
  ink: '#111827',
  muted: '#6B7280',
  accent: '#2563EB',
  accent2: '#7C3AED',
  cardFill: '#F3F4F6',
  line: '#E5E7EB',
  accentSoft: '#DBEAFE',
} as const

export const CARD = {
  shapeType: 'ROUND_RECTANGLE',
  outlineWeightPt: 1,
} as const

export const SPACING = {
  titleToContent: 24,
  sectionGap: 32,
  lineH: 8,
} as const

// ---------------------------------------------------------------------------
// Planning contract
// ---------------------------------------------------------------------------

export const ARCHETYPES = [
  'COVER',
  'EXECUTIVE_SUMMARY',
  'KPI_DASHBOARD',
  'PROCESS_FUNNEL',
  'COMPARISON',
  'TIMELINE_ROADMAP',
  'PILLARS_STRATEGY',
  'CLOSING_INSIGHT',
] as const
export type Archetype = (typeof ARCHETYPES)[number]

export function asArchetype(v: unknown): Archetype {
  if (typeof v !== 'string' || !(ARCHETYPES as readonly string[]).includes(v)) {
    failPlan(`archetype must be one of ${ARCHETYPES.join(', ')}.`)
  }
  return v as Archetype
}

function failPlan(detail: string): never {
  throw new Error(`Alpha Beautify plan: ${detail}`)
}

export interface MetricDatum {
  label: string
  value: string
  note?: string
}

export interface StageDatum {
  label: string
  description?: string
}

export interface ColumnDatum {
  name: string
  items: string[]
}

export interface SlideContent {
  title: string
  subtitle?: string
  bullets?: string[]
  metrics?: MetricDatum[]
  stages?: StageDatum[]
  columns?: ColumnDatum[]
  closing?: string
}

export interface SlidePlan {
  slideNumber: number
  purpose: string
  title: string
  content: SlideContent
  archetype: Archetype
  reason: string
  expectedElements: number
}

export interface DeckNarrative {
  opening: string
  context: string
  strategy: string
  evidence: string
  action: string
  closing: string
}

export interface DeckPlan {
  topic: string
  narrative: DeckNarrative
  slides: SlidePlan[]
}

function nonEmptyString(v: unknown, label: string, maxLen: number): string {
  if (typeof v !== 'string' || v.trim() === '') failPlan(`${label} must be a non-empty string.`)
  const s = (v as string).trim()
  if (s.length > maxLen) failPlan(`${label} must be at most ${maxLen} characters.`)
  return s
}

function strArray(v: unknown, label: string, min: number, max: number, itemMax: number): string[] {
  if (!Array.isArray(v) || v.length < min || v.length > max) {
    failPlan(`${label} must be an array of ${min}..${max} strings.`)
  }
  return v.map((item, i) => {
    if (typeof item !== 'string' || item.trim() === '') failPlan(`${label}[${i}] must be a non-empty string.`)
    const s = (item as string).trim()
    if (s.length > itemMax) failPlan(`${label}[${i}] must be at most ${itemMax} characters.`)
    return s
  })
}

// ---------------------------------------------------------------------------
// Semantic router (deterministic signals, never title keywords alone)
// ---------------------------------------------------------------------------

const DATE_RE = /\b(\d{1,2}\s*\/\s*\d{1,2}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|q[1-4]|week|month|day\s+\d+|phase\s+\d+|30\/60\/90|milestone|roadmap|timeline|chronolog)/i
const COMPARE_RE = /\b(vs\.?|versus|compar|option|alternative|pros|cons|channel|vendor|plan [ab])\b/i
const METRIC_VALUE_RE = /(\d[\d.,]*\s*((rp|usd|million|billion|ribu|juta|miliar)\b|\$|%|x|k|m))|(\d+\.\d+\s*x)/i
const CLOSING_RE = /\b(conclusion|takeaway|thesis|recommendation|closing|insight|next step|call to action|thank)/i
const INTRO_RE = /\b(intro|overview|welcome|agenda|opening|about|vision|statement)\b/i
const PROCESS_RE = /\b(step|stage|phase|lifecycle|journey|funnel|flow|pipeline|acquisition|awareness|loyalty|convert|retain)\b/i
const PILLAR_RE = /\b(pillar|ecosystem|categor|strateg|framework|model|component|area|domain)\b/i

export interface RouterInput {
  position: 'first' | 'middle' | 'last'
  title: string
  bullets: string[]
  metrics?: MetricDatum[]
  stages?: StageDatum[]
  columns?: ColumnDatum[]
  purpose?: string
}

export function classifyArchetype(input: RouterInput): { archetype: Archetype; reason: string } {
  const hay = `${input.title}\n${(input.bullets ?? []).join('\n')}\n${input.purpose ?? ''}`
  const metrics = input.metrics ?? []
  const stages = input.stages ?? []
  const columns = input.columns ?? []

  // Structured metrics win; otherwise ≥2 metric-like values in prose trigger KPI
  // (single numbers such as years must NOT trigger — threshold is deliberate).
  const metricHits = hay.match(new RegExp(METRIC_VALUE_RE.source, 'gi')) ?? []
  if (metrics.length >= 2 || metricHits.length >= 2) {
    return { archetype: 'KPI_DASHBOARD', reason: `${Math.max(metrics.length, metricHits.length)} metric value(s) detected` }
  }
  if (columns.length >= 2) {
    return { archetype: 'COMPARISON', reason: `${columns.length} comparable columns present` }
  }
  if (stages.length >= 2 && DATE_RE.test(`${hay}\n${stages.map((s) => `${s.label} ${s.description ?? ''}`).join('\n')}`)) {
    return { archetype: 'TIMELINE_ROADMAP', reason: 'stages carry chronological markers' }
  }
  if (stages.length >= 2) {
    return { archetype: 'PROCESS_FUNNEL', reason: `${stages.length} ordered stages without chronology` }
  }
  if (input.position === 'first' && INTRO_RE.test(hay)) {
    return { archetype: 'COVER', reason: 'opening position with intro semantics' }
  }
  if (input.position === 'last' && CLOSING_RE.test(hay)) {
    return { archetype: 'CLOSING_INSIGHT', reason: 'closing position with thesis semantics' }
  }
  if (PILLAR_RE.test(hay) && (input.bullets ?? []).length >= 2) {
    return { archetype: 'PILLARS_STRATEGY', reason: 'category/pillar grouping semantics' }
  }
  if (COMPARE_RE.test(hay)) {
    return { archetype: 'COMPARISON', reason: 'comparison semantics without explicit columns' }
  }
  if (PROCESS_RE.test(hay) && (input.bullets ?? []).length >= 2) {
    return { archetype: 'PROCESS_FUNNEL', reason: 'process/journey semantics' }
  }
  if (input.position === 'first') {
    return { archetype: 'COVER', reason: 'opening position fallback' }
  }
  if (input.position === 'last') {
    return { archetype: 'CLOSING_INSIGHT', reason: 'closing position fallback' }
  }
  return { archetype: 'EXECUTIVE_SUMMARY', reason: 'summary content fallback' }
}

/** Deck-level narrative slotting: one coherent plan, never independent slides. */
export function planDeck(topic: string, slides: Array<Omit<SlidePlan, 'slideNumber' | 'archetype' | 'reason' | 'expectedElements'> & { archetype?: Archetype }>): DeckPlan {
  const cleanTopic = nonEmptyString(topic, 'topic', 200)
  if (!Array.isArray(slides) || slides.length < 1 || slides.length > 30) {
    failPlan('slides must be an array of 1..30 slide specs.')
  }
  const planned: SlidePlan[] = slides.map((s, i) => {
    const position = i === 0 ? 'first' : i === slides.length - 1 ? 'last' : 'middle'
    const title = nonEmptyString(s.title, `slides[${i}].title`, 200)
    const content = s.content
    if (!content || typeof content !== 'object') failPlan(`slides[${i}].content must be an object.`)
    const chosen =
      s.archetype !== undefined
        ? { archetype: asArchetype(s.archetype), reason: 'explicit caller override' }
        : classifyArchetype({
            position,
            title,
            bullets: content.bullets ?? [],
            ...(content.metrics ? { metrics: content.metrics } : {}),
            ...(content.stages ? { stages: content.stages } : {}),
            ...(content.columns ? { columns: content.columns } : {}),
            purpose: s.purpose,
          })
    return {
      slideNumber: i + 1,
      purpose: typeof s.purpose === 'string' ? s.purpose : 'general',
      title,
      content,
      archetype: chosen.archetype,
      reason: chosen.reason,
      expectedElements: 0,
    }
  })
  return {
    topic: cleanTopic,
    narrative: {
      opening: planned[0]?.title ?? '',
      context: planned[1]?.title ?? '',
      strategy: planned[Math.min(2, planned.length - 1)]?.title ?? '',
      evidence: planned.find((p) => p.archetype === 'KPI_DASHBOARD')?.title ?? '',
      action: planned.find((p) => p.archetype === 'TIMELINE_ROADMAP')?.title ?? '',
      closing: planned[planned.length - 1]?.title ?? '',
    },
    slides: planned,
  }
}

// ---------------------------------------------------------------------------
// Renderer plumbing (shared; archetypes only declare geometry + content)
// ---------------------------------------------------------------------------

export interface ComposeResult {
  requests: import('./visual').GoogleRequest[]
  expected: {
    archetype: Archetype
    titles: string[]
    texts: string[]
    groups: number
    elementCount: number
  }
  /** TASK-086: placed elements for geometry QA (present on the page path). */
  placed?: PlacedElement[]
}

interface Ctx {
  pageObjectId: string
  requests: import('./visual').GoogleRequest[]
  texts: string[]
  titles: string[]
  groups: number
  elements: number
  seq: number
  /**
   * TASK-085 CORRECTIVE: per-compose unique tag. Object IDs must be unique
   * presentation-wide, but seq restarted at 0 on every compose call, so slide
   * 2+ reused slide 1's IDs (AB_TITLE_0, ...) and Google rejected the batch.
   */
  tag: string
  /** TASK-086: page-relative layout (design canvas on the default path). */
  g: PageLayout
  /** TASK-086: placed elements for pre-write geometry QA. */
  placed: PlacedElement[]
  /** TASK-086: role/size pairs for hierarchy + minimum-font QA. */
  hierarchy: Array<{ role: TextRole; fontPt: number; id: string }>
  /** TASK-086: bounded reflow state (mutated by the reflow loop only). */
  reflow: { fontMul: number; funnelRows: 1 | 2 }
  /** TASK-086: native TITLE placeholder to reuse (null = custom title box). */
  reuseTitleId: string | null
  /** TASK-086: native title rect for subtitle anchoring on REUSE. */
  reuseTitleRect: { x: number; y: number; w: number; h: number } | null
}

function newCtx(pageObjectId: string, g: PageLayout = defaultLayout()): Ctx {
  return {
    pageObjectId,
    requests: [],
    texts: [],
    titles: [],
    groups: 0,
    elements: 0,
    seq: 0,
    tag: Math.random().toString(36).slice(2, 8),
    g,
    placed: [],
    hierarchy: [],
    reflow: { fontMul: 1, funnelRows: 1 },
    reuseTitleId: null,
    reuseTitleRect: null,
  }
}

/**
 * TASK-086: effective type style for a semantic role at the layout's font
 * scale (× reflow multiplier). Bold follows the v1 TYPE table.
 */
function t(ctx: Ctx, role: TextRole): { fontSizePt: number; bold: boolean } {
  const bold = role !== 'body' && role !== 'caption'
  return { fontSizePt: roleFontPt(role, ctx.g.fontScale * ctx.reflow.fontMul), bold }
}

function nextId(ctx: Ctx, prefix: string): string {
  return `AB_${ctx.tag}_${prefix}_${ctx.seq++}`
}

function finish(ctx: Ctx, archetype: Archetype): ComposeResult {
  return {
    requests: ctx.requests,
    expected: {
      archetype,
      titles: ctx.titles,
      texts: ctx.texts,
      groups: ctx.groups,
      elementCount: ctx.elements,
    },
  }
}

function trackText(ctx: Ctx, text: string, isTitle = false): void {
  ctx.texts.push(text)
  if (isTitle) ctx.titles.push(text)
}

export interface PlaceMeta {
  role?: TextRole
  parentId?: string | null
  /** Decorative full-region shapes never collide (still bounds-checked). */
  background?: boolean
}

function fontPtOf(style: TextStyleInput & { alignment?: 'START' | 'CENTER' | 'END' }): number | undefined {
  const v = (style as { fontSizePt?: unknown }).fontSizePt
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function addTextBox(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  style: TextStyleInput & { alignment?: 'START' | 'CENTER' | 'END' },
  prefix: string,
  isTitle = false,
  meta: PlaceMeta = {}
): string {
  const objectId = nextId(ctx, prefix)
  const rect = assertRect({ x, y, width, height }, prefix, ctx.g.page)
  const built = buildCreateElementRequests('textBox', ctx.pageObjectId, {
    type: 'textBox',
    pageObjectId: ctx.pageObjectId,
    objectId,
    rect,
    text,
    style,
  })
  ctx.requests.push(...built.requests)
  ctx.elements += 1
  trackText(ctx, text, isTitle)
  const fontPt = fontPtOf(style)
  ctx.placed.push({
    id: objectId,
    kind: 'text',
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    text,
    ...(fontPt !== undefined ? { fontPt } : {}),
    ...(meta.role ? { role: meta.role } : {}),
    ...(meta.parentId ? { parentId: meta.parentId } : {}),
  })
  if (meta.role && fontPt !== undefined) ctx.hierarchy.push({ role: meta.role, fontPt, id: objectId })
  return objectId
}

function addShape(
  ctx: Ctx,
  shapeType: 'RECTANGLE' | 'ROUND_RECTANGLE' | 'ELLIPSE',
  x: number,
  y: number,
  width: number,
  height: number,
  opts: { fillHex?: string; outlineHex?: string; text?: string; prefix: string } & PlaceMeta
): string {
  const objectId = nextId(ctx, opts.prefix)
  const rect = assertRect({ x, y, width, height }, opts.prefix, ctx.g.page)
  const built = buildCreateElementRequests('shape', ctx.pageObjectId, {
    type: 'shape',
    pageObjectId: ctx.pageObjectId,
    objectId,
    shapeType,
    rect,
    ...(opts.fillHex !== undefined ? { fillHex: opts.fillHex } : {}),
    ...(opts.outlineHex !== undefined ? { outlineHex: opts.outlineHex } : {}),
    ...(opts.text !== undefined && opts.text !== '' ? { text: opts.text } : {}),
  })
  ctx.requests.push(...built.requests)
  ctx.elements += 1
  if (opts.text) trackText(ctx, opts.text)
  ctx.placed.push({
    id: objectId,
    kind: opts.background === true ? 'background' : 'shape',
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    ...(opts.parentId ? { parentId: opts.parentId } : {}),
  })
  return objectId
}

function addLine(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, prefix: string): string {
  const objectId = nextId(ctx, prefix)
  const built = buildCreateElementRequests('line', ctx.pageObjectId, {
    type: 'line',
    pageObjectId: ctx.pageObjectId,
    objectId,
    x1,
    y1,
    x2,
    y2,
  })
  ctx.requests.push(...built.requests)
  ctx.elements += 1
  ctx.placed.push({
    id: objectId,
    kind: 'line',
    rect: {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.max(Math.abs(x2 - x1), 1),
      h: Math.max(Math.abs(y2 - y1), 1),
    },
  })
  return objectId
}

function groupIds(ctx: Ctx, ids: string[]): void {
  if (ids.length < 2) return
  ctx.requests.push(buildGroupObjects(ids))
  ctx.groups += 1
}

function assertRect(
  r: { x: number; y: number; width: number; height: number },
  label: string,
  page: { width: number; height: number } = CANVAS
): {
  x: number
  y: number
  width: number
  height: number
} {
  for (const [k, v] of Object.entries(r)) {
    if (!Number.isFinite(v)) failPlan(`${label}.${k} is not finite.`)
  }
  if (r.width <= 0 || r.height <= 0) failPlan(`${label} requires positive width/height.`)
  if (r.x < 0 || r.y < 0 || r.x + r.width > page.width + 1 || r.y + r.height > page.height + 1) {
    failPlan(`${label} overflows canvas ${page.width}x${page.height} (x=${r.x},y=${r.y},w=${r.width},h=${r.height}).`)
  }
  return r
}

function titleBlock(ctx: Ctx, title: string, subtitle?: string): void {
  const g = ctx.g
  if (ctx.reuseTitleId) {
    // TASK-086 REUSE: write into the native TITLE placeholder instead of
    // creating a competing custom title box. The region then belongs to the
    // native element, so the custom accent bar is skipped as well.
    const style = t(ctx, 'slideTitle')
    ctx.requests.push(
      ...buildTextMutation({ objectId: ctx.reuseTitleId, mode: 'set', text: title }),
      buildUpdateTextStyle({
        objectId: ctx.reuseTitleId,
        style: { fontSizePt: style.fontSizePt, bold: style.bold, colorHex: PALETTE.ink },
      }),
      buildUpdateParagraphStyle({ objectId: ctx.reuseTitleId, alignment: 'START' })
    )
    ctx.elements += 1
    trackText(ctx, title, true)
    const anchor = ctx.reuseTitleRect ?? { x: g.TITLE.x, y: g.TITLE.y, w: g.TITLE.w, h: g.TITLE.h }
    if (subtitle) {
      addTextBox(ctx, subtitle, anchor.x, anchor.y + anchor.h + 4, g.W - g.M * 2, 30 * g.page.sy, {
        ...t(ctx, 'body'),
        colorHex: PALETTE.muted,
        alignment: 'START',
      }, 'SUB', false, { role: 'body' })
    }
    return
  }
  addTextBox(ctx, title, g.TITLE.x, g.TITLE.y, g.TITLE.w, g.TITLE.h, {
    ...t(ctx, 'slideTitle'),
    colorHex: PALETTE.ink,
    alignment: 'START',
  }, 'TITLE', true, { role: 'slideTitle' })
  if (subtitle) {
    addTextBox(ctx, subtitle, g.TITLE.x, g.TITLE.y + g.TITLE.h + 4, 600 * g.page.sx, 30 * g.page.sy, {
      ...t(ctx, 'body'),
      colorHex: PALETTE.muted,
      alignment: 'START',
    }, 'SUB', false, { role: 'body' })
  }
  addShape(ctx, 'RECTANGLE', g.TITLE.x, g.TITLE.y + g.TITLE.h + (subtitle ? 38 : 8), 64 * g.page.sx, ACCENT_BAR_W * g.page.sy, {
    fillHex: PALETTE.accent,
    prefix: 'ACCBAR',
  })
}

// ---------------------------------------------------------------------------
// Archetype renderers (deterministic geometry, native objects only)
// ---------------------------------------------------------------------------

function renderCover(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  const sx = g.page.sx
  const sy = g.page.sy
  titleBlock(ctx, c.title, c.subtitle)
  if (c.closing) {
    addTextBox(ctx, c.closing, g.M, (g.H * 11) / 18, g.W - g.M * 2, (g.H * 2) / 9, {
      ...t(ctx, 'deckTitle'),
      colorHex: PALETTE.ink,
      alignment: 'START',
    }, 'STATEMENT', false, { role: 'deckTitle' })
  }
  addShape(ctx, 'RECTANGLE', g.W - 220 * sx, 140 * sy, 172 * sx, 360 * sy, {
    fillHex: PALETTE.accentSoft,
    prefix: 'ACCENT',
    background: true,
  })
}

function renderExecutiveSummary(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  titleBlock(ctx, c.title, c.subtitle)
  const bullets = (c.bullets ?? []).slice(0, 5)
  if (bullets.length === 0) failPlan('EXECUTIVE_SUMMARY requires 1..5 bullets.')
  const top = g.CONTENT_TOP + 40 * g.page.sy
  const gap = 12 * g.page.sy
  const rowH = Math.min(64 * g.page.sy, (g.H - top - g.M - (bullets.length - 1) * gap) / bullets.length)
  const dot = 28 * Math.min(g.page.sx, g.page.sy)
  bullets.forEach((b, i) => {
    const y = top + i * (rowH + gap)
    const dotId = addShape(ctx, 'ELLIPSE', g.M, y + 8 * g.page.sy, dot, dot, { fillHex: PALETTE.accent, prefix: 'NUMBG' })
    addTextBox(ctx, String(i + 1), g.M, y + 8 * g.page.sy, dot, dot, {
      ...t(ctx, 'body'),
      colorHex: '#FFFFFF',
      alignment: 'CENTER',
    }, 'NUM', false, { role: 'body', parentId: dotId })
    addTextBox(ctx, b, g.M + 44 * g.page.sx, y, g.W - g.M * 2 - 44 * g.page.sx, rowH, {
      ...t(ctx, 'body'),
      colorHex: PALETTE.ink,
      alignment: 'START',
    }, `ITEM${i}`, false, { role: 'body' })
  })
}

function gridFor(n: number): { cols: number; rows: number } {
  if (n <= 2) return { cols: n, rows: 1 }
  if (n <= 4) return { cols: 2, rows: 2 }
  return { cols: 3, rows: 2 }
}

function renderKpiDashboard(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  titleBlock(ctx, c.title, c.subtitle)
  const metrics = (c.metrics ?? []).slice(0, 6)
  if (metrics.length === 0) failPlan('KPI_DASHBOARD requires 1..6 metrics.')
  const { cols } = gridFor(metrics.length)
  const rows = Math.ceil(metrics.length / cols)
  const gw = g.W - g.M * 2
  const cardW = (gw - (cols - 1) * g.GUTTER) / cols
  const top = g.CONTENT_TOP + 40 * g.page.sy
  const availH = g.H - top - g.M
  const cardH = Math.min(180 * g.page.sy, (availH - (rows - 1) * g.GUTTER) / rows)
  const pad = 16 * g.page.sx
  metrics.forEach((m, i) => {
    if (!m.label?.trim() || !m.value?.trim()) failPlan(`metrics[${i}] requires label and value.`)
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = g.M + col * (cardW + g.GUTTER)
    const y = top + row * (cardH + g.GUTTER)
    const ids: string[] = []
    const bgId = addShape(ctx, CARD.shapeType, x, y, cardW, cardH, { fillHex: PALETTE.cardFill, prefix: `KPIBG${i}` })
    ids.push(bgId)
    ids.push(
      addTextBox(ctx, m.value.trim(), x + pad, y + 14 * g.page.sy, cardW - pad * 2, 60 * g.page.sy, {
        ...t(ctx, 'kpiValue'),
        colorHex: PALETTE.accent,
        alignment: 'START',
      }, `KPIV${i}`, false, { role: 'kpiValue', parentId: bgId })
    )
    ids.push(
      addTextBox(ctx, m.label.trim(), x + pad, y + 78 * g.page.sy, cardW - pad * 2, 30 * g.page.sy, {
        ...t(ctx, 'body'),
        colorHex: PALETTE.ink,
        alignment: 'START',
      }, `KPIL${i}`, false, { role: 'body', parentId: bgId })
    )
    if (m.note?.trim()) {
      ids.push(
        addTextBox(ctx, m.note.trim(), x + pad, y + 110 * g.page.sy, cardW - pad * 2, Math.max(20 * g.page.sy, cardH - 124 * g.page.sy), {
          ...t(ctx, 'caption'),
          colorHex: PALETTE.muted,
          alignment: 'START',
        }, `KPIN${i}`, false, { role: 'caption', parentId: bgId })
      )
    }
    groupIds(ctx, ids)
  })
}

function renderProcessFunnel(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  const sx = g.page.sx
  const sy = g.page.sy
  titleBlock(ctx, c.title, c.subtitle)
  const stages = (c.stages ?? []).slice(0, 6)
  if (stages.length === 0) failPlan('PROCESS_FUNNEL requires 2..6 stages.')
  if (stages.length < 2) failPlan('PROCESS_FUNNEL requires 2..6 stages.')
  const top = g.CONTENT_TOP + 60 * sy
  const n = stages.length
  const gw = g.W - g.M * 2
  const gap = 16 * sx
  // TASK-086 reflow: single row while readable; two rows when boxes would
  // narrow past the readable minimum (six-stage funnel case).
  const rows = ctx.reflow.funnelRows
  const cols = Math.ceil(n / rows)
  const boxW = (gw - (cols - 1) * gap) / cols
  const availH = g.H - top - g.M
  const boxH = rows === 1 ? Math.min(150 * sy, availH) : (availH - gap) / rows
  stages.forEach((s, i) => {
    if (!s.label?.trim()) failPlan(`stages[${i}].label is required.`)
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = g.M + col * (boxW + gap)
    const y = top + row * (boxH + gap)
    const ids: string[] = []
    const bgId = addShape(ctx, 'ROUND_RECTANGLE', x, y, boxW, boxH, { fillHex: PALETTE.accentSoft, prefix: `STG${i}` })
    ids.push(bgId)
    ids.push(
      addTextBox(ctx, s.label.trim(), x + 10 * sx, y + 12 * sy, boxW - 20 * sx, 44 * sy, {
        ...t(ctx, 'cardHeading'),
        colorHex: PALETTE.accent,
        alignment: 'CENTER',
      }, `STGL${i}`, false, { role: 'cardHeading', parentId: bgId })
    )
    if (s.description?.trim()) {
      ids.push(
        addTextBox(ctx, s.description.trim(), x + 10 * sx, y + 60 * sy, boxW - 20 * sx, boxH - 70 * sy, {
          ...t(ctx, 'caption'),
          colorHex: PALETTE.ink,
          alignment: 'CENTER',
        }, `STGD${i}`, false, { role: 'caption', parentId: bgId })
      )
    }
    if (rows === 1 && i < n - 1) {
      addShape(ctx, 'RECTANGLE', x + boxW + 2 * sx, y + boxH / 2 - 2 * sy, 12 * sx, 4 * sy, { fillHex: PALETTE.accent, prefix: `ARW${i}` })
    }
    groupIds(ctx, ids)
  })
}

function renderComparison(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  const sx = g.page.sx
  const sy = g.page.sy
  titleBlock(ctx, c.title, c.subtitle)
  const columns = (c.columns ?? []).slice(0, 4)
  if (columns.length < 2) failPlan('COMPARISON requires 2..4 columns.')
  const top = g.CONTENT_TOP + 40 * sy
  const gw = g.W - g.M * 2
  const maxRows = Math.max(...columns.map((col) => col.items.length))
  if (maxRows === 0) failPlan('COMPARISON columns require at least one item each.')
  // TASK-086R1: coupled column layout — header wraps at a fitted size, items
  // start below the MEASURED header, background grows only when demanded.
  const headerBase = t(ctx, 'cardHeading').fontSizePt
  const set = layoutColumnSet({
    columns: columns.map((col) => ({
      headerText: col.name.trim(),
      itemCount: Math.min(col.items.length, 6),
    })),
    availW: gw,
    availH: g.H - top - g.M,
    gap: g.GUTTER,
    minColW: 120 * sx,
    headerInsetPt: 28 * sx,
    headerBaseFontPt: headerBase,
    headerMinFontPt: ROLE_MIN_FONT.cardHeading,
    headerTopPadPt: 12 * sy,
    minHeaderHPt: 44 * sy,
    headerPadPt: 6 * sy,
    headerGapPt: 8 * sy,
    itemRowHPt: 36 * sy,
    minBgHPt: 300 * sy,
  })
  let cx = g.M
  columns.forEach((col, i) => {
    if (!col.name?.trim()) failPlan(`columns[${i}].name is required.`)
    if (col.items.length === 0) failPlan(`columns[${i}].items must be non-empty.`)
    const colW = set.widths[i]
    const fit = set.columns[i]
    const x = cx
    cx += colW + g.GUTTER
    const ids: string[] = []
    const bgId = addShape(ctx, CARD.shapeType, x, top, colW, set.bgH, { fillHex: PALETTE.cardFill, prefix: `COLBG${i}` })
    ids.push(bgId)
    ids.push(
      addTextBox(ctx, col.name.trim(), x + 14 * sx, top + 12 * sy, colW - 28 * sx, fit.headerH, {
        fontSizePt: fit.headerFontPt,
        bold: true,
        colorHex: i === 0 ? PALETTE.accent : PALETTE.accent2,
        alignment: 'START',
      }, `COLH${i}`, false, { role: 'cardHeading', parentId: bgId })
    )
    col.items.slice(0, 6).forEach((item, j) => {
      // TASK-086: item boxes join the column group (previously orphaned).
      ids.push(
        addTextBox(ctx, `• ${item.trim()}`, x + 14 * sx, top + fit.itemTop + j * 36 * sy, colW - 28 * sx, 34 * sy, {
          ...t(ctx, 'body'),
          colorHex: PALETTE.ink,
          alignment: 'START',
        }, `COLI${i}_${j}`, false, { role: 'body', parentId: bgId })
      )
    })
    groupIds(ctx, ids)
  })
}

function renderTimelineRoadmap(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  const sx = g.page.sx
  const sy = g.page.sy
  titleBlock(ctx, c.title, c.subtitle)
  const stages = (c.stages ?? []).slice(0, 8)
  if (stages.length < 2) failPlan('TIMELINE_ROADMAP requires 2..8 stages.')
  const lineY = g.CONTENT_TOP + 170 * sy
  addLine(ctx, g.M + 20 * sx, lineY, g.W - g.M - 20 * sx, lineY, 'TLBASE')
  const n = stages.length
  const span = g.W - g.M * 2 - 40 * sx
  const pitch = n === 1 ? 0 : span / (n - 1)
  // TASK-086: label width derives from node pitch (never wider than 0.95×
  // pitch) so adjacent milestone labels cannot overlap; edges clamp inward.
  const labelW = Math.max(96 * sx, Math.min(200 * sx, pitch * 0.95))
  stages.forEach((s, i) => {
    if (!s.label?.trim()) failPlan(`stages[${i}].label is required.`)
    const x = g.M + 20 * sx + (n === 1 ? 0 : (i / (n - 1)) * span)
    const above = i % 2 === 0
    const ids: string[] = []
    const dot = 22 * Math.min(sx, sy)
    ids.push(addShape(ctx, 'ELLIPSE', x - dot / 2, lineY - dot / 2, dot, dot, { fillHex: PALETTE.accent, prefix: `DOT${i}` }))
    // TASK-086R1: coupled node layout — the description starts below the
    // MEASURED label height, so a wrapped heading (e.g. "Month 1:
    // Foundation") can never collide with its description. Above-nodes are
    // bottom-anchored to clear the node dot; below-nodes top-anchor.
    const maxBlockH = above
      ? lineY - 18 * sy - (g.CONTENT_TOP - 20 * sy)
      : g.H - g.M - (lineY + 30 * sy)
    const fit = layoutTimelineNode({
      label: s.label.trim(),
      description: s.description?.trim() ?? null,
      labelBaseFontPt: t(ctx, 'cardHeading').fontSizePt,
      labelMinFontPt: ROLE_MIN_FONT.cardHeading,
      descFontPt: t(ctx, 'caption').fontSizePt,
      labelWidthPt: labelW,
      minLabelHPt: 34 * sy,
      labelPadPt: 6 * sy,
      minGapPt: 6 * sy,
      maxBlockHPt: Math.max(maxBlockH, 40 * sy),
    })
    const labelY = above ? lineY - 18 * sy - fit.blockH : lineY + 30 * sy
    const lx = Math.max(g.M, Math.min(x - labelW / 2, g.W - g.M - labelW))
    ids.push(
      addTextBox(ctx, s.label.trim(), lx, labelY, labelW, fit.labelH, {
        fontSizePt: fit.labelFontPt,
        bold: true,
        colorHex: PALETTE.ink,
        alignment: 'CENTER',
      }, `TLL${i}`, false, { role: 'cardHeading' })
    )
    if (s.description?.trim()) {
      ids.push(
        addTextBox(ctx, s.description.trim(), lx, labelY + fit.descTop, labelW, Math.max(fit.blockH - fit.descTop, 10 * sy), {
          ...t(ctx, 'caption'),
          colorHex: PALETTE.muted,
          alignment: 'CENTER',
        }, `TLD${i}`, false, { role: 'caption' })
      )
    }
    groupIds(ctx, ids)
  })
}

function renderPillarsStrategy(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  const sx = g.page.sx
  const sy = g.page.sy
  titleBlock(ctx, c.title, c.subtitle)
  const columns: ColumnDatum[] = (c.columns ?? []).slice(0, 5).map((col) => ({
    name: col.name,
    items: (col.items ?? []).slice(0, 4),
  }))
  if (columns.length < 2) failPlan('PILLARS_STRATEGY requires 2..5 columns with items.')
  const top = g.CONTENT_TOP + 40 * sy
  const gw = g.W - g.M * 2
  // TASK-086R1: coupled layout shared with COMPARISON (pillars use a 22pt
  // header offset and 6pt header gap).
  const headerBase = t(ctx, 'cardHeading').fontSizePt
  const set = layoutColumnSet({
    columns: columns.map((col) => ({
      headerText: col.name.trim(),
      itemCount: col.items.length,
    })),
    availW: gw,
    availH: g.H - top - g.M,
    gap: g.GUTTER,
    minColW: 120 * sx,
    headerInsetPt: 28 * sx,
    headerBaseFontPt: headerBase,
    headerMinFontPt: ROLE_MIN_FONT.cardHeading,
    headerTopPadPt: 22 * sy,
    minHeaderHPt: 44 * sy,
    headerPadPt: 6 * sy,
    headerGapPt: 6 * sy,
    itemRowHPt: 36 * sy,
    minBgHPt: 300 * sy,
  })
  let cx = g.M
  columns.forEach((col, i) => {
    if (!col.name?.trim()) failPlan(`columns[${i}].name is required.`)
    if (col.items.length === 0) failPlan(`columns[${i}].items must be non-empty.`)
    const colW = set.widths[i]
    const fit = set.columns[i]
    const x = cx
    cx += colW + g.GUTTER
    const ids: string[] = []
    const bgId = addShape(ctx, CARD.shapeType, x, top, colW, set.bgH, { fillHex: PALETTE.cardFill, prefix: `PILBG${i}` })
    ids.push(bgId)
    ids.push(addShape(ctx, 'RECTANGLE', x, top, colW, 10 * sy, { fillHex: PALETTE.accent, prefix: `PILTOP${i}`, parentId: bgId }))
    ids.push(
      addTextBox(ctx, col.name.trim(), x + 14 * sx, top + 22 * sy, colW - 28 * sx, fit.headerH, {
        fontSizePt: fit.headerFontPt,
        bold: true,
        colorHex: PALETTE.ink,
        alignment: 'START',
      }, `PILH${i}`, false, { role: 'cardHeading', parentId: bgId })
    )
    col.items.forEach((item, j) => {
      // TASK-086: item boxes join the pillar group (previously orphaned).
      ids.push(
        addTextBox(ctx, `• ${item.trim()}`, x + 14 * sx, top + fit.itemTop + j * 36 * sy, colW - 28 * sx, 34 * sy, {
          ...t(ctx, 'body'),
          colorHex: PALETTE.ink,
          alignment: 'START',
        }, `PILI${i}_${j}`, false, { role: 'body', parentId: bgId })
      )
    })
    groupIds(ctx, ids)
  })
}

function renderClosingInsight(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  const sx = g.page.sx
  const sy = g.page.sy
  const statement = (c.closing ?? c.title).trim()
  if (!statement) failPlan('CLOSING_INSIGHT requires closing or title text.')
  // TASK-086: on native-title REUSE the title already displays in place —
  // a redundant kicker would collide with the reused region, so skip it.
  if (!ctx.reuseTitleId && c.closing && c.title.trim() && c.title.trim() !== c.closing.trim()) {
    addTextBox(ctx, c.title.trim(), g.M + 120 * sx, 96 * sy, g.W - g.M * 2 - 240 * sx, 40 * sy, {
      ...t(ctx, 'sectionHeading'),
      colorHex: PALETTE.muted,
      alignment: 'CENTER',
    }, 'CKICKER', true, { role: 'sectionHeading' })
  }
  addTextBox(ctx, statement, g.M + 40 * sx, 170 * sy, g.W - g.M * 2 - 80 * sx, 180 * sy, {
    ...t(ctx, 'deckTitle'),
    colorHex: PALETTE.ink,
    alignment: 'CENTER',
  }, 'THESIS', true, { role: 'deckTitle' })
  addShape(ctx, 'RECTANGLE', g.W / 2 - 32 * sx, 360 * sy, 64 * sx, ACCENT_BAR_W * sy, { fillHex: PALETTE.accent, prefix: 'CBAR' })
  if (c.subtitle) {
    addTextBox(ctx, c.subtitle, g.M + 120 * sx, 384 * sy, g.W - g.M * 2 - 240 * sx, 60 * sy, {
      ...t(ctx, 'body'),
      colorHex: PALETTE.muted,
      alignment: 'CENTER',
    }, 'CSUB', false, { role: 'body' })
  }
}

export type Renderer = (ctx: Ctx, content: SlideContent) => void

const RENDERERS: Record<Archetype, Renderer> = {
  COVER: renderCover,
  EXECUTIVE_SUMMARY: renderExecutiveSummary,
  KPI_DASHBOARD: renderKpiDashboard,
  PROCESS_FUNNEL: renderProcessFunnel,
  COMPARISON: renderComparison,
  TIMELINE_ROADMAP: renderTimelineRoadmap,
  PILLARS_STRATEGY: renderPillarsStrategy,
  CLOSING_INSIGHT: renderClosingInsight,
}

// ---------------------------------------------------------------------------
// Compose entry (pure request construction; MCP handler executes + readbacks)
// ---------------------------------------------------------------------------

export interface ComposeInput {
  pageObjectId: string
  archetype: Archetype
  title: string
  subtitle?: string
  bullets?: string[]
  metrics?: MetricDatum[]
  stages?: StageDatum[]
  columns?: ColumnDatum[]
  closing?: string
}

export function validateComposeInput(raw: Record<string, unknown>): {
  presentationId: string
  input: ComposeInput
} {
  const presentationId = typeof raw.presentationId === 'string' ? (raw.presentationId as string).trim() : ''
  if (!presentationId) failPlan('presentationId is required.')
  const pageObjectId = typeof raw.pageObjectId === 'string' ? (raw.pageObjectId as string).trim() : ''
  if (!pageObjectId) failPlan('pageObjectId is required.')
  const archetype = asArchetype(raw.archetype)
  const title = nonEmptyString(raw.title, 'title', 200)
  const readOptStr = (k: string, max: number): string | undefined => {
    if (raw[k] === undefined || raw[k] === null) return undefined
    return nonEmptyString(raw[k], k, max)
  }
  const readMetrics = (): MetricDatum[] | undefined => {
    if (raw.metrics === undefined) return undefined
    if (!Array.isArray(raw.metrics)) failPlan('metrics must be an array.')
    if (raw.metrics.length > 6) failPlan('metrics supports at most 6 entries.')
    return (raw.metrics as Array<Record<string, unknown>>).map((m, i) => {
      if (!m || typeof m !== 'object') failPlan(`metrics[${i}] must be an object.`)
      return {
        label: nonEmptyString(m.label, `metrics[${i}].label`, 120),
        value: nonEmptyString(m.value, `metrics[${i}].value`, 60),
        ...(m.note !== undefined ? { note: nonEmptyString(m.note, `metrics[${i}].note`, 200) } : {}),
      }
    })
  }
  const readStages = (): StageDatum[] | undefined => {
    if (raw.stages === undefined) return undefined
    if (!Array.isArray(raw.stages)) failPlan('stages must be an array.')
    if (raw.stages.length > 8) failPlan('stages supports at most 8 entries.')
    return (raw.stages as Array<Record<string, unknown>>).map((s, i) => {
      if (!s || typeof s !== 'object') failPlan(`stages[${i}] must be an object.`)
      return {
        label: nonEmptyString(s.label, `stages[${i}].label`, 160),
        ...(s.description !== undefined ? { description: nonEmptyString(s.description, `stages[${i}].description`, 300) } : {}),
      }
    })
  }
  const readColumns = (): ColumnDatum[] | undefined => {
    if (raw.columns === undefined) return undefined
    if (!Array.isArray(raw.columns)) failPlan('columns must be an array.')
    if (raw.columns.length > 5) failPlan('columns supports at most 5 entries.')
    return (raw.columns as Array<Record<string, unknown>>).map((c, i) => {
      if (!c || typeof c !== 'object') failPlan(`columns[${i}] must be an object.`)
      return {
        name: nonEmptyString(c.name, `columns[${i}].name`, 120),
        items: strArray(c.items, `columns[${i}].items`, 1, 6, 200),
      }
    })
  }
  const input: ComposeInput = {
    pageObjectId,
    archetype,
    title,
    ...(readOptStr('subtitle', 300) ? { subtitle: readOptStr('subtitle', 300) as string } : {}),
    ...(raw.bullets !== undefined ? { bullets: strArray(raw.bullets, 'bullets', 1, 8, 300) } : {}),
    ...(readMetrics() ? { metrics: readMetrics() as MetricDatum[] } : {}),
    ...(readStages() ? { stages: readStages() as StageDatum[] } : {}),
    ...(readColumns() ? { columns: readColumns() as ColumnDatum[] } : {}),
    ...(readOptStr('closing', 300) ? { closing: readOptStr('closing', 300) as string } : {}),
  }
  return { presentationId, input }
}

export interface PageComposeOptions {
  pageWidthPt?: number
  pageHeightPt?: number
  placeholders?: PlaceholderInfo[]
}

export type GeometryFinalStatus =
  | 'GEOMETRY_PROVEN'
  | 'GEOMETRY_PROVEN_AFTER_REFLOW'
  | 'GEOMETRY_FAILED'

export interface ComposedSlide {
  result: ComposeResult
  layout: PageLayout
  ownership: OwnershipDecision[]
  prewriteQa: GeometryFinding[]
  reflowAttempts: number
  reflowReasons: string[]
  finalStatus: GeometryFinalStatus
}

/** Minimum readable single-row funnel box width before switching to 2 rows. */
const MIN_FUNNEL_BOX_W = 150

function funnelBoxWidth(n: number, layout: PageLayout): number {
  const gw = layout.W - layout.M * 2
  return (gw - (n - 1) * 16 * layout.page.sx) / n
}

export function composeSlide(input: ComposeInput): ComposeResult {
  // v1 default path (blank-slide compatible): design canvas, no placeholders.
  return composeSlideOnPage(input, {}).result
}

export function composeSlideOnPage(input: ComposeInput, opts: PageComposeOptions): ComposedSlide {
  const page =
    opts.pageWidthPt !== undefined && opts.pageHeightPt !== undefined
      ? resolvePageGeometry(opts.pageWidthPt, opts.pageHeightPt)
      : resolvePageGeometry(DESIGN_CANVAS.w, DESIGN_CANVAS.h)
  const layout = layoutFor(page)
  const placeholders = opts.placeholders ?? []
  const content = slideContentOf(input)

  // Ownership first: TITLE reuses the first native title placeholder when it
  // fits (else CLEAR + custom title); orphan bodies CLEAR; everything else
  // PRESERVE. Custom bodies are always composed in v1 (reuseBody=false).
  const titlePh = placeholders.find((p) => isTitlePlaceholderType(p.type))
  let ownership = decideOwnership(placeholders, { reuseTitle: titlePh !== undefined, reuseBody: false })
  const nativeRects = (list: PlaceholderInfo[]): PlacedElement[] =>
    list.flatMap((p) =>
      p.rect !== undefined ? [{ id: `native:${p.objectId}`, kind: 'shape' as const, rect: p.rect }] : []
    )

  const MAX_ATTEMPTS = 3
  let fontMul = 1
  let funnelRows: 1 | 2 = 1
  const reflowReasons: string[] = []
  let attemptResult: ComposeResult | null = null
  let prewriteQa: GeometryFinding[] = []
  let attempts = 0

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    attempts = attempt + 1
    const ctx = newCtx(input.pageObjectId, layout)
    ctx.reflow = { fontMul, funnelRows }
    if (titlePh && ownership.find((d) => d.objectId === titlePh.objectId)?.decision === 'REUSE') {
      // Reuse only when the plan title fits the native box; otherwise fall
      // back to CLEAR + custom title (deterministic, documented).
      const style = t(ctx, 'slideTitle')
      const fit = titlePh.rect
        ? classifyTextFit(input.title, style.fontSizePt, titlePh.rect)
        : { fit: 'FIT' as const }
      if (fit.fit === 'OVERFLOW' || fit.fit === 'OVERFLOW_RISK') {
        ownership = ownership.map((d) =>
          d.objectId === titlePh.objectId
            ? { ...d, decision: 'CLEAR' as const, reason: `title does not fit native box (${fit.fit}); cleared for custom composition` }
            : d
        )
      } else {
        ctx.reuseTitleId = titlePh.objectId
        if (titlePh.rect) ctx.reuseTitleRect = titlePh.rect
        ctx.hierarchy.push({ role: 'slideTitle', fontPt: style.fontSizePt, id: `native:${titlePh.objectId}` })
      }
    }
    RENDERERS[input.archetype](ctx, content)
    const nativeKept = nativeRects(
      placeholders.filter((p) => {
        const dec = ownership.find((d) => d.objectId === p.objectId)?.decision
        return dec === 'PRESERVE' || dec === 'REUSE'
      })
    )
    const elements = [...ctx.placed, ...nativeKept]
    prewriteQa = [
      ...runPrewriteQa({
        page,
        elements,
        placeholders,
        ownership,
        hierarchy: ctx.hierarchy,
      }),
      ...checkNativeCollisions(ctx.placed, nativeKept),
      ...checkNumericIntegrity(content, ctx.texts),
    ]
    attemptResult = finish(ctx, input.archetype)
    attemptResult.placed = ctx.placed
    const blockers = new Set(
      prewriteQa.filter((f) => !f.pass && f.severity === 'BLOCKING').map((f) => f.check)
    )
    if (blockers.size === 0) break
    // Bounded reflow, targeted by finding kind:
    // - MINIMUM_FONT can never be fixed by shrinking (shrinking worsens it).
    // - funnel narrowness is structural (switch to 2 rows once).
    // - only TEXT_CONTAINER_OVERFLOW responds to font shrink (demand < box);
    //   box-vs-box collisions, bounds and containment never do.
    const stages = input.stages ?? []
    if (input.archetype === 'PROCESS_FUNNEL' && funnelRows === 1 && stages.length > 2 && funnelBoxWidth(stages.length, layout) < MIN_FUNNEL_BOX_W) {
      funnelRows = 2
      reflowReasons.push(`funnel ${stages.length} stages too narrow single-row; switched to 2 rows`)
      continue
    }
    if (blockers.has('MINIMUM_FONT')) break
    if ([...blockers].some((c) => c === 'TEXT_CONTAINER_OVERFLOW') && fontMul > 0.7) {
      fontMul = Math.round(fontMul * 0.9 * 100) / 100
      reflowReasons.push(`blocking text overflow; font scale reduced to ${fontMul}`)
      continue
    }
    break
  }

  const result = attemptResult ?? finish(newCtx(input.pageObjectId, layout), input.archetype)
  // TASK-086R1: CLEAR execution lives with the decision — deletions ride in
  // the first chunk so no consumer of this result can drop them.
  const clearIds = ownership.filter((d) => d.decision === 'CLEAR').map((d) => d.objectId)
  result.requests.unshift(...clearIds.map((id) => buildDeleteObject(id)))
  const blocked = hasBlocking(prewriteQa)
  return {
    result,
    layout,
    ownership,
    prewriteQa,
    reflowAttempts: attempts,
    reflowReasons,
    finalStatus: blocked ? 'GEOMETRY_FAILED' : reflowReasons.length > 0 ? 'GEOMETRY_PROVEN_AFTER_REFLOW' : 'GEOMETRY_PROVEN',
  }
}

/** TASK-086 Phase 19: reflow/geometry must never fabricate numeric facts. */
function checkNumericIntegrity(content: SlideContent, inserted: string[]): GeometryFinding[] {
  const fabricated = findFabricatedNumbers(expectedTextsOf(content), inserted)
  if (fabricated.length > 0) {
    return [{ check: 'NUMERIC_INTEGRITY', severity: 'BLOCKING', pass: false, detail: `fabricated: ${fabricated.slice(0, 5).join(', ')}` }]
  }
  return [{ check: 'NUMERIC_INTEGRITY', severity: 'INFO', pass: true }]
}

/** Custom composition must not cover preserved/reused native rects. */
function checkNativeCollisions(custom: PlacedElement[], native: PlacedElement[]): GeometryFinding[] {
  const hits: string[] = []
  for (const el of custom) {
    if (el.kind === 'background' || el.kind === 'line') continue
    for (const n of native) {
      if (el.id === n.id) continue
      // The reused title's own region is owned natively; subtitle/accent
      // placement is checked against it like any preserved rect.
      if (rectsOverlap(el.rect, n.rect)) hits.push(`${el.id}×${n.id}`)
    }
  }
  if (hits.length > 0) {
    return [{ check: 'PLACEHOLDER_COLLISION', severity: 'BLOCKING', pass: false, detail: hits.slice(0, 5).join(' | ') }]
  }
  return [{ check: 'PLACEHOLDER_COLLISION', severity: 'INFO', pass: true }]
}

// ---------------------------------------------------------------------------
// Structural QA (machine-verifiable; taste is human-gated)
// ---------------------------------------------------------------------------

export interface QaFinding {
  check: string
  pass: boolean
  detail?: string
}

export function qaComposedSlide(
  plan: { archetype: Archetype; content: SlideContent },
  result: ComposeResult
): QaFinding[] {
  const findings: QaFinding[] = []
  const push = (check: string, pass: boolean, detail?: string): void => {
    findings.push(detail ? { check, pass, detail } : { check, pass })
  }
  const expectedTexts = expectedTextsOf(plan.content)
  // Collect insertText payloads only (never raw JSON — keys like "text" would
  // false-positive single-character content).
  const inserted: string[] = []
  for (const r of result.requests) {
    const key = Object.keys(r)[0]
    const body = (r[key] ?? {}) as Record<string, unknown>
    if (typeof body.text === 'string') inserted.push(body.text)
  }
  const joined = inserted.join('\n')
  const missing = expectedTexts.filter((t) => !joined.includes(t))
  push('content-preserved', missing.length === 0, missing.length > 0 ? `missing: ${missing.slice(0, 3).join(' | ')}` : undefined)
  // No-duplication: no expected text may be inserted verbatim more than once.
  // Renderers decorate (bullets get "• "), so compare stripped exact payloads.
  const stripped = inserted.map((s) => s.replace(/^•\s+/, ''))
  const dupes = expectedTexts.filter((t) => stripped.filter((s) => s === t).length > 1)
  push('no-duplicated-content', dupes.length === 0, dupes.length > 0 ? `duplicated: ${dupes.slice(0, 3).join(' | ')}` : undefined)
  push('has-elements', result.expected.elementCount > 0)
  push('groups-reported', true, `groups=${result.expected.groups}`)
  // Bounds: every created element's box must sit inside 960x540.
  const violations: string[] = []
  for (const r of result.requests) {
    const key = Object.keys(r)[0]
    const body = (r[key] ?? {}) as Record<string, unknown>
    const props = (body.elementProperties ?? {}) as Record<string, unknown>
    const size = (props.size ?? {}) as Record<string, Record<string, number>>
    const tr = (props.transform ?? {}) as Record<string, number>
    if (typeof size.width?.magnitude !== 'number' || typeof size.height?.magnitude !== 'number') continue
    const x = (tr.translateX ?? 0) / 12700
    const y = (tr.translateY ?? 0) / 12700
    const w = size.width.magnitude / 12700
    const h = size.height.magnitude / 12700
    // Lines use bounding boxes; allow 1pt clamp slack on any side.
    if (x < -1 || y < -1 || x + w > CANVAS.width + 1 || y + h > CANVAS.height + 1) {
      violations.push(`${key}@(${x.toFixed(0)},${y.toFixed(0)},${w.toFixed(0)},${h.toFixed(0)})`)
    }
  }
  push('in-bounds', violations.length === 0, violations.length > 0 ? violations.slice(0, 3).join(' | ') : undefined)
  return findings
}

/** Split requests into sequential ≤25-op chunks (atomicity per chunk). */
export function chunkRequests(requests: import('./visual').GoogleRequest[], maxPerChunk = 25): import('./visual').GoogleRequest[][] {
  const chunks: import('./visual').GoogleRequest[][] = []
  for (let i = 0; i < requests.length; i += maxPerChunk) {
    chunks.push(requests.slice(i, i + maxPerChunk))
  }
  return chunks
}
