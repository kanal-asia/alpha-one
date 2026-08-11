/**
 * Alpha Workspace — Presentation Schema
 *
 * Defines the structured data format for AI-generated presentation content.
 * The AI produces this structure, and the PPTX renderer consumes it directly.
 */

export type PresentationStyle = 'business' | 'marketing' | 'report' | 'proposal' | 'minimal'

export interface SlideContent {
  /** Slide title (required) */
  title: string
  /** Optional subtitle or supporting text */
  subtitle?: string
  /** Bullet points for the slide */
  bullets: string[]
  /** Optional key takeaway or conclusion for this slide */
  takeaway?: string
}

export interface PresentationContent {
  /** Presentation title */
  title: string
  /** Presentation purpose or topic */
  purpose: string
  /** Target audience */
  audience: string
  /** Presentation style */
  style: PresentationStyle
  /** Number of slides generated */
  slideCount: number
  /** Array of slide content */
  slides: SlideContent[]
}

export interface PresentationInput {
  title: string
  purpose: string
  audience: string
  style: PresentationStyle
  slideCount: number
  content: string
}

/**
 * Input to the AI model for content generation.
 * This is the prompt context sent to the AI.
 */
export interface AiPresentationPrompt {
  title: string
  purpose: string
  audience: string
  style: PresentationStyle
  slideCount: number
  content: string
}

/**
 * Expected AI response structure.
 * The AI should return valid JSON matching this shape.
 */
export interface AiPresentationResponse {
  title: string
  purpose: string
  audience: string
  style: PresentationStyle
  slideCount: number
  slides: Array<{
    title: string
    subtitle?: string
    bullets: string[]
    takeaway?: string
  }>
}
