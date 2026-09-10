/**
 * ROUTING_CORRECTIVE: intent-gated guidance assembly (pure, no imports except
 * the block builders, no I/O) so a fresh "hi" stays lightweight while Google
 * and Slides intents keep their full doctrine.
 *
 * The server classifies the ALREADY-ASSEMBLED pre-guidance text (user message
 * + reference context + project block). Reference/project blocks carry their
 * own Google wording ("Google Drive File ID", "Google Drive folder ID"), so
 * Drive attachments and Drive projects trigger routing without extra signals.
 * An explicit signal override remains for callers that know more.
 */

import { buildGoogleRoutingBlock, buildMcpGuidanceBlock } from './mcp-guidance'

export interface PromptIntentSignals {
  /** True when the caller knows Google context is attached (Drive refs/project). */
  hasGoogleContext?: boolean
}

export interface PromptIntent {
  needsGoogleGuidance: boolean
  needsSlidesGuidance: boolean
}

/** Google Workspace intent: service names, resource nouns, ID nouns (EN + ID). */
const GOOGLE_RE =
  /\b(google|gmail|drive|docs|sheets?|spreadsheet|slides?|presentation|deck|pitch(?:\s*deck)?|calendar|apps?\s*script|file\s*id|spreadsheet\s*id|presentasi)\b/i

/** Presentation-composition intent (subset of Google intent). */
const SLIDES_RE =
  /\b(slides?|presentation|deck|pitch(?:\s*deck)?|presentasi|compose_slide|archetype)\b/i

export function classifyPromptIntent(
  text: string,
  signals: PromptIntentSignals = {}
): PromptIntent {
  const t = text ?? ''
  const needsSlides = SLIDES_RE.test(t)
  const needsGoogle =
    needsSlides || GOOGLE_RE.test(t) || signals.hasGoogleContext === true
  return { needsGoogleGuidance: needsGoogle, needsSlidesGuidance: needsSlides }
}

/**
 * Prepend the minimal guidance the prompt earns. Returns the input unchanged
 * when no Google/Slides intent is present (e.g. a fresh "hi").
 */
export function assemblePromptWithGuidance(
  preGuidanceText: string,
  signals: PromptIntentSignals = {}
): string {
  const intent = classifyPromptIntent(preGuidanceText, signals)
  if (intent.needsSlidesGuidance)
    return `${buildMcpGuidanceBlock()}\n\n${preGuidanceText}`
  if (intent.needsGoogleGuidance)
    return `${buildGoogleRoutingBlock()}\n\n${preGuidanceText}`
  return preGuidanceText
}
