import { describe, expect, it } from 'vitest'
import {
  assertCanonicalModelId,
  createCanonicalId,
  isValidModelId,
  resolveRuntimeModel,
  runtimeModelFromCanonicalId,
  toRuntimeModel,
  type RuntimeModel,
} from './contract'

const FREE_MODEL: RuntimeModel = toRuntimeModel({
  provider: 'opencode',
  slug: 'deepseek-v4-flash-free',
  displayName: 'DeepSeek V4 Flash Free',
  free: true,
  contextWindow: 200_000,
  supportsTools: true,
})

describe('Runtime Contract (TASK-AI-031)', () => {
  it('creates the canonical id exactly once at discovery (provider/slug)', () => {
    expect(createCanonicalId('opencode', 'deepseek-v4-flash-free')).toBe(
      'opencode/deepseek-v4-flash-free'
    )
    expect(FREE_MODEL.id).toBe('opencode/deepseek-v4-flash-free')
    expect(FREE_MODEL.provider).toBe('opencode')
    expect(FREE_MODEL.slug).toBe('deepseek-v4-flash-free')
    expect(FREE_MODEL.displayName).toBe('DeepSeek V4 Flash Free')
    expect(FREE_MODEL.free).toBe(true)
    expect(FREE_MODEL.contextWindow).toBe(200_000)
    expect(FREE_MODEL.supportsTools).toBe(true)
  })

  it('isValidModelId accepts provider/id and rejects slugs and display names', () => {
    expect(isValidModelId('opencode/deepseek-v4-flash-free')).toBe(true)
    expect(isValidModelId('openrouter/deepseek-r1')).toBe(true)
    expect(isValidModelId('deepseek-v4-flash-free')).toBe(false)
    expect(isValidModelId('DeepSeek V4 Flash Free')).toBe(false)
    expect(isValidModelId('big-pickle')).toBe(false)
    expect(isValidModelId('')).toBe(false)
    expect(isValidModelId('opencode/')).toBe(false)
  })

  it('assertCanonicalModelId returns the id unchanged when canonical', () => {
    const id = 'opencode/deepseek-v4-flash-free'
    expect(assertCanonicalModelId(id)).toBe(id)
  })

  it('assertCanonicalModelId throws on a bare slug', () => {
    expect(() => assertCanonicalModelId('deepseek-v4-flash-free')).toThrow(
      /form provider\/id/
    )
  })

  it('assertCanonicalModelId throws on a display name', () => {
    expect(() => assertCanonicalModelId('DeepSeek V4 Flash Free')).toThrow(
      /form provider\/id/
    )
  })

  it('resolveRuntimeModel returns the known model by id', () => {
    const models = [FREE_MODEL]
    expect(resolveRuntimeModel(models, 'opencode/deepseek-v4-flash-free')).toBe(
      FREE_MODEL
    )
  })

  it('resolveRuntimeModel falls back with the id preserved verbatim (never reconstructed)', () => {
    const models: RuntimeModel[] = []
    const fallback = resolveRuntimeModel(models, 'opencode/deepseek-v4-flash-free')
    expect(fallback.id).toBe('opencode/deepseek-v4-flash-free')
    expect(fallback.provider).toBe('opencode')
    expect(fallback.slug).toBe('deepseek-v4-flash-free')
  })

  it('runtimeModelFromCanonicalId keeps the canonical id immutable', () => {
    const m = runtimeModelFromCanonicalId('opencode/big-pickle')
    expect(m.id).toBe('opencode/big-pickle')
  })

  it('toRuntimeModel never mutates the id downstream', () => {
    // Simulate a layer that only passes the object through.
    const passthrough = (m: RuntimeModel): RuntimeModel => ({ ...m })
    const after = passthrough(FREE_MODEL)
    expect(after.id).toBe('opencode/deepseek-v4-flash-free')
    expect(after.displayName).toBe('DeepSeek V4 Flash Free')
  })
})
