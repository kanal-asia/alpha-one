/**
 * TASK-066: Minimal Calendar proof consumer (temporary, read-only).
 *
 * Proves the shared utilities (auth + rest) against real Google endpoints:
 *   1. shared auth can obtain a valid local access token;
 *   2. shared rest can call a 2xx JSON endpoint (userinfo);
 *   3. shared rest can call a Calendar REST endpoint and normalizes the
 *      expected 403 (calendar scope is NOT granted in the current local
 *      credentials — documented limitation, not a utility defect);
 *   4. no credential is exposed in output.
 *
 * NEVER creates/updates/deletes calendar data. NEVER prints tokens.
 */

import { getAccessToken, getGrantedScopes } from '../google/auth'
import { googleRequest, GoogleApiError } from '../google/rest'

async function main(): Promise<void> {
  const token = await getAccessToken()
  const scopes = await getGrantedScopes()
  console.log(`[auth] access token obtained (length=${token.length}, redacted)`)
  console.log(`[auth] granted scopes: ${scopes?.length ?? 0}`)
  console.log(`[auth] calendar scope granted: ${scopes?.some((s) => s.includes('calendar')) ?? false}`)

  // 2xx JSON path — proves authenticated request + JSON parse + response return.
  const userinfo = await googleRequest<{ id: string; email?: string }>({
    method: 'GET',
    url: 'https://www.googleapis.com/oauth2/v2/userinfo',
    token,
  })
  const emailDomain = userinfo.email?.split('@')[1]
  console.log(`[rest] userinfo 2xx OK (id=${userinfo.id}, email domain=${emailDomain ?? 'unknown'})`)

  // Calendar read-only endpoint (list calendars). No calendar scope granted yet.
  try {
    const cal = await googleRequest<{ items?: Array<{ id: string }> }>({
      method: 'GET',
      url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      token,
      params: { maxResults: '5' },
    })
    console.log(`[calendar] SUCCESS (${cal.items?.length ?? 0} calendars)`)
  } catch (err) {
    if (err instanceof GoogleApiError) {
      console.log('[calendar] normalized GoogleApiError:')
      console.log(`  httpStatus=${err.status}`)
      console.log(`  code=${err.code}`)
      console.log(`  googleStatus=${err.googleStatus ?? 'n/a'}`)
      console.log(`  reason=${err.reason ?? 'n/a'}`)
      console.log(`  message=${err.message}`)
      console.log('[calendar] expected: calendar scope not granted in local credentials (documented limitation).')
    } else {
      throw err
    }
  }

  console.log('[proof] done — no tokens, headers, or secrets printed.')
}

main().catch((err) => {
  console.error('[proof] FAILED:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})