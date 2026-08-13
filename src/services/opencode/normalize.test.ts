import { describe, expect, it } from 'vitest'
import { normalizeModel } from './normalize'

describe('normalizeModel — canonical model identity (TASK-AI-031)', () => {
  it('builds the canonical provider/id when the CLI emits a bare slug', () => {
    const m = normalizeModel({
      id: 'deepseek-v4-flash-free',
      providerID: 'opencode',
      name: 'DeepSeek V4 Flash Free',
      cost: { input: 0, output: 0 },
      status: 'active',
    })
    expect(m.id).toBe('opencode/deepseek-v4-flash-free')
    expect(m.slug).toBe('deepseek-v4-flash-free')
    expect(m.provider).toBe('opencode')
    expect(m.pricing.free).toBe(true)
  })

  it('never double-prefixes an id that is already canonical', () => {
    const m = normalizeModel({
      id: 'opencode/big-pickle',
      providerID: 'opencode',
      name: 'Big Pickle',
      cost: { input: 0, output: 0 },
      status: 'active',
    })
    expect(m.id).toBe('opencode/big-pickle')
    expect(m.slug).toBe('big-pickle')
  })

  it('marks paid models as not free', () => {
    const m = normalizeModel({
      id: 'claude-sonnet-4',
      providerID: 'anthropic',
      name: 'Claude Sonnet 4',
      cost: { input: 3, output: 15 },
      status: 'active',
    })
    expect(m.id).toBe('anthropic/claude-sonnet-4')
    expect(m.slug).toBe('claude-sonnet-4')
    expect(m.pricing.free).toBe(false)
  })

  it('retains display metadata without affecting identity', () => {
    const m = normalizeModel({
      id: 'nemotron-3-ultra-free',
      providerID: 'opencode',
      name: 'Nemotron 3 Ultra Free',
      cost: { input: 0, output: 0 },
      status: 'active',
    })
    expect(m.id).toBe('opencode/nemotron-3-ultra-free')
    expect(m.name).toBe('Nemotron 3 Ultra Free')
  })
})
