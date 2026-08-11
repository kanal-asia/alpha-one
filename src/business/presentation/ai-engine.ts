/**
 * Alpha Workspace — Presentation AI Content Engine
 *
 * Generates structured presentation content using AI.
 * Uses the existing OpenCode CLI infrastructure for AI calls.
 */
import { runChat, detectProviderStatus } from '../../services/opencode/client'
import type { RuntimeModel } from '../../features/runtime/contract'
import type {
  PresentationInput,
  PresentationContent,
  AiPresentationResponse,
} from './schema'

const PRESENTATION_PROMPT = `You are a professional presentation content creator. Generate a structured presentation based on the user's brief.

RULES:
1. Create a coherent presentation with a logical beginning, middle, and conclusion.
2. Match the content to the specified audience and purpose.
3. Use the user's provided topic/instructions as the primary source.
4. DO NOT invent specific business facts, statistics, financial numbers, customer data, or research findings unless supplied by the user.
5. Clearly label assumptions when necessary.
6. Avoid repetitive slides.
7. Avoid generic filler when the user's brief provides enough context.
8. Respect the requested approximate slide count.
9. Produce concise slide content suitable for PowerPoint (3-5 bullets per slide, each 1-2 lines max).
10. Each slide should have a clear, actionable title.

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact structure:
{
  "title": "presentation title",
  "purpose": "presentation purpose",
  "audience": "target audience",
  "style": "business|marketing|report|proposal|minimal",
  "slideCount": number,
  "slides": [
    {
      "title": "Slide Title",
      "subtitle": "optional subtitle",
      "bullets": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
      "takeaway": "optional key takeaway"
    }
  ]
}

IMPORTANT: Return ONLY the JSON object. No explanations, no markdown, no code blocks.`

function buildPrompt(input: PresentationInput): string {
  const context = [
    `TITLE: ${input.title}`,
    `PURPOSE: ${input.purpose}`,
    `AUDIENCE: ${input.audience}`,
    `STYLE: ${input.style}`,
    `SLIDE COUNT: ${input.slideCount}`,
    input.content ? `CONTENT/INSTRUCTIONS: ${input.content}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return `${PRESENTATION_PROMPT}\n\n${context}`
}

function extractJsonFromResponse(text: string): AiPresentationResponse | null {
  // Try to find JSON in the response (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim()

  try {
    const parsed = JSON.parse(jsonStr) as unknown
    return parsed as AiPresentationResponse
  } catch {
    // Try to find JSON object in the text
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as AiPresentationResponse
      } catch {
        return null
      }
    }
    return null
  }
}

export class AiPresentationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'AiPresentationError'
  }
}

export async function generatePresentationContent(
  input: PresentationInput,
): Promise<PresentationContent> {
  // Check if AI is available
  const status = await detectProviderStatus(false)
  if (status.state !== 'installed') {
    throw new AiPresentationError(
      'AI service is not available. Please configure an AI provider in Settings.',
      'AI_UNAVAILABLE',
    )
  }

  // Use a default model for content generation
  const model: RuntimeModel = {
    id: 'anthropic/claude-sonnet-4-20250514',
    provider: 'anthropic',
    slug: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet',
    free: false,
    contextWindow: 200000,
    supportsTools: true,
    availability: 'available',
    latency: 'medium',
  }

  const prompt = buildPrompt(input)

  let result
  try {
    result = await runChat({ model, message: prompt })
  } catch (err) {
    throw new AiPresentationError(
      `AI generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'AI_CALL_FAILED',
    )
  }

  if (!result.text) {
    throw new AiPresentationError(
      'AI returned an empty response. Please try again.',
      'EMPTY_RESPONSE',
    )
  }

  // Parse the AI response
  const response = extractJsonFromResponse(result.text)
  if (!response) {
    throw new AiPresentationError(
      'AI returned an invalid response format. Please try again.',
      'INVALID_RESPONSE',
    )
  }

  // Validate the response
  const validated = validateAiResponse(response, input)
  return validated
}

function validateAiResponse(
  response: AiPresentationResponse,
  input: PresentationInput,
): PresentationContent {
  // Validate required fields
  if (!response.title || typeof response.title !== 'string') {
    throw new AiPresentationError('AI response missing title.', 'INVALID_FIELD')
  }
  if (!response.slides || !Array.isArray(response.slides)) {
    throw new AiPresentationError('AI response missing slides array.', 'INVALID_FIELD')
  }

  // Validate slide count is reasonable
  if (response.slides.length < 3) {
    throw new AiPresentationError('AI generated too few slides.', 'INVALID_FIELD')
  }
  if (response.slides.length > 30) {
    throw new AiPresentationError('AI generated too many slides.', 'INVALID_FIELD')
  }

  // Validate each slide
  for (let i = 0; i < response.slides.length; i++) {
    const slide = response.slides[i]
    if (!slide.title || typeof slide.title !== 'string') {
      throw new AiPresentationError(`Slide ${i + 1} missing title.`, 'INVALID_FIELD')
    }
    if (!slide.bullets || !Array.isArray(slide.bullets)) {
      throw new AiPresentationError(`Slide ${i + 1} missing bullets.`, 'INVALID_FIELD')
    }
    if (slide.bullets.length === 0) {
      throw new AiPresentationError(`Slide ${i + 1} has no bullet points.`, 'INVALID_FIELD')
    }
  }

  // Return validated content with input metadata
  return {
    title: response.title || input.title,
    purpose: response.purpose || input.purpose,
    audience: response.audience || input.audience,
    style: response.style || input.style,
    slideCount: response.slides.length,
    slides: response.slides.map((slide) => ({
      title: slide.title,
      subtitle: slide.subtitle,
      bullets: slide.bullets,
      takeaway: slide.takeaway,
    })),
  }
}
