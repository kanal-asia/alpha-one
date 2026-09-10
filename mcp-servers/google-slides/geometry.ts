/**
 * TASK-086: responsive slide-geometry + composition-QA foundation (PURE — no
 * imports, no I/O) so every check is deterministic and unit-testable in any
 * runtime (browser vitest included).
 *
 * Pipeline position:
 *   PAGE INSPECTION (live pageSize + placeholders, see visual.fetchPageSnapshot)
 *   → resolvePageGeometry → layoutFor → renderers (design-space × scale)
 *   → pre-write QA (runPrewriteQa) → bounded reflow → COMPOSITION
 *   → authoritative readback → qaReadback → FINAL QA (fail-closed).
 *
 * Core principle: layout proportions derive from ACTUAL page dimensions.
 * The v1 design system was authored on a 960×540 design canvas; layoutFor()
 * reproduces those exact constants on 960×540 and scales them elsewhere.
 */

export const DESIGN_CANVAS = { w: 960, h: 540 } as const
/** 1 PT = 12700 EMU (mirrors visual.ts EMU_PER_PT; duplicated as literal so
 *  this module stays dependency-free). */
export const EMU_PER_PT = 12700

export type PageAspect = '16:9' | '4:3' | 'custom'

export interface PageGeometry {
  w: number
  h: number
  aspect: PageAspect
  /** Horizontal scale vs the 960-wide design canvas. */
  sx: number
  /** Vertical scale vs the 540-high design canvas. */
  sy: number
  /** Uniform scale applied to typography (bounded to stay readable). */
  fontScale: number
}

function failGeometry(detail: string): never {
  throw new Error(`Slide geometry: ${detail}`)
}

/** Derive page-relative geometry from authoritative page size in PT. */
export function resolvePageGeometry(pageWidthPt: number, pageHeightPt: number): PageGeometry {
  if (!Number.isFinite(pageWidthPt) || !Number.isFinite(pageHeightPt)) {
    failGeometry('page dimensions must be finite numbers.')
  }
  if (pageWidthPt <= 0 || pageHeightPt <= 0) {
    failGeometry('page dimensions must be positive.')
  }
  const ratio = pageWidthPt / pageHeightPt
  const aspect: PageAspect =
    Math.abs(ratio - 16 / 9) < 0.02 ? '16:9' : Math.abs(ratio - 4 / 3) < 0.02 ? '4:3' : 'custom'
  const sx = pageWidthPt / DESIGN_CANVAS.w
  const sy = pageHeightPt / DESIGN_CANVAS.h
  // Uniform type scale tracks the smaller axis so text never outgrows the
  // tighter dimension; clamped to keep roles readable on exotic pages.
  const fontScale = Math.max(0.5, Math.min(2, Math.min(sx, sy)))
  return { w: pageWidthPt, h: pageHeightPt, aspect, sx, sy, fontScale }
}

export interface SafeArea {
  x: number
  y: number
  w: number
  h: number
  mx: number
  myTop: number
  myBottom: number
}

/**
 * Page-relative safe area. Divisions (not decimal fractions) reproduce the v1
 * constants bit-for-bit on the 960×540 design canvas (mx=48, myTop=30,
 * myBottom=48) while scaling proportionally everywhere else.
 */
export function safeAreaOf(g: PageGeometry): SafeArea {
  const mx = g.w / 20
  const myTop = g.h / 18
  const myBottom = (g.h * 4) / 45
  return { x: mx, y: myTop, w: g.w - 2 * mx, h: g.h - myTop - myBottom, mx, myTop, myBottom }
}

export interface ZoneRect {
  x: number
  y: number
  w: number
  h: number
}

export interface SemanticZones {
  header: ZoneRect
  content: ZoneRect
  footer: ZoneRect
}

/** Layout zones are constraints, not mandatory visible boxes. */
export function zonesOf(g: PageGeometry, safe: SafeArea): SemanticZones {
  const headerH = 0.21 * g.h
  const footerH = 0.1 * g.h
  return {
    header: { x: safe.x, y: safe.y, w: safe.w, h: headerH },
    content: { x: safe.x, y: safe.y + headerH, w: safe.w, h: safe.h - headerH - footerH },
    footer: { x: safe.x, y: safe.y + safe.h - footerH, w: safe.w, h: footerH },
  }
}

/**
 * Renderer-facing layout: every value the v1 renderers need, derived from
 * the actual page. On 960×540 this reproduces CANVAS/MARGIN/TITLE_BAND/
 * CONTENT_TOP/CARD_GUTTER bit-for-bit (modulo float rounding).
 */
export interface PageLayout {
  page: PageGeometry
  safe: SafeArea
  zones: SemanticZones
  W: number
  H: number
  /** Horizontal margin (v1 MARGIN). */
  M: number
  /** Card/column gutter (v1 CARD_GUTTER, floored for tiny pages). */
  GUTTER: number
  TITLE: { x: number; y: number; w: number; h: number }
  CONTENT_TOP: number
  fontScale: number
}

export function layoutFor(g: PageGeometry): PageLayout {
  const safe = safeAreaOf(g)
  const titleH = 84 * g.sy
  return {
    page: g,
    safe,
    zones: zonesOf(g, safe),
    W: g.w,
    H: g.h,
    M: safe.mx,
    GUTTER: Math.max(12, 24 * g.sx),
    TITLE: { x: safe.mx, y: safe.myTop, w: safe.w, h: titleH },
    CONTENT_TOP: safe.myTop + titleH + 36 * g.sy,
    fontScale: g.fontScale,
  }
}

/** Default v1 layout (blank-slide / geometry-unknown path). */
export function defaultLayout(): PageLayout {
  return layoutFor(resolvePageGeometry(DESIGN_CANVAS.w, DESIGN_CANVAS.h))
}

// ---------------------------------------------------------------------------
// Typography roles + hierarchy
// ---------------------------------------------------------------------------

export type TextRole =
  | 'deckTitle'
  | 'slideTitle'
  | 'sectionHeading'
  | 'cardHeading'
  | 'kpiValue'
  | 'body'
  | 'caption'

/** Lower rank = higher visual hierarchy. */
export const ROLE_RANK: Record<TextRole, number> = {
  deckTitle: 0,
  slideTitle: 1,
  kpiValue: 1,
  sectionHeading: 2,
  cardHeading: 2,
  body: 3,
  caption: 4,
}

/** Authored v1 sizes (TYPE.*) by role. */
export const ROLE_BASE_FONT: Record<TextRole, number> = {
  deckTitle: 44,
  slideTitle: 32,
  sectionHeading: 20,
  cardHeading: 20,
  kpiValue: 40,
  body: 14,
  caption: 11,
}

/** Minimum readable sizes — shrinking below these is a BLOCKING finding. */
export const ROLE_MIN_FONT: Record<TextRole, number> = {
  deckTitle: 28,
  slideTitle: 20,
  sectionHeading: 14,
  cardHeading: 12,
  kpiValue: 18,
  body: 10,
  caption: 8,
}

/** Effective size for a role at a layout's font scale (rounded to 0.5pt). */
export function roleFontPt(role: TextRole, fontScale: number): number {
  return Math.round(ROLE_BASE_FONT[role] * fontScale * 2) / 2
}

// ---------------------------------------------------------------------------
// Text-fit estimation (deterministic, conservative)
// ---------------------------------------------------------------------------

export type FitClass = 'FIT' | 'TIGHT' | 'OVERFLOW_RISK' | 'OVERFLOW'

const AVG_CHAR_WIDTH_RATIO = 0.52
const LINE_HEIGHT_RATIO = 1.25

/** Greedy word-wrap line count; explicit newlines force breaks. */
export function estimateLines(text: string, fontPt: number, boxWidthPt: number): number {
  if (!text || boxWidthPt <= 0 || fontPt <= 0) return 0
  const charW = AVG_CHAR_WIDTH_RATIO * fontPt
  // Google breaks lines at spaces AND at '/' and '-' boundaries. Model those
  // secondary opportunities so the estimator matches rendered wrapping
  // (e.g. '(Facebook/Instagram)' may break after the slash).
  const paragraphs = text.split('\n')
  let lines = 0
  for (const para of paragraphs) {
    const chunks = para.split(/(\s+|\/|-)/).filter((s) => s !== '')
    if (chunks.length === 0) {
      lines += 1
      continue
    }
    let lineW = 0
    let paraLines = 1
    let prev: string | null = null
    for (const chunk of chunks) {
      if (/^\s+$/.test(chunk)) continue
      const wordW = Math.max(chunk.length, 1) * charW
      // Any unsplittable run (no space//- break inside) wider than the box
      // guarantees a mid-word split, even inside a larger splittable chunk.
      const pieces = chunk.split(/[\s/-]+/).filter((s) => s !== '')
      if (pieces.some((piece) => Math.max(piece.length, 1) * charW > boxWidthPt)) {
        return Number.POSITIVE_INFINITY
      }
      // No inter-word space after a separator break (break attaches to it).
      const add = (prev === null || /[/-]$/.test(prev) ? 0 : charW) + wordW
      if (lineW + add <= boxWidthPt) {
        lineW += add
      } else {
        paraLines += 1
        lineW = wordW
      }
      prev = chunk
    }
    lines += paraLines
  }
  return lines
}

export interface TextDemand {
  lines: number
  demandHeightPt: number
  /** True when a single word cannot fit the box width (mid-word split risk). */
  pathologicalWrap: boolean
}

export function textDemandPt(text: string, fontPt: number, boxWidthPt: number): TextDemand {
  const lines = estimateLines(text, fontPt, boxWidthPt)
  if (!Number.isFinite(lines)) {
    return { lines: Number.POSITIVE_INFINITY, demandHeightPt: Number.POSITIVE_INFINITY, pathologicalWrap: true }
  }
  return { lines, demandHeightPt: lines * fontPt * LINE_HEIGHT_RATIO, pathologicalWrap: false }
}

export interface FitVerdict {
  fit: FitClass
  lines: number
  demandHeightPt: number
}

export function classifyTextFit(
  text: string,
  fontPt: number,
  box: { w: number; h: number }
): FitVerdict {
  const demand = textDemandPt(text, fontPt, box.w)
  if (demand.pathologicalWrap || demand.demandHeightPt > box.h + 1) {
    return { fit: 'OVERFLOW', lines: demand.lines, demandHeightPt: demand.demandHeightPt }
  }
  if (demand.demandHeightPt > box.h * 0.85) {
    return { fit: 'OVERFLOW_RISK', lines: demand.lines, demandHeightPt: demand.demandHeightPt }
  }
  if (demand.demandHeightPt > box.h * 0.7) {
    return { fit: 'TIGHT', lines: demand.lines, demandHeightPt: demand.demandHeightPt }
  }
  return { fit: 'FIT', lines: demand.lines, demandHeightPt: demand.demandHeightPt }
}

// ---------------------------------------------------------------------------
// Rects + collision
// ---------------------------------------------------------------------------

export interface PtRect {
  x: number
  y: number
  w: number
  h: number
}

/** Overlap with 1pt tolerance (touching edges are not collisions). */
export function rectsOverlap(a: PtRect, b: PtRect, tol = 1): boolean {
  return (
    a.x + tol < b.x + b.w && b.x + tol < a.x + a.w && a.y + tol < b.y + b.h && b.y + tol < a.y + a.h
  )
}

export function rectContains(outer: PtRect, inner: PtRect, tol = 1): boolean {
  return (
    inner.x + tol >= outer.x &&
    inner.y + tol >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w + tol &&
    inner.y + inner.h <= outer.y + outer.h + tol
  )
}

export type ElementKind = 'text' | 'shape' | 'line' | 'background'

export interface PlacedElement {
  id: string
  kind: ElementKind
  rect: PtRect
  text?: string
  fontPt?: number
  role?: TextRole
  /** Id of the parent container (card bg) — parent/child never collide. */
  parentId?: string | null
}

export type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKING'

export interface GeometryFinding {
  check: string
  severity: Severity
  pass: boolean
  detail?: string
}

function finding(check: string, pass: boolean, severity: Severity, detail?: string): GeometryFinding {
  return detail ? { check, severity, pass, detail } : { check, severity, pass }
}

export function hasBlocking(findings: GeometryFinding[]): boolean {
  return findings.some((f) => !f.pass && f.severity === 'BLOCKING')
}

/** Hierarchy: present roles must strictly decrease in size along rank order.
 *  Entries sharing a rank (e.g. slideTitle + kpiValue, both focal) are exempt
 *  from pairwise comparison. */
export function checkHierarchy(entries: Array<{ role: TextRole; fontPt: number; id: string }>): GeometryFinding {
  const sorted = [...entries].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role])
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    if (ROLE_RANK[sorted[i].role] === ROLE_RANK[sorted[i + 1].role]) continue
    if (sorted[i].fontPt <= sorted[i + 1].fontPt) {
      return finding(
        'TYPOGRAPHIC_HIERARCHY',
        false,
        'ERROR',
        `${sorted[i].role}@${sorted[i].fontPt}pt not above ${sorted[i + 1].role}@${sorted[i + 1].fontPt}pt (${sorted[i + 1].id}).`
      )
    }
  }
  return finding('TYPOGRAPHIC_HIERARCHY', true, 'INFO')
}

/** Minimum-font floor per role (unreadable shrink is BLOCKING). */
export function checkMinimumFonts(entries: Array<{ role: TextRole; fontPt: number; id: string }>): GeometryFinding {
  const bad = entries.filter((e) => e.fontPt < ROLE_MIN_FONT[e.role])
  if (bad.length > 0) {
    return finding(
      'MINIMUM_FONT',
      false,
      'BLOCKING',
      bad.slice(0, 3).map((e) => `${e.role}@${e.fontPt}pt<min${ROLE_MIN_FONT[e.role]} (${e.id})`).join(' | ')
    )
  }
  return finding('MINIMUM_FONT', true, 'INFO')
}

/**
 * Collision QA with layer intent:
 * - background/line kinds never offend (decoration, connectors, baselines);
 * - parent/child pairs never collide (text inside its card);
 * - text/text overlap → TEXT_TEXT_COLLISION (BLOCKING);
 * - text/shape (non-parent) overlap → ELEMENT_ELEMENT_COLLISION (ERROR);
 * - shape/shape overlap → ELEMENT_ELEMENT_COLLISION (ERROR; touching is fine).
 */
export function checkCollisions(elements: PlacedElement[]): GeometryFinding[] {
  const textCollisions: string[] = []
  const elementCollisions: string[] = []
  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      const a = elements[i]
      const b = elements[j]
      if (a.kind === 'background' || b.kind === 'background') continue
      if (a.kind === 'line' || b.kind === 'line') continue
      if (a.parentId === b.id || b.parentId === a.id) continue
      if (!rectsOverlap(a.rect, b.rect)) continue
      const label = `${a.id}×${b.id}`
      if (a.kind === 'text' && b.kind === 'text') textCollisions.push(label)
      else elementCollisions.push(label)
    }
  }
  return [
    finding(
      'TEXT_COLLISION',
      textCollisions.length === 0,
      'BLOCKING',
      textCollisions.length > 0 ? textCollisions.slice(0, 5).join(' | ') : undefined
    ),
    finding(
      'ELEMENT_COLLISION',
      elementCollisions.length === 0,
      'ERROR',
      elementCollisions.length > 0 ? elementCollisions.slice(0, 5).join(' | ') : undefined
    ),
  ]
}

/** Every text box must fit its inner rectangle (container minus padding). */
export function checkTextContainment(
  elements: PlacedElement[],
  paddingPt = 0
): GeometryFinding {
  const bad: string[] = []
  for (const el of elements) {
    if (el.kind !== 'text' || el.text === undefined || el.fontPt === undefined) continue
    const inner = {
      w: el.rect.w - paddingPt * 2,
      h: el.rect.h - paddingPt * 2,
    }
    if (inner.w <= 0 || inner.h <= 0) {
      bad.push(`${el.id}: box too small for padding`)
      continue
    }
    const verdict = classifyTextFit(el.text, el.fontPt, inner)
    if (verdict.fit === 'OVERFLOW') {
      bad.push(`${el.id}: ${verdict.fit} lines=${verdict.lines} demand=${verdict.demandHeightPt.toFixed(0)}pt>box${inner.h.toFixed(0)}pt`)
    }
  }
  if (bad.length > 0) {
    return finding('TEXT_CONTAINER_OVERFLOW', false, 'BLOCKING', bad.slice(0, 5).join(' | '))
  }
  const risky = elements.filter((el) => {
    if (el.kind !== 'text' || el.text === undefined || el.fontPt === undefined) return false
    return classifyTextFit(el.text, el.fontPt, { w: el.rect.w, h: el.rect.h }).fit === 'OVERFLOW_RISK'
  })
  if (risky.length > 0) {
    return finding(
      'TEXT_CONTAINER_OVERFLOW',
      true,
      'WARNING',
      `tight: ${risky.slice(0, 5).map((e) => e.id).join(', ')}`
    )
  }
  return finding('TEXT_CONTAINER_OVERFLOW', true, 'INFO')
}

/** Child boxes (card texts) must sit inside their parent container. */
export function checkParentContainment(elements: PlacedElement[]): GeometryFinding {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const bad: string[] = []
  for (const el of elements) {
    if (!el.parentId) continue
    const parent = byId.get(el.parentId)
    if (!parent) {
      bad.push(`${el.id}: missing parent ${el.parentId}`)
      continue
    }
    if (!rectContains(parent.rect, el.rect)) bad.push(`${el.id} escapes parent ${el.parentId}`)
  }
  if (bad.length > 0) {
    return finding('PARENT_CONTAINMENT', false, 'BLOCKING', bad.slice(0, 5).join(' | '))
  }
  return finding('PARENT_CONTAINMENT', true, 'INFO')
}

/** Elements must sit inside the page; content must respect the safe area. */
export function checkBounds(
  elements: PlacedElement[],
  page: PageGeometry,
  safe: SafeArea
): GeometryFinding[] {
  const pageBad = elements
    .filter((e) => e.kind !== 'background')
    .filter(
      (e) =>
        e.rect.x < -1 ||
        e.rect.y < -1 ||
        e.rect.x + e.rect.w > page.w + 1 ||
        e.rect.y + e.rect.h > page.h + 1
    )
    .map((e) => e.id)
  const safeBad = elements
    .filter((e) => e.kind === 'text' || e.kind === 'shape')
    .filter((e) => !rectContains({ x: safe.x, y: safe.y, w: safe.w, h: safe.h }, e.rect))
    .map((e) => e.id)
  return [
    finding(
      'PAGE_BOUNDS',
      pageBad.length === 0,
      'BLOCKING',
      pageBad.length > 0 ? pageBad.slice(0, 5).join(', ') : undefined
    ),
    finding(
      'SAFE_AREA',
      safeBad.length === 0,
      safeBad.length > 0 ? 'ERROR' : 'INFO',
      safeBad.length > 0 ? safeBad.slice(0, 5).join(', ') : undefined
    ),
  ]
}

// ---------------------------------------------------------------------------
// Placeholder inventory + ownership
// ---------------------------------------------------------------------------

export interface PlaceholderInfo {
  objectId: string
  /** Raw Google placeholder type (TITLE, BODY, CENTER_TITLE, FOOTER, ...). */
  type: string
  index?: number
  /** Current text content ('' when empty). Page-instance text only. */
  text: string
  /** Authoritative page rect in PT when the snapshot provided one. */
  rect?: PtRect
}

const ORPHAN_PROMPT_RE = /click to add|click to edit|add (a |your )?(title|text|subtitle)/i

/** Empty or default template-prompt text counts as unused. */
export function isOrphanPlaceholderText(text: string): boolean {
  const t = (text ?? '').trim()
  return t === '' || ORPHAN_PROMPT_RE.test(t)
}

function isTitleType(type: string): boolean {
  return /^(TITLE|CENTER_TITLE)$/i.test((type ?? '').trim())
}

function isBodyType(type: string): boolean {
  return /^(BODY|SUBTITLE)$/i.test((type ?? '').trim())
}

/** Public predicates for composer ownership policy. */
export function isTitlePlaceholderType(type: string): boolean {
  return isTitleType(type)
}

export function isBodyPlaceholderType(type: string): boolean {
  return isBodyType(type)
}

export type Ownership = 'REUSE' | 'CLEAR' | 'PRESERVE'

export interface OwnershipDecision {
  objectId: string
  type: string
  decision: Ownership
  reason: string
}

/**
 * Explicit ownership for every inventoried placeholder.
 * - TITLE → REUSE when the plan reuses it, else CLEAR when unused, else PRESERVE.
 * - BODY → REUSE when the plan reuses it, else CLEAR when unused, else PRESERVE.
 * - Anything else (FOOTER, SLIDE_NUMBER, DATE, HEADER, PICTURE, ...) → PRESERVE:
 *   never classify unknown template elements as disposable without evidence.
 * - singleTitleReuse (default true): only the FIRST title placeholder may
 *   REUSE — renderers own exactly one title box, so additional REUSE decisions
 *   could never execute. Later orphan titles CLEAR; content titles PRESERVE.
 * CLEAR targets page-instance placeholders only (layout/master infrastructure
 * is never page content, so it can never appear in this inventory).
 */
export function decideOwnership(
  placeholders: PlaceholderInfo[],
  opts: { reuseTitle: boolean; reuseBody: boolean; singleTitleReuse?: boolean }
): OwnershipDecision[] {
  const single = opts.singleTitleReuse ?? true
  let titleReused = false
  return placeholders.map((p) => {
    if (isTitleType(p.type)) {
      if (opts.reuseTitle && (!single || !titleReused)) {
        titleReused = true
        return { objectId: p.objectId, type: p.type, decision: 'REUSE', reason: 'plan writes the slide title into the native placeholder' }
      }
      if (isOrphanPlaceholderText(p.text)) return { objectId: p.objectId, type: p.type, decision: 'CLEAR', reason: 'unused title placeholder would render as orphan template text' }
      return { objectId: p.objectId, type: p.type, decision: 'PRESERVE', reason: 'title placeholder carries real content the plan does not own' }
    }
    if (isBodyType(p.type)) {
      if (opts.reuseBody) return { objectId: p.objectId, type: p.type, decision: 'REUSE', reason: 'plan writes body content into the native placeholder' }
      if (isOrphanPlaceholderText(p.text)) return { objectId: p.objectId, type: p.type, decision: 'CLEAR', reason: 'unused body placeholder would render as orphan template text' }
      return { objectId: p.objectId, type: p.type, decision: 'PRESERVE', reason: 'body placeholder carries real content the plan does not own' }
    }
    return { objectId: p.objectId, type: p.type, decision: 'PRESERVE', reason: 'non-title/body template element retained by default' }
  })
}

export function placeholderOwnershipQa(decisions: OwnershipDecision[]): GeometryFinding {
  // Every placeholder has an explicit decision by construction; execution of
  // CLEAR/REUSE is verified at readback (READBACK_CLEARED_GONE / content).
  return finding('PLACEHOLDER_OWNERSHIP', true, 'INFO', `decisions=${decisions.length}`)
}

/**
 * Structural completeness: every inventoried placeholder must carry exactly
 * one decision. No implicit/unclassified placeholder may reach composition.
 */
export function checkOwnershipCompleteness(
  placeholders: PlaceholderInfo[],
  decisions: OwnershipDecision[]
): GeometryFinding {
  const decided = new Set(decisions.map((d) => d.objectId))
  const missing = placeholders.map((p) => p.objectId).filter((id) => !decided.has(id))
  if (missing.length > 0) {
    return finding('OWNERSHIP_COMPLETENESS', false, 'BLOCKING', `undecided: ${missing.slice(0, 5).join(', ')}`)
  }
  return finding('OWNERSHIP_COMPLETENESS', true, 'INFO', `classified=${decisions.length}`)
}

// ---------------------------------------------------------------------------
// Pre-write QA aggregation
// ---------------------------------------------------------------------------

export interface PrewriteQaInput {
  page: PageGeometry
  elements: PlacedElement[]
  placeholders: PlaceholderInfo[]
  ownership: OwnershipDecision[]
  hierarchy: Array<{ role: TextRole; fontPt: number; id: string }>
}

export function runPrewriteQa(input: PrewriteQaInput): GeometryFinding[] {
  const safe = safeAreaOf(input.page)
  const findings: GeometryFinding[] = []
  findings.push(finding('PAGE_ASPECT_RATIO', true, 'INFO', `${input.page.aspect} ${input.page.w}x${input.page.h}`))
  findings.push(...checkBounds(input.elements, input.page, safe))
  findings.push(checkOwnershipCompleteness(input.placeholders, input.ownership))
  findings.push(placeholderOwnershipQa(input.ownership))
  findings.push(checkTextContainment(input.elements))
  findings.push(...checkCollisions(input.elements))
  findings.push(checkParentContainment(input.elements))
  findings.push(checkHierarchy(input.hierarchy))
  findings.push(checkMinimumFonts(input.hierarchy))
  return findings
}

// ---------------------------------------------------------------------------
// Post-write authoritative readback QA
// ---------------------------------------------------------------------------

export interface ReadbackElement {
  objectId: string
  rectPt?: { x: number; y: number; w: number; h: number } | null
  text?: string
  placeholderType?: string
}

export interface ReadbackQaInput {
  page: PageGeometry
  expectedTexts: string[]
  expectedIds: string[]
  clearedIds: string[]
  elements: ReadbackElement[]
  ownership: OwnershipDecision[]
}

export function qaReadback(input: ReadbackQaInput): GeometryFinding[] {
  const findings: GeometryFinding[] = []
  const byId = new Map(input.elements.map((e) => [e.objectId, e]))
  const missing = input.expectedIds.filter((id) => !byId.has(id))
  findings.push(
    finding(
      'READBACK_OBJECTS_PRESENT',
      missing.length === 0,
      'BLOCKING',
      missing.length > 0 ? `missing: ${missing.slice(0, 5).join(', ')}` : `objects=${input.expectedIds.length}`
    )
  )
  const joined = input.elements.map((e) => e.text ?? '').join('\n')
  const missingText = input.expectedTexts.filter((t) => !joined.includes(t))
  findings.push(
    finding(
      'READBACK_CONTENT_PRESENT',
      missingText.length === 0,
      'ERROR',
      missingText.length > 0 ? `missing: ${missingText.slice(0, 3).join(' | ')}` : undefined
    )
  )
  // Cleared placeholders must be gone; REUSEd ones must carry content.
  const clearedGone = input.clearedIds.filter((id) => byId.has(id))
  findings.push(
    finding(
      'READBACK_CLEARED_GONE',
      clearedGone.length === 0,
      'BLOCKING',
      clearedGone.length > 0 ? `still present: ${clearedGone.slice(0, 5).join(', ')}` : undefined
    )
  )
  // Orphan native placeholders must not remain visible.
  const orphans = input.elements.filter(
    (e) =>
      (isTitleType(e.placeholderType ?? '') || isBodyType(e.placeholderType ?? '')) &&
      isOrphanPlaceholderText(e.text ?? '')
  )
  findings.push(
    finding(
      'READBACK_NO_ORPHAN_PLACEHOLDERS',
      orphans.length === 0,
      'BLOCKING',
      orphans.length > 0
        ? `orphans: ${orphans.slice(0, 5).map((e) => `${e.objectId}(${e.placeholderType})`).join(', ')}`
        : undefined
    )
  )
  // Duplicates: same objectId twice in readback projection.
  const seen = new Set<string>()
  const dupes = input.elements.map((e) => e.objectId).filter((id) => (seen.has(id) ? true : (seen.add(id), false)))
  findings.push(
    finding(
      'READBACK_NO_DUPLICATES',
      dupes.length === 0,
      'ERROR',
      dupes.length > 0 ? `dupes: ${dupes.slice(0, 5).join(', ')}` : undefined
    )
  )
  // Readback bounds on the authoritative rects.
  const outOfBounds = input.elements.filter((e) => {
    if (!e.rectPt) return false
    const r = e.rectPt
    return r.x < -1 || r.y < -1 || r.x + r.w > input.page.w + 1 || r.y + r.h > input.page.h + 1
  })
  findings.push(
    finding(
      'READBACK_BOUNDS',
      outOfBounds.length === 0,
      'ERROR',
      outOfBounds.length > 0 ? outOfBounds.slice(0, 5).map((e) => e.objectId).join(', ') : undefined
    )
  )
  return findings
}

// ---------------------------------------------------------------------------
// Layout allocation helpers (content-aware repeated-item sizing)
// ---------------------------------------------------------------------------

export interface RowFit {
  itemW: number
}

/**
 * availableWidth − totalGaps ÷ itemCount → candidate width. Returns null when
 * the candidate falls below the readable minimum (caller must reflow: fewer
 * columns, more rows, or fail closed).
 */
export function fitRowItems(
  itemCount: number,
  availableWidth: number,
  gap: number,
  minItemWidth: number
): RowFit | null {
  if (itemCount <= 0 || availableWidth <= 0) return null
  const itemW = (availableWidth - (itemCount - 1) * gap) / itemCount
  if (itemW < minItemWidth) return null
  return { itemW }
}

export interface GridFit {
  cols: number
  rows: number
  itemW: number
  itemH: number
}

/** Bounded grid search: most columns that satisfy minimums (fewest rows). */
export function fitGrid(
  itemCount: number,
  availableWidth: number,
  availableHeight: number,
  minItemWidth: number,
  minItemHeight: number,
  gap: number,
  maxCols: number
): GridFit | null {
  for (let cols = Math.min(maxCols, itemCount); cols >= 1; cols -= 1) {
    const rows = Math.ceil(itemCount / cols)
    const itemW = (availableWidth - (cols - 1) * gap) / cols
    const itemH = (availableHeight - (rows - 1) * gap) / rows
    if (itemW >= minItemWidth && itemH >= minItemHeight) {
      return { cols, rows, itemW, itemH }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Coupled title/body layout (TASK-086R1 adaptive fit)
// ---------------------------------------------------------------------------

/** Single-line width need for a header (longest breakable run drives it). */
export function singleLineNeedPt(text: string, fontPt: number): number {
  const charW = AVG_CHAR_WIDTH_RATIO * fontPt
  const runs = text.split(/[\s/-]+/).filter((s) => s !== '')
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0)
  return longest * charW
}

export interface TitledColumnFit {
  headerFontPt: number
  headerLines: number
  /** Header box height (text demand, no dead space). */
  headerH: number
  /** Item-block top offset from the column top (header + minimum gap). */
  itemTop: number
  totalH: number
  shrunk: boolean
  ok: boolean
}

/**
 * Coupled heading/body column layout. The header wraps at the largest font
 * that fits; items start below the MEASURED header height plus the minimum
 * gap (never a fixed offset that a wrapped title can overrun). Container
 * slack is consumed before any font reduction; reduction stops at the role
 * minimum. Returns ok:false (best-effort, min fonts) when even minimums
 * cannot fit maxTotalH — the caller renders it and QA fails closed.
 */
export function layoutTitledColumn(args: {
  headerText: string
  headerBaseFontPt: number
  headerMinFontPt: number
  headerWidthPt: number
  headerTopPadPt: number
  /** Fixed box height for short headers (v1 rhythm preserved when content fits). */
  minHeaderHPt: number
  /** Breathing room added above text demand when growing. */
  headerPadPt: number
  minGapPt: number
  itemCount: number
  itemRowHPt: number
  maxTotalHPt: number
}): TitledColumnFit {
  const { headerMinFontPt, headerWidthPt, headerTopPadPt, minHeaderHPt, headerPadPt, minGapPt, itemCount, itemRowHPt, maxTotalHPt } = args
  let font = args.headerBaseFontPt
  const minFont = Math.min(headerMinFontPt, args.headerBaseFontPt)
  while (true) {
    const lines = estimateLines(args.headerText, font, headerWidthPt)
    const demandH = (Number.isFinite(lines) ? lines : 99) * font * LINE_HEIGHT_RATIO
    const headerH = Math.max(minHeaderHPt, demandH + (Number.isFinite(lines) ? headerPadPt : 0))
    const itemTop = headerTopPadPt + headerH + minGapPt
    const totalH = itemTop + itemCount * itemRowHPt
    const fits = Number.isFinite(lines) && totalH <= maxTotalHPt + 1
    if (fits) {
      return {
        headerFontPt: Math.round(font * 2) / 2,
        headerLines: Number.isFinite(lines) ? lines : 99,
        headerH,
        itemTop,
        totalH,
        shrunk: font < args.headerBaseFontPt,
        ok: true,
      }
    }
    const next = Math.round((font - 0.5) * 2) / 2
    if (next < minFont - 1e-9) {
      return {
        headerFontPt: minFont,
        headerLines: Number.isFinite(lines) ? lines : 99,
        headerH,
        itemTop,
        totalH,
        shrunk: true,
        ok: false,
      }
    }
    font = next
  }
}

export interface ColumnSetFit {
  widths: number[]
  columns: TitledColumnFit[]
  bgH: number
  redistributed: boolean
  ok: boolean
}

/**
 * Bounded width redistribution for repeated-card grids. Equal widths first;
 * only when a column cannot fit even at minimum header font, width transfers
 * from the slackest donor, capped at 20% of an equal share per donor, and
 * only when the pool fully covers the deficit (no partial incoherence).
 * Alignment is recomputed from the final widths, so the grid stays coherent.
 */
export function rebalanceColumnWidths(args: {
  needs: number[]
  availW: number
  gap: number
  minW: number
  maxShiftFrac?: number
}): number[] {
  const { needs, availW, gap, minW } = args
  const maxShiftFrac = args.maxShiftFrac ?? 0.2
  const n = needs.length
  if (n === 0) return []
  const equal = (availW - (n - 1) * gap) / n
  if (!(equal > 0)) return new Array(n).fill(Math.max(minW, 1))
  const want = needs.map((need) => Math.min(Math.max(need, minW), equal * 2))
  const deficit = want.reduce((s, w) => s + Math.max(0, w - equal), 0)
  if (deficit <= 0) return new Array(n).fill(equal)
  const giveable = want.map((w) => Math.min(Math.max(0, equal - Math.max(minW, w)), maxShiftFrac * equal))
  const pool = giveable.reduce((s, v) => s + v, 0)
  if (pool + 1e-9 < deficit) return new Array(n).fill(equal)
  // Fully covered: donors give proportionally, needy columns take to want.
  const widths = want.slice()
  const leftover = availW - (n - 1) * gap - widths.reduce((s, v) => s + v, 0)
  // leftover >= 0 by construction (pool covers deficit); spread evenly.
  return widths.map((w) => w + leftover / n)
}

export interface ColumnSetInput {
  columns: Array<{ headerText: string; itemCount: number }>
  availW: number
  availH: number
  gap: number
  minColW: number
  headerInsetPt: number
  headerBaseFontPt: number
  headerMinFontPt: number
  headerTopPadPt: number
  minHeaderHPt: number
  headerPadPt: number
  headerGapPt: number
  itemRowHPt: number
  /** Baseline card height (v1 fixed height); grows only when content demands. */
  minBgHPt: number
}

/** Full repeated-column layout: equal widths, per-column shrink, bounded
 *  redistribution fallback, shared background height. Never throws. */
export function layoutColumnSet(input: ColumnSetInput): ColumnSetFit {
  const n = input.columns.length
  const fitWith = (widths: number[]): TitledColumnFit[] =>
    input.columns.map((c, i) =>
      layoutTitledColumn({
        headerText: c.headerText,
        headerBaseFontPt: input.headerBaseFontPt,
        headerMinFontPt: input.headerMinFontPt,
        headerWidthPt: Math.max(widths[i] - input.headerInsetPt, 40),
        headerTopPadPt: input.headerTopPadPt,
        minHeaderHPt: input.minHeaderHPt,
        headerPadPt: input.headerPadPt,
        minGapPt: input.headerGapPt,
        itemCount: c.itemCount,
        itemRowHPt: input.itemRowHPt,
        maxTotalHPt: input.availH,
      })
    )
  const equalW = (input.availW - (n - 1) * input.gap) / n
  const bgFor = (fits: TitledColumnFit[]): number =>
    Math.min(input.availH, Math.max(input.minBgHPt, ...fits.map((f) => f.totalH)))
  let widths = new Array(n).fill(equalW)
  let fits = fitWith(widths)
  if (fits.every((f) => f.ok)) {
    return { widths, columns: fits, bgH: bgFor(fits), redistributed: false, ok: true }
  }
  const needs = input.columns.map((c) =>
    Math.max(singleLineNeedPt(c.headerText, input.headerMinFontPt) + 28, input.minColW)
  )
  const rebalanced = rebalanceColumnWidths({ needs, availW: input.availW, gap: input.gap, minW: input.minColW })
  const changed = rebalanced.some((w, i) => Math.abs(w - equalW) > 0.5)
  if (changed) {
    const refits = fitWith(rebalanced)
    if (refits.every((f) => f.ok)) {
      return {
        widths: rebalanced,
        columns: refits,
        bgH: bgFor(refits),
        redistributed: true,
        ok: true,
      }
    }
  }
  return {
    widths,
    columns: fits,
    bgH: input.availH,
    redistributed: false,
    ok: false,
  }
}

export interface TimelineNodeFit {
  labelFontPt: number
  labelH: number
  descTop: number
  blockH: number
  shrunk: boolean
  ok: boolean
}

/**
 * Coupled timeline node layout: the description starts below the MEASURED
 * label height plus the minimum gap, so a wrapped heading can never collide
 * with its description. Label font shrinks (bounded by minimum) to fit the
 * block budget; null-budget failure returns ok:false for fail-closed QA.
 */
export function layoutTimelineNode(args: {
  label: string
  description?: string | null
  labelBaseFontPt: number
  labelMinFontPt: number
  descFontPt: number
  labelWidthPt: number
  minLabelHPt: number
  labelPadPt: number
  minGapPt: number
  maxBlockHPt: number
}): TimelineNodeFit {
  const gap = args.minGapPt
  let font = args.labelBaseFontPt
  const minFont = Math.min(args.labelMinFontPt, args.labelBaseFontPt)
  while (true) {
    const lines = estimateLines(args.label, font, args.labelWidthPt)
    const labelH = Number.isFinite(lines)
      ? Math.max(args.minLabelHPt, lines * font * LINE_HEIGHT_RATIO + args.labelPadPt)
      : Number.POSITIVE_INFINITY
    let descH = 0
    if (args.description) {
      const demand = textDemandPt(args.description, args.descFontPt, args.labelWidthPt)
      descH = Number.isFinite(demand.demandHeightPt) ? demand.demandHeightPt + args.labelPadPt : Number.POSITIVE_INFINITY
    }
    const blockH = labelH + (args.description ? gap + descH : 0)
    if (Number.isFinite(blockH) && blockH <= args.maxBlockHPt + 1) {
      return {
        labelFontPt: Math.round(font * 2) / 2,
        labelH,
        descTop: labelH + gap,
        blockH,
        shrunk: font < args.labelBaseFontPt,
        ok: true,
      }
    }
    const next = Math.round((font - 0.5) * 2) / 2
    if (next < minFont - 1e-9) {
      return { labelFontPt: minFont, labelH, descTop: labelH + gap, blockH, shrunk: true, ok: false }
    }
    font = next
  }
}

// ---------------------------------------------------------------------------
// Content-integrity guard (reflow must never fabricate numeric facts)
// ---------------------------------------------------------------------------

const NUMERIC_TOKEN_RE = /(?:Rp\s?[\d.,]+|\$[\d.,]+|[\d.,]+\s?(?:%|\$)|\b\d{1,2}\s*\/\s*\d{1,2}\b|\b(19|20)\d{2}\b|\bQ[1-4]\b|\b\d+\.\d+\b|[\d.,]+\s?(?:x|Rp|USD|ribu|juta|miliar|million|billion|k|M)\b)/gi

/** Numeric tokens (values, units, dates) present across texts. */
export function numericTokens(texts: string[]): string[] {
  const out = new Set<string>()
  for (const t of texts) {
    const re = new RegExp(NUMERIC_TOKEN_RE.source, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(t)) !== null) out.add(m[0].toLowerCase())
  }
  return [...out]
}

/** Tokens present in output but absent from input — fabricated facts. */
export function findFabricatedNumbers(inputTexts: string[], outputTexts: string[]): string[] {
  const allowed = new Set(numericTokens(inputTexts))
  return numericTokens(outputTexts).filter((t) => !allowed.has(t))
}
