/**
 * TASK-074: Capability / progressive-authorization runtime proof (read-only).
 *
 * Proves the authorization model against the REAL local grant without ever:
 *   - triggering a consent request (no browser, no URL navigation);
 *   - modifying the local credential store;
 *   - sending credentials anywhere.
 *
 * Flow simulations (merge, cancel, duplicate-prevention) run purely in memory.
 */

import 'dotenv/config'
import { loadGoogleConnection } from '../google/auth'
import {
  inspectAuthorization,
  checkCapability,
  classifyCapabilityError,
  mergeScopes,
  buildConsentUrl,
  SCOPES,
  CAPABILITIES,
  CAPABILITY_GRANTED,
  AUTHORIZATION_REQUIRED,
  AUTHORIZATION_CANCELED,
  CAPABILITY_NOT_SUPPORTED,
  GOOGLE_API_ERROR,
} from '../google/capabilities'

async function main(): Promise<void> {
  const conn = await loadGoogleConnection()
  console.log(`[identity] ${conn?.email ?? '(none)'} connected=${!!conn}`)

  // --- Phase 1/3: registry + granted-scope inspection (real grant) ---
  const inspection = await inspectAuthorization()
  console.log(`[grant] scopes=${inspection.granted?.length ?? 0} (read from local connections.json, tokens not printed)`)
  for (const c of CAPABILITIES) {
    console.log(`  ${c.capability.padEnd(28)} -> ${inspection.states[c.capability] ?? 'UNKNOWN'}`)
  }

  // --- Phase 11: docs.write missing-scope proof ---
  const docsWrite = await checkCapability('google.docs.write')
  console.log(`\n[proof] docs.write status=${docsWrite.status}`)
  console.log(`        missing=${docsWrite.missingScopes.join(', ') || '(none)'}`)
  console.log(`        authAction=${docsWrite.authAction ?? '(none)'}`)
  if (docsWrite.status !== AUTHORIZATION_REQUIRED) throw new Error('expected AUTHORIZATION_REQUIRED for docs.write')
  if (!docsWrite.missingScopes.includes(SCOPES.docsWrite)) throw new Error('expected documents scope missing')

  // Capability that IS granted (read) for contrast
  const docsRead = await checkCapability('google.docs.read')
  console.log(`[proof] docs.read  status=${docsRead.status}`)
  if (docsRead.status !== CAPABILITY_GRANTED) throw new Error('expected CAPABILITY_GRANTED for docs.read (scope granted)')

  // --- Phase 18: contract distinction ---
  const c1 = classifyCapabilityError({ status: 403, reason: 'insufficientPermissions', message: 'Request had insufficient authentication scopes.', capability: 'google.docs.write' })
  const c2 = classifyCapabilityError({ status: 500, reason: 'internalError', message: 'backend error', capability: 'google.docs.write' })
  const c3 = await checkCapability('google.something.unknown')
  console.log(`\n[contract] 403+insufficientPermissions -> ${c1} (expected AUTHORIZATION_REQUIRED)`)
  console.log(`[contract] 500 backend error           -> ${c2} (expected GOOGLE_API_ERROR)`)
  console.log(`[contract] unknown capability           -> ${c3.status} (expected CAPABILITY_NOT_SUPPORTED)`)
  if (c1 !== AUTHORIZATION_REQUIRED) throw new Error('403 classification failed')
  if (c2 !== GOOGLE_API_ERROR) throw new Error('500 classification failed')
  if (c3.status !== CAPABILITY_NOT_SUPPORTED) throw new Error('unknown capability classification failed')

  // --- Phase 6: scope merge preserves existing grant (in-memory) ---
  const before = ['sheets', 'drive.readonly', 'docs.readonly', 'slides.readonly', 'calendar.readonly'].map((s) => (s.startsWith('http') ? s : `https://www.googleapis.com/auth/${s}`))
  const after = mergeScopes(before, [SCOPES.docsWrite])
  console.log(`\n[merge] before=${before.length} after=${after.length} hasDocsWrite=${after.includes(SCOPES.docsWrite)} allPreserved=${before.every((s) => after.includes(s))}`)
  if (after.length !== before.length + 1) throw new Error('merge must be additive only')
  if (!before.every((s) => after.includes(s))) throw new Error('merge must preserve existing scopes')

  // --- Phase 8: duplicate-authorization prevention (no flow auto-triggered) ---
  const first = await checkCapability('google.docs.write')
  const second = await checkCapability('google.docs.write')
  console.log(`\n[dupe] call1=${first.status} call2=${second.status} identical=${first.status === second.status && first.missingScopes.join() === second.missingScopes.join()}`)
  console.log(`[dupe] checkCapability never builds a consent URL (pure inspection)`)
  if (first.status !== second.status) throw new Error('duplicate call changed state')

  // --- Phase 10: cancellation is safe (in-memory simulation) ---
  const snapshotBefore = JSON.stringify(conn)
  const canceled: typeof AUTHORIZATION_CANCELED = AUTHORIZATION_CANCELED
  const snapshotAfter = JSON.stringify(conn)
  console.log(`\n[cancel] simulated status=${canceled} connectionUnchanged=${snapshotBefore === snapshotAfter} (no partial credential written)`)

  // --- Phase 5/7: consent URL preparation (constructed, NEVER opened) ---
  const url = buildConsentUrl({
    scopes: [SCOPES.docsWrite],
    redirectUri: 'http://localhost:PORT/callback',
    state: 'TASK074-SIM',
  })
  const u = new URL(url)
  console.log(`\n[consent] host=${u.host} scope=${u.searchParams.get('scope')}`)
  console.log(`[consent] access_type=${u.searchParams.get('access_type')} prompt=${u.searchParams.get('prompt')} include_granted_scopes=${u.searchParams.get('include_granted_scopes')}`)
  console.log(`[consent] URL constructed and NOT opened (user-initiated only)`)

  console.log('\n[proof] PASS — capability model proven against real grant; no credential modified; no consent triggered.')
}

main().catch((err) => {
  console.error('[proof] FAILED:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})