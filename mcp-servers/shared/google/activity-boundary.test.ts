import { describe, expect, it } from 'vitest'
import {
  buildActivityEvent,
  composeActivityToolName,
  shouldEmitActivityForResult,
} from './activity'

/**
 * TASK-ALPHA-LOCAL-072: success/failure boundary + contract proof.
 * Pure logic — no network, no Google contact.
 */
describe('shouldEmitActivityForResult', () => {
  it('emits for a normally completed result', () => {
    expect(
      shouldEmitActivityForResult({ content: [{ type: 'text', text: '{}' }] })
    ).toBe(true)
  })

  it('does not emit for resolved isError results', () => {
    expect(
      shouldEmitActivityForResult({
        content: [{ type: 'text', text: 'Error: x' }],
        isError: true,
      })
    ).toBe(false)
  })

  it('does not emit for null/empty/non-object results', () => {
    expect(shouldEmitActivityForResult(null)).toBe(false)
    expect(shouldEmitActivityForResult(undefined)).toBe(false)
    expect(shouldEmitActivityForResult('ok')).toBe(false)
  })
})

describe('composeActivityToolName', () => {
  it('matches the canonical server_tool shape', () => {
    expect(composeActivityToolName('google-slides', 'slides_get_presentation')).toBe(
      'google-slides_slides_get_presentation'
    )
    expect(composeActivityToolName('google-sheets', 'google_sheets.read_range')).toBe(
      'google-sheets_google_sheets.read_range'
    )
  })
})

describe('buildActivityEvent', () => {
  it('builds a metadata-only event', () => {
    const e = buildActivityEvent('gmail', 'gmail_search_messages', 'sub-123')
    expect(e).not.toBeNull()
    expect(Object.keys(e!).sort()).toEqual([
      'occurred_at',
      'provider',
      'provider_user_id',
      'tool_name',
    ])
    expect(e!.provider).toBe('google')
    expect(e!.tool_name).toBe('gmail_gmail_search_messages')
    expect(e!.provider_user_id).toBe('sub-123')
    expect(Number.isNaN(Date.parse(e!.occurred_at))).toBe(false)
  })

  it('rejects empty parts and overlong names', () => {
    expect(buildActivityEvent('', 't', 's')).toBeNull()
    expect(buildActivityEvent('gmail', '', 's')).toBeNull()
    expect(buildActivityEvent('gmail', 't', '')).toBeNull()
    expect(buildActivityEvent('gmail', 'x'.repeat(200), 's')).toBeNull()
  })
})
