/**
 * TASK-067: Re-consent the existing Google identity with the Calendar scope.
 *
 * Uses the existing app OAuth flow (src/services/google/oauth-service.ts):
 * - generateAuthUrl builds the authorization request from GOOGLE_OAUTH_SCOPES
 *   (which now includes https://www.googleapis.com/auth/calendar.readonly);
 * - the state + PKCE verifier are persisted to the same OAuth states dir;
 * - the already-running app server on :3001 handles the callback, exchanges
 *   the code, and writes the refreshed connection back to connections.json
 *   under the existing `local-user` key (identity preserved, scopes preserved
 *   plus calendar).
 *
 * This script only prints redacted evidence. It never prints tokens/secrets.
 */

import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { generateAuthUrl } from '../../src/services/google/oauth-service'

const CONNECTIONS_FILE = join(process.cwd(), '.alpha', 'google', 'connections.json')

async function grantedScopes(): Promise<string[] | null> {
  try {
    const j = JSON.parse(await readFile(CONNECTIONS_FILE, 'utf-8')) as {
      'local-user'?: { scopes?: string[] }
    }
    return j['local-user']?.scopes ?? null
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const { url } = await generateAuthUrl('local-user')
  console.log('[consent] Complete Google consent in the browser. The running app server on :3001 will persist the connection.')
  console.log('[consent] auth-url (client_id + scopes + state, NOT secret):')
  console.log(url)
  spawn('cmd', ['/c', 'start', '', `"${url}"`], {
    windowsVerbatimArguments: true,
    detached: true,
    stdio: 'ignore',
  }).unref()

  const deadline = Date.now() + 180_000
  let scopes: string[] | null = null
  while (Date.now() < deadline) {
    scopes = await grantedScopes()
    if (scopes && scopes.some((s) => s.includes('calendar'))) break
    await new Promise((r) => setTimeout(r, 2000))
  }

  if (!scopes) {
    console.error('[consent] TIMEOUT: calendar scope not observed in persisted credentials.')
    process.exit(1)
  }

  const j = JSON.parse(await readFile(CONNECTIONS_FILE, 'utf-8')) as {
    'local-user': { email?: string; tokenExpiry?: number }
  }
  const c = j['local-user']
  console.log('[consent] REDACTED RESULT:')
  console.log(`  email=${c.email}`)
  console.log(`  scopes=${scopes.length}`)
  console.log(`  calendar.readonly granted=${scopes.includes('https://www.googleapis.com/auth/calendar.readonly')}`)
  console.log(`  spreadsheets preserved=${scopes.includes('https://www.googleapis.com/auth/spreadsheets')}`)
  console.log(`  drive.readonly preserved=${scopes.includes('https://www.googleapis.com/auth/drive.readonly')}`)
  console.log(`  tokenExpiry=${c.tokenExpiry ? new Date(c.tokenExpiry).toISOString() : 'n/a'}`)
  console.log('[consent] done')
}

main().catch((err) => {
  console.error('[consent] FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
})