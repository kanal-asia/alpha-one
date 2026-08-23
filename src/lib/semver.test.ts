import { describe, it, expect } from 'vitest'
import { parseSemVer, compareSemVer, isNewer, isSame, isOlder } from './semver'

describe('parseSemVer', () => {
  it('parses valid semver', () => {
    expect(parseSemVer('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 })
    expect(parseSemVer('1.10.25')).toEqual({ major: 1, minor: 10, patch: 25 })
  })

  it('trims whitespace', () => {
    expect(parseSemVer('  1.2.3  ')).toEqual({ major: 1, minor: 2, patch: 3 })
  })

  it('rejects invalid formats', () => {
    expect(parseSemVer('')).toBeNull()
    expect(parseSemVer('v1.0.0')).toBeNull()
    expect(parseSemVer('1.0')).toBeNull()
    expect(parseSemVer('1.0.0-beta')).toBeNull()
    expect(parseSemVer('abc')).toBeNull()
  })
})

describe('compareSemVer', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemVer('1.0.0', '1.0.0')).toBe(0)
  })

  it('returns -1 when a < b (major)', () => {
    expect(compareSemVer('1.0.0', '2.0.0')).toBe(-1)
  })

  it('returns 1 when a > b (major)', () => {
    expect(compareSemVer('2.0.0', '1.0.0')).toBe(1)
  })

  it('returns -1 when a < b (minor)', () => {
    expect(compareSemVer('1.0.0', '1.1.0')).toBe(-1)
  })

  it('returns 1 when a > b (minor)', () => {
    expect(compareSemVer('1.1.0', '1.0.0')).toBe(1)
  })

  it('handles 1.10.0 > 1.9.0 (not lexicographic)', () => {
    expect(compareSemVer('1.10.0', '1.9.0')).toBe(1)
  })

  it('handles 1.9.0 < 1.10.0', () => {
    expect(compareSemVer('1.9.0', '1.10.0')).toBe(-1)
  })

  it('returns null for invalid input', () => {
    expect(compareSemVer('abc', '1.0.0')).toBeNull()
    expect(compareSemVer('1.0.0', 'xyz')).toBeNull()
  })
})

describe('isNewer / isSame / isOlder', () => {
  it('isNewer', () => {
    expect(isNewer('1.1.0', '1.0.0')).toBe(true)
    expect(isNewer('1.0.0', '1.1.0')).toBe(false)
    expect(isNewer('1.0.0', '1.0.0')).toBe(false)
  })

  it('isSame', () => {
    expect(isSame('1.0.0', '1.0.0')).toBe(true)
    expect(isSame('1.0.0', '1.1.0')).toBe(false)
  })

  it('isOlder', () => {
    expect(isOlder('1.0.0', '1.1.0')).toBe(true)
    expect(isOlder('1.1.0', '1.0.0')).toBe(false)
    expect(isOlder('1.0.0', '1.0.0')).toBe(false)
  })
})
