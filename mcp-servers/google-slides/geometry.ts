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

/**
 * TASK-096-R1: authoritative Google Slides default page in PT.
 * `presentations.create({title})` always yields a 16:9 page of
 * 9144000x5143500 EMU = 720x405 PT (10 x 5.625 in). The 960x540 design
 * canvas is the 1.0 scale reference (pixels at 96dpi), NOT points — deck
 * compilation must use these dimensions so coordinates land 1:1 on the
 * real page, and the handler verifies them against the live pageSize.
 */
export const GOOGLE_DEFAULT_PAGE_PT = { w: 720, h: 405 } as const

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
/**
 * TASK-094: bold glyphs run wider than regular ones (DERIVED estimate:
 * ~12% mean advance expansion across the safe system families). Bold-aware
 * callers pass `{ bold: true }`; omitted opts preserve legacy behavior.
 */
const BOLD_WIDTH_MUL = 1.12

export interface TextMeasureOpts {
  bold?: boolean
}

/** Greedy word-wrap line count; explicit newlines force breaks. */
export function estimateLines(
  text: string,
  fontPt: number,
  boxWidthPt: number,
  opts?: TextMeasureOpts
): number {
  if (!text || boxWidthPt <= 0 || fontPt <= 0) return 0
  const charW = AVG_CHAR_WIDTH_RATIO * fontPt * (opts?.bold === true ? BOLD_WIDTH_MUL : 1)
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

export function textDemandPt(
  text: string,
  fontPt: number,
  boxWidthPt: number,
  opts?: TextMeasureOpts
): TextDemand {
  const lines = estimateLines(text, fontPt, boxWidthPt, opts)
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
  box: { w: number; h: number },
  opts?: TextMeasureOpts
): FitVerdict {
  const demand = textDemandPt(text, fontPt, box.w, opts)
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
  /** TASK-094: bold glyphs measure wider; containment accounts for it. */
  bold?: boolean
  /** TASK-094-R2: solid fill of shape entries (for orphan-container QA). */
  fillHex?: string
  /** TASK-094-R3: normalized text color of text entries (for contrast QA). */
  colorHex?: string
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
    const verdict = classifyTextFit(el.text, el.fontPt, inner, el.bold === true ? { bold: true } : undefined)
    if (verdict.fit === 'OVERFLOW') {
      bad.push(`${el.id}: ${verdict.fit} lines=${verdict.lines} demand=${verdict.demandHeightPt.toFixed(0)}pt>box${inner.h.toFixed(0)}pt`)
    }
  }
  if (bad.length > 0) {
    return finding('TEXT_CONTAINER_OVERFLOW', false, 'BLOCKING', bad.slice(0, 5).join(' | '))
  }
  const risky = elements.filter((el) => {
    if (el.kind !== 'text' || el.text === undefined || el.fontPt === undefined) return false
    return classifyTextFit(el.text, el.fontPt, { w: el.rect.w, h: el.rect.h }, el.bold === true ? { bold: true } : undefined).fit === 'OVERFLOW_RISK'
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

/**
 * TASK-094-R2: normalized meaningful-text predicate for container QA.
 * A semantic container with no meaningful text is an orphan: it renders as
 * an empty box (on dark themes, an empty white/light rectangle). Whitespace-
 * only content counts as empty. (Stored placeholder hints never reach
 * snapshots, so they cannot satisfy this.)
 */
export function isMeaningfulText(text: string | null | undefined): boolean {
  return (text ?? '').trim().length > 0
}

function isTitleType(type: string): boolean {
  // TASK-090-R1: CENTERED_TITLE is the centered variant some templates report;
  // an unrecognized title placeholder used to fall through to PRESERVE and
  // collide with the generated title (slide-1 failure class).
  return /^(TITLE|CENTER_TITLE|CENTERED_TITLE)$/i.test((type ?? '').trim())
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
// Visual-quality QA (TASK-087): measurable composition signals. All findings
// are WARNING-grade by design — they inform human judgment and NEVER gate
// GEOMETRY_PROVEN. Only unreadability/bounds/collision/factual-loss stay
// BLOCKING. Machine QA supports the human verdict; it does not replace it.
// ---------------------------------------------------------------------------

/** Union bbox area of content elements (text + non-background shapes). */
export function contentFootprint(elements: PlacedElement[], page: PageGeometry): number {
  const safe = safeAreaOf(page)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    if (el.kind === 'background' || el.kind === 'line') continue
    minX = Math.min(minX, el.rect.x)
    minY = Math.min(minY, el.rect.y)
    maxX = Math.max(maxX, el.rect.x + el.rect.w)
    maxY = Math.max(maxY, el.rect.y + el.rect.h)
  }
  if (maxX <= minX || maxY <= minY) return 0
  const area = (maxX - minX) * (maxY - minY)
  return area / (safe.w * safe.h)
}

/**
 * Peer consistency: elements sharing a role prefix family (e.g. SMV/SML card
 * pairs, KPIV/KPIL pairs) must share dimensions. Returns dimension groups.
 */
export function peerDimensionGroups(elements: PlacedElement[]): Map<string, string> {
  const groups = new Map<string, string>()
  for (const el of elements) {
    const m = /^(SMV|SML|KPIV|KPIL|ITEM|NUMBG|NUM)_?(\d+)/.exec(el.id) ?? /^(SMBG|KPIBG)(\d+)/.exec(el.id)
    if (!m) continue
    const family = m[1].replace(/\d+$/, '')
    const key = `${family}:${el.rect.w.toFixed(1)}x${el.rect.h.toFixed(1)}`
    groups.set(el.id, key)
  }
  return groups
}

export interface VisualQaInput {
  page: PageGeometry
  elements: PlacedElement[]
  hierarchy: Array<{ role: TextRole; fontPt: number; id: string }>
  /** Metric values the input carried (empty when the content has none). */
  inputMetrics: string[],
  /**
   * TASK-090: raw source texts for burial analysis. A metric embedded in
   * a long prose sentence is burial-risk; a short value label (funnel
   * stage value, KPI card) is already hierarchically surfaced by design.
   */
  sourceTexts?: string[],
  /**
   * TASK-090: proportional sets — {ids, values} whose rendered widths must
   * follow value ordering (non-increasing with values, ties allowed).
   */
  proportionSets?: Array<{ ids: string[]; values: number[] }>
}

export function qaVisualQuality(input: VisualQaInput): GeometryFinding[] {
  const findings: GeometryFinding[] = []
  const footprint = contentFootprint(input.elements, input.page)
  findings.push(
    finding(
      'VISUAL_FOOTPRINT',
      footprint >= 0.25,
      'WARNING',
      `footprint=${footprint.toFixed(2)} of safe area`
    )
  )
  // Peer consistency across repeated card families.
  const groups = peerDimensionGroups(input.elements)
  const byFamily = new Map<string, Set<string>>()
  for (const [, key] of groups) {
    const family = key.split(':')[0]
    if (!byFamily.has(family)) byFamily.set(family, new Set())
    byFamily.get(family)?.add(key)
  }
  const inconsistent = [...byFamily.entries()].filter(([, keys]) => keys.size > 1)
  findings.push(
    finding(
      'VISUAL_PEER_CONSISTENCY',
      inconsistent.length === 0,
      'WARNING',
      inconsistent.length > 0 ? `varying: ${inconsistent.map(([f]) => f).join(', ')}` : undefined
    )
  )
  // KPI hierarchy: metric values buried inside long prose must surface
  // through a kpiValue role, never as undifferentiated body copy. Short
  // value labels (funnel stages, KPI cards) are hierarchical by design,
  // as are values given proportional visual encoding (bar lengths carry
  // the hierarchy instead of type scale).
  const kpiRoles = input.hierarchy.filter((h) => h.role === 'kpiValue').length
  const proportionEncoded = (input.proportionSets ?? []).length > 0
  const burialRisk = (input.sourceTexts ?? input.inputMetrics).filter((s) => s.length > 30 && numericTokens([s]).length > 0)
  findings.push(
    finding(
      'VISUAL_KPI_HIERARCHY',
      burialRisk.length === 0 || kpiRoles > 0 || proportionEncoded,
      'WARNING',
      burialRisk.length > 0 && kpiRoles === 0 && !proportionEncoded
        ? `metrics=${burialRisk.length} buried in prose without kpiValue hierarchy`
        : undefined
    )
  )
  // Typography collapse: every level at the same size means no hierarchy.
  const sizes = new Set(input.hierarchy.map((h) => h.fontPt))
  findings.push(
    finding(
      'VISUAL_TYPE_HIERARCHY',
      sizes.size >= 2 || input.hierarchy.length <= 1,
      'WARNING',
      sizes.size < 2 && input.hierarchy.length > 1 ? 'all roles share one size' : undefined
    )
  )
  // Proportional order: widths must follow values (ties allowed). A set that
  // inverts magnitude order fails — the encoding would actively mislead.
  const byId = new Map(input.elements.map((e) => [e.id, e.rect]))
  for (const set of input.proportionSets ?? []) {
    const pairs = set.ids.map((id) => ({ id, v: set.values[set.ids.indexOf(id)], w: byId.get(id)?.w }))
    const defined = pairs.filter((p) => typeof p.w === 'number')
    let ordered = true
    for (let i = 1; i < defined.length; i += 1) {
      if (defined[i].v < defined[i - 1].v && defined[i].w !== undefined && defined[i - 1].w !== undefined) {
        if ((defined[i].w as number) > (defined[i - 1].w as number) + 1) ordered = false
      }
      if (defined[i].v > defined[i - 1].v) {
        if ((defined[i].w as number) < (defined[i - 1].w as number) - 1) ordered = false
      }
    }
    findings.push(
      finding(
        'VISUAL_PROPORTIONAL_ORDER',
        ordered && defined.length === set.ids.length,
        'WARNING',
        !ordered ? 'rendered widths invert value ordering' : defined.length !== set.ids.length ? 'proportion ids missing from layout' : undefined
      )
    )
  }
  // Mass balance: content-bbox center far from safe-area center means the
  // composition leans unintentionally (intentional asymmetry is a human call,
  // so WARNING-grade evidence, never BLOCKING).
  const content = input.elements.filter((e) => e.kind !== 'background' && e.kind !== 'line')
  if (content.length > 0) {
    const safe = safeAreaOf(input.page)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const el of content) {
      minX = Math.min(minX, el.rect.x)
      minY = Math.min(minY, el.rect.y)
      maxX = Math.max(maxX, el.rect.x + el.rect.w)
      maxY = Math.max(maxY, el.rect.y + el.rect.h)
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const ox = Math.abs(cx - (safe.x + safe.w / 2)) / safe.w
    const oy = Math.abs(cy - (safe.y + safe.h / 2)) / safe.h
    const balanced = ox <= 0.3 && oy <= 0.3
    findings.push(
      finding(
        'VISUAL_MASS_BALANCE',
        balanced,
        'WARNING',
        !balanced ? `mass offset x=${ox.toFixed(2)} y=${oy.toFixed(2)} of safe area` : undefined
      )
    )
  }
  // TASK-094: render-evidence boundary. Every check above is structural
  // (bounds, containment, collision, order) — no pixel/rendered-image
  // evidence exists at this layer. State that explicitly so GEOMETRY_PROVEN
  // can never be mistaken for pixel-level proof.
  findings.push(
    finding('VISUAL_RENDER_UNPROVEN', true, 'WARNING', 'structural geometry only; no rendered-pixel evidence')
  )
  return findings
}

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
  /**
   * TASK-089: snapshot kind ('group' for group shells). Collision QA pairs
   * visual LEAF elements only — a group shell's bbox duplicates its members
   * semantically, so shells are excluded from rect pairing (identity,
   * ownership, and presence still see them).
   */
  kind?: string
}

export interface ReadbackQaInput {
  page: PageGeometry
  expectedTexts: string[]
  /**
   * TASK-090-R1: required facts for READBACK_FACTUAL_COMPLETENESS.
   * Defaults to expectedTexts (plan facts). Pre-write coverage uses the
   * same normalized identity against source-owned segments.
   */
  requiredFacts?: string[],
  expectedIds: string[]
  clearedIds: string[]
  elements: ReadbackElement[]
  ownership: OwnershipDecision[]
  /** Compose title for the heading-anchor duplicate rule. */
  composeTitle?: string
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
  // TASK-090-R1: authoritative factual readback gate (BLOCKING). Every
  // required fact must be covered by the joined readback texts (same
  // conservative predicate as ownership: exact, majority word coverage,
  // numeric subset — no title anchor, so headings never self-satisfy).
  // This catches projection drops even when pre-write planning passed.
  const required = input.requiredFacts ?? input.expectedTexts
  const missingFacts = required.filter((f) => {
    const norm = normalizeFact(f)
    if (!norm) return false
    return !isCoveredSourceText(f, [joined])
  })
  findings.push(
    finding(
      'READBACK_FACTUAL_COMPLETENESS',
      missingFacts.length === 0,
      'BLOCKING',
      missingFacts.length > 0
        ? `missing required facts: ${missingFacts.slice(0, 5).map((f) => f.slice(0, 60)).join(' | ')}`
        : undefined
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
  // TASK-086R2-R1: duplicated SOURCE content. A surviving non-placeholder,
  // non-composed element whose text the plan reproduces is the reported
  // failure mode (source textbox stranded next to the AB_* structure).
  // Authoritative whole-slide check: REUSEd natives are owned, newly created
  // ids are expected, placeholders stay under the placeholder contract.
  const reuseIds = new Set(input.ownership.filter((d) => d.decision === 'REUSE').map((d) => d.objectId))
  const expectedSet = new Set(input.expectedIds)
  const sourceDupes = input.elements.filter(
    (e) =>
      !expectedSet.has(e.objectId) &&
      !reuseIds.has(e.objectId) &&
      e.placeholderType === undefined &&
      (e.objectId.startsWith(COMPOSED_ID_PREFIX) || isCoveredSourceText(e.text ?? '', input.expectedTexts, input.composeTitle))
  )
  findings.push(
    finding(
      'READBACK_NO_SOURCE_DUPLICATES',
      sourceDupes.length === 0,
      'BLOCKING',
      sourceDupes.length > 0
        ? `surviving source duplicates: ${sourceDupes.slice(0, 5).map((e) => e.objectId).join(', ')}`
        : undefined
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
  // TASK-086R2-R1-C1: effective post-write collisions must include preserved
  // source survivors. Pre-write checks cover the plan (+native rects) only,
  // and AB-vs-AB overlaps are already proven there — so this check is scoped
  // to preserved (non-composed, non-cleared, non-reused) elements against
  // newly created ids. Designed overlaps (badge number inside its ellipse)
  // are same-center containment, never flagged: a hit requires genuine
  // partial overlap (intersection smaller than either box).
  // TASK-089: leaf-only pairing — group shells (kind 'group') are structural
  // containers whose bbox re-states member geometry; pairing them would
  // false-flag every grouped composition. Members pair normally.
  const preserved = input.elements.filter(
    (e) =>
      !expectedSet.has(e.objectId) &&
      !reuseIds.has(e.objectId) &&
      !input.clearedIds.includes(e.objectId) &&
      !e.objectId.startsWith(COMPOSED_ID_PREFIX) &&
      e.kind !== 'group' &&
      e.rectPt !== undefined &&
      e.rectPt !== null
  )
  const created = input.elements.filter(
    (e) =>
      expectedSet.has(e.objectId) &&
      e.kind !== 'group' &&
      e.rectPt !== undefined &&
      e.rectPt !== null
  )
  const collisions: string[] = []
  for (const p of preserved) {
    const pr = p.rectPt as { x: number; y: number; w: number; h: number }
    for (const c of created) {
      const cr = c.rectPt as { x: number; y: number; w: number; h: number }
      if (rectsOverlap(pr, cr) && !rectContains(pr, cr) && !rectContains(cr, pr)) {
        collisions.push(`${p.objectId}×${c.objectId}`)
      }
    }
  }
  findings.push(
    finding(
      'READBACK_EFFECTIVE_COLLISION_FREE',
      collisions.length === 0,
      'BLOCKING',
      collisions.length > 0 ? `preserved-vs-new overlaps: ${collisions.slice(0, 5).join(' | ')}` : undefined
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

/**
 * TASK-090-R1: required-fact primitives. A fact is a normalized source
 * string; identity is conservative (exact or normalized-equivalent only).
 */
export function normalizeFact(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Split source text into candidate fact segments (sentences/lines).
 * Decimal points ("2.1B"), abbreviations, and ellipsis never split: a
 * period splits only before whitespace+capital/end (new sentence).
 */
export function splitFactSegments(text: string): string[] {
  const out: string[] = []
  for (const chunk of text.split(/[\n;!?]+/)) {
    let rest = chunk
    while (rest.length > 0) {
      // NB: digits excluded from the lookahead so decimals ("2.1B") never split.
      const m = /\.\s*(?=[A-Z"“(]|$)/.exec(rest)
      if (!m || m.index === undefined) {
        out.push(rest)
        break
      }
      const cut = m.index + 1
      out.push(rest.slice(0, cut))
      rest = rest.slice(cut).replace(/^\s+/, '')
    }
  }
  return out.map((s) => s.trim()).filter((s) => s.length > 0)
}

/**
 * A segment is substantive (fact-bearing) when it carries real wording
 * (>=4 words) or any numeric token. Stray fragments never gate clearing.
 */
export function isSubstantiveSegment(segment: string): boolean {
  const words = segment.split(/\s+/).filter(Boolean)
  if (words.length >= 4) return true
  return numericTokens([segment]).length > 0
}

/**
 * TASK-090-R1 pre-write gate helper: FACTUAL_PROJECTION_COMPLETE.
 * For every source object marked CLEAR, each substantive owned segment must
 * be covered by the planned projected texts (same conservative predicate as
 * ownership: exact, title-anchored, or majority word coverage with numeric
 * subset). Any uncovered segment is BLOCKING — the compose must not write
 * and the source must not be cleared.
 */
export interface FactCoverageTarget {
  objectId: string
  text: string
}
export function checkFactCoverage(
  clearTargets: FactCoverageTarget[],
  projectedTexts: string[],
  composeTitle?: string
): GeometryFinding[] {
  const missing: string[] = []
  for (const target of clearTargets) {
    for (const seg of splitFactSegments(target.text)) {
      if (!isSubstantiveSegment(seg)) continue
      if (!isCoveredSourceText(seg, projectedTexts, composeTitle)) {
        missing.push(`${target.objectId}: ${seg.slice(0, 60)}`)
      }
      if (missing.length >= 5) break
    }
    if (missing.length >= 5) break
  }
  return [
    finding(
      'FACTUAL_PROJECTION_COMPLETE',
      missing.length === 0,
      'BLOCKING',
      missing.length > 0 ? `unprojected owned facts: ${missing.join(' | ')}` : undefined
    ),
  ]
}

/**
 * Numeric tokens minus bare 4-digit years. Years locate content in time;
 * they are never hero KPI values (§19) and must not single-handedly block
 * summarization coverage. Quarters, months, and full dates stay guarded.
 */
export function coverageNumerics(texts: string[]): string[] {
  return numericTokens(texts).filter((tok) => !/^(19|20)\d{2}$/.test(tok))
}

/** Tokens present in output but absent from input — fabricated facts. */
export function findFabricatedNumbers(inputTexts: string[], outputTexts: string[]): string[] {
  const allowed = new Set(numericTokens(inputTexts))
  return numericTokens(outputTexts).filter((t) => !allowed.has(t))
}

// ---------------------------------------------------------------------------
// Magnitude parsing + proportional scaling (TASK-090 visual encoding).
// Deterministic, locale-aware for ID compact formats (Rp 38.500 = 38500).
// Never invents values: unparseable text yields null (caller falls back).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Source-element ownership (TASK-086R2-R1, C1 title-anchor upgrade, TASK-089
// group-aware shells): existing-slide Beautify replaces the source structure,
// never strands it alongside the composition.
// ---------------------------------------------------------------------------

/**
 * Proven gap (human benchmark): composeSlideOnPage inventoried placeholders
 * ONLY, so a plain source textbox survived EXECUTIVE_SUMMARY composition next
 * to 11 new AB_* elements while READBACK_NO_DUPLICATES (repeated objectIds)
 * and OWNERSHIP_COMPLETENESS (placeholders-only) both passed vacuously.
 *
 * This section owns the complementary contract for pre-existing
 * NON-placeholder page elements:
 * - previous-generation AB_* ids → CLEAR (retry replaces, never accumulates)
 * - text reproduced by the plan → CLEAR (duplicate-source prevention)
 * - everything else (images, uncovered content) → PRESERVE, never blind delete
 * Placeholders keep their decideOwnership contract and are never double-decided.
 */

/** Pre-existing page element inventory (superset of placeholders). */
export interface SourceElementInfo {
  objectId: string
  text?: string
  placeholderType?: string
  kind?: string
  /** ObjectId of the containing group for group members (TASK-089). */
  parentGroupId?: string
}

/** Compose-owned objectId prefix (see beautify nextId: AB_<tag>_<prefix>_<seq>). */
export const COMPOSED_ID_PREFIX = 'AB_'

/** Minimum word coverage for a source element to count as reproduced. */
export const SOURCE_CLEAR_COVERAGE = 0.5

/** Normalized fact identity (conservative: exact or normalized-equivalent only). */
export function normalizeSourceText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function sourceWords(text: string): string[] {
  return normalizeSourceText(text)
    .split(' ')
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter((w) => w.length > 0)
}

/**
 * Fraction of the element’s words present in the composed texts (0..1),
 * or -1 when the element carries no words (shapes/images/lines).
 */
export function sourceCoverage(elementText: string, expectedTexts: string[]): number {
  const words = sourceWords(elementText)
  if (words.length === 0) return -1
  const allowed = new Set(expectedTexts.flatMap(sourceWords))
  const hit = words.filter((w) => allowed.has(w)).length
  return hit / words.length
}

/** True when the composed plan reproduces the element’s content. */
export function isCoveredSourceText(
  elementText: string,
  expectedTexts: string[],
  composeTitle?: string
): boolean {
  const norm = normalizeSourceText(elementText)
  if (!norm) return false
  const normExpected = expectedTexts.map(normalizeSourceText).filter((t) => t.length > 0)
  if (normExpected.some((e) => e === norm)) return true
  // Heading anchor (TASK-086R2-R1-C1): the element is the old rendering of
  // this slide when it contains the compose title. Paraphrase-proof: agent
  // bullets routinely compress/reorder body words (measured 0.769 coverage on
  // a reproduced slide vs the 0.8 bar), but the required title is stable.
  const title = normalizeSourceText(composeTitle ?? '')
  if (title.length >= 3 && norm.includes(title)) return true
  // Content backstop: majority word coverage AND every numeric token of the
  // element present in the plan. Numbers are fidelity-stable anchors; the
  // numeric-subset guard refuses to delete elements carrying facts the plan
  // dropped (content-loss direction stays fail-closed: PRESERVE).
  if (sourceCoverage(elementText, expectedTexts) < SOURCE_CLEAR_COVERAGE) return false
  const elementNumerics = new Set(coverageNumerics([elementText]))
  const allowedNumerics = new Set(coverageNumerics(expectedTexts))
  return [...elementNumerics].every((x) => allowedNumerics.has(x))
}

/**
 * TASK-089: fully-owned group shell clearing policy (live-proven 2026-09-12,
 * disposable deck 1Jj54jK3IxBYM0qdmxggvA9bUzKL2PYShJK6IkkvJVYo):
 * - shell delete CASCADES (deleteObject on the shell removed both members,
 *   no orphans), and member deletes auto-DISSOLVE the emptied shell (no batch
 *   errors either direction).
 * - 'shell' (DEFAULT): delete the shell instead of its members when every
 *   inventoried member is CLEAR — one request, no double-delete, no leftovers.
 *   Covered members are re-marked PRESERVE-via-shell (never individually
 *   deleted); the duplicate check still flags them if they survive.
 * - 'members-only': delete CLEAR members individually, always preserve the
 *   shell. Fallback only; may leave an invisible empty shell behind.
 */
export type GroupShellClearMode = 'shell' | 'members-only'

/**
 * Ownership for pre-existing page elements outside the placeholder contract.
 * `decidedIds` must contain every placeholder id already owned by
 * decideOwnership so placeholders are never double-decided here.
 */
export function decideSourceOwnership(
  elements: SourceElementInfo[],
  opts: { expectedTexts: string[]; decidedIds: Set<string>; composeTitle?: string; groupShells?: GroupShellClearMode }
): OwnershipDecision[] {
  const mode = opts.groupShells ?? 'shell'
  // Child→parent links derive shell membership without extra plumbing.
  const childrenOf = new Map<string, SourceElementInfo[]>()
  for (const e of elements) {
    if (e.parentGroupId === undefined) continue
    const list = childrenOf.get(e.parentGroupId) ?? []
    list.push(e)
    childrenOf.set(e.parentGroupId, list)
  }
  const decided = new Set(opts.decidedIds)
  const verdict = new Map<string, OwnershipDecision>()
  const shells: SourceElementInfo[] = []
  for (const e of elements) {
    if (decided.has(e.objectId)) continue
    decided.add(e.objectId)
    // Group shells are decided in the second pass from member verdicts — even
    // an AB_-prefixed shell id must not bypass member analysis (a shell
    // deletion strands preserved members, so membership always governs).
    if (e.kind === 'group') {
      shells.push(e)
      continue
    }
    if (e.objectId.startsWith(COMPOSED_ID_PREFIX)) {
      verdict.set(e.objectId, { objectId: e.objectId, type: 'COMPOSED', decision: 'CLEAR', reason: 'previous compose generation; retry replaces it deterministically (no accumulation)' })
      continue
    }
    if (e.placeholderType !== undefined) {
      verdict.set(e.objectId, { objectId: e.objectId, type: e.placeholderType, decision: 'PRESERVE', reason: 'placeholder owned by the placeholder contract, not the source pass' })
      continue
    }
    if (isCoveredSourceText(e.text ?? '', opts.expectedTexts, opts.composeTitle)) {
      verdict.set(e.objectId, { objectId: e.objectId, type: 'SOURCE_TEXT', decision: 'CLEAR', reason: 'source content reproduced by the composition; cleared to prevent duplication' })
      continue
    }
    verdict.set(e.objectId, { objectId: e.objectId, type: 'SOURCE_TEXT', decision: 'PRESERVE', reason: 'content not covered by the plan; must not delete' })
  }
  // Second pass: group shells, decided only from member verdicts. A shell is
  // CLEAR-worthy iff every inventoried member is CLEAR. Mode 'shell' deletes
  // the shell instead of its members (no double-delete: covered members are
  // re-marked PRESERVE-via-shell and stay duplicate-checked if they survive).
  // Mode 'members-only' deletes CLEAR members individually and always
  // preserves the shell. A shell holding any PRESERVE member is always PRESERVE.
  for (const s of shells) {
    const members = childrenOf.get(s.objectId) ?? []
    const memberVerdicts = members.map((m) => verdict.get(m.objectId)?.decision)
    const fullyOwned = members.length > 0 && memberVerdicts.every((d) => d === 'CLEAR')
    if (fullyOwned && mode === 'shell') {
      for (const m of members) {
        const prev = verdict.get(m.objectId)
        verdict.set(m.objectId, { objectId: m.objectId, type: prev?.type ?? 'SOURCE_TEXT', decision: 'PRESERVE', reason: 'removed via parent shell deletion; duplicate check flags survivors' })
      }
      verdict.set(s.objectId, { objectId: s.objectId, type: 'GROUP', decision: 'CLEAR', reason: 'all members replacement-owned; shell deletion removes the generation in one request' })
    } else {
      verdict.set(s.objectId, {
        objectId: s.objectId,
        type: 'GROUP',
        decision: 'PRESERVE',
        reason:
          members.length === 0
            ? 'empty or memberless group shell; never blind-delete structure'
            : mode === 'members-only'
              ? 'shell retained; CLEAR members are deleted individually (safe default)'
              : 'group retains preserved member(s); CLEAR members are deleted individually',
      })
    }
  }
  return elements
    .filter((e) => verdict.has(e.objectId))
    .map((e) => verdict.get(e.objectId) as OwnershipDecision)
}

// ---------------------------------------------------------------------------
// Magnitude parsing + proportional scaling (TASK-090 visual encoding).
// Deterministic, locale-aware for ID compact formats (Rp 38.500 = 38500).
// Never invents values: unparseable text yields null (caller falls back).
// ---------------------------------------------------------------------------

/**
 * Parse the first numeric magnitude in free text. Handles prefix currencies
 * (Rp/USD/$), compact suffixes (K/M/B), percent/x units, and ID thousands
 * dots ("38.500" → 38500). Bare years ("2026") parse as their face value —
 * callers use relative ordering only. Returns null when no number exists.
 */
export function parseMagnitude(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const m = /(?:(Rp|USD|\$)\s*)?([+-]?\d[\d.,]*)\s*([BMK]\b|%|percent\b|x\b|Rp\b|USD\b|\$|million\b|billion\b|ribu\b|juta\b|miliar\b)?/i.exec(t)
  if (!m) return null
  let digits = m[2]
  const unit = (m[3] ?? '').toLowerCase()
  // TASK-093: Indonesian comma-decimal — "Rp6,5" → "6.5". Only when comma
  // appears as decimal separator (single comma after digits, no trailing digits
  // after it that would indicate thousands grouping).
  if (/^\d+,\d$/.test(digits)) {
    digits = digits.replace(',', '.')
  }
  // ID thousands dot: greedy match — "1.200.000" or "200.000" → strip all dots.
  if (/^\d{1,3}(\.\d{3})+$/.test(digits) && !/[bmk%]/i.test(unit)) {
    digits = digits.replace(/\./g, '')
  }
  const base = Number(digits.replace(/,/g, ''))
  if (!Number.isFinite(base)) return null
  if (/^(b)\b/i.test(unit)) return base * 1e9
  if (/^(miliar|billion)\b/i.test(unit)) return base * 1e9
  if (/^(m|jt|juta|million)\b/i.test(unit)) return base * 1e6
  if (/^k\b/i.test(unit)) return base * 1e3
  if (/^ribu\b/i.test(unit)) return base * 1e3
  return base
}

export interface ProportionalWidths {
  widths: number[]
  /** True when the visual floor compressed strict ratios (ordering kept). */
  floored: boolean
}

/**
 * Deterministic magnitude→width mapping. Largest value always maps to maxW;
 * ordering is preserved exactly; a minimum floor keeps tiny values visible.
 * Zero/negative values clamp to the floor (never invert, never vanish).
 */
export function scaleProportional(values: number[], maxW: number, minW: number): ProportionalWidths {
  if (values.length === 0) return { widths: [], floored: false }
  const vmax = Math.max(...values.map((v) => (v > 0 ? v : 0)), 0)
  const span = Math.max(maxW - minW, 0)
  let floored = false
  const widths = values.map((v) => {
    const vv = v > 0 ? v : 0
    const strict = vmax > 0 ? (maxW * vv) / vmax : maxW
    const w = minW + span * (vmax > 0 ? vv / vmax : 1)
    // The floor LIFTS small values above their strict ratio; record when it
    // does so (ordering is still preserved exactly).
    if (w > strict + 1e-9) floored = true
    return Math.round(w * 100) / 100
  })
  return { widths, floored }
}

/**
 * TASK-090: partition a total width into share-proportional segments that
 * sum EXACTLY to totalW (stacked whole). A minimum floor keeps tiny shares
 * visible; the floor deficit is borrowed from the largest segment so the
 * whole never overflows. Ordering preserved; floored flags the adjustment.
 */
export function partitionShares(shares: number[], totalW: number, minW: number): ProportionalWidths {
  const total = shares.reduce((a, b) => a + b, 0)
  if (shares.length === 0 || totalW <= 0) return { widths: [], floored: false }
  let widths = shares.map((s) => (total > 0 ? (totalW * s) / total : totalW / shares.length))
  let floored = false
  const deficit = widths.map((w) => Math.max(minW - w, 0)).reduce((a, b) => a + b, 0)
  if (deficit > 0) {
    floored = true
    let rest = deficit
    const order = widths.map((_, i) => i).sort((a, b) => widths[b] - widths[a])
    for (const i of order) {
      const give = Math.min(rest, widths[i] - minW)
      if (give <= 0) continue
      widths[i] -= give
      rest -= give
      if (rest <= 1e-9) break
    }
    if (rest > 1e-9) {
      // Even the largest segment cannot fund the floors: uniform fallback.
      widths = shares.map(() => totalW / shares.length)
    } else {
      widths = widths.map((w) => Math.max(w, minW))
    }
  }
  const rounded = widths.map((w) => Math.round(w * 100) / 100)
  // Absorb rounding drift into the largest segment so the sum stays exact.
  if (rounded.length > 0) {
    const drift = Math.round((totalW - rounded.reduce((a, b) => a + b, 0)) * 100) / 100
    let bi = 0
    for (let i = 1; i < rounded.length; i += 1) if (rounded[i] > rounded[bi]) bi = i
    rounded[bi] = Math.round((rounded[bi] + drift) * 100) / 100
  }
  return { widths: rounded, floored }
}

// ---------------------------------------------------------------------------
// Theme-aware color resolution with contrast-safe fallback (TASK-090).
// ---------------------------------------------------------------------------

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return NaN
  const c = [0, 2, 4].map((o) => {
    const v = parseInt(m[1].slice(o, o + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** WCAG-style contrast ratio between two hex colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  if (!Number.isFinite(la) || !Number.isFinite(lb)) return NaN
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Minimum contrast for a theme accent used on light surfaces. */
export const THEME_ACCENT_MIN_CONTRAST = 3.0

// ---------------------------------------------------------------------------
// TASK-096-R1: authoritative page-size contract + rendered-image analysis.
// The presentation's pageSize is authoritative; the engine's design canvas
// is an assumption that must be verified, never trusted blindly.
// ---------------------------------------------------------------------------

/** Page size in points, converted once from the authoritative magnitude/unit. */
export interface AuthoritativePageSize {
  wPt: number
  hPt: number
  unit: 'PT'
}

/**
 * Convert one authoritative page dimension to PT. Supports PT (passthrough)
 * and EMU (÷12700). Anything else (pixels, inches, missing, non-finite)
 * fails closed — raw pixels must never flow into PT geometry.
 */
export function pageDimensionPt(magnitude: unknown, unit: unknown, label: string): number {
  if (typeof magnitude !== 'number' || !Number.isFinite(magnitude) || magnitude <= 0) {
    failGeometry(`${label} magnitude must be a positive finite number.`)
  }
  if (unit === 'PT') return magnitude
  if (unit === 'EMU') return magnitude / EMU_PER_PT
  failGeometry(`${label} unit must be PT or EMU (got ${String(unit)}); raw pixels/inches are never valid page geometry.`)
}

/** True when two page sizes agree within tolerance (default 0.5pt). */
export function pageSizeMatches(a: { wPt: number; hPt: number }, b: { wPt: number; hPt: number }, tolPt = 0.5): boolean {
  return Math.abs(a.wPt - b.wPt) <= tolPt && Math.abs(a.hPt - b.hPt) <= tolPt
}

export interface RenderedPixelAnalysis {
  widthPx: number
  heightPx: number
  /** Fraction of the border band that is near-white (inset-background signal). */
  whitePerimeterPct: number
  /** True when essentially no content pixels exist (blank-slide signal). */
  blankSlide: boolean
  /**
   * Fraction of pixels close to the expected background (when supplied).
   * Low coverage on a supposedly full-bleed slide means inset background.
   */
  backgroundCoveragePct: number | null
  /** Fraction of pixels that are neither near-white nor near-background. */
  contentPixelPct: number
  /**
   * Always false: glyph clipping cannot be proven from pixels alone without
   * a glyph/plan reference. Callers must compare against compiled bounds
   * (see missingContentRegions) instead of claiming pixel proof here.
   */
  clippingDetectable: false
}

function pixelLuminance(r: number, g: number, b: number): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)]
}

function colorDistanceSq(a: [number, number, number], b: [number, number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

/**
 * Analyze a rendered slide image (RGBA bytes, row-major) for structural
 * visual defects: white perimeter (inset background), blank slides, and
 * background coverage shortfall. Pixel evidence only — semantic judgments
 * (clipping, hierarchy, encoding) are explicitly out of scope here.
 */
export function analyzeRenderedSlide(
  pixels: Uint8ClampedArray | number[],
  widthPx: number,
  heightPx: number,
  opts?: { backgroundHex?: string; whiteLuminance?: number; borderBandPx?: number }
): RenderedPixelAnalysis {
  if (!Number.isInteger(widthPx) || widthPx <= 0 || !Number.isInteger(heightPx) || heightPx <= 0) {
    failGeometry('rendered image dimensions must be positive integers.')
  }
  if (pixels.length < widthPx * heightPx * 4) {
    failGeometry('pixel buffer is smaller than width*height*4 bytes.')
  }
  const whiteLum = opts?.whiteLuminance ?? 0.92
  const band = Math.max(1, opts?.borderBandPx ?? Math.max(2, Math.round(Math.min(widthPx, heightPx) * 0.01)))
  const bgRgb = opts?.backgroundHex !== undefined ? hexToRgb(opts.backgroundHex) : null
  // Near-background tolerance in RGB distance (~48 units ≈ visibly same tone).
  const bgTolSq = 48 * 48
  let borderTotal = 0
  let borderWhite = 0
  let bgCount = 0
  let contentCount = 0
  const total = widthPx * heightPx
  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < widthPx; x += 1) {
      const o = (y * widthPx + x) * 4
      const r = pixels[o] as number
      const g = pixels[o + 1] as number
      const b = pixels[o + 2] as number
      const lum = pixelLuminance(r, g, b)
      const isWhite = lum >= whiteLum
      const isBg = bgRgb !== null && colorDistanceSq([r, g, b], bgRgb) <= bgTolSq
      if (isBg) bgCount += 1
      else if (!isWhite) contentCount += 1
      if (x < band || y < band || x >= widthPx - band || y >= heightPx - band) {
        borderTotal += 1
        if (isWhite) borderWhite += 1
      }
    }
  }
  const whitePerimeterPct = borderTotal > 0 ? (borderWhite / borderTotal) * 100 : 0
  const contentPixelPct = (contentCount / total) * 100
  return {
    widthPx,
    heightPx,
    whitePerimeterPct: Math.round(whitePerimeterPct * 100) / 100,
    blankSlide: contentPixelPct < 0.5 && (bgRgb === null || (bgCount / total) * 100 < 50),
    backgroundCoveragePct: bgRgb === null ? null : Math.round(((bgCount / total) * 100) * 100) / 100,
    contentPixelPct: Math.round(contentPixelPct * 100) / 100,
    clippingDetectable: false,
  }
}

/**
 * Compare planned content boxes (pixel rects) against a render: indices of
 * boxes whose region holds essentially no content pixels. A flagged box is
 * either missing, fully clipped, or rendered invisible — all three fail the
 * slide identically, so no distinction is claimed here.
 */
export function missingContentRegions(
  boxesPx: Array<{ x: number; y: number; w: number; h: number }>,
  pixels: Uint8ClampedArray | number[],
  widthPx: number,
  heightPx: number,
  opts?: { backgroundHex?: string; whiteLuminance?: number; contentThresholdPct?: number }
): number[] {
  const whiteLum = opts?.whiteLuminance ?? 0.92
  const threshold = opts?.contentThresholdPct ?? 1.0
  const bgRgb = opts?.backgroundHex !== undefined ? hexToRgb(opts.backgroundHex) : null
  const bgTolSq = 48 * 48
  const missing: number[] = []
  boxesPx.forEach((box, i) => {
    const x0 = Math.max(0, Math.floor(box.x))
    const y0 = Math.max(0, Math.floor(box.y))
    const x1 = Math.min(widthPx, Math.ceil(box.x + box.w))
    const y1 = Math.min(heightPx, Math.ceil(box.y + box.h))
    // A box fully outside the image is missing by construction.
    if (x1 <= 0 || y1 <= 0 || x0 >= widthPx || y0 >= heightPx) {
      missing.push(i)
      return
    }
    let content = 0
    let total = 0
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const o = (y * widthPx + x) * 4
        const lum = pixelLuminance(pixels[o] as number, pixels[o + 1] as number, pixels[o + 2] as number)
        const isWhite = lum >= whiteLum
        const isBg =
          bgRgb !== null &&
          colorDistanceSq([pixels[o] as number, pixels[o + 1] as number, pixels[o + 2] as number], bgRgb) <= bgTolSq
        total += 1
        if (!isWhite && !isBg) content += 1
      }
    }
    if (total === 0 || (content / total) * 100 < threshold) missing.push(i)
  })
  return missing
}

/**
 * Resolve a semantic theme role (e.g. ACCENT1) to a usable hex, else fallback.
 * A theme color that fails contrast against `onHex` is rejected — legibility
 * is never sacrificed for theme fidelity.
 */
export function resolveThemeRole(
  theme: Record<string, string> | null | undefined,
  role: string,
  fallbackHex: string,
  onHex = '#FFFFFF'
): string {
  const raw = theme?.[role]
  if (typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw)) {
    const ratio = contrastRatio(raw, onHex)
    if (Number.isFinite(ratio) && ratio >= THEME_ACCENT_MIN_CONTRAST) return raw.toUpperCase()
  }
  return fallbackHex
}
