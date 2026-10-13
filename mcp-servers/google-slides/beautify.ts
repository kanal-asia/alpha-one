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
  buildUpdatePageBackground,
  buildUpdateParagraphStyle,
  buildUpdateTextStyle,
  buildZOrder,
  executeBatch,
  fetchPageSnapshot,
  textResult,
  themeBackgroundRequest,
  type GoogleRequest,
  type McpTextResult,
  type PageSnapshot,
  type TextStyleInput,
} from './visual'
import {
  classifyTextFit,
  decideOwnership,
  checkFactCoverage,
  decideSourceOwnership,
  defaultLayout,
  estimateLines,
  normalizeSourceText,
  DESIGN_CANVAS,
  findFabricatedNumbers,
  hasBlocking,
  isMeaningfulText,
  isTitlePlaceholderType,
  layoutColumnSet,
  layoutFor,
  layoutTimelineNode,
  numericTokens,
  parseMagnitude,
  qaVisualQuality,
  rectsOverlap,
  resolveThemeRole,
  partitionShares,
  scaleProportional,
  textDemandPt,
  type GroupShellClearMode,
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
import {
  resolveTheme,
  resolveThemePrecedence,
  type AlphaTheme,
  type ArtDirection,
  type BackgroundStyle,
  type SurfaceStyle,
  type ShapeStyle,
  type TypographyPersonality,
  type DecorativeMotif,
  type DataVizStyle,
  type DensityStyle,
  type MetricTreatment,
  type TitleTreatment,
} from './themes'

/**
 * TASK-093-R2: retryability + write-outcome contract for compose failures.
 *
 * Deterministic provider rejections (HTTP 400 request validation) are
 * TERMINAL: repeating the identical call cannot succeed, so the engine
 * reports `retryable: false` and never auto-retries the write. Retrying is
 * only ever advised when the result explicitly declares `retryable: true`
 * AND the write outcome permits it — never on HTTP status alone, never
 * blindly on UNKNOWN outcomes.
 */
export type ComposeWriteOutcome =
  | 'NOT_ATTEMPTED'
  | 'NOT_APPLIED'
  | 'UNKNOWN'
  | 'APPLIED_READBACK_UNPROVEN'
  | 'APPLIED_VERIFIED'

export type ComposeErrorClass =
  | 'REQUEST_VALIDATION'
  | 'RATE_LIMITED'
  | 'PROVIDER_TRANSIENT'
  | 'AUTH'
  | 'NETWORK'
  | 'UNKNOWN'

export interface ComposeErrorClassification {
  errorClass: ComposeErrorClass
  retryable: boolean
  providerStatus?: number
  failedRequestIndex?: number
  failedRequestType?: string
  failedBatch?: number
  writeOutcome: ComposeWriteOutcome
  recommendedAction: string
}

function providerStatusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status
  return typeof s === 'number' && Number.isFinite(s) ? s : undefined
}

function failedRequestOf(message: string): { index?: number; type?: string } {
  const m = /requests\[(\d+)\]\.([A-Za-z]+)/.exec(message)
  if (!m) return {}
  return { index: Number(m[1]), type: m[2] }
}

/**
 * Classify a compose failure from the phase where it surfaced.
 * Pure and total: unknown shapes yield UNKNOWN / non-retryable, never throw.
 */
export function classifyComposeError(
  err: unknown,
  phase: 'inspect' | 'write' | 'readback',
  opts?: { failedBatch?: number }
): ComposeErrorClassification {
  const message = err instanceof Error ? err.message : String(err)
  const status = providerStatusOf(err)
  const failed = failedRequestOf(message)
  const failedBatch = opts?.failedBatch
  if (phase === 'inspect') {
    if (status === 401 || status === 403) {
      return {
        errorClass: 'AUTH', retryable: false, ...(status !== undefined ? { providerStatus: status } : {}),
        writeOutcome: 'NOT_ATTEMPTED',
        recommendedAction: 'Re-authenticate the Google connection; do not retry the compose until auth succeeds.',
      }
    }
    if (status === 0 || status === undefined) {
      return {
        errorClass: 'NETWORK', retryable: true, ...(status !== undefined ? { providerStatus: status } : {}),
        writeOutcome: 'NOT_ATTEMPTED',
        recommendedAction: 'Transient read failure before any write; a single retry of the same call is safe.',
      }
    }
    return {
      errorClass: status === 400 ? 'REQUEST_VALIDATION' : 'UNKNOWN',
      retryable: false, ...(status !== undefined ? { providerStatus: status } : {}),
      writeOutcome: 'NOT_ATTEMPTED',
      recommendedAction: 'Do not repeat the call; inspect the provider error first.',
    }
  }
  if (phase === 'write') {
    const base = {
      ...(status !== undefined ? { providerStatus: status } : {}),
      ...(failed.index !== undefined ? { failedRequestIndex: failed.index } : {}),
      ...(failed.type !== undefined ? { failedRequestType: failed.type } : {}),
      ...(failedBatch !== undefined ? { failedBatch } : {}),
    }
    if (status === 400) {
      return {
        errorClass: 'REQUEST_VALIDATION', retryable: false, ...base,
        writeOutcome: 'NOT_APPLIED',
        recommendedAction:
          'Deterministic request-validation failure: Google batchUpdate rejects atomically, so nothing was applied. ' +
          'Do NOT repeat this compose call (identical or content-tweaked) and do NOT fall back to primitive element tools. ' +
          'Report presentationId, pageObjectId, providerStatus, failedRequestIndex/Type, and stop.',
      }
    }
    if (status === 401 || status === 403) {
      return {
        errorClass: 'AUTH', retryable: false, ...base,
        writeOutcome: 'NOT_APPLIED',
        recommendedAction: 'Authorization rejected before any write was applied. Re-authenticate; do not retry the compose until auth succeeds.',
      }
    }
    if (status === 429) {
      return {
        errorClass: 'RATE_LIMITED', retryable: true, ...base,
        writeOutcome: 'UNKNOWN',
        recommendedAction:
          'Rate limited with unknown write outcome. Verify slide state with slides_get_page FIRST; retry only if the composed objects are absent, never blindly.',
      }
    }
    return {
      errorClass: status !== undefined && status >= 500 ? 'PROVIDER_TRANSIENT' : 'UNKNOWN',
      retryable: status !== undefined && status >= 500,
      ...base,
      writeOutcome: 'UNKNOWN',
      recommendedAction:
        'Ambiguous write outcome. Verify slide state with slides_get_page FIRST; do not repeat the write until non-application is proven.',
    }
  }
  return {
    errorClass: 'UNKNOWN', retryable: false,
    ...(status !== undefined ? { providerStatus: status } : {}),
    writeOutcome: 'APPLIED_READBACK_UNPROVEN',
    recommendedAction: 'Write was accepted but readback did not verify. Inspect with slides_get_page; do not rewrite blindly.',
  }
}

/**
 * TASK-093-R2: machine-testable form of the agent terminal-error guidance.
 * A compose call may be repeated ONLY when the failure result explicitly
 * declares `retryable: true` AND the write outcome permits a safe repeat
 * (`NOT_APPLIED` or `NOT_ATTEMPTED`). Every other combination — including
 * `retryable: true` with `UNKNOWN` or `APPLIED_READBACK_UNPROVEN` (verify
 * first, never blind) and any missing error block — returns false.
 */
export function isComposeRetryAllowed(
  errorBlock: { retryable?: unknown; writeOutcome?: unknown } | null | undefined
): boolean {
  if (!errorBlock || errorBlock.retryable !== true) return false
  return errorBlock.writeOutcome === 'NOT_APPLIED' || errorBlock.writeOutcome === 'NOT_ATTEMPTED'
}

/**
 * TASK-093-R1: bounded read-only readback retry.
 *
 * Retries ONLY the read operation (`fetchSnapshot`) when the QA deems the
 * snapshot inconsistent. It has no access to any write callback, so by
 * construction it can never re-execute batchUpdate, rebuild request plans,
 * or create new object IDs — group/object counts cannot grow across retries.
 *
 * - Total fetch invocations are bounded: 1 initial + `maxRetries` retries.
 * - Fetch throws (e.g. transient GET errors) are retried boundedly, then rethrown.
 * - QA throws (structural/deterministic failures) propagate immediately, never retried.
 */
export interface ReadbackRetryOutcome<S, Q> {
  snapshot: S
  qa: Q
  readAttempts: number
}

export async function readbackWithBoundedRetry<S, Q>(
  fetchSnapshot: () => Promise<S>,
  runQa: (snapshot: S) => Q,
  isConsistent: (qa: Q) => boolean,
  opts?: { maxRetries?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> }
): Promise<ReadbackRetryOutcome<S, Q>> {
  const maxRetries = opts?.maxRetries ?? 2
  const delayMs = opts?.delayMs ?? 400
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let attempts = 0
  for (;;) {
    let snapshot: S
    try {
      snapshot = await fetchSnapshot()
    } catch (err) {
      attempts += 1
      if (attempts >= 1 + maxRetries) throw err
      await sleep(delayMs)
      continue
    }
    attempts += 1
    const qa = runQa(snapshot)
    if (isConsistent(qa) || attempts >= 1 + maxRetries) return { snapshot, qa, readAttempts: attempts }
    await sleep(delayMs)
  }
}
/**
 * MCP handler: compose one archetype slide on an existing page.
 * TASK-086 pipeline: page inspection → ownership → layout/QA/reflow →
 * execute → authoritative readback → final QA (fail-closed).
 */
export async function handleComposeSlide(token: string, args: Record<string, unknown>): Promise<McpTextResult> {
  const { presentationId, input } = validateComposeInput(args)
  // 1. Page inspection: live dimensions + placeholder inventory.
  // TASK-093-R2: inspection failures return a structured terminal result
  // (no write was attempted) instead of an unstructured throw.
  let snapshot: PageSnapshot
  try {
    snapshot = await fetchPageSnapshot(token, presentationId, input.pageObjectId)
  } catch (err) {
    const classification = classifyComposeError(err, 'inspect')
    return textResult({
      presentationId,
      pageObjectId: input.pageObjectId,
      archetype: input.archetype,
      batches: 0,
      appliedRequests: 0,
      createdIds: [],
      writeAttemptCount: 0,
      readAttempts: 0,
      writeOutcome: classification.writeOutcome,
      error: {
        errorClass: classification.errorClass,
        retryable: classification.retryable,
        ...(classification.providerStatus !== undefined ? { providerStatus: classification.providerStatus } : {}),
        writeOutcome: classification.writeOutcome,
        recommendedAction: classification.recommendedAction,
        message: err instanceof Error ? err.message : String(err),
      },
      qaPass: false,
      finalStatus: 'GEOMETRY_FAILED',
      geometryScope: 'STRUCTURAL_ONLY',
      structuralGeometryStatus: 'FAILED',
      textFitScope: 'UNPROVEN',
      renderedVisualStatus: 'UNPROVEN',
      humanVisualStatus: 'UNPROVEN',
      overallStatus: 'FAILED',
      textPresenceStatus: 'UNPROVEN',
      textContrastStatus: 'UNPROVEN',
      meaningfulSlideStatus: 'FAILED',
      note: 'Page inspection failed before any write. See error.classification.',
    })
  }
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
  // TASK-086R2-R1: the FULL snapshot inventory rides along so existing-slide
  // Beautify replaces (not strands) the source structure.
  // TASK-090-R1: live routing guard — distribution-shaped content under a
  // degrading archetype is redirected to its encoding (reported in the
  // routing block, never silent). Sound requests pass through untouched.
  const routing = resolveEffectiveArchetype(input.archetype, slideContentOf(input))
  // TASK-090-R2: the routing patch (e.g. columns from metrics-based redirect)
  // must be visible to the renderer AND the fact/encoding gates. Spread the
  // patch into effectiveInput so slideContentOf sees the redirected columns.
  const effectiveInput: ComposeInput = routing.redirected
    ? { ...input, archetype: routing.archetype, ...routing.patch }
    : input
  // TASK-095: sharedGoal is optional for PILLARS_STRATEGY. When present it is
  // still source-proven and never dropped; when absent, the renderer emits the
  // pillars-no-goal variant with a decorative foundation band.
  // TASK-094-R2: deterministic planning/layout failures (failPlan) return a
  // structured terminal result instead of an unstructured throw, so the
  // agent cannot blindly retry a doomed write with mutated facts. Only
  // failPlan-marked errors are converted; unexpected errors still propagate.
  let composed: ComposedSlide
  try {
    composed = composeSlideOnPage(effectiveInput, {
      pageWidthPt: snapshot.pageWidthPt,
      pageHeightPt: snapshot.pageHeightPt,
      placeholders,
      expectedEncoding: routing.encoding,
      // TASK-090: theme flows planning-side (accent roles, contrast-safe).
      ...(snapshot.themeColors ? { theme: snapshot.themeColors } : {}),
      // TASK-093: forward user prompt for theme inference when themeId absent.
      ...(effectiveInput.userPrompt ? { userPrompt: effectiveInput.userPrompt } : {}),
      existingElements: snapshot.elements.map((e) => ({
        objectId: e.objectId,
        text: e.text,
        ...(e.placeholderType !== undefined ? { placeholderType: e.placeholderType } : {}),
        ...(e.kind !== undefined ? { kind: e.kind } : {}),
        ...(e.parentGroupId !== undefined ? { parentGroupId: e.parentGroupId } : {}),
      })),
    })
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith('Alpha Beautify plan: ')) throw err
    const detail = err.message.slice('Alpha Beautify plan: '.length)
    const isFitFailure = /needs .* but only .* available|requires positive|does not fit|overflow|exceeds|too (narrow|small|tall|wide)|no .* fit|without .* fitting/i.test(detail)
    return textResult({
      presentationId,
      pageObjectId: input.pageObjectId,
      archetype: input.archetype,
      batches: 0,
      appliedRequests: 0,
      createdIds: [],
      writeAttemptCount: 0,
      readAttempts: 0,
      writeOutcome: 'NOT_ATTEMPTED',
      error: {
        errorClass: 'LAYOUT_IMPOSSIBLE',
        retryable: false,
        ...(isFitFailure ? { terminalCode: 'CONTENT_CANNOT_FIT_WITHOUT_FACT_LOSS' } : {}),
        writeOutcome: 'NOT_ATTEMPTED',
        recommendedAction:
          'Deterministic planning/layout failure: repeating this compose cannot succeed. ' +
          'Do NOT retry with altered, merged, or dropped facts and do NOT fall back to primitive element tools. ' +
          'Reduce flexible narrative copy, split the content, or report the limitation honestly.',
        message: detail,
      },
      expected: {
        archetype: input.archetype,
        titles: [],
        texts: [],
        groups: 0,
        elementCount: 0,
        encoding: '',
      },
      qaPass: false,
      pageGeometry: { widthPt: CANVAS.width, heightPt: CANVAS.height, aspect: CANVAS.width / CANVAS.height },
      placeholderOwnership: [],
      prewriteQa: [],
      reflows: { attempts: 0, reasons: [] },
      readbackQa: [],
      finalStatus: 'GEOMETRY_FAILED',
      geometryScope: 'STRUCTURAL_ONLY',
      structuralGeometryStatus: 'FAILED',
      textFitScope: 'UNPROVEN',
      renderedVisualStatus: 'UNPROVEN',
      humanVisualStatus: 'UNPROVEN',
      sourceFidelityStatus: 'UNPROVEN',
      semanticEncodingStatus: 'UNPROVEN',
      emptyContainerStatus: 'CLEAR',
      collisionStatus: 'CLEAR',
      retrySafetyStatus: 'UNKNOWN',
      overallStatus: 'FAILED',
      textPresenceStatus: 'UNPROVEN',
      textContrastStatus: 'UNPROVEN',
      meaningfulSlideStatus: 'FAILED',
      factSafety: {
        fingerprint: fingerprintFacts(slideContentOf(effectiveInput)),
        sourceToInputFidelity: 'UNPROVEN',
        factsPreserved: [],
        factsOmitted: [],
        factsMerged: [],
        factsChanged: [],
        reflowAttempts: 0,
        reflowStrategies: [],
      },
      routing: {
        requested: input.archetype,
        effective: effectiveInput.archetype,
        redirected: routing.redirected,
        reason: routing.reason,
        expectedEncoding: routing.encoding,
        actualEncoding: '',
      },
      note: 'Planning/layout failure before any write. See error.classification.',
    })
  }
  // 3. Ownership execution already rides in the first chunk (CLEAR deletions
  //    are prepended by composeSlideOnPage — see above).
  const clearIds = composed.ownership.filter((d) => d.decision === 'CLEAR').map((d) => d.objectId)
  // 4. Pre-write fail-closed (§15): deterministic geometry already proves this
  //    composition cannot fit — do NOT write, report GEOMETRY_FAILED instead.
  if (composed.finalStatus === 'GEOMETRY_FAILED') {
    const findings = qaComposedSlide({ archetype: input.archetype, content: slideContentOf(input) }, composed.result, { pageWidthPt: snapshot.pageWidthPt, pageHeightPt: snapshot.pageHeightPt })
    return textResult({
      presentationId,
      pageObjectId: input.pageObjectId,
      archetype: input.archetype,
      batches: 0,
      appliedRequests: 0,
      createdIds: [],
      writeAttemptCount: 0,
      readAttempts: 0,
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
      writeOutcome: 'NOT_ATTEMPTED',
      geometryScope: 'STRUCTURAL_ONLY',
      structuralGeometryStatus: 'FAILED',
      textFitScope: textFitScopeOf(composed.prewriteQa),
      renderedVisualStatus: 'UNPROVEN',
      humanVisualStatus: 'UNPROVEN',
      overallStatus: 'FAILED',
      textPresenceStatus: 'UNPROVEN',
      textContrastStatus: composed.prewriteQa.some((f) => f.check === 'TEXT_CONTRAST' && !f.pass) ? 'FAIL' : 'PASS',
      meaningfulSlideStatus: 'FAILED',
      sourceFidelityStatus: composed.result.expected.sourceToInputFidelity ?? 'UNPROVEN',
      semanticEncodingStatus: 'MISMATCH',
      emptyContainerStatus: composed.prewriteQa.some((f) => !f.pass && f.severity === 'BLOCKING' && /EMPTY_/.test(f.check)) ? 'BLOCKED' : 'CLEAR',
      collisionStatus: composed.prewriteQa.some((f) => !f.pass && f.severity === 'BLOCKING' && /COLLISION/.test(f.check)) ? 'BLOCKED' : 'CLEAR',
      retrySafetyStatus: composed.prewriteQa.some(
        (f) => !f.pass && f.severity === 'BLOCKING' && (/^(SOURCE_|UNAUTHORIZED_)/.test(f.check) || f.check === 'READBACK_NO_SOURCE_DUPLICATES')
      ) ? 'UNSAFE' : 'UNKNOWN',
      factSafety: {
        ...summarizeSourceFacts(effectiveInput.sourceFacts, slideContentOf(effectiveInput)),
        sourceToInputFidelity: composed.result.expected.sourceToInputFidelity ?? 'UNPROVEN',
        reflowAttempts: composed.reflowAttempts,
        reflowStrategies: composed.reflowReasons,
      },
      note: 'Pre-write geometry QA blocked: composition not written. Adjust content or layout and retry.',
    })
  }
  const allRequests = composed.result.requests
  // TASK-090: native page background (theme light tint only; null otherwise).
  // Prepended ahead of CLEAR deletions — order vs deletes is irrelevant
  // (page vs object scope), and the op carries no objectId so presence QA
  // and createdIds are unaffected.
  // TASK-093-R1: Alpha-explicit dark themes own the page background. When the
  // resolved Alpha theme is non-DEFAULT with a dark palette background, its
  // page-background request wins over the Google light tint — otherwise
  // MODERN_GRADIENT/BOLD_TECH/DATA_INTELLIGENCE render on a white canvas and
  // read as Simple Light despite correct theme resolution.
  const alphaBgRequest = alphaPageBackgroundRequest(
    input.pageObjectId,
    composed.result.expected.themeResolved,
    composed.result.expected.themeSource
  )
  const bgRequest =
    alphaBgRequest ?? themeBackgroundRequest(input.pageObjectId, snapshot.themeColors ?? null)
  const chunks = chunkRequests(bgRequest ? [bgRequest, ...allRequests] : allRequests)
  const createdIds: string[] = []
  let appliedRequests = 0
  // TASK-093-R2: batch failures return a structured terminal classification
  // instead of an unstructured throw. Deterministic HTTP 400 validation
  // errors are non-retryable; the engine never auto-repeats a write.
  try {
    let batchIndex = 0
    for (const requests of chunks) {
      try {
        const done = await executeBatch(token, presentationId, requests)
        createdIds.push(...done.createdIds)
        appliedRequests += done.appliedRequests
      } catch (err) {
        throw Object.assign(err instanceof Error ? err : new Error(String(err)), { failedBatch: batchIndex })
      } finally {
        batchIndex += 1
      }
    }
  } catch (err) {
    const failedBatch = (err as { failedBatch?: unknown } | null)?.failedBatch
    const classification = classifyComposeError(
      err,
      'write',
      typeof failedBatch === 'number' ? { failedBatch } : undefined
    )
    return textResult({
      presentationId,
      pageObjectId: input.pageObjectId,
      archetype: input.archetype,
      batches: chunks.length,
      appliedRequests,
      createdIds,
      writeAttemptCount: 1,
      readAttempts: 0,
      writeOutcome: classification.writeOutcome,
      error: {
        errorClass: classification.errorClass,
        retryable: classification.retryable,
        ...(classification.providerStatus !== undefined ? { providerStatus: classification.providerStatus } : {}),
        ...(classification.failedRequestIndex !== undefined ? { failedRequestIndex: classification.failedRequestIndex } : {}),
        ...(classification.failedRequestType !== undefined ? { failedRequestType: classification.failedRequestType } : {}),
        ...(classification.failedBatch !== undefined ? { failedBatch: classification.failedBatch } : {}),
        writeOutcome: classification.writeOutcome,
        recommendedAction: classification.recommendedAction,
        message: err instanceof Error ? err.message : String(err),
      },
      expected: composed.result.expected,
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
      routing: {
        requested: input.archetype,
        effective: effectiveInput.archetype,
        redirected: routing.redirected,
        reason: routing.reason,
        expectedEncoding: routing.encoding,
        actualEncoding: composed.result.expected.encoding,
      },
      theme: {
        requested: composed.result.expected.themeRequested,
        resolved: composed.result.expected.themeResolved,
        source: composed.result.expected.themeSource,
      },
      finalStatus: 'GEOMETRY_FAILED',
      geometryScope: 'STRUCTURAL_ONLY',
      structuralGeometryStatus: 'FAILED',
      textFitScope: textFitScopeOf(composed.prewriteQa),
      renderedVisualStatus: 'UNPROVEN',
      humanVisualStatus: 'UNPROVEN',
      sourceFidelityStatus: composed.result.expected.sourceToInputFidelity ?? 'UNPROVEN',
      semanticEncodingStatus:
        routing.encoding === composed.result.expected.encoding &&
        !composed.prewriteQa.some((f) => f.check === 'PROPORTIONAL_RATIO_EXACT' && !f.pass)
          ? 'PROVEN'
          : 'MISMATCH',
      emptyContainerStatus: composed.prewriteQa.some((f) => !f.pass && f.severity === 'BLOCKING' && /EMPTY_/.test(f.check)) ? 'BLOCKED' : 'CLEAR',
      collisionStatus: composed.prewriteQa.some((f) => !f.pass && f.severity === 'BLOCKING' && /COLLISION/.test(f.check)) ? 'BLOCKED' : 'CLEAR',
      retrySafetyStatus: composed.prewriteQa.some(
        (f) => !f.pass && f.severity === 'BLOCKING' && (/^(SOURCE_|UNAUTHORIZED_)/.test(f.check) || f.check === 'READBACK_NO_SOURCE_DUPLICATES')
      ) ? 'UNSAFE' : 'UNKNOWN',
      overallStatus: 'FAILED',
      textPresenceStatus: 'UNPROVEN',
      textContrastStatus: composed.prewriteQa.some((f) => f.check === 'TEXT_CONTRAST' && !f.pass) ? 'FAIL' : 'PASS',
      meaningfulSlideStatus: 'FAILED',
      factSafety: {
        ...summarizeSourceFacts(effectiveInput.sourceFacts, slideContentOf(effectiveInput)),
        sourceToInputFidelity: composed.result.expected.sourceToInputFidelity ?? 'UNPROVEN',
        reflowAttempts: composed.reflowAttempts,
        reflowStrategies: composed.reflowReasons,
      },
      note: 'Batch write rejected. See error.classification; do not blindly repeat this call.',
    })
  }
  // 4. Authoritative readback + final QA.
  // TASK-093-R1: bounded READ-ONLY retry via readbackWithBoundedRetry.
  // Only fetchPageSnapshot is re-invoked on READBACK_OBJECTS_PRESENT gaps
  // (Google API eventual consistency for grouped children). batchUpdate is
  // never re-executed here: write happens exactly once above, so group/object
  // counts cannot grow across retries (4 KPI groups stay 4).
  const toReadbackElements = (rb: PageSnapshot) =>
    rb.elements.map((e) => ({
      objectId: e.objectId,
      ...(e.rectPt ? { rectPt: e.rectPt } : {}),
      ...(e.text ? { text: e.text } : {}),
      ...(e.placeholderType ? { placeholderType: e.placeholderType } : {}),
      ...(e.kind ? { kind: e.kind } : {}),
    }))
  const readbackOutcome = await readbackWithBoundedRetry(
    () => fetchPageSnapshot(token, presentationId, input.pageObjectId),
    (rb) =>
      qaReadback({
        page: composed.layout.page,
        expectedTexts: expectedTextsOf(slideContentOf(input)),
        expectedIds: createdIds,
        clearedIds: clearIds,
        composeTitle: input.title,
        elements: toReadbackElements(rb),
        ownership: composed.ownership,
      }),
    (qa) => !qa.some((f) => f.check === 'READBACK_OBJECTS_PRESENT' && !f.pass)
  )
  const readback = readbackOutcome.snapshot
  const readbackQa = readbackOutcome.qa
  const readAttempts = readbackOutcome.readAttempts
  const findings = qaComposedSlide({ archetype: input.archetype, content: slideContentOf(input) }, composed.result, { pageWidthPt: snapshot.pageWidthPt, pageHeightPt: snapshot.pageHeightPt })
  const blocked =
    composed.finalStatus === 'GEOMETRY_FAILED' || hasBlocking(readbackQa)
  // TASK-094-R2: machine-provable status dimensions for honest classification.
  const allMachineQa = [...composed.prewriteQa, ...readbackQa]
  const hasBlockingFactFinding = allMachineQa.some(
    (f) =>
      !f.pass &&
      f.severity === 'BLOCKING' &&
      (/^(SOURCE_|UNAUTHORIZED_)/.test(f.check) || f.check === 'READBACK_NO_SOURCE_DUPLICATES')
  )
  const hasBlockingCollision = allMachineQa.some(
    (f) => !f.pass && f.severity === 'BLOCKING' && /COLLISION/.test(f.check)
  )
  const hasBlockingEmpty = allMachineQa.some(
    (f) => !f.pass && f.severity === 'BLOCKING' && /EMPTY_/.test(f.check)
  )
  const encodingMatch = routing.encoding === composed.result.expected.encoding
  // TASK-094-R3: a ratio outside tolerance prevents semantic PROVEN even
  // when the encoding label matches — labels alone never prove proportion.
  const ratioOk = !composed.prewriteQa.some(
    (f) => f.check === 'PROPORTIONAL_RATIO_EXACT' && !f.pass
  )
  const factSummary = summarizeSourceFacts(effectiveInput.sourceFacts, slideContentOf(effectiveInput))
  const qaPass = composeQaPass(findings, readbackQa)
  // Single write per call by construction (see bounded loop above); UNSAFE
  // iff fact-fidelity or duplicate-generation blockers fired.
  const retrySafetyStatus = hasBlockingFactFinding ? 'UNSAFE' : qaPass ? 'SAFE' : 'UNKNOWN'
  // Full PROVEN additionally requires rendered + human evidence, which no
  // offline path can supply — offline ceiling is STRUCTURALLY_PROVEN.
  const overallStatus: 'PROVEN' | 'STRUCTURALLY_PROVEN' | 'FAILED' = !qaPass || blocked
    ? 'FAILED'
    : 'STRUCTURALLY_PROVEN'
  // TASK-094-R3: per-dimension visual honesty. Presence compares planned
  // texts against emitted texts; contrast reuses the blocking gate; a slide
  // is meaningful only when it carries texts and elements.
  const plannedTexts = expectedTextsOf(slideContentOf(effectiveInput))
  const textPresenceStatus =
    plannedTexts.length === 0 ? 'UNPROVEN' : plannedTexts.every((t) => composed.result.expected.texts.includes(t)) ? 'PRESENT' : 'MISSING'
  const textContrastStatus = composed.prewriteQa.some(
    (f) => f.check === 'TEXT_CONTRAST' && !f.pass
  )
    ? 'FAIL'
    : 'PASS'
  const meaningfulSlideStatus =
    composed.result.expected.texts.length > 0 && composed.result.expected.elementCount > 0 ? 'MEANINGFUL' : 'FAILED'
  return textResult({
    presentationId,
    pageObjectId: input.pageObjectId,
    archetype: input.archetype,
    batches: chunks.length,
    appliedRequests,
    createdIds,
    // TASK-093-R1: write/read invocation evidence. Write happens exactly once
    // per handleComposeSlide call; readback is bounded (1 + max 2 retries).
    writeAttemptCount: 1,
    readAttempts,
    // TASK-093-R2: honest write outcome for the verified path.
    writeOutcome: blocked ? 'APPLIED_READBACK_UNPROVEN' : 'APPLIED_VERIFIED',
    // TASK-094: scope label — GEOMETRY_PROVEN attests structural geometry
    // (bounds, containment, collision, fidelity) only, never pixel-level
    // rendered quality (see VISUAL_RENDER_UNPROVEN).
    geometryScope: 'STRUCTURAL_ONLY',
    // TASK-094-R1: separated claim statuses — structural bounds may be
    // PROVEN, estimator text-fit is DERIVED at best, and rendered/human
    // visual quality stays UNPROVEN without render evidence. A structural
    // pass can therefore never be mistaken for pixel proof.
    structuralGeometryStatus: blocked ? 'FAILED' : 'PROVEN',
    textFitScope: textFitScopeOf([...composed.prewriteQa, ...readbackQa]),
    renderedVisualStatus: 'UNPROVEN',
    humanVisualStatus: 'UNPROVEN',
    // TASK-094-R2: per-dimension honest classification. overallStatus caps at
    // STRUCTURALLY_PROVEN offline (PROVEN additionally requires rendered +
    // human evidence, which no offline path can supply).
    sourceFidelityStatus: composed.result.expected.sourceToInputFidelity ?? 'UNPROVEN',
    semanticEncodingStatus: encodingMatch && ratioOk ? 'PROVEN' : 'MISMATCH',
    emptyContainerStatus: hasBlockingEmpty ? 'BLOCKED' : 'CLEAR',
    collisionStatus: hasBlockingCollision ? 'BLOCKED' : 'CLEAR',
    retrySafetyStatus,
    overallStatus,
    textPresenceStatus,
    textContrastStatus,
    meaningfulSlideStatus,
    factSafety: {
      fingerprint: factSummary.fingerprint,
      sourceToInputFidelity: composed.result.expected.sourceToInputFidelity ?? 'UNPROVEN',
      factsPreserved: factSummary.factsPreserved,
      factsOmitted: factSummary.factsOmitted,
      factsMerged: factSummary.factsMerged,
      factsChanged: factSummary.factsChanged,
      reflowAttempts: composed.reflowAttempts,
      reflowStrategies: composed.reflowReasons,
    },
    expected: composed.result.expected,
    qa: findings,
    // TASK-086R2-R1: qaPass includes authoritative readback — never PROVEN
    // while a blocking duplicate source survives post-write.
    qaPass: composeQaPass(findings, readbackQa),
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
    // TASK-090-R1: routing transparency — requested vs effective archetype,
    // redirect reason, and the expected visual encoding contract.
    // TASK-094-R3: category/aggregate identities ride along when detected.
    routing: {
      requested: input.archetype,
      effective: effectiveInput.archetype,
      redirected: routing.redirected,
      reason: routing.reason,
      expectedEncoding: routing.encoding,
      actualEncoding: composed.result.expected.encoding,
      ...(routing.categories !== undefined ? { categories: routing.categories } : {}),
      ...(routing.aggregates !== undefined ? { aggregates: routing.aggregates } : {}),
    },
    // TASK-092: theme resolution transparency.
    theme: {
      requested: composed.result.expected.themeRequested,
      resolved: composed.result.expected.themeResolved,
      source: composed.result.expected.themeSource,
    },
    note: 'Verify with slides_get_page.',
  })
}

/**
 * TASK-090-R1: normalized required fact set. Every non-empty input string,
 * normalized for conservative identity (exact or normalized-equivalent).
 * Source-clearing and readback gates prove these survive; interpretive
 * labels can never satisfy a missing source fact.
 */
export function deriveRequiredFacts(content: SlideContent): string[] {
  return expectedTextsOf(content)
    .map((s) => normalizeSourceText(s))
    .filter((s) => s.length > 0)
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
    ...(content.sharedGoal ? [content.sharedGoal] : []),
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
    ...(input.sharedGoal !== undefined ? { sharedGoal: input.sharedGoal } : {}),
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

export let PALETTE = {
  background: '#FFFFFF',
  ink: '#111827',
  muted: '#6B7280',
  accent: '#2563EB',
  accent2: '#7C3AED',
  cardFill: '#F3F4F6',
  line: '#E5E7EB',
  accentSoft: '#DBEAFE',
}

/** Default PALETTE values for reset before theme application. */
const DEFAULT_PALETTE = { ...PALETTE }

/**
 * TASK-092: apply a theme's palette overrides to the module-level PALETTE.
 * Called at the start of each composition so all existing renderer references
 * automatically consume themed values. Resets to defaults first to prevent
 * cross-composition bleed.
 */
export function applyTheme(theme: import('./themes').AlphaTheme | null): void {
  Object.assign(PALETTE, DEFAULT_PALETTE)
  if (!theme) {
    ACTIVE_ART = DEFAULT_ART
    return
  }
  const p = theme.palette
  if (p.background) PALETTE.background = p.background
  if (p.ink) PALETTE.ink = p.ink
  if (p.muted) PALETTE.muted = p.muted
  if (p.accent) PALETTE.accent = p.accent
  if (p.accent2) PALETTE.accent2 = p.accent2
  if (p.cardFill) PALETTE.cardFill = p.cardFill
  if (p.line) PALETTE.line = p.line
  if (p.accentSoft) PALETTE.accentSoft = p.accentSoft
  ACTIVE_ART = theme.art
}

// ---------------------------------------------------------------------------
// TASK-092-R1: Art Direction State + Helpers
// ---------------------------------------------------------------------------

/** Default art direction (EXECUTIVE_NAVY-equivalent). */
const DEFAULT_ART: ArtDirection = {
  backgroundStyle: 'TINTED',
  surfaceStyle: 'OUTLINED',
  shapeStyle: 'ROUNDED',
  typographyPersonality: 'EXECUTIVE',
  decorativeMotif: 'RESTRAINED_RULE',
  dataVizStyle: 'STANDARD',
  density: 'BALANCED',
  metricTreatment: 'CARD_PANEL',
  titleTreatment: 'STANDARD',
}

/** Module-level active art direction. Mutated by applyTheme. */
let ACTIVE_ART: ArtDirection = { ...DEFAULT_ART }

/** Current art direction accessors for renderers. */
export function currentArt(): ArtDirection { return ACTIVE_ART }

/**
 * Resolve card shape type from theme shape language.
 * SHARP → RECTANGLE; everything else → ROUND_RECTANGLE.
 */
export function resolveCardShapeType(): 'RECTANGLE' | 'ROUND_RECTANGLE' {
  return ACTIVE_ART.shapeStyle === 'SHARP' ? 'RECTANGLE' : 'ROUND_RECTANGLE'
}

/**
 * Resolve card outline weight from theme shape language.
 * THIN_OUTLINE → 0.5pt; NO_OUTLINE → 0; ACCENT_OUTLINE → 1.5pt; default → 1pt.
 */
export function resolveCardOutlineWeight(): number {
  switch (ACTIVE_ART.shapeStyle) {
    case 'THIN_OUTLINE': return 0.5
    case 'NO_OUTLINE': return 0
    case 'ACCENT_OUTLINE': return 1.5
    case 'SHARP': return 0.5
    default: return 1
  }
}

/**
 * Resolve card outline hex from theme. NO_OUTLINE returns undefined.
 */
export function resolveCardOutlineHex(): string | undefined {
  if (ACTIVE_ART.shapeStyle === 'NO_OUTLINE') return undefined
  if (ACTIVE_ART.shapeStyle === 'ACCENT_OUTLINE') return PALETTE.accent
  return PALETTE.line
}

/**
 * Resolve card fill based on surface style.
 * NO_CARD → transparent; DARK_PANEL → cardFill; SOFT_FILL → accentSoft; default → cardFill.
 */
export function resolveCardFill(): string | undefined {
  switch (ACTIVE_ART.surfaceStyle) {
    case 'NO_CARD': return undefined
    case 'MINIMAL_RULE': return undefined
    case 'DARK_PANEL': return PALETTE.cardFill
    case 'ACCENT_EDGE': return PALETTE.cardFill
    case 'SOFT_FILL': return PALETTE.accentSoft
    default: return PALETTE.cardFill
  }
}

/**
 * Resolve text color for a given role based on the card fill beneath.
 * White text on dark panels; ink text on light surfaces.
 */
export function resolveTextFill(role: 'ink' | 'muted' | 'accent' | 'white'): string {
  const isDarkSurface = ACTIVE_ART.surfaceStyle === 'DARK_PANEL' || ACTIVE_ART.surfaceStyle === 'ACCENT_EDGE'
  if (role === 'white') return isDarkSurface ? PALETTE.ink : '#FFFFFF'
  if (role === 'ink') return PALETTE.ink
  if (role === 'muted') return isDarkSurface ? PALETTE.muted : PALETTE.muted
  return PALETTE.accent
}

/**
 * Resolve font family based on typography personality.
 */
export function resolveFontFamily(role: 'title' | 'body' | 'metric' | 'caption'): string | undefined {
  switch (ACTIVE_ART.typographyPersonality) {
    case 'EDITORIAL':
      // Typography-led: serif feel via Georgia (safe cross-platform)
      return role === 'title' ? 'Georgia' : role === 'metric' ? 'Georgia' : undefined
    case 'MONO':
      // Data/intelligence: monospace for metrics
      return role === 'metric' ? 'Courier New' : role === 'caption' ? 'Courier New' : undefined
    case 'TECH':
      // Modern sans-serif emphasis
      return undefined // Uses deck default (already sans)
    case 'BRAND':
      return undefined
    case 'EXECUTIVE':
    case 'FORMAL':
    default:
      return undefined
  }
}

/**
 * Resolve title bold from title treatment.
 */
export function resolveTitleBold(): boolean {
  switch (ACTIVE_ART.titleTreatment) {
    case 'LIGHTWEIGHT': return false
    case 'HEAVY': return true
    case 'BRAND_ACCENT': return true
    default: return true
  }
}

/**
 * Resolve metric font size multiplier from metric treatment.
 */
export function resolveMetricScale(): number {
  switch (ACTIVE_ART.metricTreatment) {
    case 'HERO_NUMBER': return 1.2
    case 'ELEVATED': return 1.1
    case 'STRIP': return 0.9
    default: return 1.0
  }
}

/**
 * Resolve density multiplier for spacing.
 */
export function resolveDensityMul(): number {
  switch (ACTIVE_ART.density) {
    case 'SPACIOUS': return 1.15
    case 'COMPACT': return 0.85
    default: return 1.0
  }
}

/**
 * Resolve bar track fill (background behind data bars).
 */
export function resolveBarTrackFill(): string {
  if (ACTIVE_ART.surfaceStyle === 'DARK_PANEL' || ACTIVE_ART.surfaceStyle === 'ACCENT_EDGE') {
    return PALETTE.line
  }
  return PALETTE.accentSoft
}

/**
 * Resolve bar fill for a given index.
 * LUMINOUS cycles accent→accent2; STRONG_MAGNITUDE always accent; ANALYTICAL accent2-first.
 */
export function resolveBarFill(index: number): string {
  switch (ACTIVE_ART.dataVizStyle) {
    case 'LUMINOUS':
      return index % 2 === 0 ? PALETTE.accent : PALETTE.accent2
    case 'ANALYTICAL':
      return index % 2 === 0 ? PALETTE.accent2 : PALETTE.accent
    case 'STRONG_MAGNITUDE':
      return PALETTE.accent
    case 'REFINED':
      return index === 0 ? PALETTE.accent : PALETTE.muted
    default:
      return PALETTE.accent
  }
}

/**
 * Resolve segment fill for parts-of-whole charts.
 */
export function resolveSegmentFill(index: number, total: number): string {
  const fills = [PALETTE.accent, PALETTE.accent2, PALETTE.muted, PALETTE.accentSoft, PALETTE.line, PALETTE.cardFill]
  if (ACTIVE_ART.dataVizStyle === 'LUMINOUS') {
    const luminous = [PALETTE.accent, PALETTE.accent2, PALETTE.accentSoft]
    return luminous[index % luminous.length]
  }
  if (ACTIVE_ART.dataVizStyle === 'ANALYTICAL') {
    const analytical = [PALETTE.accent2, PALETTE.accent, PALETTE.accentSoft, PALETTE.muted]
    return analytical[index % analytical.length]
  }
  return fills[index % fills.length]
}

/**
 * Resolve funnel stage background.
 */
export function resolveFunnelStageFill(): string {
  if (ACTIVE_ART.surfaceStyle === 'DARK_PANEL') return PALETTE.cardFill
  if (ACTIVE_ART.surfaceStyle === 'ACCENT_EDGE') return PALETTE.cardFill
  return PALETTE.accentSoft
}

/**
 * Resolve decorative motif requests for a given slide region.
 * Returns shape requests to add to the ctx. Caller splices into ctx.requests.
 */
export function buildDecorativeRequests(
  ctx: Ctx,
  region: { x: number; y: number; w: number; h: number },
): Array<{ shapeType: string; x: number; y: number; width: number; height: number; fillHex: string; prefix: string }> {
  const motifs: Array<{ shapeType: string; x: number; y: number; width: number; height: number; fillHex: string; prefix: string }> = []
  const sx = ctx.g.page.sx
  const sy = ctx.g.page.sy

  switch (ACTIVE_ART.decorativeMotif) {
    case 'LAYERED_HERO': {
      // Dark gradient-like: secondary translucent region at top-right
      const heroW = region.w * 0.4
      const heroH = region.h * 0.6
      motifs.push({
        shapeType: 'ROUND_RECTANGLE',
        x: region.x + region.w - heroW - 20 * sx,
        y: region.y,
        width: heroW,
        height: heroH,
        fillHex: PALETTE.accentSoft,
        prefix: 'DECO_HERO',
      })
      // Accent strip at bottom
      motifs.push({
        shapeType: 'RECTANGLE',
        x: region.x,
        y: region.y + region.h - 6 * sy,
        width: region.w,
        height: 6 * sy,
        fillHex: PALETTE.accent,
        prefix: 'DECO_STRIP',
      })
      break
    }
    case 'ANGULAR_ACCENT': {
      // Sharp diagonal accent block at top-left
      motifs.push({
        shapeType: 'RECTANGLE',
        x: region.x,
        y: region.y,
        width: 8 * sx,
        height: region.h * 0.7,
        fillHex: PALETTE.accent,
        prefix: 'DECO_ANG',
      })
      break
    }
    case 'RESTRAINED_RULE': {
      // Thin horizontal rule below title
      motifs.push({
        shapeType: 'RECTANGLE',
        x: region.x,
        y: region.y + 48 * sy,
        width: 64 * sx,
        height: 2 * sy,
        fillHex: PALETTE.accent,
        prefix: 'DECO_RULE',
      })
      break
    }
    case 'THIN_DIVIDERS': {
      // Subtle vertical divider between columns (if region is wide enough)
      if (region.w > 400 * sx) {
        motifs.push({
          shapeType: 'RECTANGLE',
          x: region.x + region.w * 0.5 - 0.5 * sx,
          y: region.y + 20 * sy,
          width: 1 * sx,
          height: region.h - 40 * sy,
          fillHex: PALETTE.line,
          prefix: 'DECO_DIV',
        })
      }
      break
    }
    case 'SOFT_REGION': {
      // Soft tinted background region
      motifs.push({
        shapeType: 'ROUND_RECTANGLE',
        x: region.x + 16 * sx,
        y: region.y + 16 * sy,
        width: region.w - 32 * sx,
        height: region.h - 32 * sy,
        fillHex: PALETTE.accentSoft,
        prefix: 'DECO_SOFT',
      })
      break
    }
    case 'MINIMAL_GEOMETRY': {
      // Small geometric accent at bottom-right
      motifs.push({
        shapeType: 'RECTANGLE',
        x: region.x + region.w - 32 * sx,
        y: region.y + region.h - 8 * sy,
        width: 32 * sx,
        height: 3 * sy,
        fillHex: PALETTE.accent,
        prefix: 'DECO_GEO',
      })
      break
    }
    case 'BRANDED_ACCENT': {
      // Accent bar at top of region
      motifs.push({
        shapeType: 'RECTANGLE',
        x: region.x,
        y: region.y,
        width: region.w,
        height: 5 * sy,
        fillHex: PALETTE.accent,
        prefix: 'DECO_BRAND',
      })
      break
    }
  }
  return motifs
}

/**
 * Build background shapes for themed backgrounds (gradient-like, hero-dark, etc.)
 * Returns shapes to be placed behind all other content (SEND_TO_BACK z-order).
 */
/**
 * TASK-094: linear mix of two #RRGGBB colors (t=0 → a, t=1 → b).
 * Used to derive intermediate tonal stops for gradient-like progressions.
 */
export function mixHex(hexA: string, hexB: string, t: number): string {
  const clamp = Math.min(1, Math.max(0, t))
  const pa = /^#([0-9a-f]{6})$/i.exec(hexA)
  const pb = /^#([0-9a-f]{6})$/i.exec(hexB)
  if (!pa || !pb) failPlan('mixHex requires #RRGGBB inputs.')
  const ch = (o: number): string => {
    const va = parseInt((pa as RegExpExecArray)[1].slice(o, o + 2), 16)
    const vb = parseInt((pb as RegExpExecArray)[1].slice(o, o + 2), 16)
    return Math.round(va + (vb - va) * clamp)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  }
  return `#${ch(0)}${ch(2)}${ch(4)}`
}

export type BackgroundVariant =
  | 'GRADIENT_HERO'
  | 'GRADIENT_BAND_TOP'
  | 'GRADIENT_BAND_BOTTOM'
  | 'GRADIENT_RAIL'
  | 'HERO_DARK'
  | 'SPLIT_REGION'
  | 'NONE'

/**
 * TASK-094-R2: honest background-composition reporting.
 * gradientTechnique is TONAL_BANDS only for layered tonal progressions;
 * everything else is SOLID_FIELDS — solid overlapping shapes are never
 * called a native gradient (the builders only emit solid fills).
 */
export type GradientTechnique = 'TONAL_BANDS' | 'SOLID_FIELDS'

export interface BackgroundComposition {
  gradientTechnique: GradientTechnique
  motifRole: 'hero' | 'band' | 'rail' | 'field' | 'flat'
  motifVariant: string
  placementFamily:
    | 'asymmetric-hero'
    | 'top-band'
    | 'bottom-grounded'
    | 'left-rail'
    | 'top-hero'
    | 'split'
    | 'flat'
}

export function describeBackgroundComposition(variant: BackgroundVariant): BackgroundComposition {
  switch (variant) {
    case 'GRADIENT_HERO':
      return { gradientTechnique: 'TONAL_BANDS', motifRole: 'hero', motifVariant: variant, placementFamily: 'asymmetric-hero' }
    case 'GRADIENT_BAND_TOP':
      return { gradientTechnique: 'TONAL_BANDS', motifRole: 'band', motifVariant: variant, placementFamily: 'top-band' }
    case 'GRADIENT_BAND_BOTTOM':
      return { gradientTechnique: 'TONAL_BANDS', motifRole: 'band', motifVariant: variant, placementFamily: 'bottom-grounded' }
    case 'GRADIENT_RAIL':
      return { gradientTechnique: 'TONAL_BANDS', motifRole: 'rail', motifVariant: variant, placementFamily: 'left-rail' }
    case 'HERO_DARK':
      return { gradientTechnique: 'SOLID_FIELDS', motifRole: 'field', motifVariant: variant, placementFamily: 'top-hero' }
    case 'SPLIT_REGION':
      return { gradientTechnique: 'SOLID_FIELDS', motifRole: 'field', motifVariant: variant, placementFamily: 'split' }
    case 'NONE':
    default:
      return { gradientTechnique: 'SOLID_FIELDS', motifRole: 'flat', motifVariant: variant, placementFamily: 'flat' }
  }
}

export function buildBackgroundRequests(
  ctx: Ctx,
  pageW: number,
  pageH: number,
  role?: string
): Array<{ shapeType: string; x: number; y: number; width: number; height: number; fillHex: string; prefix: string; zOrder: string; variant: BackgroundVariant }> {
  type BgShape = { shapeType: string; x: number; y: number; width: number; height: number; fillHex: string; prefix: string; zOrder: string; variant: BackgroundVariant }
  const shapes: BgShape[] = []

  switch (ACTIVE_ART.backgroundStyle) {
    case 'GRADIENT_LIKE': {
      // TASK-094: true tonal progression, not one solid block. Full-width
      // bands step monotonically from the dark base toward the accent
      // (base → card → soft → accent-mix). The variant follows the slide
      // role so one motif never dominates every slide identically: covers
      // anchor edge-to-edge, narrative roles ground the bottom, process
      // roles carry a left rail, data roles keep a compact top band. All
      // bands are background-kind + SEND_TO_BACK: they never collide with
      // content and never cover factual objects. Metadata stays
      // GRADIENT_LIKE (an approximation built from editable native shapes,
      // not a native gradient fill — the builders only emit solid fills).
      const hero = role === 'COVER'
      const bottom = role === 'EXECUTIVE_SUMMARY' || role === 'CLOSING_INSIGHT'
      const rail = role === 'PROCESS_FUNNEL' || role === 'TIMELINE_ROADMAP'
      const variant: BackgroundVariant = hero
        ? 'GRADIENT_HERO'
        : bottom
          ? 'GRADIENT_BAND_BOTTOM'
          : rail
            ? 'GRADIENT_RAIL'
            : 'GRADIENT_BAND_TOP'
      if (rail) {
        // TASK-096-R5: layout-aware rail — positioned on RIGHT side to avoid
        // intersecting title region (title at x=M, rail must not overlap).
        // Rail width reduced to 8% of page width to stay decorative.
        const railW = Math.min(pageW * 0.08, pageW * 0.1)
        const railX = pageW - railW
        const segs = [
          { h: 0.45, fill: PALETTE.background, prefix: 'BG_R0' },
          { h: 0.3, fill: PALETTE.cardFill, prefix: 'BG_R1' },
          { h: 0.25, fill: PALETTE.accentSoft, prefix: 'BG_R2' },
        ]
        let y = 0
        for (const s of segs) {
          const h = pageH * s.h
          shapes.push({
            shapeType: 'RECTANGLE',
            x: railX,
            y,
            width: railW,
            height: h,
            fillHex: s.fill,
            prefix: s.prefix,
            zOrder: 'SEND_TO_BACK',
            variant,
          })
          y += h
        }
        break
      }
      const stops = hero
        ? [
            { h: 0.45, fill: PALETTE.background, prefix: 'BG_G0' },
            { h: 0.25, fill: PALETTE.cardFill, prefix: 'BG_G1' },
            { h: 0.18, fill: PALETTE.accentSoft, prefix: 'BG_G2' },
            { h: 0.12, fill: mixHex(PALETTE.accentSoft, PALETTE.accent, 0.55), prefix: 'BG_G3' },
          ]
        : [
            { h: 0.32, fill: PALETTE.background, prefix: 'BG_G0' },
            { h: 0.14, fill: PALETTE.cardFill, prefix: 'BG_G1' },
            { h: 0.09, fill: PALETTE.accentSoft, prefix: 'BG_G2' },
          ]
      if (bottom) {
        // TASK-096-R5: layout-aware bottom bands — reduced height to avoid
        // intersecting thesis/closing content. Bands limited to bottom 15%
        // of page height (was 55% previously). Thesis protected region:
        // y=150*sy to y=370*sy on 960x540 design canvas.
        const maxBandH = pageH * 0.15
        let y = pageH
        for (let i = stops.length - 1; i >= 0; i -= 1) {
          const s = stops[i]
          const h = Math.min(pageH * s.h, maxBandH / stops.length)
          y -= h
          shapes.push({
            shapeType: 'RECTANGLE',
            x: 0,
            y,
            width: pageW,
            height: h,
            fillHex: s.fill,
            prefix: s.prefix,
            zOrder: 'SEND_TO_BACK',
            variant,
          })
        }
      } else {
        // TASK-096-R5-A: layout-aware top bands — placed BELOW the title
        // region with 8pt clearance, above the content region. Bands must
        // never overlap the title (y=titleEnd..titleEnd+8 is the exclusion
        // zone). Available band region: [titleEnd+8, CONTENT_TOP].
        const titleEnd = (pageH / 18) + (84 * (pageH / 540)) // safe.myTop + titleH
        const bandStart = titleEnd + 8
        const bandEnd = pageH / 18 + (84 * (pageH / 540)) + 36 * (pageH / 540) // CONTENT_TOP
        const maxBandH = Math.max(0, bandEnd - bandStart)
        let y = bandStart
        for (const s of stops) {
          const h = maxBandH > 0 ? Math.min(pageH * s.h, maxBandH / stops.length) : 0
          if (h <= 0) continue
          shapes.push({
            shapeType: 'RECTANGLE',
            x: 0,
            y,
            width: pageW,
            height: h,
            fillHex: s.fill,
            prefix: s.prefix,
            zOrder: 'SEND_TO_BACK',
            variant,
          })
          y += h
        }
      }
      break
    }
    case 'HERO_DARK': {
      // Dark hero region at top — clamped to canvas
      shapes.push({
        shapeType: 'RECTANGLE',
        x: 0,
        y: 0,
        width: pageW,
        height: Math.min(pageH * 0.45, pageH),
        fillHex: PALETTE.cardFill,
        prefix: 'BG_HERO',
        zOrder: 'SEND_TO_BACK',
        variant: 'HERO_DARK',
      })
      break
    }
    case 'SPLIT_REGION': {
      // Split left/right — clamped to canvas
      shapes.push({
        shapeType: 'RECTANGLE',
        x: 0,
        y: 0,
        width: Math.min(pageW * 0.4, pageW),
        height: pageH,
        fillHex: PALETTE.accentSoft,
        prefix: 'BG_SPLIT',
        zOrder: 'SEND_TO_BACK',
        variant: 'SPLIT_REGION',
      })
      break
    }
    default:
      break
  }
  return shapes
}

/**
 * TASK-093-R1: native page-background request from the resolved Alpha theme.
 * Returns a request only when an Alpha theme was explicitly resolved
 * (source !== 'DEFAULT') AND its palette background is dark (luminance < 0.5).
 * Light Alpha themes return null so the legacy Google light-tint path applies.
 * Dark page backgrounds are what make MODERN_GRADIENT/BOLD_TECH/DATA_INTELLIGENCE
 * visibly dark on the live path — background shapes alone leave the canvas white.
 * The op carries no objectId, so presence QA and createdIds are unaffected.
 */
export function alphaPageBackgroundRequest(
  pageObjectId: string,
  themeResolvedId: string | undefined,
  themeSource: string | undefined
): import('./visual').GoogleRequest | null {
  if (!themeResolvedId || !themeSource || themeSource === 'DEFAULT') return null
  const t = resolveTheme(themeResolvedId)
  const bg = t?.palette.background
  if (typeof bg !== 'string' || !/^#[0-9a-f]{6}$/i.test(bg)) return null
  if (relativeLuminance(bg) >= 0.5) return null
  return buildUpdatePageBackground(pageObjectId, { backgroundHex: bg.toUpperCase() })
}

/** Relative luminance of #RRGGBB (local copy; mirrors visual.themeHexLuminance). */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return NaN
  const c = [0, 2, 4].map((o) => {
    const v = parseInt(m[1].slice(o, o + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

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
  /** TASK-090-R1: peer-group shared goal (pillars); rendered as foundation, never droppable. */
  sharedGoal?: string
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
    encoding: string
    /** TASK-092: theme resolution evidence. */
    themeRequested?: string
    themeResolved?: string
    themeSource?: string
    /** TASK-094: background treatment variant of the final attempt. */
    backgroundVariant?: string
    /** TASK-094-R2: honest background composition reporting. */
    gradientTechnique?: string
    motifVariant?: string
    placementFamily?: string
    /** TASK-094-R1: source-to-input fidelity (PROVEN/UNPROVEN/FAILED). */
    sourceToInputFidelity?: string
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
  /** TASK-093-R2: stored text of the reused native TITLE placeholder (''
    when empty). Decides whether title replacement may emit `deleteText`
    (Google rejects deleting ALL of an empty span). */
  reuseTitleText: string | null
  /** TASK-086: native title rect for subtitle anchoring on REUSE. */
  reuseTitleRect: { x: number; y: number; w: number; h: number } | null
  /**
   * TASK-090: resolved accent colors. Defaults are the palette tokens;
   * composeSlideOnPage overrides from the presentation theme when a usable,
   * contrast-safe theme role exists (else palette fallback — always legible).
   */
  accentHex: string
  accent2Hex: string
  /** TASK-090: proportion sets for VISUAL_PROPORTIONAL_ORDER QA. */
  proportions: Array<{ ids: string[]; values: number[]; labels?: string[] }>
  /** TASK-090-R1: actual visual encoding this run emitted (renderer-set). */
  encoding: string
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
    reuseTitleText: null,
    reuseTitleRect: null,
    accentHex: PALETTE.accent,
    accent2Hex: PALETTE.accent2,
    proportions: [],
    encoding: '',
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
      encoding: ctx.encoding,
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
  const isBold = (style as { bold?: unknown }).bold === true
  const colorHex =
    typeof (style as { colorHex?: unknown }).colorHex === 'string'
      ? ((style as { colorHex?: unknown }).colorHex as string).toUpperCase()
      : undefined
  ctx.placed.push({
    id: objectId,
    kind: 'text',
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    text,
    ...(fontPt !== undefined ? { fontPt } : {}),
    ...(isBold ? { bold: true } : {}),
    ...(colorHex !== undefined ? { colorHex } : {}),
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
  opts: { fillHex?: string; outlineHex?: string; outlineWeightPt?: number; text?: string; prefix: string } & PlaceMeta
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
    ...(opts.outlineWeightPt !== undefined ? { outlineWeightPt: opts.outlineWeightPt } : {}),
    ...(opts.text !== undefined && opts.text !== '' ? { text: opts.text } : {}),
  })
  ctx.requests.push(...built.requests)
  ctx.elements += 1
  if (opts.text) trackText(ctx, opts.text)
  ctx.placed.push({
    id: objectId,
    kind: opts.background === true ? 'background' : 'shape',
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    ...(opts.fillHex !== undefined ? { fillHex: opts.fillHex } : {}),
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
  page: { width: number; height: number; w?: number; h?: number } = CANVAS
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
  const pw = page.width ?? page.w ?? CANVAS.width
  const ph = page.height ?? page.h ?? CANVAS.height
  if (r.x < 0 || r.y < 0 || r.x + r.width > pw + 1 || r.y + r.height > ph + 1) {
    failPlan(`${label} overflows page ${pw}x${ph} (x=${r.x},y=${r.y},w=${r.width},h=${r.height}).`)
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
      // TASK-093-R2: pass the stored placeholder text — empty placeholders
      // get insert-only (no `deleteText`, which Google rejects on empty spans).
      ...buildTextMutation({
        objectId: ctx.reuseTitleId,
        mode: 'set',
        text: title,
        ...(ctx.reuseTitleText !== null && ctx.reuseTitleText !== undefined
          ? { existingText: ctx.reuseTitleText }
          : {}),
      }),
      buildUpdateTextStyle({
        objectId: ctx.reuseTitleId,
        style: { fontSizePt: style.fontSizePt, bold: style.bold, colorHex: PALETTE.ink },
      }),
      buildUpdateParagraphStyle({ objectId: ctx.reuseTitleId, alignment: 'START' })
    )
    ctx.elements += 1
    trackText(ctx, title, true)
    const anchor = ctx.reuseTitleRect ?? { x: g.TITLE.x, y: g.TITLE.y, w: g.TITLE.w, h: g.TITLE.h }
    // TASK-094: the reused native title is real text in a real box — track it
    // for containment/collision QA like any created box. Previously it was
    // invisible to QA, so an overflowing reused title still reached PROVEN.
    ctx.placed.push({
      id: `native:${ctx.reuseTitleId}`,
      kind: 'text',
      rect: { x: anchor.x, y: anchor.y, w: anchor.w, h: anchor.h },
      text: title,
      fontPt: style.fontSizePt,
      bold: true,
      colorHex: PALETTE.ink.toUpperCase(),
      role: 'slideTitle',
    })
    if (subtitle?.trim()) {
      addTextBox(ctx, subtitle.trim(), anchor.x, anchor.y + anchor.h + 4, g.W - g.M * 2, 30 * g.page.sy, {
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
    ...(resolveFontFamily('title') !== undefined ? { fontFamily: resolveFontFamily('title') } : {}),
  }, 'TITLE', true, { role: 'slideTitle' })
  // TASK-094-R2: whitespace-only subtitles carry no content — emitting a box
  // for them creates an orphan container. The accent-bar offset below keys
  // off the same condition, so both stay consistent.
  if (subtitle?.trim()) {
    addTextBox(ctx, subtitle.trim(), g.TITLE.x, g.TITLE.y + g.TITLE.h + 4, 600 * g.page.sx, 30 * g.page.sy, {
      ...t(ctx, 'body'),
      colorHex: PALETTE.muted,
      alignment: 'START',
    }, 'SUB', false, { role: 'body' })
  }
  addShape(ctx, 'RECTANGLE', g.TITLE.x, g.TITLE.y + g.TITLE.h + (subtitle?.trim() ? 38 : 8), 64 * g.page.sx, ACCENT_BAR_W * g.page.sy, {
    fillHex: ctx.accentHex,
    prefix: 'ACCBAR',
  })
}

// ---------------------------------------------------------------------------
// Archetype renderers (deterministic geometry, native objects only)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TASK-090-R1: semantic intent routing + payload adapters.
// The engine owns the classification → adapter → renderer contract so a
// supported intent always reaches its visual encoding. Agent payloads are
// honored when sound; distribution-shaped content under a degrading
// archetype is redirected (reported, never silent). No benchmark, deck, or
// presentation IDs appear here — patterns generalize by shape, not string.
// ---------------------------------------------------------------------------

/** Short "Label 42%" distribution line parsed from a raw bullet. */
export interface ShareLine {
  label: string
  shareText: string
  share: number
}

/**
 * Detect pure distribution lines: short label + single trailing percent,
 * nothing else. "Performance Ads: 42%" qualifies; "Ads 55 percent Rp 2.64B"
 * does not (trailing amount belongs to the budget path). Requires >=3 lines.
 */
export function detectShareLines(bullets: string[] | undefined): ShareLine[] | null {
  if (!bullets || bullets.length < 3) return null
  const out: ShareLine[] = []
  for (const b of bullets) {
    const text = b.trim()
    if (text.length === 0 || text.length > 80) return null
    const m = /^([^:\d][^:]*?)\s*:?\s*(\d[\d.,]*\s*(?:%|percent))\s*$/.exec(text)
    if (!m) return null
    const label = m[1].trim()
    if (label.length < 2 || label.length > 48) return null
    const share = parsePercentShare(m[2])
    if (share === null) return null
    out.push({ label, shareText: m[2].trim(), share })
  }
  return out
}

/** Total line ("Total ... Rp 4B"): whole-claim marker for budget routing. */
export interface TotalLine {
  text: string
  amount: string | null
}

export function detectTotalLine(title: string | undefined, subtitle: string | undefined, bullets: string[] | undefined): TotalLine | null {
  const cands = [title ?? '', subtitle ?? '', ...(bullets ?? [])]
  for (const c of cands) {
    if (!/total/i.test(c)) continue
    const cur = /(Rp\s?[\d.,]+\s*(?:ribu|juta|miliar)?[BMK]?\b|\$[\d.,]+[BMK]?\b|\d[\d.,]*\s*(?:million|billion)\b)/i.exec(c)
    return { text: c.trim(), amount: cur ? cur[0].trim() : null }
  }
  return null
}

/** "Label: value" pairs with parseable values (KPI shape). */
export interface KpiPair {
  label: string
  value: string
}

export function detectKpiPairs(bullets: string[] | undefined): KpiPair[] | null {
  if (!bullets || bullets.length < 2) return null
  const out: KpiPair[] = []
  for (const b of bullets) {
    const m = /^([^:]{2,80}?)\s*:\s*(.+)$/.exec(b.trim())
    if (!m) return null
    if (parseMagnitude(m[2]) === null) return null
    out.push({ label: m[1].trim(), value: m[2].trim() })
  }
  return out.length >= 2 ? out : null
}

/** Conversion-journey vocabulary (funnel) vs peer-category ranking. */
const FUNNEL_WORDS = /visitor|leads?\b|trial|funnel|stage|step|prospect|signup|sign-?up|onboard|onboarding|awareness|consideration|conversion|advocacy|pipeline|journey|acquisition/i

export function hasFunnelSemantics(title: string | undefined, bullets: string[] | undefined): boolean {
  if (title && FUNNEL_WORDS.test(title)) return true
  const hits = (bullets ?? []).filter((b) => FUNNEL_WORDS.test(b)).length
  return hits >= 2
}

/** Split "Label: value" or trailing-magnitude lines into stages. */
export function splitLabelValue(line: string): { label: string; description: string } | null {
  const t = line.trim()
  if (!t) return null
  const colon = /^(.+?)\s*:\s*(.+)$/.exec(t)
  if (colon && colon[1].trim().length >= 2) return { label: colon[1].trim(), description: colon[2].trim() }
  const tail = /^(.*?)\s+((?:Rp|USD|\$)?\s*[+-]?\d[\d.,]*\s*(?:[BMK]\b|%|percent\b)?)\s*$/.exec(t)
  if (tail && tail[1].trim().length >= 2 && parseMagnitude(tail[2]) !== null) {
    return { label: tail[1].trim(), description: tail[2].trim() }
  }
  return null
}

/** Goal-line extraction ("Goal: ...", "Shared goal: ...", ...). */
export function extractSharedGoal(bullets: string[] | undefined): { goal: string; rest: string[] } | null {
  if (!bullets) return null
  const rest: string[] = []
  let goal: string | null = null
  for (const b of bullets) {
    const m = /^(?:shared\s+goal|goal|mission|vision)\s*:\s*(.+)$/i.exec(b.trim())
    if (m && m[1].trim().length > 0 && goal === null) {
      goal = m[1].trim()
      continue
    }
    rest.push(b)
  }
  return goal !== null ? { goal, rest } : null
}

/** Quarter/date-led bullets (timeline shape). */
export function detectTimelineStages(bullets: string[] | undefined): StageDatum[] | null {
  if (!bullets || bullets.length < 2) return null
  const DATE_LEAD = /^(Q[1-4]|Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|H[12]|20\d\d|Month\s+\d+|Week\s+\d+|Phase\s+\d+)\b/i
  const out: StageDatum[] = []
  for (const b of bullets) {
    const t = b.trim()
    const m = DATE_LEAD.exec(t)
    if (!m) return null
    const head = m[0]
    const tail = t.slice(head.length).replace(/^[-–—:\s]+/, '').trim()
    out.push(tail ? { label: head.trim(), description: tail } : { label: head.trim() })
  }
  return out
}

/** Machine-verifiable visual encoding identities (see §38/§58). */
export const VISUAL_ENCODINGS = [
  'COVER',
  'EXECUTIVE_SUMMARY_METRIC_HERO',
  'NUMBERED_SUMMARY',
  'KPI_GRID',
  'PROPORTIONAL_FUNNEL',
  'PROCESS_STAGES',
  'PAIRED_COMPARISON',
  'TIMELINE',
  'PILLARS_CLASSIC',
  'PILLARS_WITH_SHARED_FOUNDATION',
  'RANKED_PROPORTIONAL_BARS',
  'PARTS_OF_WHOLE_STACK',
  'CLOSING_INSIGHT',
] as const
export type VisualEncoding = (typeof VISUAL_ENCODINGS)[number]

export interface RawSource {
  title: string
  subtitle?: string
  bullets?: string[]
  position?: 'first' | 'middle' | 'last'
}

export interface AdaptedCompose {
  archetype: Archetype
  content: SlideContent
  expectedEncoding: VisualEncoding
  intent: string
  reason: string
}

/** Pillar keywords (explicit, narrow — never bare numbers). */
const PILLAR_WORDS = /pillar|foundation|strategic theme|thrust/i

/**
 * TASK-094-R3: total-peer predicate. An entry is the aggregate whole (not a
 * peer category) when its cleaned label is exactly "total", or when an
 * independent total is stated and the entry claims ~100% (the whole
 * masquerading as a peer). Totals must never become a fifth bar/pillar,
 * a shared goal, or a merged category.
 */
export function isTotalPeer(label: string, share: number | null, independentTotal: string | null): boolean {
  if (normLabel(label) === 'total') return true
  if (independentTotal !== null && share !== null && share >= 99.5) return true
  return false
}

/**
 * TASK-090-R1: raw source → semantic intent → shaped compose payload.
 * Deterministic; every branch is unit-pinned. Order is load-bearing:
 * budget (total + shares) before ranked (shares only); funnel before KPI
 * pairs (journey beats generic pairs); pillars before timeline; comparison
 * via explicit columns-shape; executive prose default; cover/closing by
 * position. Cross-archetype substitution never happens here — each intent
 * maps to its own encoding, or falls through to the honest default.
 */
export function adaptSourceToCompose(src: RawSource): AdaptedCompose {
  const title = src.title.trim()
  const subtitle = src.subtitle?.trim() || undefined
  const bullets = (src.bullets ?? []).map((b) => b.trim()).filter((b) => b.length > 0)
  const position = src.position ?? 'middle'
  const base: SlideContent = {
    title,
    ...(subtitle !== undefined ? { subtitle } : {}),
    ...(bullets.length > 0 ? { bullets } : {}),
  }
  // Cover: first position, intro-ish or compact (title + ≤2 short lines).
  if (position === 'first' && (INTRO_RE.test(`${title} ${subtitle ?? ''}`) || (bullets.length <= 2 && bullets.every((b) => b.length <= 90)))) {
    return {
      archetype: 'COVER',
      content: {
        title,
        ...(subtitle !== undefined ? { subtitle } : bullets.length > 0 ? { subtitle: bullets[0] } : {}),
        ...(subtitle !== undefined ? (bullets.length > 0 ? { closing: bullets.join(' ') } : {}) : bullets.length > 1 ? { closing: bullets.slice(1).join(' ') } : {}),
      },
      expectedEncoding: 'COVER',
      intent: 'COVER',
      reason: 'first position with cover semantics'
    }
  }
  // KPI pairs: ≥2 "Label: value" lines with parseable values.
  const kpiPairs = detectKpiPairs(bullets.length > 0 ? bullets : undefined)
  // Explicit before/after columns with vs-semantics (before generic pairs).
  const vsShaped = bulletsToColumns(bullets.length > 0 ? bullets : undefined)
  const vsSemantics = /vs\.?\b|versus|compar/i.test(`${title} ${bullets.join(' ')}`)
  if (vsShaped && vsShaped.length >= 2 && vsSemantics) {
    return {
      archetype: 'COMPARISON',
      content: { ...base, columns: vsShaped },
      expectedEncoding: 'PAIRED_COMPARISON',
      intent: 'COMPARISON',
      reason: 'explicit before/after columns with comparison semantics'
    }
  }
  // Budget: total line + ≥2 amount+share lines → parts-of-whole columns.
  const total = detectTotalLine(title, subtitle, bullets.length > 0 ? bullets : undefined)
  const budgetLines = detectBudgetLines(bullets.length > 0 ? bullets : undefined)
  if (total && budgetLines && budgetLines.length >= 2) {
    return {
      archetype: 'PILLARS_STRATEGY',
      content: {
        ...base,
        columns: budgetColumns(budgetLines),
      },
      expectedEncoding: 'PARTS_OF_WHOLE_STACK',
      intent: 'BUDGET_DISTRIBUTION',
      reason: 'total line plus percentage shares sum toward a whole'
    }
  }
  // Ranked distribution (needs shares; defined below with other detectors).
  // Ranked distribution: ≥3 short label+% lines, no total claim.
  const rankShares = detectShareLines(bullets.length > 0 ? bullets : undefined)
  if (rankShares && rankShares.length >= 3) {
    return {
      archetype: 'COMPARISON',
      content: {
        ...base,
        columns: rankShares.map((s) => ({ name: s.label, items: [s.shareText] })),
      },
      expectedEncoding: 'RANKED_PROPORTIONAL_BARS',
      intent: 'RANKED_COMPARISON',
      reason: 'peer categories ranked by share, no whole claimed'
    }
  }
  // Funnel journey before generic KPI pairs.
  if (hasFunnelSemantics(title, bullets.length > 0 ? bullets : undefined)) {
    const stages = bullets
      .map((b) => splitLabelValue(b))
      .filter((s): s is { label: string; description: string } => s !== null)
    if (stages.length >= 2) {
      return {
        archetype: 'PROCESS_FUNNEL',
        content: { ...base, stages },
        expectedEncoding: 'PROPORTIONAL_FUNNEL',
        intent: 'FUNNEL',
        reason: 'conversion-journey stages with magnitudes'
      }
    }
  }
  if (kpiPairs && kpiPairs.length >= 2) {
    return {
      archetype: 'KPI_DASHBOARD',
      content: { ...base, metrics: kpiPairs.map((p) => ({ label: p.label, value: p.value })) },
      expectedEncoding: 'KPI_GRID',
      intent: 'KPI_DASHBOARD',
      reason: 'label:value metric pairs'
    }
  }
  // Pillars (+ extracted shared goal) before timeline/comparison.
  {
    const goal = extractSharedGoal(bullets.length > 0 ? bullets : undefined)
    const pillarish = PILLAR_WORDS.test(title) || (bullets ?? []).filter((b) => PILLAR_WORDS.test(b)).length >= 2
    if (pillarish) {
      const cols = bulletsToColumns(goal ? goal.rest : bullets.length > 0 ? bullets : undefined)
      if (cols && cols.length >= 2) {
        return {
          archetype: 'PILLARS_STRATEGY',
          content: { ...base, columns: cols, ...(goal ? { sharedGoal: goal.goal } : {}) },
          expectedEncoding: goal ? 'PILLARS_WITH_SHARED_FOUNDATION' : 'PILLARS_CLASSIC',
          intent: 'PILLARS_STRATEGY',
          reason: goal ? 'peer pillars plus explicit shared goal' : 'peer pillar columns'
        }
      }
    }
  }
  // Timeline: quarter/date-led lines.
  {
    const stages = detectTimelineStages(bullets.length > 0 ? bullets : undefined)
    if (stages && stages.length >= 2) {
      return {
        archetype: 'TIMELINE_ROADMAP',
        content: { ...base, stages },
        expectedEncoding: 'TIMELINE',
        intent: 'TIMELINE_ROADMAP',
        reason: 'chronological stage labels'
      }
    }
  }
  // Comparison via explicit columns-shape bullets.
  {
    const cols = bulletsToColumns(bullets.length > 0 ? bullets : undefined)
    if (cols && cols.length >= 2 && (/vs\.?\b|versus/i.test(title) || /vs\.?\b|versus/i.test(bullets.join(' ')))) {
      return {
        archetype: 'COMPARISON',
        content: { ...base, columns: cols },
        expectedEncoding: 'PAIRED_COMPARISON',
        intent: 'COMPARISON',
        reason: 'explicit before/after columns'
      }
    }
  }
  // Closing: last position with thesis semantics.
  if (position === 'last' && (CLOSING_RE.test(`${title} ${bullets.join(' ')}`) || bullets.length <= 2)) {
    const closing = bullets.length > 0 ? bullets.join(' ') : title
    if (closing.length <= 300) {
      return {
        archetype: 'CLOSING_INSIGHT',
        content: { ...base, closing },
        expectedEncoding: 'CLOSING_INSIGHT',
        intent: 'CLOSING_INSIGHT',
        reason: 'closing position with thesis semantics'
      }
    }
  }
  // Executive prose: extract explicit metrics into metrics[], keep the
  // non-yielding remainder as narrative. Consumed bullets leave content so
  // shaped fields carry every fact verbatim exactly once (no duplication,
  // no verbatim-or-nothing QA trap). Years stay context, never heroes.
  {
    const prose: MetricPhrase[] = []
    const seen = new Set<string>()
    const take = (p: MetricPhrase): void => {
      const key = p.value.toLowerCase().replace(/\s+/g, ' ').trim()
      if (seen.has(key)) return
      seen.add(key)
      prose.push(p)
    }
    for (const b of bullets) {
      const lead = extractMetricPhrase(b)
      if (lead) take(lead)
      for (const p of extractProseMetrics(b)) take({ value: p.value, label: p.label })
    }
    const narrative = bullets.filter((b) => extractMetricPhrase(b) === null && extractProseMetrics(b).length === 0)
    const content: SlideContent = {
      title,
      ...(subtitle !== undefined ? { subtitle } : {}),
      ...(prose.length > 0 ? { metrics: prose.map((p) => ({ label: p.label, value: p.value })) } : {}),
      ...(narrative.length > 0 ? { bullets: narrative } : {}),
    }
    return {
      archetype: 'EXECUTIVE_SUMMARY',
      content,
      expectedEncoding: prose.length >= 2 ? 'EXECUTIVE_SUMMARY_METRIC_HERO' : 'NUMBERED_SUMMARY',
      intent: 'EXECUTIVE_SUMMARY',
      reason: prose.length >= 2 ? 'narrative with explicit metric payload' : 'narrative default'
    }
  }
}

/** Budget allocation line: label + percent share + currency amount, all verbatim. */
export interface BudgetLine {
  label: string
  shareText: string
  share: number
  amount: string
}

/**
 * Detect budget lines: each carries BOTH a percent share and (usually) a
 * currency amount ("Performance Marketing: Rp 2.0B, 50%"). Amount-less
 * share lines fall back to the share text itself — never invented.
 * Returns null unless >=2 lines qualify.
 */
export function detectBudgetLines(bullets: string[] | undefined): BudgetLine[] | null {
  if (!bullets || bullets.length < 2) return null
  const out: BudgetLine[] = []
  for (const b of bullets) {
    const text = b.trim()
    const shareM = /(\d[\d.,]*\s*(?:%|percent))/i.exec(text)
    if (!shareM) return null
    const curM = /(Rp\s?[\d.,]+\s*(?:ribu|juta|miliar)?[BMK]?\b|\$[\d.,]+[BMK]?\b|\d[\d.,]*\s*(?:million|billion)\b)/i.exec(text)
    const cutAt = Math.min(
      shareM.index,
      curM ? curM.index : shareM.index
    )
    const label = text.slice(0, cutAt).replace(/[:\u2013\u2014\-,;\s]+$/g, '').trim()
    if (label.length < 2 || !/[A-Za-z]/.test(label)) return null
    const share = parsePercentShare(shareM[0])
    if (share === null) return null
    out.push({ label, shareText: shareM[0].trim(), share, amount: curM ? curM[0].trim() : shareM[0].trim() })
  }
  return out.length >= 2 ? out : null
}

/** Build budget columns from detected lines (all strings verbatim). */
export function budgetColumns(lines: BudgetLine[]): ColumnDatum[] {
  return lines.map((s) => ({ name: `${s.label} ${s.shareText}`, items: [s.amount] }))
}

/**
 * Detect distribution-shaped metrics[] content: 3+ items with percent-like
 * values (ranked peer categories) or currency+percent (budget allocation).
 * This catches the real-agent path where the model sends KPI_DASHBOARD with
 * metrics that are semantically ranked/budget, not independent KPIs.
 */
function detectDistributionMetrics(
  metrics: MetricDatum[] | undefined,
): { kind: 'ranked' | 'budget'; items: Array<{ label: string; shareText: string; share: number; amount?: string }> } | null {
  if (!metrics || metrics.length < 3) return null
  const items: Array<{ label: string; shareText: string; share: number; amount?: string }> = []
  let pctCount = 0
  for (const m of metrics) {
    const label = (m.label ?? '').trim()
    const value = (m.value ?? '').trim()
    if (!label || !value || label.length < 2 || label.length > 48) return null
    const shareM = /(\d[\d.,]*\s*(?:%|percent))/i.exec(value)
    // TASK-094: all-or-nothing. A metric without a share must NOT be silently
    // skipped while its siblings redirect (that drops a source category, the
    // 4→3 defect class). Mixed content is not distributional: return null so
    // the requested archetype is honored with every fact preserved.
    if (!shareM) return null
    const share = parsePercentShare(shareM[0])
    if (share === null) return null
    const curM = /(Rp\s?[\d.,]+\s*(?:ribu|juta|miliar)?[BMK]?\b|\$[\d.,]+[BMK]?\b)/i.exec(value)
    items.push({ label, shareText: shareM[0].trim(), share, amount: curM ? curM[0].trim() : undefined })
    pctCount++
  }
  if (pctCount < 3 || items.length < 3) return null
  const hasAmount = items.some((i) => i.amount)
  return hasAmount ? { kind: 'budget', items } : { kind: 'ranked', items }
}

/**
 * Detect distribution-shaped bullets: 3+ share lines (from the agent sending
 * raw bullets instead of metrics[]). Catches the case where the model sends
 * channel percentages as bullets to KPI_DASHBOARD.
 */
function detectDistributionBullets(bullets: string[]): { kind: 'ranked' | 'budget'; items: Array<{ label: string; shareText: string; share: number; amount?: string }> } | null {
  const shareLines = detectShareLines(bullets.length > 0 ? bullets : undefined)
  if (shareLines && shareLines.length >= 3) {
    return { kind: 'ranked', items: shareLines.map((s) => ({ label: s.label, shareText: s.shareText, share: s.share })) }
  }
  const budgetLines = detectBudgetLines(bullets.length > 0 ? bullets : undefined)
  if (budgetLines && budgetLines.length >= 3) {
    return { kind: 'budget', items: budgetLines.map((b) => ({ label: b.label, shareText: b.shareText, share: b.share, amount: b.amount })) }
  }
  return null
}

/**
 * Detect funnel-shaped stages: ordered dependent conversion stages with
 * explicit magnitudes. Catches the case where the model sends funnel data
 * under the wrong archetype.
 */
function detectFunnelStages(stages: StageDatum[] | undefined): boolean {
  if (!stages || stages.length < 3) return false
  let numericCount = 0
  for (const s of stages) {
    const text = s.description ?? s.label ?? ''
    if (/\d/.test(text)) numericCount++
  }
  return numericCount >= stages.length - 1
}

/**
 * TASK-090-R2: live routing guard. The engine is the SINGLE semantic authority.
 * The model may suggest an archetype, but the engine validates it against
 * content semantics. Degrading selections are redirected with transparent
 * reporting — never silently honored.
 *
 * Routing checks (in order):
 * 1. Distribution-shaped metrics[] → ranked bars or parts-of-whole
 * 2. Distribution-shaped bullets → ranked bars or parts-of-whole
 * 3. Funnel-shaped stages under wrong archetype → proportional funnel
 * 4. All others → requested archetype honored
 *
 * TASK-094-R3: budget allocations route to COMPARISON (parts-of-whole
 * stacked rendering), never to PILLARS_STRATEGY — pillars geometry drags
 * in shared-goal machinery that fails closed on tight budgets and invites
 * total-as-peer mistakes. Totals are separated before peer counting.
 */
export interface RoutingDecision {
  archetype: Archetype
  patch: Partial<SlideContent>
  encoding: VisualEncoding
  reason: string
  redirected: boolean
  /** TASK-094-R3: detected peer category identities (for routing evidence). */
  categories?: string[]
  /** TASK-094-R3: detected aggregate/total identities (never peers). */
  aggregates?: string[]
}

export function resolveEffectiveArchetype(
  requested: Archetype,
  content: SlideContent
): RoutingDecision {
  const bullets = content.bullets ?? []
  const total = detectTotalLine(content.title, content.subtitle, bullets.length > 0 ? bullets : undefined)
  const totalAmount = total?.amount ?? null
  const totalIdentities = total ? [total.text.trim()] : []
  const budgetLines = detectBudgetLines(bullets.length > 0 ? bullets : undefined)
  const rankShares = detectShareLines(bullets.length > 0 ? bullets : undefined)

  // 1. Bullet-based distribution (original R1 path): share lines in bullets.
  // TASK-094-R3: total-like lines are separated BEFORE peer counting so the
  // whole can never become a fifth peer/category.
  if (rankShares && rankShares.length >= 3 && requested !== 'COMPARISON' && requested !== 'PILLARS_STRATEGY') {
    const peerShares = rankShares.filter((s) => !isTotalPeer(s.label, s.share, totalAmount))
    const peerBudget = (budgetLines ?? []).filter((b) => !isTotalPeer(b.label, b.share, totalAmount))
    if (total && peerBudget.length >= 2) {
      const cols = budgetColumns(peerBudget)
      return {
        archetype: 'COMPARISON',
        patch: { columns: cols },
        encoding: 'PARTS_OF_WHOLE_STACK',
        reason: 'budget distribution under ' + requested + '; routed to parts-of-whole (total kept as aggregate)',
        redirected: true,
        categories: cols.map((c) => c.name),
        aggregates: totalIdentities,
      }
    }
    if (peerShares.length >= 3) {
      const cols = peerShares.map((s) => ({ name: s.label, items: [s.shareText] }))
      return {
        archetype: 'COMPARISON',
        patch: { columns: cols },
        encoding: 'RANKED_PROPORTIONAL_BARS',
        reason: 'ranked distribution under ' + requested + '; routed to ranked bars',
        redirected: true,
        categories: cols.map((c) => c.name),
        aggregates: totalIdentities,
      }
    }
  }

  // 2. Metrics-based distribution (R2): the model sends KPI_DASHBOARD with
  //    metrics[] that are semantically ranked/budget, not independent KPIs.
  //    This is the PRIMARY real-agent failure path (slides 8/9).
  //    TASK-094-R3: budgets route to COMPARISON (stacked), never PILLARS —
  //    pillars geometry couples shared-goal layout that fails closed on
  //    tight budgets. Totals separated before peer counting in all branches.
  if (requested === 'KPI_DASHBOARD') {
    const dist = detectDistributionMetrics(content.metrics)
    if (dist) {
      const peers = dist.items.filter((i) => !isTotalPeer(i.label, i.share, totalAmount))
      if (peers.length >= 3) {
        if (dist.kind === 'budget' && total) {
          const cols = peers.map((i) => ({ name: `${i.label} ${i.shareText}`, items: [i.amount ?? i.shareText] }))
          return {
            archetype: 'COMPARISON',
            patch: { columns: cols },
            encoding: 'PARTS_OF_WHOLE_STACK',
            reason: 'budget allocation in KPI metrics under KPI_DASHBOARD; routed to parts-of-whole (total kept as aggregate)',
            redirected: true,
            categories: cols.map((c) => c.name),
            aggregates: totalIdentities,
          }
        }
        const cols = peers.map((i) => ({ name: i.label, items: [i.shareText] }))
        return {
          archetype: 'COMPARISON',
          patch: { columns: cols },
          encoding: 'RANKED_PROPORTIONAL_BARS',
          reason: 'peer-category percentages in KPI metrics under KPI_DASHBOARD; routed to ranked bars',
          redirected: true,
          categories: cols.map((c) => c.name),
          aggregates: totalIdentities,
        }
      }
    }
    // Also catch distribution-shaped bullets sent to KPI_DASHBOARD.
    const bulletDist = detectDistributionBullets(bullets)
    if (bulletDist) {
      const peers = bulletDist.items.filter((i) => !isTotalPeer(i.label, i.share, totalAmount))
      if (peers.length >= 3) {
        if (bulletDist.kind === 'budget' && total) {
          const cols = peers.map((i) => ({ name: `${i.label} ${i.shareText}`, items: [i.amount ?? i.shareText] }))
          return {
            archetype: 'COMPARISON',
            patch: { columns: cols },
            encoding: 'PARTS_OF_WHOLE_STACK',
            reason: 'budget allocation in KPI bullets under KPI_DASHBOARD; routed to parts-of-whole (total kept as aggregate)',
            redirected: true,
            categories: cols.map((c) => c.name),
            aggregates: totalIdentities,
          }
        }
        const cols = peers.map((i) => ({ name: i.label, items: [i.shareText] }))
        return {
          archetype: 'COMPARISON',
          patch: { columns: cols },
          encoding: 'RANKED_PROPORTIONAL_BARS',
          reason: 'peer-category percentages in KPI bullets under KPI_DASHBOARD; routed to ranked bars',
          redirected: true,
          categories: cols.map((c) => c.name),
          aggregates: totalIdentities,
        }
      }
    }
  }

  // 3. Funnel stages under wrong archetype (R2): ordered conversion stages
  //    with explicit magnitudes must reach proportional funnel encoding.
  if (requested !== 'PROCESS_FUNNEL' && detectFunnelStages(content.stages)) {
    return {
      archetype: 'PROCESS_FUNNEL',
      patch: {},
      encoding: 'PROPORTIONAL_FUNNEL',
      reason: 'conversion-funnel stages with magnitudes under ' + requested + '; routed to proportional funnel',
      redirected: true,
    }
  }

  // 4. Honor the requested archetype for all other content shapes.
  return {
    archetype: requested,
    patch: {},
    encoding: expectedEncodingFor(requested, content),
    reason: 'requested archetype honored',
    redirected: false,
  }
}

/** Expected encoding for an archetype + content (mirrors renderer branches). */
export function expectedEncodingFor(archetype: Archetype, content: SlideContent): VisualEncoding {
  switch (archetype) {
    case 'COVER':
      return 'COVER'
    case 'KPI_DASHBOARD':
      return 'KPI_GRID'
    case 'TIMELINE_ROADMAP':
      return 'TIMELINE'
    case 'CLOSING_INSIGHT':
      return 'CLOSING_INSIGHT'
    case 'EXECUTIVE_SUMMARY':
      return countStripMetrics(content) >= 2 ? 'EXECUTIVE_SUMMARY_METRIC_HERO' : 'NUMBERED_SUMMARY'
    case 'PROCESS_FUNNEL':
      return funnelMagnitudes(content) !== null ? 'PROPORTIONAL_FUNNEL' : 'PROCESS_STAGES'
    case 'COMPARISON': {
      const cols = content.columns ?? []
      if (cols.length >= 3 && cols.every((c) => c.items.length === 1 && parsePercentShare(c.items[0]) !== null)) {
        return 'RANKED_PROPORTIONAL_BARS'
      }
      // TASK-094-R3: mirror of the renderComparison stacked branch (shares
      // in names + amounts rendering as one stacked whole). Totals stripped
      // with the same rule so the mirror cannot drift from the renderer.
      const independentTotal =
        detectTotalLine(content.title, content.subtitle, content.bullets)?.amount ?? null
      const peers = cols.filter(
        (c) => !isTotalPeer(c.name, parsePercentShare(c.items[0] ?? ''), independentTotal)
      )
      const pillarDist = pillarDistribution(peers)
      if (pillarDist !== null && pillarDist.kind === 'stacked') return 'PARTS_OF_WHOLE_STACK'
      const lines = detectShareLines(content.bullets)
      if (lines && lines.length >= 3) return 'RANKED_PROPORTIONAL_BARS'
      return 'PAIRED_COMPARISON'
    }
    case 'PILLARS_STRATEGY': {
      const cols = content.columns ?? []
      const dist = pillarDistribution(cols)
      if (dist && dist.kind === 'stacked') return 'PARTS_OF_WHOLE_STACK'
      if (dist && dist.kind === 'ranked') return 'RANKED_PROPORTIONAL_BARS'
      return content.sharedGoal ? 'PILLARS_WITH_SHARED_FOUNDATION' : 'PILLARS_CLASSIC'
    }
  }
}


function renderCover(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  ctx.encoding = 'COVER'
  const sx = g.page.sx
  const sy = g.page.sy
  titleBlock(ctx, c.title, c.subtitle)
  // TASK-090-R2: tagline recovery — the model may send tagline as a bullet
  // instead of in the closing field. Recover it so the source fact survives.
  const tagline = c.closing?.trim() || (c.bullets && c.bullets.length > 0 ? c.bullets[0]?.trim() : undefined)
  if (tagline) {
    addTextBox(ctx, tagline, g.M, (g.H * 11) / 18, g.W - g.M * 2, (g.H * 2) / 9, {
      ...t(ctx, 'deckTitle'),
      colorHex: PALETTE.ink,
      alignment: 'START',
    }, 'STATEMENT', false, { role: 'deckTitle' })
  }
  // TASK-090: motif system — a soft field anchors the right region, a thin
  // accent rule grounds the statement zone. The field is explicitly layered
  // behind text (deterministic SEND_TO_BACK): the full-width title can extend
  // over the motif region, and creation order alone must not cover text.
  const motifId = addShape(ctx, 'RECTANGLE', g.W - 220 * sx, 140 * sy, 172 * sx, 360 * sy, {
    fillHex: PALETTE.accentSoft,
    prefix: 'ACCENT',
    background: true,
  })
  ctx.requests.push(buildZOrder([motifId], 'SEND_TO_BACK'))
  addShape(ctx, 'RECTANGLE', g.M, (g.H * 11) / 18 - 14 * sy, 64 * sx, 8 * sy, {
    fillHex: ctx.accentHex,
    prefix: 'MOTIF',
  })
}

function renderExecutiveSummary(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  ctx.encoding = 'NUMBERED_SUMMARY'
  titleBlock(ctx, c.title, c.subtitle)
  const bullets = (c.bullets ?? []).slice(0, 5)
  // TASK-090: explicit metrics[] array feeds the strip directly (value/label
  // verbatim); bullets remain the narrative source. Either path (or both)
  // can supply the ≥2 metrics the strip requires.
  const directMetrics = (c.metrics ?? [])
    .filter((m) => m.label?.trim() && m.value?.trim())
    .slice(0, 6)
    .map((m) => ({ value: m.value.trim(), label: m.label.trim() }))
  if (bullets.length === 0 && directMetrics.length < 2) {
    failPlan('EXECUTIVE_SUMMARY requires 1..5 bullets.')
  }
  // Metric-aware summary: leading metrics, explicit metrics[], and prose
  // metrics all feed one deduplicated strip; narrative remainder renders
  // separately. Falls back to numbered rows below the metric threshold.
  const stripMetrics = collectStripMetrics(bullets, directMetrics)
  if (stripMetrics.length >= 2) {
    ctx.encoding = 'EXECUTIVE_SUMMARY_METRIC_HERO'
    ctx.encoding = 'EXECUTIVE_SUMMARY_METRIC_HERO'
    renderSummaryMetricStrip(ctx, stripMetrics, stripNarrative(bullets))
    return
  }
  ctx.encoding = 'NUMBERED_SUMMARY'
  const top = g.CONTENT_TOP + 40 * g.page.sy
  const gap = 12 * g.page.sy
  const rowH = Math.min(64 * g.page.sy, (g.H - top - g.M - (bullets.length - 1) * gap) / bullets.length)
  const dot = 28 * Math.min(g.page.sx, g.page.sy)
  bullets.forEach((b, i) => {
    const y = top + i * (rowH + gap)
    const dotId = addShape(ctx, 'ELLIPSE', g.M, y + 8 * g.page.sy, dot, dot, { fillHex: ctx.accentHex, prefix: 'NUMBG' })
    addTextBox(ctx, String(i + 1), g.M, y + 8 * g.page.sy, dot, dot, {
      ...t(ctx, 'body'),
      // TASK-094-R3: badge digit picks the readable side (dark ink on light
      // accents, white on dark) — white-on-cyan fails contrast visibly.
      colorHex: bestTextOnFill(ctx.accentHex),
      alignment: 'CENTER',
    }, 'NUM', false, { role: 'body', parentId: dotId })
    addTextBox(ctx, b, g.M + 44 * g.page.sx, y, g.W - g.M * 2 - 44 * g.page.sx, rowH, {
      ...t(ctx, 'body'),
      colorHex: PALETTE.ink,
      alignment: 'START',
    }, `ITEM${i}`, false, { role: 'body' })
  })
}

/**
 * TASK-087: split one summary bullet into a (value, label) metric phrase.
 * Only a LEADING metric value qualifies ("Rp 4.8B budget ..." → value
 * "Rp 4.8B", label "budget ..."); the value substring is reused verbatim so
 * numeric facts can never be reformatted. Returns null for narrative lines.
 */
export interface MetricPhrase {
  value: string
  label: string
}

export function extractMetricPhrase(bullet: string): MetricPhrase | null {
  const text = bullet.trim()
  if (!text) return null
  // Leading metric: optional currency word/code/sign, digits with separators,
  // optional compact suffix (B/M/K), optional unit (%, x, currency, words).
  // Deliberately independent of METRIC_VALUE_RE (routing): extraction needs a
  // LEADING value with its full unit, verbatim, for hero display.
  const m = /^\s*((?:Rp|USD|\$)?\s*[+-]?\d[\d.,]*(?:\s*[BMK])?(?:\s*(?:percent\b|percentage\b|%|x\b|Rp\b|USD\b|\$|million\b|billion\b|ribu\b|juta\b|miliar\b))?)/i.exec(text)
  if (!m) return null
  const value = m[1].trim()
  if (!/\d/.test(value)) return null
  // A bare year/quarter alone is context, not a metric ("In 2026 we grew").
  if (/^(19|20)\d{2}$/.test(value) || /^Q[1-4]$/i.test(value)) return null
  const label = text
    .slice(m[0].length)
    .replace(/^[\s:–—-]+/, '')
    .trim()
  if (!label) return null
  return { value, label }
}

/**
 * TASK-090-R1: mid-sentence metric extraction from narrative prose.
 * Finds explicit currency/count/percentage values and associates each with
 * the noun phrase that follows it on the same clause ("Rp 12B annual
 * recurring revenue" → value "Rp 12B", label "annual recurring revenue").
 * Conservative by construction:
 * - bare years (1900–2100) without units are context, never hero values;
 * - values without a following label phrase are skipped (naked numbers);
 * - labels stop at clause boundaries, stopwords, digits, and punctuation.
 * Never invents: every value/label substring comes from the source text.
 */
export interface ProseMetric {
  value: string
  label: string
}
const PROSE_STOPWORDS = new Set(
  'and or while with the a an in on of for to by as at from that this these those it its be is are was were will would per each our their than then so but if when where how both either into over after before between through during without within via around across along also just more most too very which who than'.split(' ')
)
export function extractProseMetrics(text: string): ProseMetric[] {
  const out: ProseMetric[] = []
  const re = /((?:Rp|USD|\$)\s*)?([+-]?\d[\d.,]*)\s*([BMK]\b|%|percent\b)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const value = m[0].trim()
    if (!/\d/.test(value)) continue
    const digitsOnly = m[2].replace(/[.,]/g, '')
    if (!m[1] && !m[3] && /^(19|20)\d{2}$/.test(digitsOnly)) continue
    const rest = text.slice(m.index + m[0].length)
    const words: string[] = []
    for (const tok of rest.split(/\s+/)) {
      if (words.length >= 4) break
      const hasDigit = /\d/.test(tok)
      const clean = tok.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
      if (!clean) {
        if (hasDigit) break
        continue
      }
      if (!/^[A-Za-z]/.test(clean)) break
      if (PROSE_STOPWORDS.has(clean.toLowerCase())) break
      words.push(clean)
      if (/[.!?;,():]$/.test(tok)) break
    }
    if (words.length === 0) continue
    out.push({ value, label: words.join(' ') })
  }
  return out
}

/**
 * TASK-087: demand-driven text box height. Estimates the rendered height of
 * `text` at `fontPt` in a `widthPt` box and pads it, so boxes fit their own
 * content instead of forcing content into fixed boxes. Deterministic: same
 * inputs always yield the same height.
 */
export function fitTextBoxH(
  text: string,
  fontPt: number,
  widthPt: number,
  padPt = 8,
  opts?: { bold?: boolean }
): number {
  const demand = textDemandPt(text, fontPt, Math.max(widthPt, 1), opts)
  if (!Number.isFinite(demand.demandHeightPt)) return padPt * 2 + fontPt
  return Math.ceil(demand.demandHeightPt + padPt * 2 - 0.5) + 0.5
}


/**
 * TASK-090-R1: collect hero-strip metrics from every supply path — explicit
 * metrics[], leading-metric bullets, and mid-sentence prose metrics —
 * deduplicated by normalized value. Single source of truth shared by the
 * renderer and the expected-encoding mirror (no drift by construction).
 */
export function collectStripMetrics(bullets: string[], directMetrics: MetricPhrase[]): MetricPhrase[] {
  const out: MetricPhrase[] = [...directMetrics]
  const normKey = (v: string): string => v.toLowerCase().replace(/\s+/g, ' ').trim()
  const seen = new Set(directMetrics.map((m) => normKey(m.value)))
  const take = (p: MetricPhrase): void => {
    const key = normKey(p.value)
    if (seen.has(key)) return
    seen.add(key)
    out.push(p)
  }
  for (const b of bullets) {
    const lead = extractMetricPhrase(b)
    if (lead) take(lead)
    for (const p of extractProseMetrics(b)) take({ value: p.value, label: p.label })
  }
  return out
}

/** Bullets that yield no metric stay narrative (everything else is consumed). */
export function stripNarrative(bullets: string[]): string[] {
  return bullets.filter((b) => extractMetricPhrase(b) === null && extractProseMetrics(b).length === 0)
}


/** Count hero-strip metrics (single source of truth for strip routing). */
export function countStripMetrics(content: SlideContent): number {
  const direct = (content.metrics ?? [])
    .filter((m) => m.label?.trim() && m.value?.trim())
    .slice(0, 6)
    .map((m) => ({ value: m.value.trim(), label: m.label.trim() }))
  return collectStripMetrics(content.bullets ?? [], direct).length
}

/**
 * TASK-090-R1: funnel magnitudes shared by renderer + expected-encoding.
 * Null unless ≥2 stages with every value parseable (description preferred).
 */
export function funnelMagnitudes(content: SlideContent): number[] | null {
  const stages = (content.stages ?? bulletsToStages(content.bullets) ?? []).slice(0, 6)
  if (stages.length < 2) return null
  const vals = stages.map((s) => parseMagnitude(s.description?.trim() ? s.description : s.label))
  return vals.every((v) => v !== null) ? (vals as number[]) : null
}

/**
 * TASK-090-R1: pillar distribution shared by renderer + expected-encoding.
 * Stacked when percent shares sum to ~100, ranked when shares parse but do
 * not form a whole, null when names carry no shares.
 */
export function pillarDistribution(columns: ColumnDatum[]): { kind: 'stacked' | 'ranked'; shares: number[] } | null {
  if (columns.length < 2) return null
  const shares = columns.map((c) => (c.items.length >= 1 ? parsePercentShare(c.name) : null))
  if (shares.some((s) => s === null)) return null
  const vals = shares as number[]
  const total = vals.reduce((a, b) => a + b, 0)
  return { kind: Math.abs(total - 100) <= 3 ? 'stacked' : 'ranked', shares: vals }
}

// ---------------------------------------------------------------------------
// TASK-094: source-fact inventory + distribution fidelity QA.
// The engine must preserve input cardinality end-to-end: categories,
// labels, values, and totals survive routing, patching, and rendering
// unchanged. These checks compare the compose INPUT inventory against the
// RENDERED geometry inventory (labels + magnitudes captured in
// ctx.proportions) — never metadata labels alone.
// ---------------------------------------------------------------------------

export interface DistributionSourceItem {
  /** Clean category label (share/amount tokens stripped). */
  label: string
  share: number
  shareText: string
  amount?: string
}

export interface DistributionSource {
  kind: 'ranked' | 'budget'
  items: DistributionSourceItem[]
  /** Whole-claim amount text when the source states one (e.g. total budget). */
  total: string | null
}

export interface DistributionRendered {
  labels: string[]
  values: number[]
  /**
   * TASK-094-R3: rendered data-mark widths in pt, parallel to labels/values.
   * When present and aligned, ratios are verified against the linear scale
   * (width_i/width_max vs value_i/value_max within tolerance). Absent widths
   * skip ratio verification (unit-level callers); the plan gate always
   * supplies them, so metadata-only encodings cannot pass there.
   */
  widths?: number[]
}

/** TASK-094-R3: ratio tolerance for rendered data-mark widths (±10%). */
export const PROPORTIONAL_RATIO_TOLERANCE = 0.1
/** TASK-094-R3: zero-share marks must not exceed this visibility bound. */
export const ZERO_SHARE_MAX_PT = 8

const CURRENCY_TOKEN_RE =
  /(Rp\s?[\d.,]+\s*(?:ribu|juta|miliar)?[BMK]?\b|\$[\d.,]+[BMK]?\b|\d[\d.,]*\s*(?:million|billion)\b)/i
const SHARE_TOKEN_RE = /(\d[\d.,]*\s*(?:%|percent))/i

/** Strip share + currency tokens and separators, leaving category words. */
export function cleanDistributionLabel(raw: string): string {
  return raw
    .replace(SHARE_TOKEN_RE, ' ')
    .replace(CURRENCY_TOKEN_RE, ' ')
    .replace(/[:\u2013\u2014\-,;—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normLabel(s: string): string {
  return cleanDistributionLabel(s).toLowerCase()
}

function labelWords(s: string): string[] {
  return normLabel(s).split(' ').filter((w) => w.length > 0)
}

/**
 * Content-only distribution inventory (mirrors resolveEffectiveArchetype
 * priority: bullets → metrics → columns). Returns null when the content is
 * not distribution-shaped — fidelity QA is then skipped, other gates apply.
 */
export function extractDistributionSource(content: SlideContent): DistributionSource | null {
  const bullets = content.bullets ?? []
  const total = detectTotalLine(content.title, content.subtitle, bullets.length > 0 ? bullets : undefined)
  const totalText = total?.amount ?? null
  const rankShares = detectShareLines(bullets.length > 0 ? bullets : undefined)
  if (rankShares && rankShares.length >= 3) {
    const budgetLines = detectBudgetLines(bullets.length > 0 ? bullets : undefined)
    if (total && budgetLines && budgetLines.length >= 2) {
      return {
        kind: 'budget',
        items: budgetLines.map((b) => ({ label: b.label, share: b.share, shareText: b.shareText, amount: b.amount })),
        total: totalText,
      }
    }
    return {
      kind: 'ranked',
      items: rankShares.map((s) => ({ label: s.label, share: s.share, shareText: s.shareText })),
      total: totalText,
    }
  }
  const dist = detectDistributionMetrics(content.metrics)
  if (dist) {
    return {
      kind: dist.kind,
      items: dist.items.map((i) => ({
        label: i.label,
        share: i.share,
        shareText: i.shareText,
        ...(i.amount !== undefined ? { amount: i.amount } : {}),
      })),
      total: totalText,
    }
  }
  const bulletDist = detectDistributionBullets(bullets)
  if (bulletDist) {
    return {
      kind: bulletDist.kind,
      items: bulletDist.items.map((i) => ({
        label: i.label,
        share: i.share,
        shareText: i.shareText,
        ...(i.amount !== undefined ? { amount: i.amount } : {}),
      })),
      total: totalText,
    }
  }
  const rawColumns = content.columns ?? []
  // TASK-094-R3: same total-separation rule as the renderers, so the
  // inventory mirror cannot drift from rendered geometry.
  const independentTotal = detectTotalLine(content.title, content.subtitle, content.bullets)?.amount ?? null
  const columns = rawColumns.filter(
    (c) => !isTotalPeer(c.name, parsePercentShare(c.items[0] ?? ''), independentTotal)
  )
  if (columns.length >= 3 && columns.every((c) => c.items.length === 1 && parsePercentShare(c.items[0]) !== null)) {
    return {
      kind: 'ranked',
      items: columns.map((c) => {
        const share = parsePercentShare(c.items[0]) as number
        return { label: c.name.trim(), share, shareText: c.items[0].trim() }
      }),
      total: totalText,
    }
  }
  const pillarDist = pillarDistribution(columns)
  if (pillarDist) {
    return {
      kind: pillarDist.kind === 'stacked' ? 'budget' : 'ranked',
      items: columns.map((c, i) => ({
        label: cleanDistributionLabel(c.name),
        share: pillarDist.shares[i],
        shareText: String(pillarDist.shares[i]),
        amount: c.items[0]?.trim(),
      })),
      total: totalText,
    }
  }
  return null
}

/**
 * Compare source inventory vs rendered geometry inventory.
 * Every mismatch class is BLOCKING: count, identity, merge, omission, value,
 * and total. Rendered labels are cleaned with the same normalizer as source
 * labels, so verbatim-preserving pipelines match exactly while renames,
 * merges ("Success & Operations"), and drops fail loudly.
 */
export function checkDistributionFidelity(
  source: DistributionSource,
  rendered: DistributionRendered,
  renderedTexts: string[]
): GeometryFinding[] {
  const out = (check: string, pass: boolean, detail?: string): GeometryFinding => ({
    check,
    severity: 'BLOCKING',
    pass,
    ...(detail !== undefined ? { detail } : {}),
  })
  const findings: GeometryFinding[] = []
  if (rendered.labels.length !== source.items.length) {
    findings.push(
      out(
        'SOURCE_CATEGORY_COUNT_MISMATCH',
        false,
        `source=${source.items.length} rendered=${rendered.labels.length}`
      )
    )
    return findings
  }
  const srcLabels = source.items.map((i) => normLabel(i.label)).sort()
  const renLabels = rendered.labels.map((l) => normLabel(l)).sort()
  const identityOk = srcLabels.length === renLabels.length && srcLabels.every((l, i) => l === renLabels[i])
  if (!identityOk) {
    findings.push(
      out(
        'SOURCE_CATEGORY_IDENTITY_MISMATCH',
        false,
        `source=[${srcLabels.join(' | ')}] rendered=[${renLabels.join(' | ')}]`
      )
    )
  }
  // Merge: one rendered label covering words from 2+ distinct source labels.
  const srcWordSets = source.items.map((i) => new Set(labelWords(i.label)))
  for (const rl of rendered.labels) {
    const words = new Set(labelWords(rl))
    if (words.size === 0) continue
    const covered = srcWordSets.filter((sw) => [...words].some((w) => sw.has(w)))
    const exact = srcLabels.includes(normLabel(rl))
    if (!exact && covered.length >= 2) {
      findings.push(out('UNAUTHORIZED_FACT_MERGE', false, `rendered "${rl}" merges ${covered.length} source categories`))
    }
  }
  // Omission: a source category with no word overlap anywhere rendered.
  for (const item of source.items) {
    const words = labelWords(item.label)
    const seen = rendered.labels.some((rl) => {
      const rw = new Set(labelWords(rl))
      return words.some((w) => rw.has(w))
    })
    if (!seen && words.length > 0) {
      findings.push(out('UNAUTHORIZED_FACT_OMISSION', false, `source "${item.label}" absent from rendered labels`))
    }
  }
  // Value: rendered magnitudes track source shares (12% relative or 1.5 abs).
  const byLabel = new Map<string, number>()
  rendered.labels.forEach((l, i) => {
    if (i < rendered.values.length) byLabel.set(normLabel(l), rendered.values[i])
  })
  for (const item of source.items) {
    const rv = byLabel.get(normLabel(item.label))
    if (rv === undefined) continue
    const denom = Math.max(Math.abs(item.share), 1)
    const rel = Math.abs(rv - item.share) / denom
    if (rel > 0.12 && Math.abs(rv - item.share) > 1.5) {
      findings.push(
        out('SOURCE_VALUE_MISMATCH', false, `"${item.label}": source=${item.share} rendered=${rv}`)
      )
    }
  }
  // Width ratios: rendered data-mark widths must track the linear scale
  // (width_i/width_max vs value_i/value_max within tolerance). Runs only
  // when the caller supplies aligned widths (the plan gate always does, so
  // metadata-only encodings cannot pass there); unit callers without widths
  // skip this section. Zero-share marks must not exceed the visibility bound.
  if (rendered.widths !== undefined && rendered.widths.length === rendered.values.length) {
    const positives = rendered.values
      .map((v, i) => ({ v, w: (rendered.widths as number[])[i] }))
      .filter((p) => p.v > 0)
    const zeroes = rendered.values.filter((v) => !(v > 0))
    if (positives.length > 0) {
      const vmax = Math.max(...positives.map((p) => p.v))
      const wmax = Math.max(...positives.map((p) => p.w))
      if (wmax <= 0) {
        findings.push(out('PROPORTIONAL_RATIO_EXACT', false, 'widest data mark has no measurable width'))
      } else {
        for (const p of positives) {
          const expected = p.v / vmax
          const actual = p.w / wmax
          const denom = Math.max(expected, 1e-9)
          if (Math.abs(actual - expected) / denom > PROPORTIONAL_RATIO_TOLERANCE) {
            findings.push(
              out(
                'PROPORTIONAL_RATIO_EXACT',
                false,
                `value=${p.v} renders at ${(actual * 100).toFixed(1)}% of max width, expected ${(expected * 100).toFixed(1)}% (±${PROPORTIONAL_RATIO_TOLERANCE * 100}%)`
              )
            )
          }
        }
      }
    }
    if (zeroes.length > 0) {
      const zw = rendered.values
        .map((v, i) => ({ v, w: (rendered.widths as number[])[i] }))
        .filter((p) => !(p.v > 0))
      for (const p of zw) {
        if (p.w > ZERO_SHARE_MAX_PT) {
          findings.push(out('PROPORTIONAL_RATIO_EXACT', false, `zero-share mark spans ${p.w.toFixed(1)}pt (visibility bound ${ZERO_SHARE_MAX_PT}pt)`))
        }
      }
    }
  }
  // Total: stated whole must survive verbatim, and budget shares must sum ~100.
  if (source.total) {
    const joined = renderedTexts.join('\n').toLowerCase()
    const normTotal = source.total.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!joined.includes(normTotal)) {
      findings.push(out('SOURCE_TOTAL_MISMATCH', false, `total "${source.total}" absent from rendered text`))
    }
  }
  if (source.kind === 'budget') {
    const sum = source.items.reduce((a, b) => a + b.share, 0)
    if (Math.abs(sum - 100) > 3) {
      findings.push(out('SOURCE_TOTAL_MISMATCH', false, `budget shares sum to ${sum}, not a whole`))
    }
  }
  if (findings.length === 0) {
    return [
      { check: 'SOURCE_CATEGORY_COUNT_MISMATCH', severity: 'INFO', pass: true },
      { check: 'SOURCE_CATEGORY_IDENTITY_MISMATCH', severity: 'INFO', pass: true },
    ]
  }
  return findings
}

/**
 * TASK-094: plan-level distribution gate. Invoked with the routing-promised
 * encoding: bars/stacked encodings require an extractable source inventory
 * AND matching labeled rendered geometry in the same attempt. Anything less
 * (no source, no labeled geometry) fails closed — the encoding label alone
 * never constitutes proof.
 */
export function checkDistributionPlan(
  content: SlideContent,
  ctx: {
    proportions: Array<{ ids: string[]; values: number[]; labels?: string[] }>
    texts: string[]
    placed: PlacedElement[]
  },
  expectedEncoding: string | undefined
): GeometryFinding[] {
  if (expectedEncoding !== 'RANKED_PROPORTIONAL_BARS' && expectedEncoding !== 'PARTS_OF_WHOLE_STACK') {
    return []
  }
  const source = extractDistributionSource(content)
  if (!source) {
    return [
      {
        check: 'SOURCE_CATEGORY_COUNT_MISMATCH',
        severity: 'BLOCKING',
        pass: false,
        detail: `${expectedEncoding} promised without extractable distribution source`,
      },
    ]
  }
  const labeled = ctx.proportions.filter((s) => Array.isArray(s.labels) && s.labels.length > 0)
  if (labeled.length === 0) {
    return [
      {
        check: 'SOURCE_CATEGORY_COUNT_MISMATCH',
        severity: 'BLOCKING',
        pass: false,
        detail: `${expectedEncoding} promised but no labeled rendered geometry present`,
      },
    ]
  }
  const byId = new Map(ctx.placed.map((e) => [e.id, e.rect.w]))
  const labels: string[] = []
  const values: number[] = []
  const widths: number[] = []
  for (const set of labeled) {
    const setLabels = set.labels as string[]
    for (let i = 0; i < setLabels.length; i += 1) {
      const w = byId.get(set.ids[i])
      if (typeof w !== 'number' || !(w > 0)) {
        return [
          {
            check: 'SOURCE_CATEGORY_COUNT_MISMATCH',
            severity: 'BLOCKING',
            pass: false,
            detail: `${expectedEncoding} promised but rendered mark ${set.ids[i] ?? '(unknown)'} has no measurable width`,
          },
        ]
      }
      labels.push(setLabels[i])
      values.push(set.values[i])
      widths.push(w)
    }
  }
  const rendered: DistributionRendered = { labels, values, widths }
  return checkDistributionFidelity(source, rendered, ctx.texts)
}

/**
 * TASK-094-R1: tolerant per-line source parser for `sourceFacts`.
 * Unlike the strict detectors (all-or-nothing, used for routing), source
 * parsing SKIPS the total line and narrative-only lines: a source block of
 * "total + 4 category lines + optional narrative" must still yield its 4
 * mandatory items. Lines without a parseable share carry no comparable
 * distributional signal and are ignored (flexible copy by construction).
 * Returns null unless 3+ share lines parse.
 */
export interface SourceFactLine {
  label: string
  share: number
  shareText: string
  amount?: string
}

export function parseSourceFactLines(lines: string[] | undefined): { items: SourceFactLine[]; total: string | null } | null {
  if (!lines || lines.length === 0) return null
  const total = detectTotalLine('', undefined, lines)?.amount ?? null
  const items: SourceFactLine[] = []
  for (const rawLine of lines) {
    const text = (rawLine ?? '').trim()
    if (!text) continue
    const shareM = /(\d[\d.,]*\s*(?:%|percent))/i.exec(text)
    if (!shareM) continue
    const share = parsePercentShare(shareM[0])
    if (share === null) continue
    const curM = CURRENCY_TOKEN_RE.exec(text)
    const cutAt = Math.min(shareM.index, curM ? curM.index : shareM.index)
    const label = text.slice(0, cutAt).replace(/[:\u2013\u2014\-,;\s]+$/g, '').trim()
    if (label.length < 2 || !/[A-Za-z]/.test(label)) continue
    items.push({
      label,
      share,
      shareText: shareM[0].trim(),
      ...(curM ? { amount: curM[0].trim() } : {}),
    })
  }
  if (items.length < 3) return null
  return { items, total }
}

/**
 * TASK-094-R1: source-to-input fidelity status.
 * PROVEN: authoritative source present and every compared fact matches.
 * UNPROVEN: no authoritative source was provided (never fabricated, never
 *   claimed as PASS — input-to-render gates still apply).
 * FAILED: a blocking source-to-input mismatch (write must not happen).
 */
export type SourceToInputFidelity = 'PROVEN' | 'UNPROVEN' | 'FAILED'

function s2iFinding(check: string, pass: boolean, detail?: string): GeometryFinding {
  return { check, severity: pass ? 'INFO' : 'BLOCKING', pass, ...(detail !== undefined ? { detail } : {}) }
}

function normAmount(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * TASK-094-R2: normalized authoritative fact fingerprint for one content set.
 * Sorted normalized fact strings hashed (djb2, hex). Retries — engine
 * reflow attempts AND outer tool re-invocations carrying the same content —
 * must preserve this fingerprint bit-for-bit; any drift means facts moved.
 */
export function fingerprintFacts(content: SlideContent): string {
  const facts = expectedTextsOf(content)
    .map((s) => normalizeSourceText(s))
    .filter((s) => s.length > 0)
    .sort()
    .join('\n')
  let h = 5381
  for (let i = 0; i < facts.length; i += 1) {
    h = ((h << 5) + h + facts.charCodeAt(i)) | 0
  }
  return `fp${(h >>> 0).toString(16).padStart(8, '0')}`
}

export interface FactSafetySummary {
  fingerprint: string
  factsPreserved: string[]
  factsOmitted: string[]
  factsMerged: string[]
  factsChanged: string[]
}

/**
 * TASK-094-R2: declarative source-vs-input fact summary (no finding parsing).
 * Compares authoritative source labels against compose-input labels with the
 * same normalizer the gate uses, so summary and gate agree by construction.
 * Without sourceFacts every list is honestly empty.
 */
export function summarizeSourceFacts(
  sourceFacts: string[] | undefined,
  content: SlideContent
): FactSafetySummary {
  const fingerprint = fingerprintFacts(content)
  const empty = { fingerprint, factsPreserved: [], factsOmitted: [], factsMerged: [], factsChanged: [] }
  const parsed = parseSourceFactLines(sourceFacts)
  if (!parsed) return empty
  const inpInv = extractDistributionSource(content)
  const srcLabels = parsed.items.map((i) => normLabel(i.label))
  if (!inpInv) {
    const joined = expectedTextsOf(content).join('\n').toLowerCase()
    const preserved = srcLabels.filter((l) => joined.includes(l))
    const omitted = srcLabels.filter((l) => !joined.includes(l))
    return { fingerprint, factsPreserved: preserved, factsOmitted: omitted, factsMerged: [], factsChanged: [] }
  }
  const inpLabels = inpInv.items.map((i) => normLabel(i.label))
  const preserved = srcLabels.filter((l) => inpLabels.includes(l))
  const omitted = srcLabels.filter((l) => !inpLabels.includes(l))
  const srcWordSets = parsed.items.map((i) => new Set(labelWords(i.label)))
  const merged = inpLabels.filter((l) => {
    if (srcLabels.includes(l)) return false
    const words = new Set(labelWords(l))
    if (words.size === 0) return false
    return srcWordSets.filter((sw) => [...words].some((w) => sw.has(w))).length >= 2
  })
  const inpByLabel = new Map(inpInv.items.map((i) => [normLabel(i.label), i]))
  const changed: string[] = []
  for (const item of parsed.items) {
    const other = inpByLabel.get(normLabel(item.label))
    if (!other) continue
    if (other.share !== item.share) {
      changed.push(item.label)
      continue
    }
    const a = item.amount !== undefined ? normAmount(item.amount) : undefined
    const b = other.amount !== undefined ? normAmount(other.amount) : undefined
    if (a !== b) changed.push(item.label)
  }
  return { fingerprint, factsPreserved: preserved, factsOmitted: omitted, factsMerged: merged, factsChanged: changed }
}

/**
 * TASK-094-R1: authoritative source vs compose-input gate. Runs BEFORE any
 * write (wired into prewrite QA): when `sourceFacts` carry distributional
 * facts, the compose input must preserve every category, label, share,
 * amount, and total exactly — merges ("Success & Operations"), omissions,
 * renames, inventions, and value changes all fail BLOCKING. Narrative-only
 * source lines carry no comparable signal and never block (flexible copy).
 * Text-layer comparison is exact (no tolerance): tolerance belongs to
 * rendered-geometry magnitudes, not to source wording.
 */
export function checkSourceToInputFidelity(
  sourceFacts: string[] | undefined,
  content: SlideContent
): { findings: GeometryFinding[]; status: SourceToInputFidelity } {
  if (!sourceFacts || sourceFacts.length === 0) {
    return { findings: [], status: 'UNPROVEN' }
  }
  const parsed = parseSourceFactLines(sourceFacts)
  if (!parsed || parsed.items.length === 0) {
    return {
      findings: [s2iFinding('SOURCE_TO_INPUT_NON_DISTRIBUTIONAL', true, 'narrative-only source; nothing mandatory to compare')],
      status: 'PROVEN',
    }
  }
  const srcInv: DistributionSource = {
    kind: parsed.items.some((i) => i.amount !== undefined) ? 'budget' : 'ranked',
    items: parsed.items,
    total: parsed.total,
  }
  const inpInv = extractDistributionSource(content)
  if (!inpInv) {
    // Input is not distributional: fall back to label containment so a
    // faithful reshape (e.g. honored KPI cards) still passes, while drops fail.
    const joined = expectedTextsOf(content).join('\n').toLowerCase()
    const findings: GeometryFinding[] = []
    for (const item of srcInv.items) {
      const words = labelWords(item.label)
      if (words.length > 0 && !joined.includes(normLabel(item.label))) {
        findings.push(s2iFinding('SOURCE_TO_INPUT_UNAUTHORIZED_OMISSION', false, `source "${item.label}" absent from compose input`))
      }
    }
    if (srcInv.total) {
      const normTotal = srcInv.total.toLowerCase().replace(/\s+/g, ' ').trim()
      if (!joined.includes(normTotal)) {
        findings.push(s2iFinding('SOURCE_TO_INPUT_TOTAL_MISMATCH', false, `total "${srcInv.total}" absent from compose input`))
      }
    }
    if (findings.length > 0) return { findings, status: 'FAILED' }
    return {
      findings: [s2iFinding('SOURCE_TO_INPUT_NON_DISTRIBUTIONAL_INPUT', true, 'input preserves source labels without distribution shape')],
      status: 'PROVEN',
    }
  }
  const findings: GeometryFinding[] = []
  if (inpInv.items.length !== srcInv.items.length) {
    findings.push(
      s2iFinding(
        'SOURCE_TO_INPUT_CATEGORY_COUNT_MISMATCH',
        false,
        `source=${srcInv.items.length} input=${inpInv.items.length}`
      )
    )
    return { findings, status: 'FAILED' }
  }
  const srcLabels = srcInv.items.map((i) => normLabel(i.label)).sort()
  const inpLabels = inpInv.items.map((i) => normLabel(i.label)).sort()
  const identityOk = srcLabels.every((l, i) => l === inpLabels[i])
  if (!identityOk) {
    findings.push(
      s2iFinding(
        'SOURCE_TO_INPUT_IDENTITY_MISMATCH',
        false,
        `source=[${srcLabels.join(' | ')}] input=[${inpLabels.join(' | ')}]`
      )
    )
  }
  // Merge: one input label covering words from 2+ distinct source labels.
  const srcWordSets = srcInv.items.map((i) => new Set(labelWords(i.label)))
  for (const item of inpInv.items) {
    const words = new Set(labelWords(item.label))
    if (words.size === 0) continue
    const covered = srcWordSets.filter((sw) => [...words].some((w) => sw.has(w)))
    if (!srcLabels.includes(normLabel(item.label)) && covered.length >= 2) {
      findings.push(s2iFinding('SOURCE_TO_INPUT_UNAUTHORIZED_MERGE', false, `input "${item.label}" merges ${covered.length} source categories`))
    }
  }
  // Omission + invention via label-set difference.
  for (const l of srcLabels) {
    if (!inpLabels.includes(l)) {
      findings.push(s2iFinding('SOURCE_TO_INPUT_UNAUTHORIZED_OMISSION', false, `source category "${l}" absent from input`))
    }
  }
  for (const l of inpLabels) {
    if (!srcLabels.includes(l)) {
      findings.push(s2iFinding('SOURCE_TO_INPUT_UNAUTHORIZED_INVENTION', false, `input category "${l}" has no source`))
    }
  }
  // Value: exact numeric share + verbatim amount (text layer, no tolerance).
  const inpByLabel = new Map<string, { share: number; amount?: string }>()
  inpInv.items.forEach((i) => inpByLabel.set(normLabel(i.label), { share: i.share, ...(i.amount !== undefined ? { amount: i.amount } : {}) }))
  for (const item of srcInv.items) {
    const other = inpByLabel.get(normLabel(item.label))
    if (!other) continue
    if (other.share !== item.share) {
      findings.push(s2iFinding('SOURCE_TO_INPUT_VALUE_MISMATCH', false, `"${item.label}": source=${item.share} input=${other.share}`))
    }
    const a = item.amount !== undefined ? normAmount(item.amount) : undefined
    const b = other.amount !== undefined ? normAmount(other.amount) : undefined
    if (a !== b) {
      findings.push(
        s2iFinding('SOURCE_TO_INPUT_VALUE_MISMATCH', false, `"${item.label}": source amount "${item.amount ?? ''}" input "${other.amount ?? ''}"`)
      )
    }
  }
  // Total: verbatim equality when the source states one.
  const srcTotal = srcInv.total !== null ? normAmount(srcInv.total) : null
  const contentTotal = detectTotalLine(content.title, content.subtitle, content.bullets)?.amount ?? null
  const inpTotal = contentTotal !== null ? normAmount(contentTotal) : null
  if (srcTotal !== null && srcTotal !== inpTotal) {
    findings.push(s2iFinding('SOURCE_TO_INPUT_TOTAL_MISMATCH', false, `source total "${srcInv.total}" vs input "${contentTotal ?? '(absent)'}"`))
  }
  // Order: flagged honestly (WARNING) when meaningful sequences differ.
  const srcSeq = srcInv.items.map((i) => normLabel(i.label))
  const inpSeq = inpInv.items.map((i) => normLabel(i.label))
  if (identityOk && srcSeq.some((l, i) => l !== inpSeq[i])) {
    findings.push({ check: 'SOURCE_TO_INPUT_ORDER_DIFFERS', severity: 'WARNING', pass: true, detail: 'category order differs from source' })
  }
  if (findings.some((f) => !f.pass && f.severity === 'BLOCKING')) return { findings, status: 'FAILED' }
  return { findings, status: 'PROVEN' }
}

/**
 * TASK-087: hero metric strip for metric-rich Executive Summary content.
 * N-across cards share the KPI visual language (card bg + accent value +
 * ink label) so peer metrics receive consistent treatment; any narrative
 * remainder renders as supporting lines beneath the strip.
 */
function renderSummaryMetricStrip(
  ctx: Ctx,
  metrics: MetricPhrase[],
  narrative: string[]
): void {
  const g = ctx.g
  const n = metrics.length
  const gw = g.W - g.M * 2
  // Vertically center the strip in the content zone so the composition owns
  // the canvas instead of clustering at the top. Narrative lines sit in a
  // reserved band BELOW every card, so cards never collide with them; the
  // strip is demand-sized only inside the remaining zone. With 3+ metrics
  // the strip wraps to TWO ROWS so cards keep readable widths and every box
  // keeps a positive, demand-driven height. When even the minimum viable
  // two-row strip cannot fit, the SUMMARY narrows deterministically: first
  // the narrative band is dropped (narrative lines are re-emitted below the
  // strip only when they fit), then fail closed. Never emit zero-height
  // boxes and never let cards collide with narrative.
  const narrativeBandH = narrative.length > 0 ? narrative.length * 30 * g.page.sy + g.GUTTER : 0
  const stripTop = g.CONTENT_TOP + 40 * g.page.sy
  const availH = g.H - stripTop - g.M - narrativeBandH
  const valueStyle = t(ctx, 'kpiValue')
  const labelStyle = t(ctx, 'body')
  const rows = n > 3 ? 2 : 1
  const perRow = Math.ceil(n / rows)
  const rowCardW = (gw - (perRow - 1) * g.GUTTER) / perRow
  const innerW = rowCardW - 32 * g.page.sx
  // Demand-driven boxes: every value/label box is sized from its own text
  // demand (plus padding), so short values stay compact and long labels grow
  // instead of overflowing. Card height follows the tallest label, and the
  // whole strip is clamped into the zone above the narrative band.
  const demands = metrics.map((m) => ({
    valueH: fitTextBoxH(m.value, valueStyle.fontSizePt, innerW, 8, { bold: true }),
    labelH: fitTextBoxH(m.label, labelStyle.fontSizePt, innerW),
  }))
  const maxLabelH = Math.max(...demands.map((d) => d.labelH))
  const gapVH = 6 * g.page.sy
  const pad = 16 * g.page.sx
  // All cards share the tallest label height, so peer card bottoms align on
  // one grid line regardless of per-label wrap. The strip is clamped into
  // the zone above the reserved narrative band — never overlapping it.
  // Slack for descenders/rounding lives INSIDE the gaps: the value box ends
  // a full gap above the label box, and the label box ends a full pad above
  // the card bottom, so padded boxes stay disjoint and contained.
  const slackH = labelStyle.fontSizePt * 1.25
  const naturalH = demands[0].valueH + gapVH + maxLabelH + pad + slackH
  // The strip must leave room for the value zone, the gap, at least one
  // body line of label, and the bottom pad in EVERY card; if the tallest
  // label cannot fit even that floor, fail closed instead of emitting
  // zero-height boxes.
  const minCardH = demands[0].valueH + gapVH + labelStyle.fontSizePt * 1.25 + pad
  const rowGap = g.GUTTER
  let cardH = Math.min(naturalH, (availH - (rows - 1) * rowGap) / rows)
  let liveNarrative = narrative
  if (cardH < minCardH && narrative.length > 0) {
    // Drop the narrative band: the strip owns the zone, narrative lines are
    // re-emitted only when they fit below it (never overlapping cards).
    liveNarrative = []
    cardH = Math.min(naturalH, (g.H - stripTop - g.M - (rows - 1) * rowGap) / rows)
  }
  if (cardH < minCardH) {
    failPlan(`summary metric strip needs ${Math.ceil(minCardH)}pt per card but only ${Math.floor(cardH)}pt available.`)
  }
  metrics.forEach((m, k) => {
    const row = Math.floor(k / perRow)
    const col = k % perRow
    const x = g.M + col * (rowCardW + g.GUTTER)
    const yBase = stripTop + row * (cardH + rowGap)
    const vH = demands[k].valueH
    // Bottom-align labels so peer cards share one baseline grid even when
    // one label wraps and others do not.
    const y0 = yBase + pad / 2
    const ids: string[] = []
    const smCardShape = resolveCardShapeType()
    const smCardFill = resolveCardFill()
    const smCardOutline = resolveCardOutlineHex()
    ids.push(addShape(ctx, smCardShape, x, yBase, rowCardW, cardH, {
      ...(smCardFill !== undefined ? { fillHex: smCardFill } : {}),
      ...(smCardOutline !== undefined ? { outlineHex: smCardOutline, outlineWeightPt: resolveCardOutlineWeight() } : {}),
      prefix: `SMBG${k}`,
    }))
    // Card interior partition: value box [y0, y0+vH+slack/2), then a full
    // gap, then the label box; the label box bottom stays a full pad above
    // the card bottom. Disjoint + contained by construction.
    const valueBoxH = vH + slackH / 2
    const labelY = y0 + valueBoxH + gapVH
    // TASK-094: bold-aware demands can push the label box to zero/negative
    // when the card budget is exhausted. Clamp to a small positive box and
    // let TEXT_CONTAINER_OVERFLOW judge honestly (BLOCKING) instead of
    // throwing here — layout pressure must fail closed via QA, with reflow
    // getting its chance first.
    const labelBoxH = Math.max(cardH - (labelY - yBase) - pad, 8 * g.page.sy)
    ids.push(
      addTextBox(ctx, m.value, x + pad, y0, rowCardW - pad * 2, valueBoxH, {
        ...t(ctx, 'kpiValue'),
        colorHex: ctx.accentHex,
        alignment: 'START',
      }, `SMV${k}`, false, { role: 'kpiValue', parentId: ids[0] })
    )
    ids.push(
      addTextBox(ctx, m.label, x + pad, labelY, rowCardW - pad * 2, labelBoxH, {
        ...t(ctx, 'body'),
        colorHex: PALETTE.ink,
        alignment: 'START',
      }, `SML${k}`, false, { role: 'body', parentId: ids[0] })
    )
    groupIds(ctx, ids)
  })
  narrative.forEach((line, r) => {
    if (!liveNarrative.includes(line)) return
    addTextBox(
      ctx,
      line,
      g.M,
      stripTop + rows * cardH + (rows - 1) * g.GUTTER + g.GUTTER + r * 30 * g.page.sy,
      gw,
      28 * g.page.sy,
      { ...t(ctx, 'body'), colorHex: PALETTE.muted, alignment: 'START' },
      `SMN${r}`,
      false,
      { role: 'body' }
    )
  })
}

function gridFor(n: number): { cols: number; rows: number } {
  if (n <= 2) return { cols: n, rows: 1 }
  if (n <= 4) return { cols: 2, rows: 2 }
  return { cols: 3, rows: 2 }
}

function renderKpiDashboard(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  ctx.encoding = 'KPI_GRID'
  titleBlock(ctx, c.title, c.subtitle)
  const metrics = (c.metrics ?? []).slice(0, 6)
  if (metrics.length === 0) failPlan('KPI_DASHBOARD requires 1..6 metrics.')
  const { cols } = gridFor(metrics.length)
  const rows = Math.ceil(metrics.length / cols)
  const gw = g.W - g.M * 2
  const cardW = (gw - (cols - 1) * g.GUTTER) / cols
  const top = g.CONTENT_TOP + 40 * g.page.sy
  const availH = g.H - top - g.M
  const rowBudget = (availH - (rows - 1) * g.GUTTER) / rows
  const pad = 16 * g.page.sx
  const innerW = cardW - pad * 2 - 6 * g.page.sx
  // TASK-090-R1: uniform peer value size — the largest kpiValue size at
  // which EVERY card value fits two lines. Peer consistency beats per-card
  // optimization; the floor stays inside the kpiValue role (≥18pt base).
  // TASK-092-R1: metricScale adjusts the base font for theme emphasis.
  const metricMul = resolveMetricScale()
  const baseV = t(ctx, 'kpiValue').fontSizePt * metricMul
  const labelStyle = t(ctx, 'body')
  const labelH = Math.max(
    ...metrics.map((m) => fitTextBoxH((((m.label ?? '') as string).trim() || '?'), labelStyle.fontSizePt, Math.max(innerW, 1), 4))
  )
  const gapVH = 8 * g.page.sy
  // Largest value size whose full card (value + label + pads) fits the row
  // budget, with every value inside two lines. Uniform across peers.
  const ladder = [1, 0.85, 0.7, 0.6, 0.5].map((f) => Math.round(baseV * f * 2) / 2).filter((s) => s >= 18)
  let valueSize: number | undefined = undefined
  let valueH = 0
  for (const size of ladder) {
    const fitsLines = metrics.every((m) => {
      const v = ((m.value ?? '') as string).trim() || '?'
      return estimateLines(v, size, Math.max(innerW, 1), { bold: true }) <= 2
    })
    if (!fitsLines) continue
    const h = Math.max(
      ...metrics.map((m) => fitTextBoxH((((m.value ?? '') as string).trim() || '?'), size, Math.max(innerW, 1), 4, { bold: true }))
    )
    if (pad + h + gapVH + labelH + pad <= rowBudget) {
      valueSize = size
      valueH = h
      break
    }
  }
  if (valueSize === undefined) {
    failPlan('KPI cards do not fit the row budget at the minimum kpiValue size.')
  }
  // valueH/labelH selected above (uniform peers, budget-fitted).
  const needH = pad + valueH + gapVH + labelH + pad
  // Uniform card height from worst-case demands; fail closed when the row
  // budget cannot hold it (never clip, never shrink below role floors).
  if (needH > rowBudget) {
    failPlan(`KPI cards need ${Math.ceil(needH)}pt but only ${Math.floor(rowBudget)}pt per row is available.`)
  }
  const cardH = needH
  metrics.forEach((m, i) => {
    if (!m.label?.trim() || !m.value?.trim()) failPlan(`metrics[${i}] requires label and value.`)
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = g.M + col * (cardW + g.GUTTER)
    const y = top + row * (cardH + g.GUTTER)
    const ids: string[] = []
    const cardShape = resolveCardShapeType()
    const cardFill = resolveCardFill()
    const cardOutline = resolveCardOutlineHex()
    const cardOutlineW = resolveCardOutlineWeight()
    const bgId = addShape(ctx, cardShape, x, y, cardW, cardH, {
      ...(cardFill !== undefined ? { fillHex: cardFill } : {}),
      prefix: `KPIBG${i}`,
    })
    ids.push(bgId)
    // TASK-090: uniform category accent bar — one consistent anchor per KPI
    // card (same geometry/role on every peer; variation comes from content).
    ids.push(
      addShape(ctx, 'RECTANGLE', x, y, 6 * g.page.sx, cardH, { fillHex: ctx.accentHex, prefix: `KPIA${i}`, parentId: bgId })
    )
    const mFam = resolveFontFamily('metric')
    ids.push(
      addTextBox(ctx, m.value.trim(), x + pad, y + pad, innerW, valueH, {
        fontSizePt: valueSize,
        bold: true,
        colorHex: ctx.accentHex,
        alignment: 'START',
        ...(mFam !== undefined ? { fontFamily: mFam } : {}),
      }, `KPIV${i}`, false, { role: 'kpiValue', parentId: bgId })
    )
    ids.push(
      addTextBox(ctx, m.label.trim(), x + pad, y + pad + valueH + gapVH, innerW, labelH, {
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

/**
 * TASK-090: parse a percentage share ("41 percent", "55%") → number.
 * Returns null for anything else — distribution encoding never guesses.
 */
export function parsePercentShare(text: string): number | null {
  const m = /([+-]?\d[\d.,]*)\s*(%|percent\b)/i.exec(text.trim())
  if (!m) return null
  const v = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(v) ? v : null
}

/**
 * TASK-087B: deterministic bullets→structure adapters. Agents sometimes pass
 * plain bullets for sequential/grouped content; these adapters recover the
 * structure WITHOUT inventing facts, or return undefined so the renderer
 * fails closed with its explicit missing-structure error (never silent
 * bullet degradation for rich content).
 */

/** Ordered bullets ARE stages verbatim (label-only; no parsing, no invention). */
export function bulletsToStages(bullets: string[] | undefined): StageDatum[] | undefined {
  if (!bullets || bullets.length === 0) return undefined
  const stages = bullets
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((label) => ({ label }))
  return stages.length > 0 ? stages : undefined
}

/**
 * Grouped bullets with an explicit "Name: items" / "Name — items" shape
 * become columns; items split on , ; · /. Returns undefined unless EVERY
 * bullet carries the explicit shape — partial parses fail closed.
 */
export function bulletsToColumns(bullets: string[] | undefined): ColumnDatum[] | undefined {
  if (!bullets || bullets.length < 2) return undefined
  const cols: ColumnDatum[] = []
  for (const b of bullets) {
    const m = /^([^:–—\-]{2,60})\s*[:–—\-]\s*(.+)$/.exec(b.trim())
    if (!m) return undefined
    const items = m[2]
      .split(/[,;·\/]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (items.length === 0) return undefined
    cols.push({ name: m[1].trim(), items })
  }
  return cols.length >= 2 ? cols : undefined
}

// ---------------------------------------------------------------------------
// TASK-090: shared distribution encodings (ranked bars + stacked bar).
// Deterministic magnitude→length visuals from existing primitives only.
// No derived statistics are ever rendered — source values stay verbatim.
// ---------------------------------------------------------------------------

export interface DistributionEntry {
  /** Category label (verbatim source wording). */
  label: string
  /** Value text rendered verbatim (e.g. "41 percent", "Rp 2.64B"). */
  valueText: string
  /** Parsed magnitude driving bar length. */
  value: number
}

/**
 * Ranked horizontal bars: label | proportional bar | value. Input order is
 * preserved (never re-sorted — order is source meaning); bar lengths follow
 * values via scaleProportional. All bars share one fill: rank reads from
 * LENGTH, never from arbitrary color variation.
 */
export function renderRankedBars(
  ctx: Ctx,
  entries: DistributionEntry[],
  top: number,
  maxBarW: number,
  rowH = 34
): { barIds: string[]; endY: number } {
  const g = ctx.g
  const sx = g.page.sx
  const sy = g.page.sy
  const labelW = Math.min(220 * sx, maxBarW * 0.32)
  const valueW = 110 * sx
  const barMaxW = Math.max(maxBarW - labelW - valueW - 24 * sx, 60 * sx)
  // TASK-094-R3: data-mark scale is linear (width = maxW * v/vmax) with only
  // a tiny visibility floor. The previous 6% floor lifted small values and
  // distorted the canonical 42/12 ratio to ~3.04 instead of 3.5. Tracks keep
  // full width; only the colored data mark is measured for ratios.
  const prop = scaleProportional(
    entries.map((e) => e.value),
    barMaxW,
    Math.max(2 * sx, barMaxW * 0.005)
  )
  const barIds: string[] = []
  const barH = 14 * sy
  const trackFill = resolveBarTrackFill()
  entries.forEach((e, i) => {
    const y = top + i * rowH * sy
    addTextBox(ctx, e.label, g.M, y, labelW, rowH * sy, {
      ...t(ctx, 'body'),
      colorHex: PALETTE.ink,
      alignment: 'START',
    }, `DBL${i}`, false, { role: 'body' })
    const bx = g.M + labelW + 12 * sx
    // TASK-092-R1: bar track background for visual depth
    addShape(ctx, 'RECTANGLE', bx, y + (rowH * sy - barH) / 2, barMaxW, barH, {
      fillHex: trackFill,
      prefix: `DBT${i}`,
    })
    const barId = addShape(ctx, 'RECTANGLE', bx, y + (rowH * sy - barH) / 2, prop.widths[i], barH, {
      fillHex: resolveBarFill(i),
      prefix: `DBB${i}`,
    })
    barIds.push(barId)
    addTextBox(ctx, e.valueText, bx + prop.widths[i] + 8 * sx, y, valueW, rowH * sy, {
      ...t(ctx, 'body'),
      bold: true,
      colorHex: PALETTE.ink,
      alignment: 'START',
    }, `DBV${i}`, false, { role: 'body' })
  })
  ctx.proportions.push({ ids: barIds, values: entries.map((e) => e.value), labels: entries.map((e) => e.label) })
  return { barIds, endY: top + entries.length * rowH * sy }
}

/** Cycle of distinct fills for stacked segments (deterministic order). */
function stackedFills(ctx: Ctx): string[] {
  return [ctx.accentHex, ctx.accent2Hex, PALETTE.ink, PALETTE.muted]
}

/**
 * Stacked 100%-style distribution bar with legend rows. Segments are
 * proportional to shares; legend chips match segment fills. Only used when
 * shares sum to approximately 100 (else ranked bars — never a false whole).
 */
export function renderStackedBar(
  ctx: Ctx,
  segments: Array<{ name: string; amount: string; share: number }>,
  top: number,
  totalLabel: string
): { endY: number } {
  const g = ctx.g
  const sx = g.page.sx
  const sy = g.page.sy
  const gw = g.W - g.M * 2
  // TASK-094-R3: linear segment scale (width = gw * share/sum) with only a
  // tiny visibility floor, mirroring renderRankedBars. A large floor would
  // distort small shares (the 50/25 pair must render at ratio 2.0).
  const prop = partitionShares(
    segments.map((s) => s.share),
    gw,
    Math.max(2 * sx, gw * 0.005)
  )
  const barH = 44 * sy
  const segIds: string[] = []
  let cx = g.M
  // Total header.
  addTextBox(ctx, totalLabel, g.M, top, gw, 40 * sy, {
    ...t(ctx, 'sectionHeading'),
    colorHex: PALETTE.ink,
    alignment: 'START',
  }, 'STKT', false, { role: 'sectionHeading' })
  const barY = top + 48 * sy
  segments.forEach((_s, i) => {
    const w = prop.widths[i]
    const id = addShape(ctx, 'RECTANGLE', cx, barY, w, barH, {
      fillHex: resolveSegmentFill(i, segments.length),
      prefix: `STKS${i}`,
    })
    segIds.push(id)
    cx += w
  })
    ctx.proportions.push({ ids: segIds, values: segments.map((s) => s.share), labels: segments.map((s) => s.name) })
  // Legend rows: chip + "name — amount" (verbatim source wording).
  let ly = barY + barH + 14 * sy
  const chip = 14 * sx
  segments.forEach((s, i) => {
    addShape(ctx, 'RECTANGLE', g.M, ly + 4 * sy, chip, chip, {
      fillHex: resolveSegmentFill(i, segments.length),
      prefix: `STKC${i}`,
    })
    addTextBox(ctx, `${s.name} — ${s.amount}`, g.M + chip + 10 * sx, ly, gw - chip - 10 * sx, 26 * sy, {
      ...t(ctx, 'body'),
      colorHex: PALETTE.ink,
      alignment: 'START',
    }, `STKL${i}`, false, { role: 'body' })
    ly += 30 * sy
  })
  groupIds(ctx, segIds)
  return { endY: ly }
}

function renderProcessFunnel(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  const sx = g.page.sx
  const sy = g.page.sy
  titleBlock(ctx, c.title, c.subtitle)
  const stages = (c.stages ?? bulletsToStages(c.bullets) ?? []).slice(0, 6)
  if (stages.length < 2) failPlan('PROCESS_FUNNEL requires 2..6 stages.')
  const top = g.CONTENT_TOP + 60 * sy
  const n = stages.length
  const gw = g.W - g.M * 2
  const gap = 16 * sx
  // TASK-086 reflow: single row while readable; two rows when boxes would
  // narrow past the readable minimum (six-stage funnel case).
  const rows = ctx.reflow.funnelRows
  const cols = Math.ceil(n / rows)
  const slotW = (gw - (cols - 1) * gap) / cols
  const availH = g.H - top - g.M
  const boxH = rows === 1 ? Math.min(150 * sy, availH) : (availH - gap) / rows
  // TASK-090: proportional funnel. When every stage carries a parseable
  // magnitude (description preferred, else label), bars taper with value
  // (largest = widest, order preserved, floored per contract) while labels
  // keep full slot width so long names never squeeze. Without magnitudes,
  // classic equal cards (no invented values).
  const magnitudes = funnelMagnitudes({ title: c.title, stages })
  const prop = magnitudes !== null
    ? scaleProportional(magnitudes, slotW, Math.max(72 * sx, slotW * 0.35))
    : null
  ctx.encoding = prop ? 'PROPORTIONAL_FUNNEL' : 'PROCESS_STAGES'
  if (prop) ctx.proportions.push({ ids: [], values: magnitudes as number[] })
  const propSet = prop ? ctx.proportions[ctx.proportions.length - 1] : null
  stages.forEach((s, i) => {
    if (!s.label?.trim()) failPlan(`stages[${i}].label is required.`)
    const col = i % cols
    const row = Math.floor(i / cols)
    const slotX = g.M + col * (slotW + gap)
    const y = top + row * (boxH + gap)
    const ids: string[] = []
    if (!prop) {
      const bgId = addShape(ctx, 'ROUND_RECTANGLE', slotX, y, slotW, boxH, { fillHex: resolveFunnelStageFill(), prefix: `STG${i}` })
      ids.push(bgId)
      ids.push(
        addTextBox(ctx, s.label.trim(), slotX + 10 * sx, y + 12 * sy, slotW - 20 * sx, 44 * sy, {
          ...t(ctx, 'cardHeading'),
          colorHex: ctx.accentHex,
          alignment: 'CENTER',
        }, `STGL${i}`, false, { role: 'cardHeading', parentId: bgId })
      )
      if (s.description?.trim()) {
        ids.push(
          addTextBox(ctx, s.description.trim(), slotX + 10 * sx, y + 60 * sy, slotW - 20 * sx, boxH - 70 * sy, {
            ...t(ctx, 'caption'),
            colorHex: PALETTE.ink,
            alignment: 'CENTER',
          }, `STGD${i}`, false, { role: 'caption', parentId: bgId })
        )
      }
      if (rows === 1 && i < n - 1) {
        addShape(ctx, 'RECTANGLE', slotX + slotW + 2 * sx, y + boxH / 2 - 2 * sy, 12 * sx, 4 * sy, { fillHex: ctx.accentHex, prefix: `ARW${i}` })
      }
      groupIds(ctx, ids)
      return
    }
    // Magnitude row: full-width centered label, centered tapered bar,
    // centered value caption. Bar widths encode value; nothing invented.
    const labelH = 40 * sy
    const barH = 26 * sy
    const barW = (prop as { widths: number[] }).widths[i]
    const barX = slotX + (slotW - barW) / 2
    const barY = y + labelH + 8 * sy
    ids.push(
      addTextBox(ctx, s.label.trim(), slotX + 6 * sx, y, slotW - 12 * sx, labelH, {
        ...t(ctx, 'cardHeading'),
        colorHex: PALETTE.ink,
        alignment: 'CENTER',
      }, `STGL${i}`, false, { role: 'cardHeading' })
    )
    const barId = addShape(ctx, 'ROUND_RECTANGLE', barX, barY, barW, barH, {
      fillHex: ctx.accentHex,
      prefix: `STG${i}`,
    })
    ids.push(barId)
    if (propSet) propSet.ids.push(barId)
    if (s.description?.trim()) {
      // Value caption sits below the bar in slot space (NOT parented to
      // the bar: it is wider than tapered bars by design and disjoint).
      ids.push(
        addTextBox(ctx, s.description.trim(), slotX + 6 * sx, barY + barH + 6 * sy, slotW - 12 * sx, 30 * sy, {
          ...t(ctx, 'caption'),
          colorHex: PALETTE.ink,
          alignment: 'CENTER',
        }, `STGD${i}`, false, { role: 'caption' })
      )
    }
    if (rows === 1 && i < n - 1) {
      addShape(ctx, 'RECTANGLE', slotX + slotW + 2 * sx, y + labelH, 12 * sx, 4 * sy, { fillHex: ctx.accentHex, prefix: `ARW${i}` })
    }
    groupIds(ctx, ids)
  })
}

/**
 * TASK-090-R1: comparison distribution predicate shared by renderer and
 * expected-encoding (no drift): 3+ single-value percentage columns.
 */
export function comparisonDistribution(columns: ColumnDatum[]): number[] | null {
  if (columns.length < 3) return null
  const vals = columns.map((col) =>
    col.items.length === 1 ? parsePercentShare(col.items[0]) : null
  )
  return vals.every((v) => v !== null) ? (vals as number[]) : null
}

function renderComparison(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  ctx.encoding = 'PAIRED_COMPARISON'
  const sx = g.page.sx
  const sy = g.page.sy
  titleBlock(ctx, c.title, c.subtitle)
  // TASK-094-R3: totals are separated BEFORE peer slicing so the whole can
  // never occupy (or silently displace) a peer slot.
  const independentTotal = detectTotalLine(c.title, c.subtitle, c.bullets)?.amount ?? null
  const peerColumns = (c.columns ?? bulletsToColumns(c.bullets) ?? []).filter(
    (col) => !isTotalPeer(col.name, parsePercentShare(col.items[0] ?? ''), independentTotal)
  )
  const columns = peerColumns.slice(0, 4)
  if (columns.length < 2) failPlan('COMPARISON requires 2..4 columns.')
  const top = g.CONTENT_TOP + 40 * sy
  const gw = g.W - g.M * 2
  // TASK-090: percentage-distribution branch — 3+ single-value percentage
  // columns (e.g. channel shares) encode far better as ranked proportional
  // bars than as peer containers.
  const distValues = comparisonDistribution(columns)
  if (distValues !== null) {
    ctx.encoding = 'RANKED_PROPORTIONAL_BARS'
    renderRankedBars(
      ctx,
      columns.map((col, i) => ({
        label: col.name.trim(),
        valueText: col.items[0].trim(),
        value: (distValues[i] as number),
      })),
      top,
      gw
    )
    return
  }
  // TASK-094-R3: budget/allocation branch — shares carried in column names
  // with amounts render as one stacked whole (parts-of-whole), never as peer
  // containers and never under pillars/shared-goal geometry. The aggregate
  // total stays in the subtitle/total line, never as a segment.
  const pillarDist = pillarDistribution(columns)
  if (pillarDist !== null && pillarDist.kind === 'stacked') {
    ctx.encoding = 'PARTS_OF_WHOLE_STACK'
    renderStackedBar(
      ctx,
      columns.map((col, i) => ({
        name: col.name.trim(),
        amount: col.items[0].trim(),
        share: (pillarDist.shares[i] as number),
      })),
      top,
      c.title.trim()
    )
    return
  }
  const maxRows = Math.max(...columns.map((col) => col.items.length))
  if (maxRows === 0) failPlan('COMPARISON columns require at least one item each.')
  // TASK-090: paired-delta detection — exactly 2 columns whose every item
  // parses to a magnitude at equal row counts. Deltas render as proportional
  // bar pairs (direction readable geometrically); source text stays verbatim
  // and NO derived percentages are ever rendered.
  // TASK-096-R5-A: unit-homogeneity guard — paired delta bars are only
  // meaningful when all values share the same unit (e.g. all Rp miliar or
  // all plain numbers). Mixed units (Rp miliar vs percentages vs counts)
  // produce meaningless proportional bars that misrepresent the data.
  function rawUnitTag(text: string): string {
    const m = /(?:(?:Rp|USD|\$)\s*)?\d[\d.,]*\s*([BMK]\b|%|percent\b|x\b|Rp\b|USD\b|\$|million\b|billion\b|ribu\b|juta\b|miliar\b)?/i.exec(text.trim())
    const unit = (m?.[1] ?? '').toLowerCase()
    if (unit === '%' || unit === 'percent') return '%'
    if (/^(b|miliar|billion)$/i.test(unit)) return 'miliar'
    if (/^(m|jt|juta|million)$/i.test(unit)) return 'juta'
    if (/^(k|ribu)$/i.test(unit)) return 'ribu'
    if (/^(x)$/i.test(unit)) return 'x'
    return ''
  }
  const pairedValues: number[][] | null =
    columns.length === 2 &&
    columns[0].items.length === columns[1].items.length &&
    columns[0].items.length > 0 &&
    columns.every((col) => col.items.every((it) => parseMagnitude(it) !== null)) &&
    // unit-homogeneity: all items across both columns must share the same unit
    (() => {
      const tags = columns.flatMap((col) => col.items.map(rawUnitTag))
      const unique = new Set(tags)
      return unique.size <= 1
    })()
      ? columns.map((col) => col.items.map((it) => parseMagnitude(it) as number))
      : null
  const deltaZoneH = pairedValues !== null ? pairedValues[0].length * 18 * sy : 0
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
    minBgHPt: 300 * sy + deltaZoneH,
  })
  let cx = g.M
  const colBgIds: string[] = []
  columns.forEach((col, i) => {
    if (!col.name?.trim()) failPlan(`columns[${i}].name is required.`)
    if (col.items.length === 0) failPlan(`columns[${i}].items must be non-empty.`)
    const colW = set.widths[i]
    const fit = set.columns[i]
    const x = cx
    cx += colW + g.GUTTER
    const ids: string[] = []
    const cardShape = resolveCardShapeType()
    const cardFill = resolveCardFill()
    const cardOutline = resolveCardOutlineHex()
    const bgId = addShape(ctx, cardShape, x, top, colW, set.bgH, {
      ...(cardFill !== undefined ? { fillHex: cardFill } : {}),
      ...(cardOutline !== undefined ? { outlineHex: cardOutline, outlineWeightPt: resolveCardOutlineWeight() } : {}),
      prefix: `COLBG${i}`,
    })
    ids.push(bgId)
    colBgIds.push(bgId)
    ids.push(
      addTextBox(ctx, col.name.trim(), x + 14 * sx, top + 12 * sy, colW - 28 * sx, fit.headerH, {
        fontSizePt: fit.headerFontPt,
        bold: true,
        // TASK-094-R3: uniform accent for every header. Alternating accent2
        // fails contrast on dark card fills (purple-on-dark ≈ 3.45); the
        // primary accent passes on both light and dark surfaces.
        colorHex: ctx.accentHex,
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
  // TASK-090: paired delta bars in the reserved zone below the item rows.
  // One bar per value, shared scale (global max), side couleur per column.
  // Skipped when the zone cannot fit (fail-safe: classic columns stand alone).
  if (pairedValues !== null) {
    const rows = pairedValues[0].length
    const vmax = Math.max(...pairedValues.flat())
    const zoneTop = top + (set.columns[0]?.itemTop ?? 0) + maxRows * 36 * sy + 10 * sy
    const barMax = Math.min(set.widths[0], set.widths[1]) * 0.5
    if (vmax > 0 && top + set.bgH - zoneTop >= rows * 18 * sy + 8 * sy && barMax > 20 * sx) {
      const barH = 8 * sy
      pairedValues[0].forEach((v0, j) => {
        const v1 = pairedValues[1][j]
        const y = zoneTop + j * 18 * sy
        const w0 = Math.max(8 * sx, (barMax * v0) / vmax)
        const w1 = Math.max(8 * sx, (barMax * v1) / vmax)
        const b0 = addShape(ctx, 'RECTANGLE', g.M + 14 * sx, y, w0, barH, {
          fillHex: ctx.accentHex,
          prefix: `DLT0_${j}`,
          parentId: colBgIds[0],
        })
        const x1 = g.M + set.widths[0] + g.GUTTER + 14 * sx
        const b1 = addShape(ctx, 'RECTANGLE', x1, y, w1, barH, {
          fillHex: ctx.accent2Hex,
          prefix: `DLT1_${j}`,
          parentId: colBgIds[1],
        })
        ctx.proportions.push({ ids: [b0, b1], values: [v0, v1] })
      })
    }
  }
}

function renderTimelineRoadmap(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  ctx.encoding = 'TIMELINE'
  const sx = g.page.sx
  const sy = g.page.sy
  titleBlock(ctx, c.title, c.subtitle)
  const stages = (c.stages ?? bulletsToStages(c.bullets) ?? []).slice(0, 8)
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
    ids.push(addShape(ctx, 'ELLIPSE', x - dot / 2, lineY - dot / 2, dot, dot, { fillHex: ctx.accentHex, prefix: `DOT${i}` }))
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

/**
 * TASK-090-R1: shared-goal foundation band. Renders below the pillar
 * block (or below the title when called early) as a full-width ink band
 * with light goal text. Fails closed when the band cannot fit — a shared
 * goal is never silently omitted.
 */
export function renderSharedGoalBand(
  ctx: Ctx,
  goal: string,
  top: number,
  availBottom: number,
  role: 'sectionHeading' | 'body' = 'body'
): number {
  const g = ctx.g
  const sx = g.page.sx
  const sy = g.page.sy
  const gw = g.W - g.M * 2
  const style = t(ctx, role)
  // TASK-093-R2: never emit a semantic container for empty content — an
  // empty goal band renders as an orphan rectangle. Callers already guard on
  // trimmed content; this is the fail-closed backstop.
  if (!isMeaningfulText(goal)) return top
  const boxH = fitTextBoxH(goal, style.fontSizePt, gw - 32 * sx, 8, { bold: style.bold }) + 16 * sy
  const bandH = boxH + 16 * sy
  if (top + bandH > availBottom) {
    failPlan('shared goal needs ' + Math.ceil(bandH) + 'pt but only ' + Math.floor(availBottom - top) + 'pt available.')
  }
  // TASK-094-R3: the band fill and its text must contrast on EVERY theme.
  // PALETTE.ink is dark on light themes but near-white on dark themes, so an
  // ink-filled band carries invisible light text under MODERN_GRADIENT-class
  // palettes (the live white-rectangle class). Keep the striking dark band
  // exactly as-is when ink is dark; otherwise fall back to the surfaces the
  // contrast budget already proves (card fill + adaptive ink).
  const inkIsDark = relativeLuminance(PALETTE.ink) < 0.3
  const bandFill = inkIsDark ? PALETTE.ink : (resolveCardFill() ?? PALETTE.background)
  const bandText = inkIsDark ? '#FFFFFF' : PALETTE.ink
  const bgId = addShape(ctx, 'RECTANGLE', g.M, top, gw, bandH, {
    fillHex: bandFill,
    prefix: 'GOALBG',
  })
  const goalId = addTextBox(ctx, goal, g.M + 16 * sx, top + 8 * sy, gw - 32 * sx, boxH, {
    ...style,
    colorHex: bandText,
    alignment: 'CENTER',
  }, 'GOAL', true, { role, parentId: bgId })
  groupIds(ctx, [bgId, goalId])
  return top + bandH
}

function renderPillarsStrategy(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  ctx.encoding = 'PILLARS_CLASSIC'
  const sx = g.page.sx
  const sy = g.page.sy
  titleBlock(ctx, c.title, c.subtitle)
  // TASK-094-R3: totals separated before peer slicing (same rule as
  // renderComparison) so the whole never occupies a pillar slot.
  const independentTotal = detectTotalLine(c.title, c.subtitle, c.bullets)?.amount ?? null
  const columns: ColumnDatum[] = (c.columns ?? bulletsToColumns(c.bullets) ?? [])
    .filter((col) => !isTotalPeer(col.name, parsePercentShare(col.items[0] ?? ''), independentTotal))
    .slice(0, 5)
    .map((col) => ({
      name: col.name,
      items: (col.items ?? []).slice(0, 4),
    }))
  if (columns.length < 2) failPlan('PILLARS_STRATEGY requires 2..5 columns with items.')
  const top = g.CONTENT_TOP + 40 * sy
  const gw = g.W - g.M * 2
  // TASK-090: distribution branch — every column name is a percentage share
  // with at least one amount line (e.g. budget allocation). Shares summing
  // to ~100 render as a stacked whole; otherwise ranked proportional bars.
  // Never a false whole, never equal-weight containers for unequal shares.
  // TASK-090-R1: distribution branches share pillarDistribution() with the
  // expected-encoding mirror (no drift by construction).
  const dist = pillarDistribution(columns)
  if (dist !== null) {
    if (dist.kind === 'stacked') {
      ctx.encoding = 'PARTS_OF_WHOLE_STACK'
      const done = renderStackedBar(
        ctx,
        columns.map((col, i) => ({ name: col.name.trim(), amount: col.items[0].trim(), share: dist.shares[i] })),
        top,
        c.title.trim()
      )
      if (c.sharedGoal?.trim()) {
        renderSharedGoalBand(ctx, c.sharedGoal.trim(), done.endY + g.GUTTER, g.H - g.M)
      }
      return
    }
    ctx.encoding = 'RANKED_PROPORTIONAL_BARS'
    const ranked = renderRankedBars(
      ctx,
      columns.map((col, i) => ({
        label: col.name.trim(),
        valueText: col.items[0].trim(),
        value: dist.shares[i],
      })),
      top,
      gw
    )
    if (c.sharedGoal?.trim()) {
      renderSharedGoalBand(ctx, c.sharedGoal.trim(), ranked.endY + g.GUTTER, g.H - g.M)
    }
    return
  }
  if (c.sharedGoal?.trim()) ctx.encoding = 'PILLARS_WITH_SHARED_FOUNDATION'
  // TASK-090-R1: goal-band space is reserved BEFORE column layout so the
  // shared goal never overflows the columns block (adapt-or-fail-closed).
  const goalText = c.sharedGoal?.trim() || ''
  const goalReserve = goalText
    ? fitTextBoxH(goalText, t(ctx, 'body').fontSizePt, gw - 32 * g.page.sx) + 16 * sy + g.GUTTER
    : 0
  // TASK-086R1: coupled layout shared with COMPARISON (pillars use a 22pt
  // header offset and 6pt header gap).
  const headerBase = t(ctx, 'cardHeading').fontSizePt
  const set = layoutColumnSet({
    columns: columns.map((col) => ({
      headerText: col.name.trim(),
      itemCount: col.items.length,
    })),
    availW: gw,
    availH: g.H - top - g.M - goalReserve,
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
    minBgHPt: goalText ? 140 * sy : 300 * sy,
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
    const cardShape = resolveCardShapeType()
    const cardFill = resolveCardFill()
    const cardOutline = resolveCardOutlineHex()
    const bgId = addShape(ctx, cardShape, x, top, colW, set.bgH, {
      ...(cardFill !== undefined ? { fillHex: cardFill } : {}),
      ...(cardOutline !== undefined ? { outlineHex: cardOutline, outlineWeightPt: resolveCardOutlineWeight() } : {}),
      prefix: `PILBG${i}`,
    })
    ids.push(bgId)
    ids.push(addShape(ctx, 'RECTANGLE', x, top, colW, 10 * sy, { fillHex: ctx.accentHex, prefix: `PILTOP${i}`, parentId: bgId }))
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
  // TASK-090: shared foundation band — one structural anchor beneath every
  // pillar so the columns read as supported peers, not floating cards.
  // background-kind (collision-exempt); positioned below the column
  // backgrounds with a gap, so no overlap and no z-order op is needed.
  // TASK-090-R1: with a shared goal the goal band IS the foundation (one
  // anchor, not two); the decorative band is skipped to save real space.
  let pillarsBottom = top + set.bgH
  if (!c.sharedGoal?.trim()) {
    const bandY = top + set.bgH + 14 * sy
    if (bandY + 10 * sy <= g.H - g.M) {
      addShape(ctx, 'RECTANGLE', g.M, bandY, gw, 10 * sy, {
        fillHex: ctx.accentHex,
        prefix: 'PILBASE',
        background: true,
      })
      pillarsBottom = bandY + 10 * sy
    }
  }
  // TASK-090-R1: shared goal is a required foundation fact, never droppable.
  // When present the encoding reports it; geometry shortfall fails closed.
  if (c.sharedGoal?.trim()) {
    ctx.encoding = 'PILLARS_WITH_SHARED_FOUNDATION'
    renderSharedGoalBand(ctx, c.sharedGoal.trim(), pillarsBottom + g.GUTTER, g.H - g.M, 'body')
  }
}

function renderClosingInsight(ctx: Ctx, c: SlideContent): void {
  const g = ctx.g
  ctx.encoding = 'CLOSING_INSIGHT'
  const sx = g.page.sx
  const sy = g.page.sy
  // TASK-094-R3: the main statement is never narrative body text. With an
  // explicit closing it renders as the display thesis; without one, a
  // substantive subtitle IS the statement (promoted to display thesis with
  // the title as kicker). Title-only closes keep title-as-thesis. This keeps
  // long statements out of shrink-to-9.5pt body boxes.
  const closingText = (c.closing ?? '').trim()
  const subtitleText = (c.subtitle ?? '').trim()
  const statement = (closingText || subtitleText || c.title).trim()
  if (!statement) failPlan('CLOSING_INSIGHT requires closing or title text.')
  const kicker = closingText
    ? (c.title.trim() && c.title.trim() !== closingText ? c.title.trim() : undefined)
    : (subtitleText ? c.title.trim() : undefined)
  const hasKicker = !ctx.reuseTitleId && kicker !== undefined
  const hasSubtitle = closingText ? !!subtitleText : false
  // TASK-090-R2: adaptive geometry — standard layout first; if the thesis
  // text is long, switch to compact mode (smaller fonts, tighter spacing)
  // to ensure all content fits within the slide. Only fail closed if both
  // layouts genuinely cannot hold the content.
  const thesisChars = statement.length
  const compact = thesisChars > 200 || (hasKicker && thesisChars > 140)
  if (compact) {
    // Compact layout: smaller thesis, tighter vertical distribution.
    const kickerY = 60 * sy
    const thesisY = hasKicker ? 100 * sy : 80 * sy
    const thesisH = hasSubtitle ? 180 * sy : 220 * sy
    if (hasKicker) {
      addTextBox(ctx, kicker as string, g.M + 140 * sx, kickerY, g.W - g.M * 2 - 280 * sx, 30 * sy, {
        ...t(ctx, 'body'),
        colorHex: PALETTE.muted,
        alignment: 'CENTER',
      }, 'CKICKER', true, { role: 'body' })
    }
    addTextBox(ctx, statement, g.M + 60 * sx, thesisY, g.W - g.M * 2 - 120 * sx, thesisH, {
      ...t(ctx, 'sectionHeading'),
      colorHex: PALETTE.ink,
      alignment: 'CENTER',
    }, 'THESIS', true, { role: 'sectionHeading' })
    const barY = thesisY + thesisH + 10 * sy
    addShape(ctx, 'RECTANGLE', g.W / 2 - 32 * sx, barY, 64 * sx, ACCENT_BAR_W * sy, { fillHex: ctx.accentHex, prefix: 'CBAR' })
    if (hasSubtitle) {
      addTextBox(ctx, subtitleText, g.M + 140 * sx, barY + 16 * sy, g.W - g.M * 2 - 280 * sx, 50 * sy, {
        ...t(ctx, 'body'),
        colorHex: PALETTE.muted,
        alignment: 'CENTER',
      }, 'CSUB', false, { role: 'body' })
    }
    return
  }
  // Standard layout: full-size thesis with kicker and subtitle.
  // TASK-096-R1: thesis box sized for a 96-char display thesis at the real
  // 720x405 page (4 wrapped lines at deckTitle demand 165pt there, 220pt at
  // full scale). A shorter box overflowed honestly on real pages while the
  // 960 design reference masked it; the accent bar shifts accordingly.
  if (hasKicker) {
    addTextBox(ctx, kicker as string, g.M + 120 * sx, 96 * sy, g.W - g.M * 2 - 240 * sx, 40 * sy, {
      ...t(ctx, 'sectionHeading'),
      colorHex: PALETTE.muted,
      alignment: 'CENTER',
    }, 'CKICKER', true, { role: 'sectionHeading' })
  }
  addTextBox(ctx, statement, g.M + 40 * sx, 150 * sy, g.W - g.M * 2 - 80 * sx, 220 * sy, {
    ...t(ctx, 'deckTitle'),
    colorHex: PALETTE.ink,
    alignment: 'CENTER',
  }, 'THESIS', true, { role: 'deckTitle' })
  addShape(ctx, 'RECTANGLE', g.W / 2 - 32 * sx, 380 * sy, 64 * sx, ACCENT_BAR_W * sy, { fillHex: ctx.accentHex, prefix: 'CBAR' })
  if (hasSubtitle) {
    addTextBox(ctx, subtitleText, g.M + 120 * sx, 384 * sy, g.W - g.M * 2 - 240 * sx, 60 * sy, {
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
  sharedGoal?: string
  /** TASK-092: optional theme ID. Resolved via theme precedence if absent. */
  themeId?: string
  /** TASK-093: original user prompt for theme inference from prompt context. */
  userPrompt?: string
  /**
   * TASK-094-R1: authoritative per-slide source lines (verbatim user facts).
   * Optional, bounded, scoped to this slide only. When present, the engine
   * gates compose input against it BEFORE any write (source-to-input
   * fidelity); lines without numeric/category signal are flexible narrative
   * and never compared. Never style instructions, credentials, or prompts.
   */
  sourceFacts?: string[]
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
    ...(readOptStr('sharedGoal', 300) ? { sharedGoal: readOptStr('sharedGoal', 300) as string } : {}),
    ...(readOptStr('themeId', 60) ? { themeId: readOptStr('themeId', 60) as string } : {}),
    ...(readOptStr('userPrompt', 500) ? { userPrompt: readOptStr('userPrompt', 500) as string } : {}),
    ...(raw.sourceFacts !== undefined ? { sourceFacts: strArray(raw.sourceFacts, 'sourceFacts', 1, 8, 300) } : {}),
  }
  return { presentationId, input }
}

export interface PageComposeOptions {
  pageWidthPt?: number
  pageHeightPt?: number
  placeholders?: PlaceholderInfo[]
  /**
   * TASK-090: presentation theme colors ({THEME_ROLE: '#RRGGBB'}), when the
   * caller resolved them from the live deck. Accent roles resolve through
   * resolveThemeRole with palette fallback; absent theme keeps palette.
   */
  theme?: Record<string, string> | null
  /**
   * TASK-086R2-R1: full pre-existing page inventory (superset of
   * placeholders) so Beautify on an existing slide replaces the source
   * structure instead of stranding it next to the composition. Placeholders
   * keep their decideOwnership contract; this only adds ownership for the
   * remaining elements (duplicate-source CLEAR + previous-generation CLEAR).
   */
  existingElements?: Array<{ objectId: string; text?: string; placeholderType?: string; kind?: string; parentGroupId?: string }>
  /**
   * TASK-089: fully-owned group shell clearing policy ('shell' default:
   * live-proven cascade — one shell delete removes the whole owned
   * generation; 'members-only' fallback preserves shells). Threaded to
   * decideSourceOwnership.
   */
  groupShells?: GroupShellClearMode
  /**
   * TASK-090-R1: required visual encoding. When provided, a mismatch with
   * the renderer-reported encoding fails closed (EXPECTED_ENCODING_MATCH).
   * Direct unit callers omit it (no gate); the live path always sets it.
   */
  expectedEncoding?: string
  /**
   * TASK-092: Alpha theme ID for art direction. Resolved via theme precedence:
   * explicit compose theme > user prompt hint > existing deck > default.
   */
  alphaThemeId?: string
  /** TASK-092: user prompt text for theme inference (used when alphaThemeId absent). */
  userPrompt?: string
}

/** qaPass must include authoritative readback: no GEOMETRY_PROVEN while a blocking duplicate survives. */
export function composeQaPass(planFindings: Array<{ pass: boolean }>, readbackQa: GeometryFinding[]): boolean {
  return planFindings.every((f) => f.pass) && !hasBlocking(readbackQa)
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
  // TASK-090: theme accent resolution (contrast-safe, palette fallback).
  const theme = opts.theme ?? null
  // TASK-092: Alpha theme resolution and palette application.
  // Precedence: explicit compose theme > user prompt > existing deck > default.
  const themeResolution = resolveThemePrecedence(
    input.themeId ?? opts.alphaThemeId,
    opts.userPrompt,
    theme,
  )
  const alphaTheme = resolveTheme(themeResolution.themeId)
  applyTheme(alphaTheme)
  // TASK-094-R1: authoritative source vs compose input, computed once
  // (content-only, reflow-invariant) and enforced on every attempt below.
  // Absent sourceFacts yield UNPROVEN — never fabricated, never PASS-claimed.
  const sourceFidelity = checkSourceToInputFidelity(input.sourceFacts, content)
  const sourceFidelityFindings = sourceFidelity.findings

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
  // TASK-094: background variant of the final attempt (for deck-coherence
  // diagnostics and theme-match evidence).
  let bgVariant: BackgroundVariant = 'NONE'
  // TASK-094-R2: authoritative fact fingerprint. Reflow attempts may change
  // geometry, spacing, and fonts — never facts. Verified every attempt.
  const factFingerprint = fingerprintFacts(content)

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    attempts = attempt + 1
    const ctx = newCtx(input.pageObjectId, layout)
    ctx.reflow = { fontMul, funnelRows }
    // TASK-093-R1: Alpha-explicit themes own the accent roles. The Google
    // deck theme (often Simple Light blue) must not override an explicitly
    // resolved Alpha palette — that override made MODERN_GRADIENT render with
    // Simple Light accents on the live path. DEFAULT source keeps the legacy
    // Google-role resolution with palette fallback.
    const alphaExplicit = themeResolution.source !== 'DEFAULT'
    ctx.accentHex = alphaExplicit ? PALETTE.accent : resolveThemeRole(theme, 'ACCENT1', PALETTE.accent)
    ctx.accent2Hex = alphaExplicit ? PALETTE.accent2 : resolveThemeRole(theme, 'ACCENT2', PALETTE.accent2)
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
      // TASK-093-R2: carry the stored placeholder text so title replacement
      // can skip `deleteText` when there is no deletable span (empty fresh-
      // deck placeholders). PlaceholderInfo.text is '' when empty.
      ctx.reuseTitleText = titlePh.text ?? ''
      if (titlePh.rect) ctx.reuseTitleRect = titlePh.rect
        ctx.hierarchy.push({ role: 'slideTitle', fontPt: style.fontSizePt, id: `native:${titlePh.objectId}` })
      }
    }
    // TASK-092-R1: themed background shapes (gradient-like, hero-dark, split).
    // Applied centrally so every archetype benefits.
    // TASK-094: role-aware variant (cover hero vs content band) so one motif
    // never dominates every slide identically.
    const bgShapes = buildBackgroundRequests(ctx, layout.W, layout.H, input.archetype)
    bgVariant = bgShapes.length > 0 ? (bgShapes[0].variant as BackgroundVariant) : 'NONE'
    for (const s of bgShapes) {
      const id = addShape(ctx, s.shapeType as 'RECTANGLE' | 'ROUND_RECTANGLE' | 'ELLIPSE', s.x, s.y, s.width, s.height, {
        fillHex: s.fillHex,
        prefix: s.prefix,
        background: true,
      })
      ctx.requests.push(buildZOrder([id], s.zOrder as 'SEND_TO_BACK'))
    }
    RENDERERS[input.archetype](ctx, content)
    // TASK-094-R2: retry immutability — reflow may only reshape geometry.
    // Any fact drift across attempts is a programming defect: fail loudly.
    if (fingerprintFacts(content) !== factFingerprint) {
      failPlan('fact fingerprint drift across reflow attempts (facts moved during retry).')
    }
    const nativeKept = nativeRects(
      placeholders.filter((p) => {
        const dec = ownership.find((d) => d.objectId === p.objectId)?.decision
        return dec === 'PRESERVE' || dec === 'REUSE'
      })
    )
    // TASK-094: the reused native title is tracked in ctx.placed as text
    // (see titleBlock) AND appears in nativeKept as a shape rect for the
    // same box. Dedupe by id so the pair never self-collides; the text view
    // carries containment/collision QA, the shape view is redundant.
    const placedIds = new Set(ctx.placed.map((p) => p.id))
    const nativeNew = nativeKept.filter((n) => !placedIds.has(n.id))
    const elements = [...ctx.placed, ...nativeNew]
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
      // TASK-094-R3: text/fill contrast — invisible text on semantic
      // containers fails closed (checked against parent fill, else page).
      ...checkTextContrast(ctx.placed, PALETTE.background),
      // TASK-094-R2: decoration-on-text guard (accent bars, lines and
      // containers vs text boxes, motifs/backgrounds exempt by contract).
      ...checkProtectedTextCollisions(elements),
      // TASK-096-R5: decoration-protected-region intersection gate.
      // Validates that decorative objects do not intersect protected foreground
      // regions (title, content, semantic rows).
      ...checkDecorationProtectedRegionIntersections(elements, [
        { id: 'TITLE', role: 'title', rect: layout.TITLE },
        { id: 'CONTENT', role: 'content', rect: { x: layout.M, y: layout.CONTENT_TOP, w: layout.W - layout.M * 2, h: layout.H - layout.CONTENT_TOP - layout.M } },
      ]),
      // TASK-094-R2: orphan containers — text boxes without meaningful text
      // and content shapes with neither direct text nor text children fail
      // closed (decorative/data-mark prefixes exempt by audited allowlist).
      ...checkEmptyContainers(ctx.placed, insertTextTargets(ctx.requests)),
      // TASK-094: distribution fidelity — input inventory vs rendered
      // geometry (counts, identities, values, totals). Metadata-only
      // encodings cannot pass: a promised bars/stacked encoding with no
      // matching rendered geometry fails closed here.
      ...checkDistributionPlan(content, ctx, opts.expectedEncoding),
      // TASK-094-R1: source-to-input fidelity — authoritative source facts
      // vs compose input, BEFORE any write. Computed once (content-only,
      // reflow-invariant) and enforced on every attempt.
      ...sourceFidelityFindings,
      // TASK-087: visual-quality signals are WARNING-grade evidence for the
      // human verdict — they inform but never gate GEOMETRY_PROVEN.
      ...qaVisualQuality({
        page,
        elements: ctx.placed,
        hierarchy: ctx.hierarchy,
        inputMetrics: numericTokens(expectedTextsOf(content)),
        sourceTexts: expectedTextsOf(content),
        proportionSets: ctx.proportions,
      }),
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
  // TASK-092: thread theme resolution evidence into the compose result.
  result.expected.themeRequested = input.themeId ?? opts.alphaThemeId ?? undefined
  result.expected.themeResolved = themeResolution.themeId
  result.expected.themeSource = themeResolution.source
  result.expected.backgroundVariant = bgVariant
  result.expected.sourceToInputFidelity = sourceFidelity.status
  // TASK-094-R2: honest motif reporting (technique/role/variant/placement).
  const bgComposition = describeBackgroundComposition(bgVariant)
  result.expected.gradientTechnique = bgComposition.gradientTechnique
  result.expected.motifVariant = bgComposition.motifVariant
  result.expected.placementFamily = bgComposition.placementFamily
  // TASK-086R2-R1: source ownership for the remaining (non-placeholder)
  // inventory. CLEARs ride the first chunk with the placeholder CLEARs, so no
  // consumer of this result can drop them. Scoped to this slide: only ids
  // observed on THIS page snapshot are ever decided here.
  const decidedIds = new Set(placeholders.map((p) => p.objectId))
  ownership.push(
    ...decideSourceOwnership(opts.existingElements ?? [], {
      expectedTexts: expectedTextsOf(content),
      decidedIds,
      composeTitle: input.title,
      ...(opts.groupShells !== undefined ? { groupShells: opts.groupShells } : {}),
    })
  )
  // TASK-090-R1: pre-write factual coverage gate (FACTUAL_PROJECTION_COMPLETE).
  // For every CLEAR target carrying source text, each substantive owned fact
  // must be covered by the planned projected texts. Uncovered facts BLOCK
  // before any write — source is never cleared to discover loss afterward.
  // Layered above TASK-089 ownership mechanics (which it does not replace).
  {
    const textById = new Map<string, string>()
    for (const p of placeholders) {
      if (p.text) textById.set(p.objectId, p.text)
    }
    for (const e of opts.existingElements ?? []) {
      if (e.text) textById.set(e.objectId, e.text)
    }
    const clearTargets = ownership
      .filter((d) => d.decision === 'CLEAR' && textById.has(d.objectId))
      .map((d) => ({ objectId: d.objectId, text: textById.get(d.objectId) as string }))
    prewriteQa.push(
      ...checkFactCoverage(clearTargets, expectedTextsOf(content), input.title)
    )
  }
  // TASK-090-R1: encoding match gate. When the caller declares the required
  // visual encoding, a renderer that emits anything else fails closed —
  // facts surviving in the wrong visual grammar is still a wrong result.
  // The emitted encoding is read from the final attempt's plan (attemptResult
  // is always set: the reflow loop assigns it on every iteration).
  const emittedEncoding = attemptResult?.expected.encoding ?? ''
  if (opts.expectedEncoding !== undefined && emittedEncoding !== opts.expectedEncoding) {
    prewriteQa.push({
      check: 'EXPECTED_ENCODING_MATCH',
      pass: false,
      severity: 'BLOCKING',
      detail: `expected ${opts.expectedEncoding} but emitted ${emittedEncoding || '(unset)'}`
    })
  }
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

/** Object IDs that receive direct text (for orphan-container QA). */
function insertTextTargets(requests: Array<Record<string, unknown>>): Set<string> {
  const out = new Set<string>()
  for (const r of requests) {
    const mutation = (r as Record<string, unknown>).insertText as Record<string, unknown> | undefined
    if (mutation && typeof mutation.objectId === 'string') out.add(mutation.objectId)
  }
  return out
}

/**
 * TASK-094-R2: decoration behind text is a design layer; decoration ON text
 * is a defect. Motif/decorative shapes (ACCENT/MOTIF/DECO_) and native
 * background layers live behind content by contract and are exempt here
 * (contrast is enforced by theme construction + tests). For every other
 * overlapping text-vs-shape/line pair, paint order decides: requests paint
 * in plan order (later = in front), so a shape created BEFORE the text it
 * overlaps (track under its value label, card under its content) is the
 * intended layering and passes; a shape painted OVER text (accent bar across
 * glyphs, rail over a label) is BLOCKING with both sides, roles, bounds,
 * and overlap area reported. Parent/child and same-id pairs are excepted.
 * The reused native title participates like any created box. Conflicts fail
 * closed; motifs are never auto-repositioned (no silent redesign) and text
 * is never shrunk below minimums to keep a decoration.
 */
export const MOTIF_BEHIND_PREFIXES = ['ACCENT', 'MOTIF', 'DECO_', 'BG_']

export function checkProtectedTextCollisions(elements: PlacedElement[]): GeometryFinding[] {
  const hits: string[] = []
  const order = new Map(elements.map((e, i) => [e.id, i]))
  const texts = elements.filter((e) => e.kind === 'text')
  const solids = elements.filter((e) => e.kind === 'shape' || e.kind === 'line')
  for (const t of texts) {
    for (const s of solids) {
      if (t.id === s.id) continue
      if (t.parentId === s.id || s.parentId === t.id) continue
      if (MOTIF_BEHIND_PREFIXES.some((p) => s.id.includes(p))) continue
      if (!rectsOverlap(t.rect, s.rect)) continue
      // Behind-by-paint-order (earlier plan position) is intended layering.
      const si = order.get(s.id) ?? Number.POSITIVE_INFINITY
      const ti = order.get(t.id) ?? Number.POSITIVE_INFINITY
      if (si < ti) continue
      const ox = Math.max(0, Math.min(t.rect.x + t.rect.w, s.rect.x + s.rect.w) - Math.max(t.rect.x, s.rect.x))
      const oy = Math.max(0, Math.min(t.rect.y + t.rect.h, s.rect.y + s.rect.h) - Math.max(t.rect.y, s.rect.y))
      const tLabel = `${t.id}${t.role ? `(${t.role})` : ''}`
      hits.push(
        `${tLabel}×${s.id} area=${Math.round(ox * oy)}pt2 ` +
          `text=[${Math.round(t.rect.x)},${Math.round(t.rect.y)},${Math.round(t.rect.w)},${Math.round(t.rect.h)}] ` +
          `shape=[${Math.round(s.rect.x)},${Math.round(s.rect.y)},${Math.round(s.rect.w)},${Math.round(s.rect.h)}]`
      )
    }
  }
  if (hits.length > 0) {
    return [{ check: 'PROTECTED_TEXT_COLLISION', severity: 'BLOCKING', pass: false, detail: hits.slice(0, 5).join(' | ') }]
  }
  return [{ check: 'PROTECTED_TEXT_COLLISION', severity: 'INFO', pass: true }]
}

/**
 * TASK-094-R2: audited allowlist of shape prefixes that legitimately carry
 * no direct text and no text children: decorative accents/motifs/tracks/
 * chips/dots/arrows plus proportional data marks (bars/segments whose
 * labels live in sibling boxes). A textless, childless shape with any OTHER
 * prefix is an orphan container and fails closed — novel shapes must either
 * carry content or be classified here explicitly.
 */
export const NONCONTAINER_PREFIXES = [
  'ACCBAR',
  'CBAR',
  'KPIA',
  'PILTOP',
  'ACCENT',
  'MOTIF',
  'DECO_',
  'BG_',
  'DBB',
  'DBT',
  'DLT',
  'DOT',
  'ARW',
  'NUMBG',
  'STKS',
  'STKC',
  // STG doubles as the proportional-funnel tapered bar (labels keep full
  // slot width in sibling boxes by design); classic-mode STG cards carry
  // parentId-linked children instead.
  'STG',
]

/**
 * TASK-094-R2: orphan-container guard. Every text box must carry meaningful
 * text; every content shape must carry direct text or own text children
 * (via parentId). Decorative/data-mark shapes from NONCONTAINER_PREFIXES are
 * exempt (they collide-check normally). Anything else textless is BLOCKING —
 * on dark themes a light orphan renders as the reported empty white
 * rectangle, so that combination is called out explicitly.
 */
export function checkEmptyContainers(
  placed: PlacedElement[],
  textTargetIds: Set<string> | string[]
): GeometryFinding[] {
  const targets = textTargetIds instanceof Set ? textTargetIds : new Set(textTargetIds)
  const childOwners = new Set<string>()
  for (const el of placed) {
    if (el.parentId) childOwners.add(el.parentId)
  }
  const emptyText: string[] = []
  const emptyShapes: string[] = []
  for (const el of placed) {
    if (el.kind === 'text') {
      if (!isMeaningfulText(el.text)) emptyText.push(`${el.id}: empty text box`)
      continue
    }
    if (el.kind !== 'shape') continue
    const hasText = targets.has(el.id)
    const hasKids = childOwners.has(el.id)
    if (hasText || hasKids) continue
    if (NONCONTAINER_PREFIXES.some((p) => el.id.includes(p))) continue
    let detail = `${el.id}: textless content shape with no text children`
    const fill = (el as { fillHex?: unknown }).fillHex
    if (typeof fill === 'string' && /^#[0-9a-f]{6}$/i.test(fill)) {
      detail += ` fill=${fill.toUpperCase()}`
      if (relativeLuminance(fill) >= 0.5 && relativeLuminance(PALETTE.background) < 0.3) {
        detail += ' (light orphan container on dark theme)'
      }
    }
    emptyShapes.push(detail)
  }
  const findings: GeometryFinding[] = []
  if (emptyText.length > 0) {
    findings.push({ check: 'EMPTY_TEXT_BOX', severity: 'BLOCKING', pass: false, detail: emptyText.slice(0, 5).join(' | ') })
  }
  if (emptyShapes.length > 0) {
    findings.push({ check: 'EMPTY_CONTAINER', severity: 'BLOCKING', pass: false, detail: emptyShapes.slice(0, 5).join(' | ') })
  }
  if (findings.length === 0) {
    return [{ check: 'EMPTY_CONTAINER', severity: 'INFO', pass: true }]
  }
  return findings
}

/**
 * TASK-096-R5: protected-region intersection gate. Validates that decorative
 * objects (BG_*, DECO_*, MOTIF*, ACCENT*) do not intersect protected foreground
 * regions (title, content, semantic rows). This gate catches layout-unaware
 * decorations that the existing collision system exempts.
 */
export interface ProtectedRegion {
  id: string
  role: string
  rect: { x: number; y: number; w: number; h: number }
}

export function checkDecorationProtectedRegionIntersections(
  elements: PlacedElement[],
  protectedRegions: ProtectedRegion[]
): GeometryFinding[] {
  const hits: string[] = []
  const decorations = elements.filter(
    (e) =>
      (e.kind === 'shape' || e.kind === 'line' || e.kind === 'background') &&
      (e.id.startsWith('BG_') || e.id.startsWith('DECO_') || e.id.startsWith('MOTIF') || e.id.startsWith('ACCENT'))
  )
  for (const deco of decorations) {
    for (const region of protectedRegions) {
      if (!rectsOverlap(deco.rect, region.rect)) continue
      const ox = Math.max(
        0,
        Math.min(deco.rect.x + deco.rect.w, region.rect.x + region.rect.w) -
          Math.max(deco.rect.x, region.rect.x)
      )
      const oy = Math.max(
        0,
        Math.min(deco.rect.y + deco.rect.h, region.rect.y + region.rect.h) -
          Math.max(deco.rect.y, region.rect.y)
      )
      const area = ox * oy
      if (area > 1) {
        hits.push(
          `${deco.id}×${region.id}(${region.role}) area=${Math.round(area)}pt2 ` +
            `deco=[${Math.round(deco.rect.x)},${Math.round(deco.rect.y)},${Math.round(deco.rect.w)},${Math.round(deco.rect.h)}] ` +
            `region=[${Math.round(region.rect.x)},${Math.round(region.rect.y)},${Math.round(region.rect.w)},${Math.round(region.rect.h)}]`
        )
      }
    }
  }
  if (hits.length > 0) {
    return [
      {
        check: 'DECORATION_PROTECTED_REGION_INTERSECTION',
        severity: 'BLOCKING',
        pass: false,
        detail: hits.slice(0, 5).join(' | '),
      },
    ]
  }
  return [{ check: 'DECORATION_PROTECTED_REGION_INTERSECTION', severity: 'INFO', pass: true }]
}

/**
 * TASK-094-R3: minimum WCAG contrast for semantic text.
 * Measured healthy pairs run 5.7-17.9; white-on-white / dark-on-dark
 * defects sit at ~1.0. 4.5 (WCAG AA) separates them with margin.
 */
export const TEXT_CONTRAST_MIN_RATIO = 4.5

/**
 * TASK-094-R3: pick the readable text color for a filled badge/dot.
 * White-on-light-accents (e.g. cyan #06B6D4) fails contrast visibly; dark
 * ink on that badge passes. Returns whichever of white vs dark ink has the
 * higher WCAG ratio against the fill — deterministic, theme-aware.
 */
export function bestTextOnFill(fillHex: string): string {
  const white = contrastRatioOf('#FFFFFF', fillHex)
  const dark = contrastRatioOf('#0F172A', fillHex)
  if (!Number.isFinite(white)) return '#FFFFFF'
  if (!Number.isFinite(dark)) return '#0F172A'
  return white >= dark ? '#FFFFFF' : '#0F172A'
}

export function contrastRatioOf(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex)
  const l2 = relativeLuminance(bgHex)
  if (!Number.isFinite(l1) || !Number.isFinite(l2)) return NaN
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/**
 * TASK-094-R3: text-to-background contrast validator for semantic
 * containers. Each text entry is checked against its parent container fill,
 * else the page background. White-on-white and dark-on-dark (the live
 * invisible-text class) fail BLOCKING with object id, role, colors, ratio,
 * and threshold. Decorative shapes carry no text and never enter this check.
 */
export function checkTextContrast(elements: PlacedElement[], pageBgHex: string): GeometryFinding[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const bad: string[] = []
  for (const el of elements) {
    if (el.kind !== 'text') continue
    const fg = el.colorHex
    if (typeof fg !== 'string' || !/^#[0-9a-f]{6}$/i.test(fg)) continue
    let bg: string | undefined
    if (el.parentId) {
      const parent = byId.get(el.parentId)
      const fill = (parent as { fillHex?: unknown } | undefined)?.fillHex
      if (typeof fill === 'string' && /^#[0-9a-f]{6}$/i.test(fill)) bg = fill
    }
    if (bg === undefined) bg = pageBgHex
    if (!/^#[0-9a-f]{6}$/i.test(bg)) continue
    const ratio = contrastRatioOf(fg, bg)
    if (!Number.isFinite(ratio)) continue
    if (ratio < TEXT_CONTRAST_MIN_RATIO) {
      bad.push(
        `${el.id}${el.role ? `(${el.role})` : ''} text=${fg.toUpperCase()} on fill=${bg.toUpperCase()} ratio=${ratio.toFixed(2)}<${TEXT_CONTRAST_MIN_RATIO}`
      )
    }
  }
  if (bad.length > 0) {
    return [{ check: 'TEXT_CONTRAST', severity: 'BLOCKING', pass: false, detail: bad.slice(0, 5).join(' | ') }]
  }
  return [{ check: 'TEXT_CONTRAST', severity: 'INFO', pass: true }]
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
  result: ComposeResult,
  opts?: { pageWidthPt?: number; pageHeightPt?: number }
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
  // Bounds: every created element's box must sit inside the actual page.
  const pageW = opts?.pageWidthPt ?? CANVAS.width
  const pageH = opts?.pageHeightPt ?? CANVAS.height
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
    if (x < -1 || y < -1 || x + w > pageW + 1 || y + h > pageH + 1) {
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

/**
 * TASK-093-R1: deck-level slide-count verification contract (pure, no writes).
 * The compose engine has no deck-level orchestration tool (per-slide tools
 * only), so exact-count enforcement lives with the agent workflow — this
 * helper is the deterministic verifier both agents and tests use:
 * - new decks: exactly N slides, first slide meaningful, no blank slides.
 * - existing decks: count unchanged unless explicitly changed; the helper
 *   never deletes anything (first-slide protection by construction — it is
 *   pure and returns a verdict instead of mutating).
 * A count mismatch or blank slide is a failure/conditional signal, never
 * silently accepted.
 */
export interface DeckSlideSummary {
  objectId: string
  elementCount: number
  hasText: boolean
}

export interface SlideLifecycleVerdict {
  pass: boolean
  reason: string
  blankSlideIds: string[]
}

export function verifyDeckSlideCount(
  slides: DeckSlideSummary[],
  expectedN: number,
  opts?: { isNewDeck?: boolean }
): SlideLifecycleVerdict {
  const isNewDeck = opts?.isNewDeck ?? true
  if (slides.length !== expectedN) {
    return {
      pass: false,
      reason: `slide count mismatch: expected ${expectedN}, found ${slides.length}`,
      blankSlideIds: [],
    }
  }
  const blankSlideIds = slides
    .filter((s) => s.elementCount === 0 && !s.hasText)
    .map((s) => s.objectId)
  if (isNewDeck && blankSlideIds.length > 0) {
    return {
      pass: false,
      reason: `blank slide(s) in new deck: ${blankSlideIds.join(', ')}`,
      blankSlideIds,
    }
  }
  if (isNewDeck && slides.length > 0 && slides[0].elementCount === 0 && !slides[0].hasText) {
    return {
      pass: false,
      reason: `first slide is blank in new deck: ${slides[0].objectId}`,
      blankSlideIds: [slides[0].objectId],
    }
  }
  return { pass: true, reason: `exact count ${expectedN}, no blank slides`, blankSlideIds: [] }
}

/**
 * TASK-094: deck-coherence diagnostic (pure, advisory).
 * Records per-slide theme/background/encoding signatures and warns (never
 * fails valid decks) when one background variant dominates a multi-encoding
 * deck so heavily that semantic differences are masked, or when theme
 * coherence breaks mid-deck. The engine cannot orchestrate decks (no
 * deck-level tool), so this is the deterministic check agents and tests run
 * over per-slide compose evidence.
 */
export interface DeckSlideSignature {
  themeId: string
  backgroundVariant: string
  encoding: string
}

export function diagnoseDeckCoherence(slides: DeckSlideSignature[]): GeometryFinding[] {
  if (slides.length === 0) {
    return [{ check: 'DECK_COHERENCE', severity: 'INFO', pass: true, detail: 'empty deck' }]
  }
  const findings: GeometryFinding[] = []
  const themes = new Set(slides.map((s) => s.themeId))
  findings.push({
    check: 'DECK_THEME_COHERENCE',
    severity: 'WARNING',
    pass: themes.size === 1,
    ...(themes.size === 1
      ? { detail: `single theme ${[...themes][0]} across ${slides.length} slides` }
      : { detail: `mixed themes: ${[...themes].join(', ')}` }),
  })
  const variants = new Map<string, number>()
  for (const s of slides) variants.set(s.backgroundVariant, (variants.get(s.backgroundVariant) ?? 0) + 1)
  const encodings = new Set(slides.map((s) => s.encoding))
  const topShare = Math.max(...variants.values()) / slides.length
  const repetitive = slides.length >= 6 && topShare > 0.7 && encodings.size >= 3
  findings.push({
    check: 'DECK_MOTIF_VARIATION',
    severity: 'WARNING',
    pass: !repetitive,
    detail: repetitive
      ? `one background variant dominates (${Math.round(topShare * 100)}%) across ${encodings.size} encodings`
      : `variants: ${[...variants.entries()].map(([v, n]) => `${v}x${n}`).join(', ')}`,
  })
  return findings
}

/**
 * TASK-094-R1: deck lifecycle evidence contract (pure assembly, no writes).
 * The engine has NO deck-level orchestration tool, so it cannot enforce
 * exact-N execution itself — but every required evidence item is derivable
 * from existing tool results (createPresentation/getPresentation ids,
 * createSlide slideObjectIds, compose pageObjectIds + writeOutcome,
 * final slides_get_presentation inventory). The agent assembles this record;
 * this helper derives the verdict deterministically. Anything the trace does
 * not establish yields LIFECYCLE_UNPROVEN, never a fabricated PASS.
 */
export type LifecycleVerdict = 'LIFECYCLE_PROVEN' | 'LIFECYCLE_MISMATCH' | 'LIFECYCLE_UNPROVEN'

export interface DeckRunTrace {
  requestedN: number
  /** Observed initial slide count of the fresh presentation (provider makes 1). */
  initialSlideCount: number
  initialSlideId: string | null
  initialComposed: boolean
  createdSlideIds: string[]
  composedPageIds: string[]
  finalSlides: DeckSlideSummary[]
  isNewDeck?: boolean
  /**
   * TASK-094-R3: page IDs whose compose terminally failed before any write.
   * Any entry here fails exact-N verification: a deck with failed slides is
   * incomplete, never completable by count alone.
   */
  failedSlideIds?: string[]
}

export interface LifecycleEvidence {
  requestedN: number
  initialSlideCount: number
  initialSlideId: string | null
  initialComposed: boolean
  createSlideCalls: number
  composedPageIds: string[]
  duplicatePageIds: string[]
  finalSlideCount: number
  blankSlideCount: number
  meaningfulSlideCount: number
  verdict: LifecycleVerdict
  reason: string
  /** TASK-094-R3: terminally failed page IDs (empty when none). */
  failedSlideIds: string[]
}

export function buildLifecycleEvidence(trace: DeckRunTrace): LifecycleEvidence {
  const isNewDeck = trace.isNewDeck ?? true
  const seen = new Set<string>()
  const duplicatePageIds = [...new Set(trace.composedPageIds.filter((id) => seen.has(id) || !seen.add(id)))]
  const blankSlideIds = trace.finalSlides
    .filter((s) => s.elementCount === 0 && !s.hasText)
    .map((s) => s.objectId)
  const base = {
    requestedN: trace.requestedN,
    initialSlideCount: trace.initialSlideCount,
    initialSlideId: trace.initialSlideId,
    initialComposed: trace.initialComposed,
    createSlideCalls: trace.createdSlideIds.length,
    composedPageIds: [...trace.composedPageIds],
    duplicatePageIds,
    finalSlideCount: trace.finalSlides.length,
    blankSlideCount: blankSlideIds.length,
    meaningfulSlideCount: trace.finalSlides.length - blankSlideIds.length,
    failedSlideIds: [...(trace.failedSlideIds ?? [])],
  }
  if (!isNewDeck) {
    return { ...base, verdict: 'LIFECYCLE_UNPROVEN', reason: 'existing-deck flow is not exact-N gated' }
  }
  if (!trace.initialSlideId) {
    return { ...base, verdict: 'LIFECYCLE_UNPROVEN', reason: 'initial slide id unknown; cannot verify' }
  }
  if (!trace.initialComposed) {
    return { ...base, verdict: 'LIFECYCLE_MISMATCH', reason: 'initial slide was bypassed, not composed' }
  }
  if (duplicatePageIds.length > 0) {
    return { ...base, verdict: 'LIFECYCLE_MISMATCH', reason: `duplicate composed pages: ${duplicatePageIds.join(', ')}` }
  }
  // TASK-094-R3: terminally failed slides make the deck incomplete even when
  // the record count matches — a blank failed slide is never meaningful.
  const failedSlideIds = trace.failedSlideIds ?? []
  if (failedSlideIds.length > 0) {
    return { ...base, verdict: 'LIFECYCLE_MISMATCH', reason: `terminally failed slides: ${failedSlideIds.join(', ')}` }
  }
  const count = verifyDeckSlideCount(trace.finalSlides, trace.requestedN, { isNewDeck: true })
  if (!count.pass) {
    return { ...base, verdict: 'LIFECYCLE_MISMATCH', reason: count.reason }
  }
  return { ...base, verdict: 'LIFECYCLE_PROVEN', reason: count.reason }
}

/**
 * TASK-094-R1: bounded call accounting for one deck run.
 * The `scope` labels what the numbers ARE: MODEL_ONLY (hand-written model),
 * CONTRACT_PROVEN (workflow simulation test), RUNTIME_OBSERVED (assembled
 * from a real trace). Scopes must never be conflated: a MODEL_ONLY 31->21
 * table is DERIVED evidence, not a runtime improvement claim.
 */
export type EfficiencyScope = 'MODEL_ONLY' | 'CONTRACT_PROVEN' | 'RUNTIME_OBSERVED'

export interface DeckCallLogEntry {
  tool: 'createPresentation' | 'getPresentation' | 'getPage' | 'createSlide' | 'composeSlide'
  retried?: boolean
}

export interface DeckCallAccounting {
  theoreticalMinimumCalls: number
  actualSlidesToolCalls: number
  composeCalls: number
  createSlideCalls: number
  redundantReadbackCalls: number
  retryCalls: number
  efficiencyScope: EfficiencyScope
}

export function accountDeckCalls(log: DeckCallLogEntry[], scope: EfficiencyScope): DeckCallAccounting {
  const composeCalls = log.filter((e) => e.tool === 'composeSlide').length
  const createSlideCalls = log.filter((e) => e.tool === 'createSlide').length
  const getPageCalls = log.filter((e) => e.tool === 'getPage').length
  const getPresentationCalls = log.filter((e) => e.tool === 'getPresentation').length
  // Load-bearing reads: every agent get_page is redundant (each compose
  // already returns its own authoritative readback evidence; the initial
  // slide id comes from get_presentation, not get_page). Of the
  // get_presentation calls, the initial inventory read and the deck-end
  // verification read are load-bearing; anything beyond is redundant.
  const redundantReadbackCalls = getPageCalls + Math.max(0, getPresentationCalls - 2)
  const retryCalls = log.filter((e) => e.retried === true).length
  // Irreducible floor under per-slide tools for N distinct composed pages:
  // 1 createPresentation + 1 initial get_presentation + N compose +
  // (N-1) createSlide + 1 deck-end verify.
  const theoreticalMinimumCalls = 2 + composeCalls + Math.max(0, composeCalls - 1) + 1
  return {
    theoreticalMinimumCalls,
    actualSlidesToolCalls: log.length,
    composeCalls,
    createSlideCalls,
    redundantReadbackCalls,
    retryCalls,
    efficiencyScope: scope,
  }
}

/**
 * TASK-094-R1: measurement claim boundary for text fitting.
 * The 12% bold uplift is a DERIVED estimate (mean advance expansion), not a
 * measurement; rendered glyph fit without screenshot evidence is UNPROVEN.
 */
export const TEXT_MEASURE_SCOPE = 'DERIVED_ESTIMATE' as const

/**
 * TASK-094-R1: architecture boundary classifications (see report section 19).
 * States explicitly what the existing 13-tool surface can and cannot enforce.
 * TASK-094-R2: tool-batching + image capability boundaries (audit-only).
 */
export const ARCHITECTURE_BOUNDARIES = {
  sourceToInputFidelity: 'IMPLEMENTABLE_EXISTING_SURFACE',
  exactNLifecycleEnforcement: 'DECK_LEVEL_TOOL_REQUIRED',
  exactNLifecycleEvidence: 'AGENT_CONTRACT_ONLY',
  runtimeCallAccounting: 'AGENT_CONTRACT_ONLY',
  renderedPixelQA: 'EXTERNAL_RENDER_REQUIRED',
  deckBatching: 'DECK_LEVEL_TOOL_REQUIRED',
  userSuppliedImageInsertion: 'EXISTING_CAPABILITY_AVAILABLE',
  stockOrGeneratedImagePipeline: 'NEW_PROVIDER_AND_POLICY_REQUIRED',
} as const

/** TASK-094-R1: text-fit claim for a finding set (estimator-based, never pixel). */
export function textFitScopeOf(findings: Array<{ check: string; pass: boolean; severity: string }>): 'DERIVED_FIT' | 'BLOCKED' | 'UNPROVEN' {
  if (findings.length === 0) return 'UNPROVEN'
  if (findings.some((f) => f.check === 'TEXT_CONTAINER_OVERFLOW' && !f.pass)) return 'BLOCKED'
  return 'DERIVED_FIT'
}
