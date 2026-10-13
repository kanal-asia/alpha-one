/**
 * TASK-082-CORRECTIVE (C02/C03): Slides MCP guidance reflects the TASK-082
 * controlled 10-tool surface instead of the legacy-only boundary.
 */
import { describe, expect, it } from 'vitest'
import { buildMcpGuidanceBlock } from './mcp-guidance'

describe('buildMcpGuidanceBlock — Slides surface', () => {
  it('no longer contains the legacy-only capability statement', () => {
    const text = buildMcpGuidanceBlock()
    expect(text).not.toContain('add-slide/insert-text')
    expect(text).not.toMatch(/presentation create\/read\/add-slide\/insert-text/)
  })
  it('advertises inspect + controlled visual mutation surface', () => {
    const text = buildMcpGuidanceBlock()
    expect(text).toContain('slides_get_page')
    expect(text).toContain('slides_create_element')
    expect(text).toContain('slides_update_element')
    expect(text).toContain('slides_delete_object')
    expect(text).toContain('slides_duplicate_object')
    expect(text).toContain('slides_batch_update')
  })
  it('requires inspect-before-mutate with object IDs', () => {
    const text = buildMcpGuidanceBlock()
    expect(text).toMatch(/slides_get_page BEFORE mutating/i)
    expect(text).toMatch(/object ID/i)
  })
  it('explicitly prevents replacement-textbox simulation', () => {
    const text = buildMcpGuidanceBlock()
    expect(text).toMatch(/never simulate an edit by inserting a replacement textbox/i)
    expect(text).toMatch(/update the existing element/i)
  })
  it('does not claim deferred capabilities', () => {
    const text = buildMcpGuidanceBlock()
    const lower = text.toLowerCase()
    // TASK-084: theme read/consume is implemented (no longer deferred).
    expect(lower).not.toContain('raw batchupdate')
    expect(lower).not.toContain('arbitrary')
    expect(lower).not.toContain('ungroup')
    expect(lower).not.toContain('global theme')
    expect(lower).not.toContain('chart')
  })
  it('TASK-085: fail-closed professional generation (no silent plain fallback)', () => {
    const text = buildMcpGuidanceBlock()
    expect(text).toMatch(/fail-closed/i)
    expect(text).toMatch(/never silently fall back to plain title\/body/i)
    expect(text).toMatch(/ARCHETYPE_PROVEN/i)
    expect(text).toMatch(/authoritative.*readback/i)
  })
  it('TASK-084: guides design-system-aware composition', () => {
    const text = buildMcpGuidanceBlock()
    expect(text).toMatch(/design system/i)
    expect(text).toMatch(/native layout/i)
    expect(text).toMatch(/native placeholder/i)
    expect(text).toMatch(/semantic theme color/i)
    expect(text).toMatch(/native page background/i)
    expect(text).toMatch(/z-order/i)
    expect(text).toMatch(/group related/i)
  })
  it('TASK-086R2: forbids primitive professional fallback when compose is unavailable', () => {
    const text = buildMcpGuidanceBlock()
    expect(text).toMatch(/no-primitive-fallback/i)
    expect(text).toMatch(/only authorized composition path/i)
    expect(text).toMatch(/do NOT reconstruct the deck or slide with/i)
    expect(text).toMatch(/Professional Slides composition capability is unavailable in this runtime/)
    expect(text).toMatch(/only for explicit targeted edits/i)
  })
  it('TASK-086R2: PROVEN requires compose success plus readback, never manual construction', () => {
    const text = buildMcpGuidanceBlock()
    expect(text).toMatch(/success-claim integrity/i)
    expect(text).toMatch(/manually constructed slide/i)
    expect(text).toMatch(/never proven/i)
    expect(text).toMatch(/report it unproven/i)
    expect(text).toMatch(/never report "presentation created successfully"/i)
  })
  it('keeps readback verification guidance with page inspection', () => {
    expect(buildMcpGuidanceBlock()).toContain('slides_get_page')
  })
  it('TASK-090-R1: routes payload shapes to semantic archetypes without substitution', () => {
    const text = buildMcpGuidanceBlock()
    expect(text).toMatch(/semantic routing/i)
    expect(text).toMatch(/no-substitution rule/i)
    expect(text).toMatch(/retry the SAME intent/i)
    expect(text).toMatch(/never substitute another archetype/i)
  })
  it('TASK-095-R2: routes new multi-slide decks to the deck-level tool', () => {
    const text = buildMcpGuidanceBlock()
    expect(text).toMatch(/new deck with 2 or more slides/i)
    expect(text).toMatch(/slides_compose_deck exactly once/i)
    expect(text).toMatch(/do NOT create a deck by looping slides_create_presentation, slides_create_slide, and slides_compose_slide/i)
    expect(text).toMatch(/Use slides_compose_slide only for an explicit single-slide request/i)
    expect(text).toMatch(/never choose retry archetypes per slide/i)
  })
})
