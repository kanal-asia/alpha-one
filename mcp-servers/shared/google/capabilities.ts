/**
 * TASK-074: OAuth capability registry + progressive authorization (shared).
 *
 * Provides a service-independent model for the Google Custom MCP ecosystem:
 *
 *   capability  ->  required OAuth scope(s)
 *   local grant ->  GRANTED | MISSING | UNKNOWN
 *
 * and the structured states the Agent-facing contract uses:
 *
 *   CAPABILITY_GRANTED / AUTHORIZATION_REQUIRED / AUTHORIZATION_CANCELED /
 *   AUTHORIZATION_FAILED / CAPABILITY_NOT_SUPPORTED / GOOGLE_API_ERROR
 *
 * Progressive authorization is deliberately LOCAL-FIRST: consent URLs are
 * constructed for the local OAuth client, token exchange writes back to the
 * SAME local credential store (with scope merge via include_granted_scopes),
 * and no credential ever leaves the user's machine. The KANAL VPS is never a
 * credential store.
 *
 * Boundary:
 * - No Google API calls are made here (no REST, no OAuth wire traffic).
 * - No scope is ever granted automatically; the flow is always user-initiated.
 * - No service-specific logic; every MCP maps onto the same registry.
 */

import {
  loadGoogleConnection,
  getGrantedScopes,
  persistConnection,
  type GoogleConnection,
} from './auth'

// ---------------------------------------------------------------------------
// Contract states (stable, Agent-facing)
// ---------------------------------------------------------------------------

export const CAPABILITY_GRANTED = 'CAPABILITY_GRANTED'
export const AUTHORIZATION_REQUIRED = 'AUTHORIZATION_REQUIRED'
export const AUTHORIZATION_CANCELED = 'AUTHORIZATION_CANCELED'
export const AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED'
export const CAPABILITY_NOT_SUPPORTED = 'CAPABILITY_NOT_SUPPORTED'
export const GOOGLE_API_ERROR = 'GOOGLE_API_ERROR'

export type AuthorizationStatus =
  | typeof CAPABILITY_GRANTED
  | typeof AUTHORIZATION_REQUIRED
  | typeof AUTHORIZATION_CANCELED
  | typeof AUTHORIZATION_FAILED
  | typeof CAPABILITY_NOT_SUPPORTED
  | typeof GOOGLE_API_ERROR

// ---------------------------------------------------------------------------
// Scope constants
// ---------------------------------------------------------------------------

export const SCOPES = {
  docsRead: 'https://www.googleapis.com/auth/docs.readonly',
  docsWrite: 'https://www.googleapis.com/auth/documents',
  slidesRead: 'https://www.googleapis.com/auth/presentations.readonly',
  slidesWrite: 'https://www.googleapis.com/auth/presentations',
  driveRead: 'https://www.googleapis.com/auth/drive.readonly',
  driveWriteFile: 'https://www.googleapis.com/auth/drive.file',
  driveWrite: 'https://www.googleapis.com/auth/drive',
  calendarRead: 'https://www.googleapis.com/auth/calendar.readonly',
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
  scriptProjects: 'https://www.googleapis.com/auth/script.projects',
  scriptExecute: 'https://www.googleapis.com/auth/script.scriptapp',
  gmailRead: 'https://www.googleapis.com/auth/gmail.readonly',
  gmailCompose: 'https://www.googleapis.com/auth/gmail.compose',
  sheets: 'https://www.googleapis.com/auth/spreadsheets',
  userinfoEmail: 'https://www.googleapis.com/auth/userinfo.email',
  userinfoProfile: 'https://www.googleapis.com/auth/userinfo.profile',
  openid: 'openid',
} as const

// ---------------------------------------------------------------------------
// Capability registry: capability -> { service, label, requiredScopes }
// ---------------------------------------------------------------------------

export interface CapabilityDef {
  capability: string
  service: string
  label: string
  requiredScopes: string[]
  /** True when the capability performs a mutation against Google. */
  write: boolean
}

export const CAPABILITIES: CapabilityDef[] = [
  {
    capability: 'google.sheets.read',
    service: 'google-sheets',
    label: 'Google Sheets read',
    requiredScopes: [SCOPES.sheets],
    write: false,
  },
  {
    capability: 'google.sheets.write',
    service: 'google-sheets',
    label: 'Google Sheets write',
    requiredScopes: [SCOPES.sheets],
    write: true,
  },
  {
    capability: 'google.docs.read',
    service: 'google-docs',
    label: 'Google Docs read',
    requiredScopes: [SCOPES.docsRead],
    write: false,
  },
  {
    capability: 'google.docs.write',
    service: 'google-docs',
    label: 'Google Docs write',
    requiredScopes: [SCOPES.docsWrite],
    write: true,
  },
  {
    capability: 'google.slides.read',
    service: 'google-slides',
    label: 'Google Slides read',
    requiredScopes: [SCOPES.slidesRead],
    write: false,
  },
  {
    capability: 'google.slides.write',
    service: 'google-slides',
    label: 'Google Slides write',
    requiredScopes: [SCOPES.slidesWrite],
    write: true,
  },
  {
    capability: 'google.drive.read',
    service: 'google-drive',
    label: 'Google Drive read',
    requiredScopes: [SCOPES.driveRead],
    write: false,
  },
  {
    capability: 'google.drive.write',
    service: 'google-drive',
    label: 'Google Drive write',
    requiredScopes: [SCOPES.driveWriteFile],
    write: true,
  },
  {
    capability: 'google.calendar.read',
    service: 'google-calendar',
    label: 'Google Calendar read',
    requiredScopes: [SCOPES.calendarRead],
    write: false,
  },
  {
    capability: 'google.appsscript.read',
    service: 'google-apps-script',
    label: 'Google Apps Script project read',
    requiredScopes: [SCOPES.scriptProjects],
    write: false,
  },
  {
    capability: 'google.appsscript.execute',
    service: 'google-apps-script',
    label: 'Google Apps Script execution',
    requiredScopes: [SCOPES.scriptExecute],
    write: false,
  },
  {
    capability: 'google.gmail.read',
    service: 'google-gmail',
    label: 'Google Gmail read',
    requiredScopes: [SCOPES.gmailRead],
    write: false,
  },
  {
    capability: 'google.gmail.compose',
    service: 'google-gmail',
    label: 'Google Gmail compose',
    requiredScopes: [SCOPES.gmailCompose],
    write: true,
  },
]

// ---------------------------------------------------------------------------
// Granted-scope inspection
// ---------------------------------------------------------------------------

export type ScopeState = 'GRANTED' | 'MISSING' | 'UNKNOWN'

export interface AuthorizationInspection {
  connected: boolean
  email: string | null
  granted: string[] | null
  states: Record<string, ScopeState>
}

/** Inspect every registered capability against the CURRENT local grant. */
export async function inspectAuthorization(): Promise<AuthorizationInspection> {
  const scopes = await getGrantedScopes()
  const conn = await loadGoogleConnection()

  if (!scopes || scopes.length === 0) {
    return { connected: false, email: null, granted: null, states: {} }
  }

  const grantedSet = new Set(scopes)
  const states: Record<string, ScopeState> = {}
  for (const c of CAPABILITIES) {
    states[c.capability] = c.requiredScopes.every((s) => grantedSet.has(s)) ? 'GRANTED' : 'MISSING'
  }

  return { connected: true, email: conn?.email ?? null, granted: scopes, states }
}

// ---------------------------------------------------------------------------
// Capability check (Phase 4 requirement)
// ---------------------------------------------------------------------------

export interface CapabilityCheckResult {
  status: AuthorizationStatus
  capability: string
  service: string
  label: string
  write: boolean
  requiredScopes: string[]
  missingScopes: string[]
  reason: string
  authAction: string | null
}

export async function checkCapability(capability: string): Promise<CapabilityCheckResult> {
  const def = CAPABILITIES.find((c) => c.capability === capability)
  if (!def) {
    return {
      status: CAPABILITY_NOT_SUPPORTED,
      capability,
      service: 'unknown',
      label: capability,
      write: false,
      requiredScopes: [],
      missingScopes: [],
      reason: `Capability "${capability}" is not registered.`,
      authAction: null,
    }
  }

  const granted = await getGrantedScopes()
  if (!granted) {
    return {
      status: AUTHORIZATION_REQUIRED,
      ...def,
      missingScopes: def.requiredScopes,
      reason: 'No local Google connection found. Connect your Google account locally first.',
      authAction: 'connect',
    }
  }

  const grantedSet = new Set(granted)
  const missing = def.requiredScopes.filter((s) => !grantedSet.has(s))

  if (missing.length === 0) {
    return {
      status: CAPABILITY_GRANTED,
      ...def,
      missingScopes: [],
      reason: 'Authorization already granted locally.',
      authAction: null,
    }
  }

  return {
    status: AUTHORIZATION_REQUIRED,
    ...def,
    missingScopes: missing,
    reason: `Authorization required for ${def.label}: missing scope(s) ${missing.join(', ')}.`,
    authAction: 'authorize',
  }
}

// ---------------------------------------------------------------------------
// Error classification (Phase 13 / contract: GOOGLE_API_ERROR vs AUTHORIZATION_REQUIRED)
// ---------------------------------------------------------------------------

export interface ClassifyErrorInput {
  status?: number
  reason?: string
  message?: string
  capability?: string
}

export function classifyCapabilityError(input: ClassifyErrorInput): AuthorizationStatus {
  const capability = input.capability
  const def = capability ? CAPABILITIES.find((c) => c.capability === capability) : undefined
  const status = input.status ?? 0
  const reason = (input.reason ?? '').toLowerCase()
  const message = (input.message ?? '').toLowerCase()

  const permissionDenied =
    status === 403 || reason.includes('insufficientpermissions') || reason.includes('permissiondenied') || message.includes('permission')

  if (permissionDenied) {
    if (def) {
      return AUTHORIZATION_REQUIRED
    }
    return AUTHORIZATION_REQUIRED
  }

  if (status === 401) {
    return AUTHORIZATION_REQUIRED
  }

  return GOOGLE_API_ERROR
}

// ---------------------------------------------------------------------------
// Scope merge (Phase 6 requirement — preserve existing authorization)
// ---------------------------------------------------------------------------

export function mergeScopes(existing: string[] | undefined, added: string[] | undefined): string[] {
  const set = new Set<string>([...(existing ?? []), ...(added ?? [])])
  return [...set]
}

// ---------------------------------------------------------------------------
// Progressive authorization (Phase 5/7 — LOCAL-FIRST, user-initiated)
// ---------------------------------------------------------------------------

export interface ConsentUrlOptions {
  scopes: string[]
  redirectUri: string
  state: string
  clientId?: string
  /** Include previously granted scopes so consent is additive, never replacing. */
  includeGrantedScopes?: boolean
  accessType?: string
}

/** Build a Google OAuth consent URL for the local client. Never triggers a request. */
export function buildConsentUrl(options: ConsentUrlOptions): string {
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('Google OAuth client not configured (GOOGLE_CLIENT_ID).')
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: options.scopes.join(' '),
    state: options.state,
    access_type: options.accessType ?? 'offline',
    prompt: 'consent',
    ...(options.includeGrantedScopes !== false ? { include_granted_scopes: 'true' } : {}),
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/** Exchange an authorization code and persist the MERGED scope set locally. */
export async function exchangeAuthorizationCode(options: {
  code: string
  redirectUri: string
  clientId?: string
  clientSecret?: string
}): Promise<GoogleConnection> {
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID
  const clientSecret = options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth client not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: options.code,
      grant_type: 'authorization_code',
      redirect_uri: options.redirectUri,
    }),
  })

  if (!resp.ok) {
    throw new Error('Google authorization code exchange failed.')
  }

  const tokens = (await resp.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
  }

  const existing = await loadGoogleConnection()
  const grantedScopes = mergeScopes(existing?.scopes, tokens.scope ? tokens.scope.split(' ') : undefined)

  const updated: GoogleConnection = {
    ...(existing ?? {}),
    email: existing?.email,
    accessToken: tokens.access_token,
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
    scopes: grantedScopes,
  }

  await persistConnection(updated)
  return updated
}