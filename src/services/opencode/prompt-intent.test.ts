/**
 * ROUTING_CORRECTIVE regression tests: guidance is intent-gated, not global.
 *
 * Acceptance:
 * - Fresh No Project "hi" → prompt unchanged (no Google/Slides wording).
 * - Google Drive request → routing hints, no Slides doctrine.
 * - Slides request → full block (routing + Slides doctrine).
 * - Non-Google coding request → unchanged.
 */
import { describe, expect, it } from 'vitest'
import {
  buildGoogleRoutingBlock,
  buildMcpGuidanceBlock,
  buildSlidesDoctrineBlock,
} from './mcp-guidance'
import { assemblePromptWithGuidance, classifyPromptIntent } from './prompt-intent'

describe('classifyPromptIntent', () => {
  it('fresh greeting earns no guidance', () => {
    expect(classifyPromptIntent('hi')).toEqual({
      needsGoogleGuidance: false,
      needsSlidesGuidance: false,
    })
  })

  it('Google Drive request earns routing only', () => {
    const intent = classifyPromptIntent(
      'Find my budget file on Google Drive and tell me its name'
    )
    expect(intent.needsGoogleGuidance).toBe(true)
    expect(intent.needsSlidesGuidance).toBe(false)
  })

  it('spreadsheet request earns routing only', () => {
    const intent = classifyPromptIntent(
      'Read range A1:B10 from my spreadsheet'
    )
    expect(intent.needsGoogleGuidance).toBe(true)
    expect(intent.needsSlidesGuidance).toBe(false)
  })

  it('Slides request earns routing + Slides doctrine', () => {
    const intent = classifyPromptIntent(
      'Create a pitch deck about our Q3 results'
    )
    expect(intent.needsGoogleGuidance).toBe(true)
    expect(intent.needsSlidesGuidance).toBe(true)
  })

  it('Indonesian presentation request earns both', () => {
    const intent = classifyPromptIntent('Buatkan presentasi penjualan')
    expect(intent.needsGoogleGuidance).toBe(true)
    expect(intent.needsSlidesGuidance).toBe(true)
  })

  it('non-Google coding request earns nothing', () => {
    expect(
      classifyPromptIntent('Write a React component for a settings form')
    ).toEqual({ needsGoogleGuidance: false, needsSlidesGuidance: false })
  })

  it('hasGoogleContext signal forces routing without Slides', () => {
    expect(classifyPromptIntent('hi', { hasGoogleContext: true })).toEqual({
      needsGoogleGuidance: true,
      needsSlidesGuidance: false,
    })
  })
})

describe('assemblePromptWithGuidance', () => {
  it('fresh No Project "hi" passes through byte-identical', () => {
    expect(assemblePromptWithGuidance('hi')).toBe('hi')
  })

  it('"hi" carries no Google MCP or Slides wording', () => {
    const out = assemblePromptWithGuidance('hi')
    expect(out).not.toContain('GOOGLE MCP')
    expect(out).not.toContain('archetype')
    expect(out).not.toContain('slides_')
    expect(out).not.toContain('MCP')
  })

  it('Drive request gets routing but no Slides doctrine', () => {
    const out = assemblePromptWithGuidance(
      'Find my budget file on Google Drive'
    )
    expect(out).toContain('GOOGLE MCP')
    expect(out).toContain('Google Drive (drive_*)')
    expect(out).not.toContain('archetype')
    expect(out).not.toContain('slides_compose_slide')
  })

  it('Slides request gets the full block', () => {
    const out = assemblePromptWithGuidance('Make a presentation for investors')
    expect(out).toContain('GOOGLE MCP')
    expect(out).toContain('slides_compose_slide')
    expect(out).toContain('ARCHETYPE_PROVEN')
  })

  it('coding request passes through unchanged', () => {
    const msg = 'Find unused imports in the project'
    expect(assemblePromptWithGuidance(msg)).toBe(msg)
  })

  it('Drive reference context triggers routing on its own wording', () => {
    const withRef = [
      '[Attached Reference: "Budget" — Google Drive File ID: abc123]',
      '',
      'Summarize this file',
    ].join('\n')
    const out = assemblePromptWithGuidance(withRef)
    expect(out).toContain('GOOGLE MCP')
  })
})

describe('block split', () => {
  it('routing block has no Slides doctrine', () => {
    const routing = buildGoogleRoutingBlock()
    expect(routing).toContain('GOOGLE MCP')
    expect(routing).not.toContain('archetype')
    expect(routing).not.toContain('slides_compose_slide')
    expect(routing).not.toContain('Alpha Beautify')
  })

  it('slides block carries the doctrine', () => {
    const slides = buildSlidesDoctrineBlock()
    expect(slides).toContain('slides_compose_slide')
    expect(slides).toContain('ARCHETYPE_PROVEN')
  })

  it('combined block keeps the full surface', () => {
    const full = buildMcpGuidanceBlock()
    expect(full).toContain('GOOGLE MCP')
    expect(full).toContain('slides_compose_slide')
    expect(full).toContain('drive_get_file_metadata')
  })
})
