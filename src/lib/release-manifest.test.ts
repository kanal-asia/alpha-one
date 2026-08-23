import { describe, it, expect } from 'vitest'
import { validateManifest } from './release-manifest'

describe('validateManifest', () => {
  it('accepts valid manifest', () => {
    const manifest = validateManifest({
      version: '1.1.0',
      minimumSupportedVersion: '1.0.0',
      releaseDate: '2026-01-15',
      releaseNotes: 'Bug fixes and improvements.',
      downloads: {
        windows: 'https://example.com/win.exe',
        android: 'https://example.com/app.apk',
      },
    })
    expect(manifest).not.toBeNull()
    expect(manifest!.version).toBe('1.1.0')
    expect(manifest!.minimumSupportedVersion).toBe('1.0.0')
    expect(manifest!.releaseDate).toBe('2026-01-15')
    expect(manifest!.releaseNotes).toBe('Bug fixes and improvements.')
    expect(manifest!.downloads!.windows).toBe('https://example.com/win.exe')
  })

  it('accepts minimal manifest (only version)', () => {
    const manifest = validateManifest({ version: '2.0.0' })
    expect(manifest).not.toBeNull()
    expect(manifest!.version).toBe('2.0.0')
    expect(manifest!.minimumSupportedVersion).toBeUndefined()
    expect(manifest!.releaseDate).toBeUndefined()
    expect(manifest!.releaseNotes).toBeUndefined()
    expect(manifest!.downloads).toBeUndefined()
  })

  it('rejects missing version', () => {
    expect(validateManifest({})).toBeNull()
    expect(validateManifest({ version: 123 })).toBeNull()
  })

  it('rejects invalid semver', () => {
    expect(validateManifest({ version: 'abc' })).toBeNull()
    expect(validateManifest({ version: 'v1.0.0' })).toBeNull()
    expect(validateManifest({ version: '1.0' })).toBeNull()
  })

  it('rejects non-object input', () => {
    expect(validateManifest(null)).toBeNull()
    expect(validateManifest('string')).toBeNull()
    expect(validateManifest(42)).toBeNull()
  })

  it('ignores unknown fields gracefully', () => {
    const manifest = validateManifest({
      version: '1.0.0',
      unknownField: 'should be ignored',
    })
    expect(manifest).not.toBeNull()
    expect(manifest!.version).toBe('1.0.0')
  })

  it('handles downloads with partial fields', () => {
    const manifest = validateManifest({
      version: '1.0.0',
      downloads: { windows: 'https://example.com/win.exe' },
    })
    expect(manifest).not.toBeNull()
    expect(manifest!.downloads!.windows).toBe('https://example.com/win.exe')
    expect(manifest!.downloads!.android).toBeUndefined()
  })
})
