/**
 * TASK-082: Controlled visual-editing surface for the Google Slides MCP.
 *
 * Hybrid design (no raw Google Request passthrough, ever):
 *
 *   Alpha MCP schema
 *     -> input validation (this module)
 *     -> typed request builders (this module)
 *     -> allowlisted Google Slides Request objects
 *     -> presentations.batchUpdate (shared rest.ts transport)
 *
 * Geometry: agent-facing unit is PT. EMU conversion is centralized here
 * (1 PT = 12700 EMU). Colors: agent-facing hex RGB (#RRGGBB), converted to
 * Google RgbColor (0..1 floats). Field masks are constructed internally;
 * the model never supplies raw field-mask strings.
 *
 * Read projection (slides_get_page) is full-fidelity but bounded: one page
 * per call, capped text/runs, objectIds always preserved, no binary data,
 * nothing persisted locally.
 */

import { googleRequest } from '../shared/google/rest'

// ---------------------------------------------------------------------------
// Constants + small deterministic converters (single source of truth)
// ---------------------------------------------------------------------------

/** EMU per typographic point. Google Slides absolute geometry unit. */
export const EMU_PER_PT = 12700

/** Maximum operations accepted by slides_batch_update. */
export const MAX_BATCH_OPS = 25

/** Bounds for full-fidelity page reads. */
export const MAX_TEXT_CONTENT = 2000
export const MAX_TEXT_RUNS = 50
export const MAX_RUN_CONTENT = 500

const RESOURCE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/
const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/

function fail(label: string, detail: string): never {
  throw new Error(`${label}: ${detail}`)
}

export function asResourceId(v: unknown, label: string): string {
  if (typeof v !== 'string' || v.trim() === '') fail(label, 'is required (Google resource ID).')
  const id = (v as string).trim()
  if (!RESOURCE_ID_RE.test(id)) fail(label, 'is malformed. Expected letters, digits, _ and - (max 120).')
  return id
}

export function asOptionalResourceId(v: unknown, label: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  return asResourceId(v, label)
}

export function asFiniteNumber(v: unknown, label: string): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) fail(label, 'must be a finite number.')
  return n
}

export function asPositiveNumber(v: unknown, label: string): number {
  const n = asFiniteNumber(v, label)
  if (n <= 0) fail(label, 'must be positive.')
  return n
}

export function asNonNegativeNumber(v: unknown, label: string): number {
  const n = asFiniteNumber(v, label)
  if (n < 0) fail(label, 'must be >= 0.')
  return n
}

export function asIntInRange(v: unknown, label: string, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) fail(label, `must be an integer in [${min}, ${max}].`)
  return n
}

export function asText(v: unknown, label: string, maxLen: number, required = true): string {
  if (v === undefined || v === null) {
    if (!required) return ''
    fail(label, 'is required.')
  }
  if (typeof v !== 'string') fail(label, 'must be a string.')
  return v as string
}

/** Strict #RRGGBB. Returns normalized uppercase hex. */
export function asHexColor(v: unknown, label: string): string {
  if (typeof v !== 'string' || !HEX_COLOR_RE.test(v.trim())) {
    fail(label, 'must be hex RGB like #2563EB.')
  }
  return (v as string).trim().toUpperCase()
}

export function asHttpUrl(v: unknown, label: string): string {
  if (typeof v !== 'string' || v.trim() === '') fail(label, 'is required (http/https URL).')
  const s = (v as string).trim()
  let u: URL
  try {
    u = new URL(s)
  } catch {
    fail(label, 'must be a valid URL.')
  }
  if (u!.protocol !== 'http:' && u!.protocol !== 'https:') {
    fail(label, 'must use http or https (local paths and data: URLs are not supported).')
  }
  if (/^[A-Za-z]:[\\/]/.test(s) || s.startsWith('/') || s.startsWith('\\\\')) {
    fail(label, 'must not be a local filesystem path.')
  }
  return s
}

/** PT -> EMU magnitude, rounded to integer. */
export function emuFromPt(pt: number): number {
  return Math.round(pt * EMU_PER_PT)
}

/** EMU magnitude -> PT, rounded to 2 decimals. */
export function ptFromEmu(emu: number): number {
  return Math.round((emu / EMU_PER_PT) * 100) / 100
}

export interface EmuDimension {
  magnitude: number
  unit: 'EMU'
}

export function dimensionEmuFromPt(pt: number): EmuDimension {
  return { magnitude: emuFromPt(pt), unit: 'EMU' }
}

export interface GoogleRgb {
  red: number
  green: number
  blue: number
}

/** #RRGGBB -> Google RgbColor floats (rounded to 4 decimals). */
export function rgbFromHex(hex: string): GoogleRgb {
  const h = hex.replace('#', '')
  const r = (v: string): number => Math.round((parseInt(v, 16) / 255) * 10000) / 10000
  return { red: r(h.slice(0, 2)), green: r(h.slice(2, 4)), blue: r(h.slice(4, 6)) }
}

/** Google RgbColor -> #RRGGBB. Returns undefined for theme colors (not opaque RGB). */
export function hexFromRgb(rgb: { red?: number; green?: number; blue?: number } | undefined): string | undefined {
  if (!rgb || rgb.red === undefined || rgb.green === undefined || rgb.blue === undefined) return undefined
  const b = (v: number): string => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0').toUpperCase()
  return `#${b(rgb.red)}${b(rgb.green)}${b(rgb.blue)}`
}

export function newObjectId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

// ---------------------------------------------------------------------------
// Element geometry (agent PT <-> Google EMU), centralized
// ---------------------------------------------------------------------------

export interface AlphaRect {
  x: number
  y: number
  width: number
  height: number
}

export function asRect(args: Record<string, unknown>, label: string): AlphaRect {
  const x = asFiniteNumber(args.x, `${label}.x`)
  const y = asFiniteNumber(args.y, `${label}.y`)
  const width = asPositiveNumber(args.width, `${label}.width`)
  const height = asPositiveNumber(args.height, `${label}.height`)
  return { x, y, width, height }
}

export interface GoogleElementProperties {
  pageObjectId: string
  size: { width: EmuDimension; height: EmuDimension }
  transform: {
    scaleX: number
    scaleY: number
    translateX: number
    translateY: number
    unit: 'EMU'
  }
}

export function elementProperties(pageObjectId: string, rect: AlphaRect): GoogleElementProperties {
  return {
    pageObjectId,
    size: { width: dimensionEmuFromPt(rect.width), height: dimensionEmuFromPt(rect.height) },
    transform: {
      scaleX: 1,
      scaleY: 1,
      translateX: emuFromPt(rect.x),
      translateY: emuFromPt(rect.y),
      unit: 'EMU',
    },
  }
}

// ---------------------------------------------------------------------------
// Full-fidelity page projection (bounded)
// ---------------------------------------------------------------------------

interface GoogleTextRun {
  content?: string
  style?: {
    bold?: boolean
    italic?: boolean
    fontFamily?: string
    fontSize?: { magnitude?: number; unit?: string }
    foregroundColor?: { opaqueColor?: { rgbColor?: GoogleRgb; themeColor?: string } }
  }
}

interface GooglePageElement {
  objectId?: string
  size?: { width?: { magnitude?: number }; height?: { magnitude?: number } }
  transform?: { scaleX?: number; scaleY?: number; translateX?: number; translateY?: number }
  title?: string
  description?: string
  // TASK-085 CORRECTIVE: the PageElement union key is `elementGroup` (docs-verified),
  // NOT `group`. Misreading it hid every group as kind=unknown with no membership.
  elementGroup?: { children?: GooglePageElement[] }
  shape?: {
    shapeType?: string
    text?: { textElements?: Array<{ textRun?: { content?: string } }> }
    placeholder?: { type?: string; index?: number; parentObjectId?: string }
    shapeProperties?: {
      // F03: SolidFill.color IS OpaqueColor ({rgbColor|themeColor}), direct —
      // never wrapped in opaqueColor. TextStyle.foregroundColor is the different
      // OptionalColor wrapper and is intentionally left alone (live-proven).
      shapeBackgroundFill?: {
        propertyState?: string
        solidFill?: { color?: { rgbColor?: GoogleRgb; themeColor?: string } }
      }
      outline?: {
        propertyState?: string
        outlineFill?: { solidFill?: { color?: { rgbColor?: GoogleRgb; themeColor?: string } } }
        weight?: { magnitude?: number }
      }
    }
  }
  image?: {
    contentUrl?: string
    sourceUrl?: string
    imageProperties?: { transparency?: number; brightness?: number; contrast?: number }
  }
  video?: { id?: string; source?: string }
  line?: { lineCategory?: string; lineProperties?: { lineFill?: unknown; weight?: { magnitude?: number } } }
  table?: { rows?: number; columns?: number }
  wordArt?: unknown
  sheetsChart?: { spreadsheetId?: string; chartId?: number }
  speakerSpotlight?: unknown
}

const EMU = (m: number | undefined): number | undefined => (typeof m === 'number' ? m : undefined)

function projectTextRun(run: GoogleTextRun | undefined): Record<string, unknown> | null {
  if (!run) return null
  const content = (run.content ?? '').slice(0, MAX_RUN_CONTENT)
  const st = run.style ?? {}
  const sizePt =
    st.fontSize?.magnitude !== undefined
      ? st.fontSize.unit === 'PT'
        ? Math.round(st.fontSize.magnitude * 100) / 100
        : ptFromEmu(st.fontSize.magnitude)
      : undefined
  return {
    content,
    ...(st.bold !== undefined ? { bold: st.bold } : {}),
    ...(st.italic !== undefined ? { italic: st.italic } : {}),
    ...(st.fontFamily ? { fontFamily: st.fontFamily } : {}),
    ...(sizePt !== undefined ? { fontSizePt: sizePt } : {}),
    ...(st.foregroundColor?.opaqueColor?.rgbColor
      ? { colorHex: hexFromRgb(st.foregroundColor.opaqueColor.rgbColor) }
      : {}),
    // TASK-084: preserve semantic theme references (never collapse to hex).
    ...(st.foregroundColor?.opaqueColor?.themeColor
      ? { themeColor: st.foregroundColor.opaqueColor.themeColor }
      : {}),
  }
}

/**
 * TASK-084: project an OpaqueColor slot ({rgbColor|themeColor}) without
 * flattening semantics. Returns {fillHex} for literal RGB, {themeColor} for
 * semantic references, or null when neither is present.
 */
export function projectColorRef(color: { rgbColor?: GoogleRgb; themeColor?: string } | undefined): Record<string, string> | null {
  if (!color) return null
  if (color.themeColor) return { themeColor: color.themeColor }
  const hex = hexFromRgb(color.rgbColor)
  return hex ? { fillHex: hex } : null
}

function projectShapeText(shape: NonNullable<GooglePageElement['shape']>): Record<string, unknown> | null {
  const elements = shape.text?.textElements ?? []
  if (elements.length === 0) return null
  const full = elements.map((e) => e.textRun?.content ?? '').join('').slice(0, MAX_TEXT_CONTENT)
  const runs = elements
    .map((e) => projectTextRun(e.textRun))
    .filter((r): r is Record<string, unknown> => r !== null)
    .slice(0, MAX_TEXT_RUNS)
  return { content: full, runs }
}

function projectFill(
  solid: { color?: { rgbColor?: GoogleRgb; themeColor?: string } } | undefined
): string | undefined {
  return hexFromRgb(solid?.color?.rgbColor)
}

/**
 * Project one raw Google PageElement into a bounded factual record. Never invents values.
 * TASK-084: index (array position) drives zIndex — Google exposes no numeric
 * z-index; pageElements[] order IS back-to-front layering (DERIVED, flagged).
 */
export function projectPageElement(el: GooglePageElement, index?: number): Record<string, unknown> {
  const kind = el.elementGroup
    ? 'group'
    : el.shape
      ? 'shape'
      : el.image
        ? 'image'
        : el.video
          ? 'video'
          : el.line
            ? 'line'
            : el.table
              ? 'table'
              : el.wordArt
                ? 'wordArt'
                : el.sheetsChart
                  ? 'sheetsChart'
                  : el.speakerSpotlight
                    ? 'speakerSpotlight'
                    : 'unknown'
  const out: Record<string, unknown> = {
    objectId: el.objectId ?? null,
    kind,
  }
  if (index !== undefined) {
    out.zIndex = index
    out.zIndexDerived = true
  }
  const w = EMU(el.size?.width?.magnitude)
  const h = EMU(el.size?.height?.magnitude)
  if (w !== undefined || h !== undefined) {
    out.size = {
      ...(w !== undefined ? { widthEmu: w, widthPt: ptFromEmu(w) } : {}),
      ...(h !== undefined ? { heightEmu: h, heightPt: ptFromEmu(h) } : {}),
    }
  }
  if (el.transform) {
    const t = el.transform
    const tx = EMU(t.translateX)
    const ty = EMU(t.translateY)
    out.transform = {
      ...(t.scaleX !== undefined ? { scaleX: t.scaleX } : {}),
      ...(t.scaleY !== undefined ? { scaleY: t.scaleY } : {}),
      ...(tx !== undefined ? { translateXEmu: tx, xPt: ptFromEmu(tx) } : {}),
      ...(ty !== undefined ? { translateYEmu: ty, yPt: ptFromEmu(ty) } : {}),
    }
  }
  if (el.title) out.title = el.title
  if (el.description) out.altText = el.description
  if (el.shape) {
    out.shapeType = el.shape.shapeType ?? null
    const text = projectShapeText(el.shape)
    if (text) out.text = text
    // TASK-084: placeholder identity (never dropped — drives native targeting).
    if (el.shape.placeholder) {
      const ph = el.shape.placeholder
      out.placeholder = {
        ...(ph.type ? { type: ph.type } : {}),
        ...(ph.index !== undefined ? { index: ph.index } : {}),
        ...(ph.parentObjectId ? { parentObjectId: ph.parentObjectId } : {}),
      }
    }
    // TASK-084: semantic fill (theme refs preserved; legacy fillHex kept for RGB).
    const bgFill = el.shape.shapeProperties?.shapeBackgroundFill
    const fill = projectColorRef(bgFill?.solidFill?.color)
    if (fill) {
      out.fill = {
        ...fill,
        ...(bgFill?.propertyState ? { state: bgFill.propertyState } : {}),
      }
      if (fill.fillHex) out.fillHex = fill.fillHex
    }
    const oProps = el.shape.shapeProperties?.outline
    const oFill = projectColorRef(oProps?.outlineFill?.solidFill?.color)
    const oW = EMU(oProps?.weight?.magnitude)
    if (oFill || oW !== undefined || oProps?.propertyState) {
      out.outline = {
        ...(oFill ?? {}),
        ...(oW !== undefined ? { weightPt: ptFromEmu(oW) } : {}),
        ...(oProps?.propertyState ? { state: oProps.propertyState } : {}),
      }
    }
  }
  if (el.image) {
    out.image = {
      ...(el.image.contentUrl ? { contentUrl: el.image.contentUrl } : {}),
      ...(el.image.sourceUrl ? { sourceUrl: el.image.sourceUrl } : {}),
      ...(el.image.imageProperties ? { properties: el.image.imageProperties } : {}),
    }
  }
  if (el.video) out.video = { ...(el.video.id ? { id: el.video.id } : {}), ...(el.video.source ? { source: el.video.source } : {}) }
  if (el.line) {
    out.line = {
      ...(el.line.lineCategory ? { category: el.line.lineCategory } : {}),
      ...(el.line.lineProperties?.weight?.magnitude !== undefined
        ? { weightPt: ptFromEmu(el.line.lineProperties.weight.magnitude) }
        : {}),
    }
  }
  if (el.table) {
    out.table = {
      ...(el.table.rows !== undefined ? { rows: el.table.rows } : {}),
      ...(el.table.columns !== undefined ? { columns: el.table.columns } : {}),
    }
  }
  if (el.wordArt) out.wordArt = true
  if (el.sheetsChart) {
    out.sheetsChart = {
      ...(el.sheetsChart.spreadsheetId ? { spreadsheetId: el.sheetsChart.spreadsheetId } : {}),
      ...(el.sheetsChart.chartId !== undefined ? { chartId: el.sheetsChart.chartId } : {}),
    }
  }
  // TASK-085 CORRECTIVE: group membership lives in elementGroup.children
  // (full nested PageElements). Project member IDs plus one bounded level of
  // child detail. Groups cannot nest per Google, so depth 1 is complete.
  if (el.elementGroup) {
    const raw = el.elementGroup.children
    const children: string[] = []
    const members: Array<Record<string, unknown>> = []
    if (Array.isArray(raw)) {
      for (const c of raw) {
        if (!c || typeof c !== 'object') continue
        if (typeof c.objectId === 'string' && c.objectId.length > 0) children.push(c.objectId)
        members.push(projectPageElement(c as GooglePageElement))
      }
    }
    out.group = { children, members }
  }
  if (el.speakerSpotlight) out.speakerSpotlight = true
  return out
}

// ---------------------------------------------------------------------------
// Typed Google Request builders (allowlisted output only)
// ---------------------------------------------------------------------------

export type GoogleRequest = Record<string, unknown>

export type CreateElementType = 'textBox' | 'shape' | 'image' | 'line' | 'table'

export const CREATE_ELEMENT_TYPES: CreateElementType[] = ['textBox', 'shape', 'image', 'line', 'table']

const SHAPE_TYPES = ['RECTANGLE', 'ROUND_RECTANGLE', 'ELLIPSE'] as const
export type AlphaShapeType = (typeof SHAPE_TYPES)[number]

export function asShapeType(v: unknown): AlphaShapeType {
  if (typeof v !== 'string' || !(SHAPE_TYPES as readonly string[]).includes(v)) {
    fail('shapeType', `must be one of ${SHAPE_TYPES.join(', ')}.`)
  }
  return v as AlphaShapeType
}

/**
 * TASK-084: official semantic theme-color keys (OpaqueColor.themeColor).
 * Verified against the Slides discovery document. THEME_COLOR_TYPE_UNSPECIFIED
 * is intentionally excluded (must never be sent).
 */
export const THEME_COLORS = [
  'DARK1',
  'LIGHT1',
  'DARK2',
  'LIGHT2',
  'ACCENT1',
  'ACCENT2',
  'ACCENT3',
  'ACCENT4',
  'ACCENT5',
  'ACCENT6',
  'HYPERLINK',
  'FOLLOWED_HYPERLINK',
  'TEXT1',
  'BACKGROUND1',
  'TEXT2',
  'BACKGROUND2',
] as const
export type ThemeColorKey = (typeof THEME_COLORS)[number]

export function asThemeColor(v: unknown, label: string): ThemeColorKey {
  if (typeof v !== 'string' || !(THEME_COLORS as readonly string[]).includes(v)) {
    fail(label, `must be one of ${THEME_COLORS.join(', ')}.`)
  }
  return v as ThemeColorKey
}

export interface TextStyleInput {
  fontFamily?: string
  fontSizePt?: number
  bold?: boolean
  italic?: boolean
  colorHex?: string
  /** TASK-084: semantic theme color — mutually exclusive with colorHex. */
  colorTheme?: string
}

export function buildTextStyleFields(style: TextStyleInput): { google: Record<string, unknown>; fields: string } {
  const google: Record<string, unknown> = {}
  const fields: string[] = []
  if (style.fontFamily !== undefined) {
    if (typeof style.fontFamily !== 'string' || style.fontFamily.trim() === '') fail('fontFamily', 'must be a non-empty string.')
    google.fontFamily = style.fontFamily.trim()
    fields.push('fontFamily')
  }
  if (style.fontSizePt !== undefined) {
    const n = asPositiveNumber(style.fontSizePt, 'fontSizePt')
    google.fontSize = { magnitude: n, unit: 'PT' }
    fields.push('fontSize')
  }
  if (style.bold !== undefined) {
    if (typeof style.bold !== 'boolean') fail('bold', 'must be a boolean.')
    google.bold = style.bold
    fields.push('bold')
  }
  if (style.italic !== undefined) {
    if (typeof style.italic !== 'boolean') fail('italic', 'must be a boolean.')
    google.italic = style.italic
    fields.push('italic')
  }
  if (style.colorHex !== undefined && style.colorTheme !== undefined) {
    fail('colorHex/colorTheme', 'are mutually exclusive — supply literal hex OR a semantic theme color, not both.')
  }
  if (style.colorHex !== undefined) {
    google.foregroundColor = { opaqueColor: { rgbColor: rgbFromHex(asHexColor(style.colorHex, 'colorHex')) } }
    fields.push('foregroundColor')
  }
  if (style.colorTheme !== undefined) {
    google.foregroundColor = { opaqueColor: { themeColor: asThemeColor(style.colorTheme, 'colorTheme') } }
    fields.push('foregroundColor')
  }
  if (fields.length === 0) fail('textStyle', 'requires at least one of fontFamily, fontSizePt, bold, italic, colorHex.')
  return { google, fields: fields.join(',') }
}

export type TextRangeInput = { mode: 'all' } | { mode: 'range'; startIndex: number; endIndex: number }

export function asTextRange(v: unknown, label: string): TextRangeInput {
  if (v === undefined || v === null) return { mode: 'all' }
  if (typeof v !== 'object') fail(label, "must be omitted (whole text) or {startIndex, endIndex}.")
  const r = v as Record<string, unknown>
  const startIndex = asIntInRange(r.startIndex, `${label}.startIndex`, 0, 1_000_000)
  const endIndex = asIntInRange(r.endIndex, `${label}.endIndex`, 0, 1_000_000)
  if (endIndex <= startIndex) fail(label, 'requires endIndex > startIndex.')
  return { mode: 'range', startIndex, endIndex }
}

export function googleRange(r: TextRangeInput): Record<string, unknown> {
  return r.mode === 'all' ? { type: 'ALL' } : { type: 'FIXED_RANGE', startIndex: r.startIndex, endIndex: r.endIndex }
}

export type AlignmentInput = 'START' | 'CENTER' | 'END'

export function asAlignment(v: unknown): AlignmentInput {
  if (v === 'START' || v === 'CENTER' || v === 'END') return v
  fail('alignment', 'must be START, CENTER or END.')
}

export interface ShapeStyleInput {
  fillHex?: string | 'none'
  /** TASK-084: semantic theme fill — mutually exclusive with fillHex (incl. 'none'). */
  fillThemeColor?: string
  outlineHex?: string
  /** TASK-084: semantic theme outline — mutually exclusive with outlineHex. */
  outlineThemeColor?: string
  outlineWeightPt?: number
}

export function buildShapeStyleFields(style: ShapeStyleInput): { google: Record<string, unknown>; fields: string } {
  // F02 (docs-verified from discovery JSON): SolidFill.color IS OpaqueColor directly.
  // The previous code wrapped color inside opaqueColor, but SolidFill.color = OpaqueColor,
  // which has rgbColor/themeColor as DIRECT properties. OpaqueColor is the type,
  // not a property inside color.
  // Field mask: dotted subfield paths (e.g. "shapeBackgroundFill.solidFill.color").
  const google: Record<string, unknown> = {}
  const fields: string[] = []
  if (style.fillHex !== undefined && style.fillThemeColor !== undefined) {
    fail('fillHex/fillThemeColor', 'are mutually exclusive — supply literal hex, "none", OR a semantic theme color.')
  }
  if (style.fillHex !== undefined) {
    if (style.fillHex === 'none') {
      google.shapeBackgroundFill = { propertyState: 'NOT_RENDERED' }
      fields.push('shapeBackgroundFill.propertyState')
    } else {
      google.shapeBackgroundFill = {
        solidFill: { color: { rgbColor: rgbFromHex(asHexColor(style.fillHex, 'fillHex')) } },
      }
      fields.push('shapeBackgroundFill.solidFill.color')
    }
  }
  if (style.fillThemeColor !== undefined) {
    google.shapeBackgroundFill = {
      solidFill: { color: { themeColor: asThemeColor(style.fillThemeColor, 'fillThemeColor') } },
    }
    fields.push('shapeBackgroundFill.solidFill.color')
  }
  if (style.outlineHex !== undefined || style.outlineThemeColor !== undefined || style.outlineWeightPt !== undefined) {
    if (style.outlineHex !== undefined && style.outlineThemeColor !== undefined) {
      fail('outlineHex/outlineThemeColor', 'are mutually exclusive — supply literal hex OR a semantic theme color.')
    }
    const outline: Record<string, unknown> = {}
    if (style.outlineHex !== undefined) {
      outline.outlineFill = {
        solidFill: { color: { rgbColor: rgbFromHex(asHexColor(style.outlineHex, 'outlineHex')) } },
      }
      fields.push('outline.outlineFill.solidFill.color')
    }
    if (style.outlineThemeColor !== undefined) {
      outline.outlineFill = {
        solidFill: { color: { themeColor: asThemeColor(style.outlineThemeColor, 'outlineThemeColor') } },
      }
      fields.push('outline.outlineFill.solidFill.color')
    }
    if (style.outlineWeightPt !== undefined) {
      outline.weight = dimensionEmuFromPt(asPositiveNumber(style.outlineWeightPt, 'outlineWeightPt'))
      fields.push('outline.weight')
    }
    google.outline = outline
  }
  if (fields.length === 0) fail('shapeStyle', 'requires at least one of fillHex, outlineHex, outlineWeightPt.')
  return { google, fields: fields.join(',') }
}

// --- create builders (return {requests, createdId}) ---

export interface CreateResult {
  requests: GoogleRequest[]
  createdId: string
}

export function buildCreateTextBox(args: {
  pageObjectId: string
  text: string
  rect: AlphaRect
  objectId?: string
  style?: TextStyleInput & { alignment?: AlignmentInput; fillHex?: string }
}): CreateResult {
  const objectId = args.objectId ?? newObjectId('TXTBOX')
  const requests: GoogleRequest[] = [
    {
      createShape: {
        objectId,
        shapeType: 'TEXT_BOX',
        elementProperties: elementProperties(args.pageObjectId, args.rect),
      },
    },
    { insertText: { objectId, insertionIndex: 0, text: args.text } },
  ]
  const style = args.style ?? {}
  const textKeys: TextStyleInput = {
    ...(style.fontFamily !== undefined ? { fontFamily: style.fontFamily } : {}),
    ...(style.fontSizePt !== undefined ? { fontSizePt: style.fontSizePt } : {}),
    ...(style.bold !== undefined ? { bold: style.bold } : {}),
    ...(style.italic !== undefined ? { italic: style.italic } : {}),
    ...(style.colorHex !== undefined ? { colorHex: style.colorHex } : {}),
  }
  if (Object.keys(textKeys).length > 0) {
    const built = buildTextStyleFields(textKeys)
    requests.push({ updateTextStyle: { objectId, style: built.google, textRange: { type: 'ALL' }, fields: built.fields } })
  }
  if (style.alignment !== undefined) {
    requests.push({
      updateParagraphStyle: {
        objectId,
        style: { alignment: asAlignment(style.alignment) },
        textRange: { type: 'ALL' },
        fields: 'alignment',
      },
    })
  }
  if (style.fillHex !== undefined) {
    const built = buildShapeStyleFields({ fillHex: style.fillHex })
    requests.push({ updateShapeProperties: { objectId, shapeProperties: built.google, fields: built.fields } })
  }
  return { requests, createdId: objectId }
}

export function buildCreateShape(args: {
  pageObjectId: string
  shapeType: AlphaShapeType
  rect: AlphaRect
  objectId?: string
  fillHex?: string | 'none'
  outlineHex?: string
  outlineWeightPt?: number
  text?: string
}): CreateResult {
  const objectId = args.objectId ?? newObjectId('SHAPE')
  const requests: GoogleRequest[] = [
    {
      createShape: {
        objectId,
        shapeType: args.shapeType,
        elementProperties: elementProperties(args.pageObjectId, args.rect),
      },
    },
  ]
  if (args.fillHex !== undefined || args.outlineHex !== undefined || args.outlineWeightPt !== undefined) {
    const built = buildShapeStyleFields({
      ...(args.fillHex !== undefined ? { fillHex: args.fillHex } : {}),
      ...(args.outlineHex !== undefined ? { outlineHex: args.outlineHex } : {}),
      ...(args.outlineWeightPt !== undefined ? { outlineWeightPt: args.outlineWeightPt } : {}),
    })
    requests.push({ updateShapeProperties: { objectId, shapeProperties: built.google, fields: built.fields } })
  }
  if (args.text !== undefined && args.text !== '') {
    requests.push({ insertText: { objectId, insertionIndex: 0, text: args.text } })
  }
  return { requests, createdId: objectId }
}

export function buildCreateImage(args: {
  pageObjectId: string
  imageUrl: string
  rect: AlphaRect
  objectId?: string
}): CreateResult {
  const objectId = args.objectId ?? newObjectId('IMG')
  return {
    requests: [
      {
        createImage: {
          objectId,
          url: args.imageUrl,
          elementProperties: elementProperties(args.pageObjectId, args.rect),
        },
      },
    ],
    createdId: objectId,
  }
}

export function buildCreateLine(args: {
  pageObjectId: string
  x1: number
  y1: number
  x2: number
  y2: number
  objectId?: string
}): CreateResult {
  const objectId = args.objectId ?? newObjectId('LINE')
  // Google represents a line by bounding-box size + unit transform.
  // Degenerate (zero-length axis) sizes are clamped to 1pt so the API accepts them.
  const x = Math.min(args.x1, args.x2)
  const y = Math.min(args.y1, args.y2)
  const width = Math.max(Math.abs(args.x2 - args.x1), 1)
  const height = Math.max(Math.abs(args.y2 - args.y1), 1)
  return {
    requests: [
      {
        createLine: {
          objectId,
          lineCategory: 'STRAIGHT',
          elementProperties: elementProperties(args.pageObjectId, { x, y, width, height }),
        },
      },
    ],
    createdId: objectId,
  }
}

export function buildCreateTable(args: {
  pageObjectId: string
  rows: number
  columns: number
  rect: AlphaRect
  objectId?: string
}): CreateResult {
  const objectId = args.objectId ?? newObjectId('TABLE')
  return {
    requests: [
      {
        createTable: {
          objectId,
          rows: args.rows,
          columns: args.columns,
          elementProperties: elementProperties(args.pageObjectId, args.rect),
        },
      },
    ],
    createdId: objectId,
  }
}

// --- mutation builders ---

export type TextMutationMode = 'set' | 'insert' | 'delete'

export function buildTextMutation(args: {
  objectId: string
  mode: TextMutationMode
  text?: string
  startIndex?: number
  endIndex?: number
}): GoogleRequest[] {
  const { objectId, mode } = args
  if (mode === 'set') {
    const text = asText(args.text, 'text', 5000)
    return [
      { deleteText: { objectId, textRange: { type: 'ALL' } } },
      { insertText: { objectId, insertionIndex: 0, text } },
    ]
  }
  if (mode === 'insert') {
    const text = asText(args.text, 'text', 5000)
    const at = args.startIndex === undefined ? 0 : asIntInRange(args.startIndex, 'startIndex', 0, 1_000_000)
    return [{ insertText: { objectId, insertionIndex: at, text } }]
  }
  // delete
  if (args.startIndex === undefined || args.endIndex === undefined) {
    fail('delete', 'requires explicit startIndex and endIndex (destructive text deletion is never implicit).')
  }
  const startIndex = asIntInRange(args.startIndex, 'startIndex', 0, 1_000_000)
  const endIndex = asIntInRange(args.endIndex, 'endIndex', 0, 1_000_000)
  if (endIndex <= startIndex) fail('delete', 'requires endIndex > startIndex.')
  return [{ deleteText: { objectId, textRange: { type: 'FIXED_RANGE', startIndex, endIndex } } }]
}

export function buildUpdateTextStyle(args: {
  objectId: string
  style: TextStyleInput
  range?: TextRangeInput
}): GoogleRequest {
  const built = buildTextStyleFields(args.style)
  return {
    updateTextStyle: {
      objectId: args.objectId,
      style: built.google,
      textRange: googleRange(args.range ?? { mode: 'all' }),
      fields: built.fields,
    },
  }
}

export function buildUpdateParagraphStyle(args: { objectId: string; alignment: AlignmentInput; range?: TextRangeInput }): GoogleRequest {
  return {
    updateParagraphStyle: {
      objectId: args.objectId,
      style: { alignment: args.alignment },
      textRange: googleRange(args.range ?? { mode: 'all' }),
      fields: 'alignment',
    },
  }
}

export function buildUpdateShapeStyle(args: { objectId: string; style: ShapeStyleInput }): GoogleRequest {
  const built = buildShapeStyleFields(args.style)
  return { updateShapeProperties: { objectId: args.objectId, shapeProperties: built.google, fields: built.fields } }
}

export function buildUpdateTransform(args: { objectId: string; rect: AlphaRect }): GoogleRequest {
  // C08 CORRECTIVE: UpdatePageElementTransformRequest accepts ONLY
  // {objectId, transform, applyMode} — the previous implementation emitted a
  // non-existent top-level `size` field, so every transform was rejected.
  // Absolute move/resize is expressed SOLELY through the AffineTransform:
  // translate for position, scale factors (vs current size) for dimensions.
  // Use buildAbsoluteTransform() with live element geometry instead.
  // Retained only so existing imports keep compiling; delegates with the
  // only semantics expressible without a read (move, preserving unit scale).
  return {
    updatePageElementTransform: {
      objectId: args.objectId,
      applyMode: 'ABSOLUTE',
      transform: {
        scaleX: 1,
        scaleY: 1,
        translateX: emuFromPt(args.rect.x),
        translateY: emuFromPt(args.rect.y),
        unit: 'EMU',
      },
    },
  }
}

export interface PartialRect {
  x?: number
  y?: number
  width?: number
  height?: number
}

/**
 * C08: partial geometry for transform updates. Move requires x AND y;
 * resize requires width AND height; at least one pair must be present.
 * Singles are rejected explicitly (no silent half-updates).
 */
export function asPartialRect(args: Record<string, unknown>, label: string): PartialRect {
  const pick = (k: string): number | undefined => {
    const v = args[k]
    if (v === undefined || v === null) return undefined
    return asFiniteNumber(v, `${label}.${k}`)
  }
  const x = pick('x')
  const y = pick('y')
  const width = pick('width')
  const height = pick('height')
  if ((x === undefined) !== (y === undefined)) fail(label, 'move requires x AND y together.')
  if ((width === undefined) !== (height === undefined)) fail(label, 'resize requires width AND height together.')
  if (width !== undefined && width <= 0) fail(`${label}.width`, 'must be positive.')
  if (height !== undefined && height <= 0) fail(`${label}.height`, 'must be positive.')
  if (x === undefined && width === undefined) {
    fail(label, 'requires a move pair (x, y), a resize pair (width, height), or both.')
  }
  return { ...(x !== undefined ? { x, y: y as number } : {}), ...(width !== undefined ? { width, height: height as number } : {}) }
}

/** Live element geometry read from Google (sizes in EMU, scales/shears unitless). */
export interface ElementGeometry {
  sizeWEmu: number
  sizeHEmu: number
  scaleX: number
  scaleY: number
  shearX: number
  shearY: number
  translateXEmu: number
  translateYEmu: number
}

const GEOMETRY_FIELDS = 'slides(objectId,pageElements(objectId,size,transform))'

async function fetchDeckGeometries(token: string, presentationId: string): Promise<Map<string, ElementGeometry>> {
  const pres = await googleRequest<{
    slides?: Array<{
      objectId?: string
      pageElements?: Array<{
        objectId?: string
        size?: { width?: { magnitude?: number }; height?: { magnitude?: number } }
        transform?: {
          scaleX?: number
          scaleY?: number
          shearX?: number
          shearY?: number
          translateX?: number
          translateY?: number
        }
      }>
    }>
  }>({
    method: 'GET',
    url: `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    params: { fields: GEOMETRY_FIELDS },
    token,
  })
  const map = new Map<string, ElementGeometry>()
  for (const slide of pres.slides ?? []) {
    for (const el of slide.pageElements ?? []) {
      if (!el.objectId || map.has(el.objectId)) continue
      map.set(el.objectId, {
        sizeWEmu: el.size?.width?.magnitude ?? 0,
        sizeHEmu: el.size?.height?.magnitude ?? 0,
        scaleX: el.transform?.scaleX ?? 1,
        scaleY: el.transform?.scaleY ?? 1,
        shearX: el.transform?.shearX ?? 0,
        shearY: el.transform?.shearY ?? 0,
        translateXEmu: el.transform?.translateX ?? 0,
        translateYEmu: el.transform?.translateY ?? 0,
      })
    }
  }
  return map
}

/** Read one top-level element's live geometry. Nested group children are not addressable. */
export async function fetchElementGeometry(
  token: string,
  presentationId: string,
  objectId: string
): Promise<ElementGeometry> {
  const map = await fetchDeckGeometries(token, presentationId)
  const geo = map.get(objectId)
  if (!geo) {
    fail('objectId', 'not found among top-level page elements (nested group children cannot be transformed directly).')
  }
  return geo as ElementGeometry
}

/**
 * C08: compose a VALID absolute transform from Alpha PT geometry + live state.
 * Move: new translate, current scales preserved. Resize: scales recomputed vs
 * current EMU size, translate preserved. Both: new translate + new scales.
 * Shear is preserved verbatim. Zero-size current elements are rejected.
 */
export function buildAbsoluteTransform(objectId: string, rect: PartialRect, cur: ElementGeometry): GoogleRequest {
  if (cur.sizeWEmu <= 0 || cur.sizeHEmu <= 0) {
    fail('transform', 'current element has no readable size; resize is not computable.')
  }
  const scaleX = rect.width !== undefined ? emuFromPt(rect.width) / cur.sizeWEmu : cur.scaleX
  const scaleY = rect.height !== undefined ? emuFromPt(rect.height) / cur.sizeHEmu : cur.scaleY
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    fail('transform', 'computed scale is not positive-finite.')
  }
  return {
    updatePageElementTransform: {
      objectId,
      applyMode: 'ABSOLUTE',
      transform: {
        scaleX,
        scaleY,
        shearX: cur.shearX,
        shearY: cur.shearY,
        translateX: rect.x !== undefined ? emuFromPt(rect.x) : cur.translateXEmu,
        translateY: rect.y !== undefined ? emuFromPt(rect.y as number) : cur.translateYEmu,
        unit: 'EMU',
      },
    },
  }
}

export function buildDeleteObject(objectId: string): GoogleRequest {
  return { deleteObject: { objectId } }
}

// ---------------------------------------------------------------------------
// TASK-084: design-system builders (page background, layout slides, z-order, group)
// ---------------------------------------------------------------------------

export interface PageBackgroundInput {
  backgroundHex?: string
  backgroundThemeColor?: string
}

/** TASK-084: native page background (UpdatePagePropertiesRequest, documented mask). */
export function buildUpdatePageBackground(
  pageObjectId: string,
  input: PageBackgroundInput
): GoogleRequest {
  if (input.backgroundHex !== undefined && input.backgroundThemeColor !== undefined) {
    fail('backgroundHex/backgroundThemeColor', 'are mutually exclusive — supply literal hex OR a semantic theme color.')
  }
  let color: Record<string, unknown>
  if (input.backgroundHex !== undefined) {
    color = { rgbColor: rgbFromHex(asHexColor(input.backgroundHex, 'backgroundHex')) }
  } else if (input.backgroundThemeColor !== undefined) {
    color = { themeColor: asThemeColor(input.backgroundThemeColor, 'backgroundThemeColor') }
  } else {
    fail('pageBackground', 'requires backgroundHex OR backgroundThemeColor.')
  }
  return {
    updatePageProperties: {
      objectId: pageObjectId,
      pageProperties: { pageBackgroundFill: { solidFill: { color } } },
      fields: 'pageBackgroundFill.solidFill.color',
    },
  }
}

export interface CreateSlideInput {
  layoutId?: string
  slideObjectId?: string
  insertionIndex?: number
  placeholderMappings?: Array<{ layoutPlaceholderObjectId: string; slidePlaceholderObjectId: string }>
}

/**
 * TASK-084: layout-aware slide creation (CreateSlideRequest). No layout →
 * blank/default (legacy behavior preserved). Layout must belong to the current
 * master (Google returns 400 otherwise); placeholder mappings require a layout.
 */
export function buildCreateSlide(input: CreateSlideInput): GoogleRequest {
  const req: Record<string, unknown> = {}
  if (input.slideObjectId !== undefined) {
    req.objectId = asResourceId(input.slideObjectId, 'slideObjectId')
  }
  if (input.insertionIndex !== undefined) {
    req.insertionIndex = asIntInRange(input.insertionIndex, 'insertionIndex', 0, 10000)
  }
  if (input.layoutId !== undefined) {
    req.slideLayoutReference = { layoutId: asResourceId(input.layoutId, 'layoutId') }
  }
  if (input.placeholderMappings !== undefined) {
    if (input.layoutId === undefined) {
      fail('placeholderMappings', 'requires layoutId (mappings only apply to layout-created slides).')
    }
    if (!Array.isArray(input.placeholderMappings) || input.placeholderMappings.length === 0) {
      fail('placeholderMappings', 'must be a non-empty array when supplied.')
    }
    req.placeholderIdMappings = input.placeholderMappings.map((m, i) => {
      if (!m || typeof m !== 'object') fail(`placeholderMappings[${i}]`, 'must be an object.')
      return {
        layoutPlaceholderObjectId: asResourceId(
          (m as Record<string, unknown>).layoutPlaceholderObjectId,
          `placeholderMappings[${i}].layoutPlaceholderObjectId`
        ),
        objectId: asResourceId((m as Record<string, unknown>).slidePlaceholderObjectId, `placeholderMappings[${i}].slidePlaceholderObjectId`),
      }
    })
  }
  return { createSlide: req }
}

export const ZORDER_OPERATIONS = ['BRING_TO_FRONT', 'BRING_FORWARD', 'SEND_BACKWARD', 'SEND_TO_BACK'] as const
export type ZOrderOperation = (typeof ZORDER_OPERATIONS)[number]

export function asZOrderOperation(v: unknown): ZOrderOperation {
  if (typeof v !== 'string' || !(ZORDER_OPERATIONS as readonly string[]).includes(v)) {
    fail('operation', `must be one of ${ZORDER_OPERATIONS.join(', ')}.`)
  }
  return v as ZOrderOperation
}

/** TASK-084: layering (UpdatePageElementsZOrderRequest). Google enforces same-page + ungrouped. */
export function buildZOrder(objectIds: string[], operation: ZOrderOperation): GoogleRequest {
  if (!Array.isArray(objectIds) || objectIds.length === 0) {
    fail('objectIds', 'must be a non-empty array of element objectIds.')
  }
  if (objectIds.length > MAX_BATCH_OPS) {
    fail('objectIds', `exceeds the maximum of ${MAX_BATCH_OPS} elements per z-order operation.`)
  }
  // Runtime validation even though the type is nominal — exported builders
  // must reject forged enum values without relying on callers.
  const op = asZOrderOperation(operation)
  return {
    updatePageElementsZOrder: {
      pageElementObjectIds: objectIds.map((id) => asResourceId(id, 'objectIds[]')),
      operation: op,
    },
  }
}

/** TASK-084: grouping (GroupObjectsRequest). Videos/tables/placeholders excluded by Google. */
export function buildGroupObjects(childObjectIds: string[], groupObjectId?: string): GoogleRequest {
  if (!Array.isArray(childObjectIds) || childObjectIds.length < 2) {
    fail('childObjectIds', 'requires at least two element objectIds on the same page.')
  }
  if (childObjectIds.length > MAX_BATCH_OPS) {
    fail('childObjectIds', `exceeds the maximum of ${MAX_BATCH_OPS} elements per group operation.`)
  }
  return {
    groupObjects: {
      ...(groupObjectId ? { groupObjectId: asResourceId(groupObjectId, 'groupObjectId') } : {}),
      childrenObjectIds: childObjectIds.map((id) => asResourceId(id, 'childObjectIds[]')),
    },
  }
}

export function buildDuplicateObject(objectId: string, requestedId?: string): GoogleRequest {
  return {
    duplicateObject: {
      objectId,
      ...(requestedId ? { objectIds: { [objectId]: requestedId } } : {}),
    },
  }
}

/** Best-effort extraction of created/duplicated objectIds from batch replies. Never fakes IDs. */
export function extractReplyObjectIds(replies: Array<Record<string, unknown>> | undefined): Array<Record<string, string>> {
  if (!replies) return []
  const out: Array<Record<string, string>> = []
  for (const reply of replies) {
    const found: Record<string, string> = {}
    for (const [key, value] of Object.entries(reply ?? {})) {
      if (value && typeof value === 'object') {
        const oid = (value as Record<string, unknown>).objectId
        if (typeof oid === 'string' && oid) found[key] = oid
      }
    }
    if (Object.keys(found).length > 0) out.push(found)
  }
  return out
}

// ---------------------------------------------------------------------------
// Batch operation dispatcher (allowlisted; unknown kinds rejected)
// ---------------------------------------------------------------------------

export type BatchOpKind =
  | 'create'
  | 'text'
  | 'textStyle'
  | 'paragraphStyle'
  | 'shapeStyle'
  | 'transform'
  | 'delete'
  | 'duplicate'
  | 'pageBackground'
  | 'zorder'
  | 'group'

export const BATCH_OP_KINDS: BatchOpKind[] = [
  'create',
  'text',
  'textStyle',
  'paragraphStyle',
  'shapeStyle',
  'transform',
  'delete',
  'duplicate',
  'pageBackground',
  'zorder',
  'group',
]

/** TASK-084: projected kind info for page-context validation (group/zorder). */
export interface PageElementKindInfo {
  kind: string
  isPlaceholder: boolean
}

/**
 * TASK-084: read one page's element kinds (bounded single-page read).
 * Used to validate group/zorder ops before any mutation.
 */
export async function fetchPageKindMap(
  token: string,
  presentationId: string,
  pageObjectId: string
): Promise<Map<string, PageElementKindInfo>> {  const pres = await googleRequest<{
    slides?: Array<{ objectId?: string; pageElements?: GooglePageElement[] }>
  }>({
    method: 'GET',
    url: `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    params: { fields: 'slides.objectId,slides.pageElements' },
    token,
  })
  const slide = (pres.slides ?? []).find((s) => s.objectId === pageObjectId)
  if (!slide) fail('pageObjectId', 'does not match any slide in this presentation.')
  const map = new Map<string, PageElementKindInfo>()
  slide.pageElements?.forEach((el, i) => {
    if (!el.objectId) return
    const projected = projectPageElement(el, i)
    map.set(el.objectId, {
      kind: String(projected.kind ?? 'unknown'),
      isPlaceholder: projected.placeholder !== undefined,
    })
  })
  return map
}

/**
 * TASK-086: authoritative page snapshot for responsive composition.
 * One GET returns live pageSize + projected page elements (rect in PT,
 * placeholder identity, text content). Pure geometry decisions consume this
 * via geometry.ts — this function only fetches and projects, never lays out.
 */
export interface PageSnapshotElement {
  objectId: string
  kind: string
  rectPt: { x: number; y: number; w: number; h: number } | null
  placeholderType?: string
  placeholderIndex?: number
  text: string
}

export interface PageSnapshot {
  pageWidthPt: number
  pageHeightPt: number
  elements: PageSnapshotElement[]
}

function snapshotRect(projected: Record<string, unknown>): PageSnapshotElement['rectPt'] {
  const size = (projected.size ?? {}) as Record<string, unknown>
  const tr = (projected.transform ?? {}) as Record<string, unknown>
  const w = typeof size.widthPt === 'number' ? size.widthPt : null
  const h = typeof size.heightPt === 'number' ? size.heightPt : null
  const x = typeof tr.xPt === 'number' ? tr.xPt : null
  const y = typeof tr.yPt === 'number' ? tr.yPt : null
  if (w === null || h === null || x === null || y === null) return null
  const sx = typeof tr.scaleX === 'number' && Number.isFinite(tr.scaleX) ? tr.scaleX : 1
  const sy = typeof tr.scaleY === 'number' && Number.isFinite(tr.scaleY) ? tr.scaleY : 1
  return { x, y, w: w * sx, h: h * sy }
}

function snapshotText(projected: Record<string, unknown>): string {
  const text = (projected.text ?? {}) as Record<string, unknown>
  return typeof text.content === 'string' ? (text.content as string) : ''
}

export async function fetchPageSnapshot(
  token: string,
  presentationId: string,
  pageObjectId: string
): Promise<PageSnapshot> {
  const pres = await googleRequest<{
    pageSize?: { width?: { magnitude?: number; unit?: string }; height?: { magnitude?: number; unit?: string } }
    slides?: Array<{ objectId?: string; pageElements?: GooglePageElement[] }>
  }>({
    method: 'GET',
    url: `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    params: { fields: 'pageSize,slides.objectId,slides.pageElements' },
    token,
  })
  const toPt = (magnitude: number | undefined, unit: string | undefined): number | null => {
    if (typeof magnitude !== 'number' || !Number.isFinite(magnitude) || magnitude <= 0) return null
    return unit === 'PT' ? magnitude : ptFromEmu(magnitude)
  }
  const pageWidthPt = toPt(pres.pageSize?.width?.magnitude, pres.pageSize?.width?.unit)
  const pageHeightPt = toPt(pres.pageSize?.height?.magnitude, pres.pageSize?.height?.unit)
  if (pageWidthPt === null || pageHeightPt === null) {
    fail('pageSize', 'presentation did not return a usable pageSize; cannot compose responsively.')
  }
  const slide = (pres.slides ?? []).find((s) => s.objectId === pageObjectId)
  if (!slide) fail('pageObjectId', 'does not match any slide in this presentation.')
  const elements: PageSnapshotElement[] = []
  for (const el of slide.pageElements ?? []) {
    if (!el.objectId) continue
    const projected = projectPageElement(el)
    const ph = (projected.placeholder ?? {}) as Record<string, unknown>
    elements.push({
      objectId: el.objectId,
      kind: String(projected.kind ?? 'unknown'),
      rectPt: snapshotRect(projected),
      ...(typeof ph.type === 'string' ? { placeholderType: ph.type } : {}),
      ...(typeof ph.index === 'number' ? { placeholderIndex: ph.index } : {}),
      text: snapshotText(projected),
    })
  }
  return { pageWidthPt, pageHeightPt, elements }
}

/** TASK-084: validate group children against live page kinds (docs exclusions). */
export function validateGroupChildren(
  childObjectIds: string[],
  kinds: Map<string, PageElementKindInfo>,
  label: string
): void {
  for (const id of childObjectIds) {
    const info = kinds.get(id)
    if (!info) fail(label, `objectId ${id} is not a top-level element of the target page (nested group children cannot be grouped).`)
    if (info.isPlaceholder) fail(label, `objectId ${id} is a placeholder — placeholders cannot be grouped.`)
    if (info.kind === 'table' || info.kind === 'video') {
      fail(label, `objectId ${id} is a ${info.kind} — tables and videos cannot be grouped.`)
    }
    if (info.kind === 'group') fail(label, `objectId ${id} is already a group — nested groups are not supported.`)
  }
}

/** TASK-084: validate z-order targets (same page, ungrouped per Google constraints). */
export function validateZOrderTargets(
  objectIds: string[],
  kinds: Map<string, PageElementKindInfo>,
  label: string
): void {
  for (const id of objectIds) {
    const info = kinds.get(id)
    if (!info) fail(label, `objectId ${id} is not a top-level element of the target page.`)
    if (info.kind === 'group') fail(label, `objectId ${id} is a group — reorder its members individually.`)
  }
}

export function buildBatchOperation(
  op: Record<string, unknown>,
  geoCtx?: Map<string, ElementGeometry>,
  pageCtx?: Map<string, Map<string, PageElementKindInfo>>
): { requests: GoogleRequest[]; createdIds: string[] } {
  const kind = op.op
  if (typeof kind !== 'string' || !(BATCH_OP_KINDS as string[]).includes(kind)) {
    fail('operations[].op', `must be one of the allowlisted operations ${BATCH_OP_KINDS.join(', ')}. Raw Google requests are prohibited.`)
  }
  switch (kind as BatchOpKind) {
    case 'create':
      return buildCreateOperation(op)
    case 'text': {
      const objectId = asResourceId(op.objectId, 'operations[].objectId')
      const mode = op.mode
      if (mode !== 'set' && mode !== 'insert' && mode !== 'delete') fail('operations[].mode', "must be 'set', 'insert' or 'delete'.")
      return {
        requests: buildTextMutation({
          objectId,
          mode,
          ...(op.text !== undefined ? { text: op.text as string } : {}),
          ...(op.startIndex !== undefined ? { startIndex: op.startIndex as number } : {}),
          ...(op.endIndex !== undefined ? { endIndex: op.endIndex as number } : {}),
        }),
        createdIds: [],
      }
    }
    case 'textStyle': {
      const objectId = asResourceId(op.objectId, 'operations[].objectId')
      return {
        requests: [
          buildUpdateTextStyle({
            objectId,
            style: readTextStyleInput(op, 'operations[]'),
            range: asTextRange(op.range, 'operations[].range'),
          }),
        ],
        createdIds: [],
      }
    }
    case 'paragraphStyle': {
      const objectId = asResourceId(op.objectId, 'operations[].objectId')
      return {
        requests: [
          buildUpdateParagraphStyle({ objectId, alignment: asAlignment(op.alignment), range: asTextRange(op.range, 'operations[].range') }),
        ],
        createdIds: [],
      }
    }
    case 'shapeStyle': {
      const objectId = asResourceId(op.objectId, 'operations[].objectId')
      return {
        requests: [buildUpdateShapeStyle({ objectId, style: readShapeStyleInput(op, 'operations[]') })],
        createdIds: [],
      }
    }
    case 'transform': {
      const objectId = asResourceId(op.objectId, 'operations[].objectId')
      const rect = asPartialRect(op, 'operations[]')
      const cur = geoCtx?.get(objectId)
      if (!cur) {
        fail('operations[].transform', 'requires live element geometry (batch handler reads it once per batch).')
      }
      return { requests: [buildAbsoluteTransform(objectId, rect, cur as ElementGeometry)], createdIds: [] }
    }
    case 'delete': {
      return { requests: [buildDeleteObject(asResourceId(op.objectId, 'operations[].objectId'))], createdIds: [] }
    }
    case 'duplicate': {
      const objectId = asResourceId(op.objectId, 'operations[].objectId')
      return {
        requests: [buildDuplicateObject(objectId, asOptionalResourceId(op.requestedId, 'operations[].requestedId'))],
        createdIds: [],
      }
    }
    case 'pageBackground': {
      const pageObjectId = asResourceId(op.pageObjectId, 'operations[].pageObjectId')
      const input: PageBackgroundInput = {}
      if (op.backgroundHex !== undefined) input.backgroundHex = op.backgroundHex as string
      if (op.backgroundThemeColor !== undefined) input.backgroundThemeColor = op.backgroundThemeColor as string
      return { requests: [buildUpdatePageBackground(pageObjectId, input)], createdIds: [] }
    }
    case 'zorder': {
      const pageObjectId = asResourceId(op.pageObjectId, 'operations[].pageObjectId')
      const rawIds = op.objectIds
      if (!Array.isArray(rawIds) || rawIds.length === 0) fail('operations[].objectIds', 'must be a non-empty array.')
      const ids = rawIds.map((id) => asResourceId(id, 'operations[].objectIds[]'))
      const kinds = pageCtx?.get(pageObjectId)
      if (!kinds) fail('operations[].zorder', 'requires live page context (batch handler reads the page once per batch).')
      validateZOrderTargets(ids, kinds, 'operations[]')
      return { requests: [buildZOrder(ids, asZOrderOperation(op.operation))], createdIds: [] }
    }
    case 'group': {
      const pageObjectId = asResourceId(op.pageObjectId, 'operations[].pageObjectId')
      const rawIds = op.childObjectIds
      if (!Array.isArray(rawIds)) fail('operations[].childObjectIds', 'must be an array of at least two objectIds.')
      const ids = rawIds.map((id) => asResourceId(id, 'operations[].childObjectIds[]'))
      const kinds = pageCtx?.get(pageObjectId)
      if (!kinds) fail('operations[].group', 'requires live page context (batch handler reads the page once per batch).')
      validateGroupChildren(ids, kinds, 'operations[]')
      return {
        requests: [buildGroupObjects(ids, asOptionalResourceId(op.groupObjectId, 'operations[].groupObjectId'))],
        createdIds: [],
      }
    }
  }
}

function readTextStyleInput(op: Record<string, unknown>, label: string): TextStyleInput {
  const style: TextStyleInput = {}
  if (op.fontFamily !== undefined) style.fontFamily = op.fontFamily as string
  if (op.fontSizePt !== undefined) style.fontSizePt = op.fontSizePt as number
  if (op.bold !== undefined) {
    if (typeof op.bold !== 'boolean') fail(`${label}.bold`, 'must be a boolean.')
    style.bold = op.bold
  }
  if (op.italic !== undefined) {
    if (typeof op.italic !== 'boolean') fail(`${label}.italic`, 'must be a boolean.')
    style.italic = op.italic
  }
  if (op.colorHex !== undefined) style.colorHex = op.colorHex as string
  if (op.colorTheme !== undefined) style.colorTheme = op.colorTheme as string
  return style
}

function readShapeStyleInput(op: Record<string, unknown>, label: string): ShapeStyleInput {
  const style: ShapeStyleInput = {}
  if (op.fillHex !== undefined) style.fillHex = op.fillHex as string
  if (op.fillThemeColor !== undefined) style.fillThemeColor = op.fillThemeColor as string
  if (op.outlineHex !== undefined) style.outlineHex = op.outlineHex as string
  if (op.outlineThemeColor !== undefined) style.outlineThemeColor = op.outlineThemeColor as string
  if (op.outlineWeightPt !== undefined) style.outlineWeightPt = op.outlineWeightPt as number
  return style
}

function buildCreateOperation(op: Record<string, unknown>): { requests: GoogleRequest[]; createdIds: string[] } {
  const pageObjectId = asResourceId(op.pageObjectId, 'operations[].pageObjectId')
  const type = op.type
  if (typeof type !== 'string' || !(CREATE_ELEMENT_TYPES as string[]).includes(type)) {
    fail('operations[].type', `must be one of ${CREATE_ELEMENT_TYPES.join(', ')}.`)
  }
  const objectId = asOptionalResourceId(op.objectId, 'operations[].objectId')
  const withId = objectId ? { objectId } : {}
  switch (type as CreateElementType) {
    case 'textBox': {
      const r = buildCreateTextBox({
        pageObjectId,
        text: asText(op.text, 'operations[].text', 5000),
        rect: asRect(op, 'operations[]'),
        ...withId,
      })
      return { requests: r.requests, createdIds: [r.createdId] }
    }
    case 'shape': {
      const r = buildCreateShape({
        pageObjectId,
        shapeType: asShapeType(op.shapeType),
        rect: asRect(op, 'operations[]'),
        ...withId,
      })
      return { requests: r.requests, createdIds: [r.createdId] }
    }
    case 'image': {
      const r = buildCreateImage({
        pageObjectId,
        imageUrl: asHttpUrl(op.imageUrl, 'operations[].imageUrl'),
        rect: asRect(op, 'operations[]'),
        ...withId,
      })
      return { requests: r.requests, createdIds: [r.createdId] }
    }
    case 'line': {
      const r = buildCreateLine({
        pageObjectId,
        x1: asFiniteNumber(op.x1, 'operations[].x1'),
        y1: asFiniteNumber(op.y1, 'operations[].y1'),
        x2: asFiniteNumber(op.x2, 'operations[].x2'),
        y2: asFiniteNumber(op.y2, 'operations[].y2'),
        ...withId,
      })
      return { requests: r.requests, createdIds: [r.createdId] }
    }
    case 'table': {
      const r = buildCreateTable({
        pageObjectId,
        rows: asIntInRange(op.rows, 'operations[].rows', 1, 20),
        columns: asIntInRange(op.columns, 'operations[].columns', 1, 20),
        rect: asRect(op, 'operations[]'),
        ...withId,
      })
      return { requests: r.requests, createdIds: [r.createdId] }
    }
  }
}

// ---------------------------------------------------------------------------
// Tool handlers (token + args -> MCP text result). Network via shared rest.ts.
// ---------------------------------------------------------------------------

export interface McpTextResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export function textResult(result: unknown): McpTextResult {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}

/** Execute one batchUpdate and return ids + reply count (shared by compose). */
export async function executeBatch(
  token: string,
  presentationId: string,
  requests: GoogleRequest[]
): Promise<{ createdIds: string[]; appliedRequests: number }> {
  const res = await batchUpdate(token, presentationId, requests)
  const createdIds: string[] = []
  for (const ids of extractReplyObjectIds(res.replies)) {
    for (const id of Object.values(ids)) createdIds.push(id)
  }
  return { createdIds, appliedRequests: requests.length }
}

async function batchUpdate(
  token: string,
  presentationId: string,
  requests: GoogleRequest[]
): Promise<{ presentationId: string; replies?: Array<Record<string, unknown>> }> {
  return googleRequest<{ presentationId: string; replies?: Array<Record<string, unknown>> }>({
    method: 'POST',
    url: `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    body: { requests },
    token,
  })
}

const PAGE_FIELDS =
  'presentationId,title,revisionId,pageSize,slides.objectId,slides.pageElements,slides.slideProperties,slides.layoutProperties,slides.pageProperties'

export interface SlideDesignContext {
  layoutObjectId?: string
  masterObjectId?: string
  pageBackground?: Record<string, unknown> | null
}

/** TASK-084: project PageProperties.pageBackgroundFill (native background, inherited-aware). */
export function projectPageBackground(
  props: { pageBackgroundFill?: { propertyState?: string; solidFill?: { color?: { rgbColor?: GoogleRgb; themeColor?: string } } } } | undefined
): Record<string, unknown> | null {
  const fill = props?.pageBackgroundFill
  if (!fill) return null
  const color = projectColorRef(fill.solidFill?.color)
  if (!color && !fill.propertyState) return null
  return {
    ...(color ?? {}),
    ...(fill.propertyState ? { state: fill.propertyState } : {}),
  }
}

export async function handleGetPage(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const presentationId = asResourceId(args.presentationId, 'presentationId')
  const pageObjectId = asResourceId(args.pageObjectId, 'pageObjectId')
  const pres = await googleRequest<{
    presentationId: string
    title: string
    revisionId?: string
    slides?: Array<{
      objectId?: string
      pageElements?: GooglePageElement[]
      slideProperties?: { layoutObjectId?: string; masterObjectId?: string }
      layoutProperties?: { masterObjectId?: string; name?: string; displayName?: string }
      pageProperties?: { pageBackgroundFill?: { propertyState?: string; solidFill?: { color?: { rgbColor?: GoogleRgb; themeColor?: string } } } }
    }>
  }>({
    method: 'GET',
    url: `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    params: { fields: PAGE_FIELDS },
    token,
  })
  const slide = (pres.slides ?? []).find((s) => s.objectId === pageObjectId)
  if (!slide) fail('pageObjectId', 'does not match any slide in this presentation.')
  const elements = (slide.pageElements ?? []).map((el, i) => projectPageElement(el, i))
  return textResult({
    presentationId: pres.presentationId,
    title: pres.title,
    revisionId: pres.revisionId ?? null,
    pageObjectId,
    // TASK-084: native design-system relationships (read-only from Google).
    layoutObjectId: slide.slideProperties?.layoutObjectId ?? null,
    masterObjectId: slide.slideProperties?.masterObjectId ?? slide.layoutProperties?.masterObjectId ?? null,
    pageBackground: projectPageBackground(slide.pageProperties),
    elementCount: elements.length,
    elements,
  })
}

export interface CreateElementArgs {
  type: CreateElementType
  pageObjectId: string
  objectId?: string
  rect?: AlphaRect
  text?: string
  shapeType?: AlphaShapeType
  imageUrl?: string
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  rows?: number
  columns?: number
  style?: TextStyleInput & { alignment?: AlignmentInput; fillHex?: string }
  fillHex?: string | 'none'
  outlineHex?: string
  outlineWeightPt?: number
}

export function buildCreateElementRequests(kind: CreateElementType, pageObjectId: string, a: CreateElementArgs): CreateResult {
  const withId = a.objectId ? { objectId: a.objectId } : {}
  switch (kind) {
    case 'textBox': {
      if (!a.rect) fail('geometry', 'textBox requires x, y, width, height (PT).')
      return buildCreateTextBox({
        pageObjectId,
        text: asText(a.text, 'text', 5000),
        rect: a.rect as AlphaRect,
        ...withId,
        ...(a.style ? { style: a.style } : {}),
      })
    }
    case 'shape': {
      if (!a.rect) fail('geometry', 'shape requires x, y, width, height (PT).')
      if (!a.shapeType) fail('shapeType', 'is required (RECTANGLE, ROUND_RECTANGLE, ELLIPSE).')
      return buildCreateShape({
        pageObjectId,
        shapeType: a.shapeType,
        rect: a.rect as AlphaRect,
        ...withId,
        ...(a.fillHex !== undefined ? { fillHex: a.fillHex } : {}),
        ...(a.outlineHex !== undefined ? { outlineHex: a.outlineHex } : {}),
        ...(a.outlineWeightPt !== undefined ? { outlineWeightPt: a.outlineWeightPt } : {}),
        ...(a.text !== undefined && a.text !== '' ? { text: a.text } : {}),
      })
    }
    case 'image': {
      if (!a.rect) fail('geometry', 'image requires x, y, width, height (PT).')
      if (!a.imageUrl) fail('imageUrl', 'is required (http/https URL).')
      return buildCreateImage({ pageObjectId, imageUrl: a.imageUrl, rect: a.rect as AlphaRect, ...withId })
    }
    case 'line': {
      if (a.x1 === undefined || a.y1 === undefined || a.x2 === undefined || a.y2 === undefined) {
        fail('geometry', 'line requires x1, y1, x2, y2 (PT).')
      }
      return buildCreateLine({
        pageObjectId,
        x1: a.x1 as number,
        y1: a.y1 as number,
        x2: a.x2 as number,
        y2: a.y2 as number,
        ...withId,
      })
    }
    case 'table': {
      if (!a.rect) fail('geometry', 'table requires x, y, width, height (PT).')
      if (a.rows === undefined || a.columns === undefined) fail('rows/columns', 'table requires rows and columns (1..20).')
      return buildCreateTable({
        pageObjectId,
        rows: a.rows as number,
        columns: a.columns as number,
        rect: a.rect as AlphaRect,
        ...withId,
      })
    }
  }
}

export function readCreateElementArgs(raw: Record<string, unknown>): { presentationId: string; built: CreateResult; kind: CreateElementType } {
  const presentationId = asResourceId(raw.presentationId, 'presentationId')
  const pageObjectId = asResourceId(raw.pageObjectId, 'pageObjectId')
  const type = raw.type
  if (typeof type !== 'string' || !(CREATE_ELEMENT_TYPES as string[]).includes(type)) {
    fail('type', `must be one of ${CREATE_ELEMENT_TYPES.join(', ')}.`)
  }
  const kind = type as CreateElementType
  const objectId = asOptionalResourceId(raw.objectId, 'objectId')
  const args: CreateElementArgs = {
    type: kind,
    pageObjectId,
    ...(objectId ? { objectId } : {}),
  }
  if (kind === 'line') {
    args.x1 = asFiniteNumber(raw.x1, 'x1')
    args.y1 = asFiniteNumber(raw.y1, 'y1')
    args.x2 = asFiniteNumber(raw.x2, 'x2')
    args.y2 = asFiniteNumber(raw.y2, 'y2')
  } else {
    args.rect = asRect(raw, 'geometry')
  }
  if (kind === 'textBox') {
    args.text = asText(raw.text, 'text', 5000)
    const style: CreateElementArgs['style'] = {}
    if (raw.fontFamily !== undefined) style.fontFamily = raw.fontFamily as string
    if (raw.fontSizePt !== undefined) style.fontSizePt = raw.fontSizePt as number
    if (raw.bold !== undefined) {
      if (typeof raw.bold !== 'boolean') fail('bold', 'must be a boolean.')
      style.bold = raw.bold
    }
    if (raw.italic !== undefined) {
      if (typeof raw.italic !== 'boolean') fail('italic', 'must be a boolean.')
      style.italic = raw.italic
    }
    if (raw.colorHex !== undefined) style.colorHex = raw.colorHex as string
    if (raw.alignment !== undefined) style.alignment = asAlignment(raw.alignment)
    if (raw.fillHex !== undefined) style.fillHex = raw.fillHex as string
    if (Object.keys(style).length > 0) args.style = style
  }
  if (kind === 'shape') {
    args.shapeType = asShapeType(raw.shapeType)
    if (raw.fillHex !== undefined) args.fillHex = raw.fillHex as string
    if (raw.outlineHex !== undefined) args.outlineHex = raw.outlineHex as string
    if (raw.outlineWeightPt !== undefined) args.outlineWeightPt = raw.outlineWeightPt as number
    if (raw.text !== undefined) args.text = asText(raw.text, 'text', 5000, false)
  }
  if (kind === 'image') args.imageUrl = asHttpUrl(raw.imageUrl, 'imageUrl')
  if (kind === 'table') {
    args.rows = asIntInRange(raw.rows, 'rows', 1, 20)
    args.columns = asIntInRange(raw.columns, 'columns', 1, 20)
  }
  const built = buildCreateElementRequests(kind, pageObjectId, args)
  return { presentationId, built, kind }
}

export async function handleCreateElement(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const { presentationId, built, kind } = readCreateElementArgs(args)
  const res = await batchUpdate(token, presentationId, built.requests)
  return textResult({
    presentationId: res.presentationId,
    elementType: kind,
    objectId: built.createdId,
    createdIds: extractReplyObjectIds(res.replies),
    note: 'Verify with slides_get_page.',
  })
}

export type UpdateFamily = 'text' | 'textStyle' | 'paragraphStyle' | 'shapeStyle' | 'transform' | 'imageStyle'

export const UPDATE_FAMILIES: UpdateFamily[] = ['text', 'textStyle', 'paragraphStyle', 'shapeStyle', 'transform', 'imageStyle']

export function buildUpdateElementRequests(
  raw: Record<string, unknown>,
  geoCtx?: Map<string, ElementGeometry>
): { objectId: string; family: UpdateFamily; requests: GoogleRequest[] } {
  const objectId = asResourceId(raw.objectId, 'objectId')
  const family = raw.family
  if (typeof family !== 'string' || !(UPDATE_FAMILIES as string[]).includes(family)) {
    fail('family', `must be one of ${UPDATE_FAMILIES.join(', ')}.`)
  }
  switch (family as UpdateFamily) {
    case 'text': {
      const mode = raw.mode
      if (mode !== 'set' && mode !== 'insert' && mode !== 'delete') fail('mode', "must be 'set', 'insert' or 'delete'.")
      return {
        objectId,
        family: 'text',
        requests: buildTextMutation({
          objectId,
          mode,
          ...(raw.text !== undefined ? { text: raw.text as string } : {}),
          ...(raw.startIndex !== undefined ? { startIndex: raw.startIndex as number } : {}),
          ...(raw.endIndex !== undefined ? { endIndex: raw.endIndex as number } : {}),
        }),
      }
    }
    case 'textStyle':
      return {
        objectId,
        family: 'textStyle',
        requests: [
          buildUpdateTextStyle({
            objectId,
            style: readTextStyleInput(raw, ''),
            range: asTextRange(raw.range, 'range'),
          }),
        ],
      }
    case 'paragraphStyle':
      return {
        objectId,
        family: 'paragraphStyle',
        requests: [
          buildUpdateParagraphStyle({
            objectId,
            alignment: asAlignment(raw.alignment),
            range: asTextRange(raw.range, 'range'),
          }),
        ],
      }
    case 'shapeStyle':
      return {
        objectId,
        family: 'shapeStyle',
        requests: [buildUpdateShapeStyle({ objectId, style: readShapeStyleInput(raw, '') })],
      }
    case 'transform':
    case 'imageStyle': {
      // C08: absolute move/resize requires live element geometry (scales are
      // computed vs current EMU size). Handlers supply it via geoCtx after a
      // single bounded read; direct builder use without context is rejected.
      // imageStyle reuses the same absolute transform family (reposition/resize).
      const rect = asPartialRect(raw, 'geometry')
      const cur = geoCtx?.get(objectId)
      if (!cur) {
        fail(
          'transform',
          'requires live element geometry (read the element first). Internal callers must supply geoCtx.'
        )
      }
      return {
        objectId,
        family: family as UpdateFamily,
        requests: [buildAbsoluteTransform(objectId, rect, cur as ElementGeometry)],
      }
    }
  }
}

export async function handleUpdateElement(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const presentationId = asResourceId(args.presentationId, 'presentationId')
  // C08: transform/imageStyle families need live geometry. One bounded read,
  // then a single atomic batchUpdate — still one MCP call, no raw passthrough.
  let geoCtx: Map<string, ElementGeometry> | undefined
  if (args.family === 'transform' || args.family === 'imageStyle') {
    const objectId = asResourceId(args.objectId, 'objectId')
    geoCtx = new Map([[objectId, await fetchElementGeometry(token, presentationId, objectId)]])
  }
  const built = buildUpdateElementRequests(args, geoCtx)
  const res = await batchUpdate(token, presentationId, built.requests)
  return textResult({
    presentationId: res.presentationId,
    objectId: built.objectId,
    family: built.family,
    appliedRequests: built.requests.length,
    replyIds: extractReplyObjectIds(res.replies),
    note: 'Verify with slides_get_page.',
  })
}

export async function handleDeleteObject(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const presentationId = asResourceId(args.presentationId, 'presentationId')
  const objectId = asResourceId(args.objectId, 'objectId')
  const res = await batchUpdate(token, presentationId, [buildDeleteObject(objectId)])
  return textResult({
    presentationId: res.presentationId,
    deletedObjectId: objectId,
    deleted: true,
    note: 'Verify with slides_get_page.',
  })
}

export async function handleDuplicateObject(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const presentationId = asResourceId(args.presentationId, 'presentationId')
  const objectId = asResourceId(args.objectId, 'objectId')
  const requestedId = asOptionalResourceId(args.requestedId, 'requestedId')
  const res = await batchUpdate(token, presentationId, [buildDuplicateObject(objectId, requestedId)])
  return textResult({
    presentationId: res.presentationId,
    sourceObjectId: objectId,
    ...(requestedId ? { requestedObjectId: requestedId } : {}),
    replyIds: extractReplyObjectIds(res.replies),
    replies: res.replies ?? [],
    note: 'Verify with slides_get_page.',
  })
}

export async function handleBatchUpdate(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const presentationId = asResourceId(args.presentationId, 'presentationId')
  if (!Array.isArray(args.operations)) fail('operations', 'must be a non-empty array of allowlisted operations.')
  const ops = args.operations as Array<Record<string, unknown>>
  if (ops.length === 0) fail('operations', 'must contain at least one operation (empty batches rejected).')
  if (ops.length > MAX_BATCH_OPS) {
    fail('operations', `exceeds the maximum of ${MAX_BATCH_OPS} operations per batch.`)
  }
  // C08: transform ops need live geometry. One bounded deck read covers the
  // whole batch; validation of every op still happens before any mutation.
  let geoCtx: Map<string, ElementGeometry> | undefined
  if (ops.some((op) => op && typeof op === 'object' && (op as Record<string, unknown>).op === 'transform')) {
    geoCtx = await fetchDeckGeometries(token, presentationId)
  }
  // TASK-084: group/zorder ops need live page-kind context. One bounded read
  // per distinct target page; validation of every op still precedes mutation.
  let pageCtx: Map<string, Map<string, PageElementKindInfo>> | undefined
  const needsPageCtx = (op: unknown): string | null => {
    if (!op || typeof op !== 'object') return null
    const r = op as Record<string, unknown>
    if ((r.op === 'group' || r.op === 'zorder') && typeof r.pageObjectId === 'string' && r.pageObjectId) {
      return r.pageObjectId
    }
    return null
  }
  const pageIds = [...new Set(ops.map(needsPageCtx).filter((id): id is string => id !== null))]
  if (pageIds.length > 0) {
    pageCtx = new Map()
    for (const pageId of pageIds) {
      pageCtx.set(pageId, await fetchPageKindMap(token, presentationId, pageId))
    }
  }
  const requests: GoogleRequest[] = []
  const createdIds: string[] = []
  ops.forEach((op, i) => {
    if (!op || typeof op !== 'object') fail(`operations[${i}]`, 'must be an object with an allowlisted op.')
    try {
      const built = buildBatchOperation(op, geoCtx, pageCtx)
      requests.push(...built.requests)
      createdIds.push(...built.createdIds)
    } catch (err) {
      throw new Error(`operations[${i}]: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
  const res = await batchUpdate(token, presentationId, requests)
  return textResult({
    presentationId: res.presentationId,
    operations: ops.length,
    appliedRequests: requests.length,
    createdIds,
    replyIds: extractReplyObjectIds(res.replies),
    note: 'Batch applied atomically. Verify with slides_get_page.',
  })
}

/** TASK-084: native page-background mutation (single page, controlled). */
export async function handleUpdatePage(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const presentationId = asResourceId(args.presentationId, 'presentationId')
  const pageObjectId = asResourceId(args.pageObjectId, 'pageObjectId')
  const input: PageBackgroundInput = {}
  if (args.backgroundHex !== undefined) input.backgroundHex = args.backgroundHex as string
  if (args.backgroundThemeColor !== undefined) input.backgroundThemeColor = args.backgroundThemeColor as string
  const res = await batchUpdate(token, presentationId, [buildUpdatePageBackground(pageObjectId, input)])
  return textResult({
    presentationId: res.presentationId,
    pageObjectId,
    background: input.backgroundHex !== undefined ? { fillHex: input.backgroundHex } : { themeColor: input.backgroundThemeColor },
    note: 'Verify with slides_get_page (pageBackground).',
  })
}

/** TASK-084: layout-aware slide creation (blank when no layout given). */
export async function handleCreateSlide(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const presentationId = asResourceId(args.presentationId, 'presentationId')
  const input: CreateSlideInput = {}
  if (args.layoutId !== undefined) input.layoutId = args.layoutId as string
  if (args.slideObjectId !== undefined) input.slideObjectId = args.slideObjectId as string
  if (args.insertionIndex !== undefined) input.insertionIndex = args.insertionIndex as number
  if (args.placeholderMappings !== undefined) {
    input.placeholderMappings = args.placeholderMappings as Array<{
      layoutPlaceholderObjectId: string
      slidePlaceholderObjectId: string
    }>
  }
  const res = await batchUpdate(token, presentationId, [buildCreateSlide(input)])
  const replies = extractReplyObjectIds(res.replies)
  return textResult({
    presentationId: res.presentationId,
    slideObjectId: replies.find((r) => r.createSlide)?.createSlide ?? null,
    layoutId: input.layoutId ?? null,
    replyIds: replies,
    note: 'Verify with slides_get_presentation (slide/layout IDs) and slides_get_page (placeholders).',
  })
}
