import { describe, expect, it } from 'vitest'
import { resolveModelsDevEnrichmentFromCatalog } from './modelsdev'

// TASK-OPENCODE-084: Models.dev metadata enrichment (optional, additive).
// Tests the pure catalog-matching core with a fixture (no disk dependency).

const catalog = {
  'google-vertex': {
    id: 'google-vertex',
    name: 'Vertex',
    models: {
      'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        cost: { input: 0.3, output: 2.5 },
        modalities: { input: ['text', 'image', 'audio', 'video', 'pdf'] },
      },
      'claude-sonnet-4-5@20250929': {
        id: 'claude-sonnet-4-5@20250929',
        name: 'Claude Sonnet 4.5',
        cost: { input: 3, output: 15 },
        modalities: { input: ['text', 'image', 'pdf'] },
      },
    },
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    models: {
      'deepseek-v4-flash-free': {
        id: 'deepseek-v4-flash-free',
        name: 'DeepSeek V4 Flash Free',
        cost: { input: 0, output: 0 },
        modalities: { input: ['text'] },
      },
    },
  },
}

describe('Models.dev enrichment resolver (TASK-OPENCODE-084)', () => {
  it('resolves a paid model by provider + model id with pricing and modalities', () => {
    const e = resolveModelsDevEnrichmentFromCatalog(catalog, 'google-vertex', 'gemini-2.5-flash')
    expect(e).not.toBeNull()
    expect(e!.matched).toBe(true)
    expect(e!.providerId).toBe('google-vertex')
    expect(e!.modelId).toBe('gemini-2.5-flash')
    expect(e!.inputPrice).toBe(0.3)
    expect(e!.outputPrice).toBe(2.5)
    expect(e!.inputModalities).toEqual(['text', 'image', 'video', 'audio', 'pdf'])
    expect(e!.detailUrl).toBe('https://models.dev/models/google-vertex/gemini-2.5-flash/')
  })

  it('matches date-suffixed Models.dev ids via prefix', () => {
    const e = resolveModelsDevEnrichmentFromCatalog(catalog, 'google-vertex', 'claude-sonnet-4-5')
    expect(e).not.toBeNull()
    expect(e!.modelId).toBe('claude-sonnet-4-5@20250929')
  })

  it('free model keeps null pricing (never fabricates $0/$0)', () => {
    const e = resolveModelsDevEnrichmentFromCatalog(catalog, 'opencode', 'deepseek-v4-flash-free')
    expect(e).not.toBeNull()
    expect(e!.inputPrice).toBeNull()
    expect(e!.outputPrice).toBeNull()
    expect(e!.inputModalities).toEqual(['text'])
  })

  it('returns null for an unknown provider/model (fallback keeps PAID)', () => {
    expect(resolveModelsDevEnrichmentFromCatalog(catalog, 'unknown', 'unknown-model')).toBeNull()
    expect(resolveModelsDevEnrichmentFromCatalog(catalog, 'google-vertex', 'no-such-model')).toBeNull()
  })
})
