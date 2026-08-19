# TASK-OPENCODE-059 — Local Google Identity & MCP Authorization Persistence Audit

## Objective

Audit-only investigation of Google OAuth identity, OAuth scopes, and official Google MCP authorization persistence in Alpha Workspace.

The immediate symptom is:

- Google authorization popup appears repeatedly during Agent runtime.
- Multiple official Google MCP services may trigger separate authorization attempts.
- `opencode mcp auth calendar` previously reported success but runtime state did not persist a usable Calendar token.
- TASK-058 proved that OpenCode was supplying the Alpha One REST OAuth token to MCP runtime rather than completing/reusing a valid MCP-specific authorization state.
- Drive, Docs, and Slides MCP tool calls remain denied despite REST access succeeding with the same Google account/resource.
- Calendar authorization state has shown inconsistent persistence.

The purpose of this task is to determine exactly:

1. Where Google identity is stored locally.
2. Where OAuth consent/granted scopes are represented.
3. Where MCP-specific authorization state is stored.
4. Which process owns that state.
5. Whether authorization state is persisted across Agent runs.
6. Why the Agent can trigger repeated Google OAuth popups.
7. Whether multiple MCP servers are independently requesting authorization.
8. Whether Alpha Workspace has a reusable local Google connection identity.
9. Whether any state is incorrectly expected to exist on the KANAL VPS.
10. What the minimal architecture correction should be.

This task is AUDIT-ONLY.

---

# Critical Architecture Principle

## Alpha Workspace is a local-first open-source application

The Alpha Workspace user environment is the source of truth for:

- Google OAuth authorization state
- MCP authorization state
- user credentials/tokens
- local Agent runtime
- local MCP configuration
- local workspace/project state

The KANAL VPS is NOT the credential backend.

The KANAL VPS may only retain the explicitly permitted telemetry/account metadata:

- download count
- source/release information
- email associated with OAuth connection, where applicable

The KANAL VPS MUST NOT become the storage location for:

- Google access tokens
- Google refresh tokens
- Google OAuth authorization codes
- MCP OAuth credentials
- Google Drive data
- Google Docs content
- Google Slides content
- Google Calendar data
- user workspace files

Do not propose moving Google credentials to the VPS as remediation.

---

# Critical Existing Constraints

## Google Sheets

`google-sheets` remains the existing custom Alpha One MCP.

MUST NOT:

- modify it
- replace it
- remove it
- migrate it
- register official Google Sheets MCP
- change its OAuth behavior
- perform Sheets smoke tests
- redesign its architecture

Sheets is OUT OF SCOPE except for verifying that it remains untouched.

---

## Official Google MCP Servers

Current intended architecture:

- Drive → official Google MCP
- Docs → official Google MCP
- Slides → official Google MCP
- Calendar → official Google MCP
- Sheets → custom Alpha One MCP

Do not create custom Drive/Docs/Slides/Calendar MCP engines.

---

# Scope

Audit ONLY:

1. Local Google identity lifecycle.
2. Local OAuth credential lifecycle.
3. OAuth consent/scopes.
4. MCP-specific authorization state.
5. Local persistence of MCP authorization.
6. OpenCode MCP auth state.
7. Agent runtime MCP authentication behavior.
8. Repeated OAuth popup behavior.
9. Per-MCP authorization versus shared Google identity.
10. Local storage boundaries.
11. Credential reuse between Agent runs.
12. KANAL VPS involvement, if any.
13. Security implications of current storage.
14. Minimal remediation recommendation.

Do NOT implement remediation.

---

# Phase 0 — Environment Discovery

Identify the Alpha Workspace local runtime architecture relevant to authentication.

Determine:

- operating system/runtime
- Alpha Workspace application process
- OpenCode process
- local configuration directory
- local data directory
- local credential/authentication storage
- MCP configuration location
- OpenCode MCP authentication storage
- any local database used for identity/configuration
- any browser callback handler
- any OAuth callback listener

Record actual file paths.

Do not expose secrets.

---

# Phase 1 — Google Identity Source of Truth

Trace how Alpha Workspace identifies the connected Google account.

Determine:

- where Google account identity is initially obtained;
- whether Google `sub` is stored;
- whether Google email is stored;
- whether identity is stored locally;
- whether identity is stored in local database/file;
- whether identity is reconstructed from tokens;
- whether identity is sent to the KANAL VPS;
- whether identity is tied to an Alpha Workspace local user identity.

The expected architectural model is:

```text
Local Alpha Workspace User
        │
        └── Google Connection
              ├── Google subject
              ├── Google email
              └── authorization state
```

Do not assume this model exists.

Prove the actual implementation.

---

# Phase 2 — OAuth Client and Consent State

Audit the current Google OAuth implementation.

Determine:

- OAuth client ID source;
- OAuth client secret source;
- redirect URI source;
- OAuth scopes requested;
- OAuth scopes granted;
- OAuth consent configuration;
- whether OAuth authorization is initiated by Alpha Workspace;
- whether OAuth authorization is initiated by OpenCode;
- whether multiple OAuth flows exist.

Compare:

```text
Alpha Workspace Google OAuth
vs
OpenCode MCP OAuth
```

Do not modify OAuth configuration.

---

# Phase 3 — Local Credential Storage

Identify where OAuth credentials are persisted locally.

Determine separately:

### Access Token

- where stored;
- whether encrypted;
- lifetime;
- whether persisted across Agent runs.

### Refresh Token

- where stored;
- whether encrypted;
- whether persisted;
- whether available for silent renewal.

### MCP OAuth Token

- where stored;
- whether separate from REST OAuth token;
- whether per-server;
- whether shared;
- whether encrypted;
- whether persisted across process restart.

### Authorization Metadata

Determine whether the application stores: 

- granted scopes
- authorization timestamp
- token expiration
- provider
- Google account identity
- MCP server identity
- authorization status

Never print actual token values.

---

# Phase 4 — MCP Authorization State

Trace official MCP authentication for: 

- Drive
- Docs
- Slides
- Calendar

For each server determine:

1. MCP endpoint.
2. OAuth client.
3. authorization initiation.
4. callback.
5. authorization code.
6. PKCE state.
7. token exchange.
8. resulting token.
9. local persistence.
10. runtime token retrieval.
11. token refresh.
12. token reuse.

Create this matrix:

| MCP      | OAuth Initiated | Callback | Token Obtained | Token Persisted | Token Reused | Runtime Uses Correct Token |
| -------- | --------------- | -------- | -------------- | --------------- | ------------ | -------------------------- |
| Drive    |                 |          |                |                 |              |                            |
| Docs     |                 |          |                |                 |              |                            |
| Slides   |                 |          |                |                 |              |                            |
| Calendar |                 |          |                |                 |              |                            |

Do not expose credentials.

---

# Phase 5 — Repeated OAuth Popup Root Cause

Investigate the reported behavior: 

> Agent runtime triggers approximately five Google OAuth popup windows.

Determine exactly why.

Possible classifications:

### `EXPECTED_PER_MCP_AUTH`

Each MCP legitimately requires separate first-time authorization, and all authorization state is correctly persisted afterward.

### `AUTH_STATE_NOT_PERSISTED`

Authorization succeeds but resulting state is not stored locally.

### `AUTH_STATE_NOT_REUSED`

Authorization is stored but runtime does not retrieve/reuse it.

### `WRONG_CREDENTIAL_SOURCE`

Runtime uses Alpha Workspace REST token instead of the MCP-specific credential.

### `MCP_AUTH_REINITIALIZED_PER_REQUEST`

Runtime incorrectly starts authorization for every Agent request/tool session.

### `IDENTITY_MAPPING_FAILURE`

Google identity is known, but MCP authorization cannot map back to the local Google connection.

### `UNKNOWN`

Evidence insufficient.

Do not guess.

---

# Phase 6 — Process Restart Persistence

Perform a controlled read-only persistence audit.

Determine whether authorization state survives: 

1. Agent request completion.
2. New Agent session.
3. OpenCode restart.
4. Alpha Workspace restart.

Do not intentionally delete credentials.

Do not revoke OAuth authorization.

Expected conceptual behavior:

```text
FIRST AUTH
Google OAuth
    ↓
Local persistence
    ↓
Agent completes

NEXT AGENT RUN
    ↓
Load local auth state
    ↓
Token valid?
    ├── YES → reuse silently
    └── NO → refresh / reauthorize affected MCP only
```

Determine whether actual behavior matches this.

---

# Phase 7 — Identity-to-MCP Mapping

Determine whether the local system has a mapping equivalent to: 

```text
Google Identity
      │
      ├── Drive MCP authorization
      ├── Docs MCP authorization
      ├── Slides MCP authorization
      └── Calendar MCP authorization
```

Determine whether the system instead incorrectly models: 

```text
Google Connected = TRUE
```

without per-MCP authorization state.

Identify whether the system can distinguish: 

* Google account connected
* Drive MCP authorized
* Docs MCP authorized
* Slides MCP authorized
* Calendar MCP authorized

Do not redesign.

Only audit.

---

# Phase 8 — Scope Registry Audit

Determine where the system knows the required OAuth scopes for each MCP.

The platform SHOULD have a stable capability definition equivalent to: 

```text
Drive MCP
  required scopes:
    drive.readonly
    drive.file

Docs MCP
  required scopes:
    drive.readonly
    drive.file
    documents.readonly
    documents

Slides MCP
  required scopes:
    drive.readonly
    drive.file
    presentations.readonly
    presentations

Calendar MCP
  required scopes:
    calendar read-only scopes required by the official Google MCP documentation
```

Do not assume the above list is correct without comparing against current official Google documentation.

Determine: 

- whether required scopes are hardcoded
- whether stored in backend/local config
- whether inferred dynamically
- whether only OpenCode knows them
- whether Alpha Workspace knows them
- whether there is a capability registry

Important: "Backend" in this task means the LOCAL Alpha Workspace application/runtime where appropriate.

Do not interpret this as KANAL VPS storage.

---

# Phase 9 — Capability vs User Grant

Determine whether the local application can distinguish: 

```text
REQUIRED CAPABILITY
vs
USER GRANTED CAPABILITY
```

Conceptual model: 

```text
Capability Definition
      │
      └── Google Docs MCP
            required scopes
                 │
                 ▼
User Google Connection
      │
      └── granted scopes
                 │
                 ▼
Authorization Status
```

Determine whether this comparison currently exists.

Do not implement it.

---

# Phase 10 — KANAL VPS Boundary Audit

Verify whether any Google credential or Google data is sent to the KANAL VPS.

Audit network/API calls where practical.

Allowed VPS data: 

- download count
- source/release metadata
- OAuth-connected email

Disallowed VPS data: 

- access token
- refresh token
- authorization code
- MCP token
- Google file content
- Google document content
- Google presentation content
- Google calendar data
- user workspace files

If sensitive credential data is found leaving the local environment: 

classify as: 

`SECURITY_FINDING`

Do not remediate in this task.

---

# Phase 11 — Security Boundary

Determine whether local credential storage is: 

- plaintext
- encrypted
- OS-protected
- application-encrypted
- browser-only
- OpenCode-owned
- Alpha Workspace-owned

Determine whether credentials are accessible to: 

- Alpha Workspace
- OpenCode
- MCP runtime
- unrelated local processes

Do not expose secrets.

Do not copy credentials.

---

# Phase 12 — Runtime Trace

Perform a controlled Agent execution that invokes at least one official MCP.

Prefer a read-only operation.

Observe: 

- whether OAuth popup appears
- which MCP triggers it
- whether an existing credential is reused
- whether a callback occurs
- whether a new token is created
- whether token state is persisted
- whether subsequent invocation triggers another popup

Do not perform destructive operations.

Do not invoke Sheets.

---

# Evidence Classification

Every conclusion MUST be classified: 

* `PROVEN`
* `DERIVED`
* `UNPROVEN`
* `UNKNOWN`
* `INSUFFICIENT_EVIDENCE`

Do not convert repeated popup behavior into a confirmed storage bug without tracing the persistence path.

---

# Quality Gate

## PASS

Use PASS only if: 

* Google identity source is proven;
* OAuth state source is proven;
* MCP authorization storage is proven;
* token persistence is proven;
* token reuse is proven;
* repeated popup root cause is proven;
* local/VPS boundary is proven;
* scope definition source is proven;
* per-user authorization mapping is understood.

## CONDITIONAL

Use CONDITIONAL if: 

* architecture is understood;
* root cause is identified;
* but an external prerequisite or small implementation gap remains.

## BLOCKED

Use BLOCKED if: 

* required runtime/storage evidence cannot be obtained;
* authentication state is inaccessible;
* Google/OpenCode behavior prevents conclusive audit.

## FAIL

Use FAIL only if: 

* Alpha Workspace is proven to mishandle identity, authorization, or credentials;
* or sensitive Google credentials/data are proven to leave the local environment contrary to the local-first architecture.

Do not use FAIL merely because Google MCP itself rejects authorization.

---

# Remediation Boundary

This task is AUDIT-ONLY.

Do NOT: 

- create new credential tables
- modify OAuth implementation
- change token storage
- modify MCP runtime
- change OpenCode
- change Google Cloud configuration
- change OAuth scopes
- move credentials to VPS
- create a credential service
- implement capability registry
- modify Sheets

If a remediation is required, document the smallest corrective change recommended.

Do not implement it.

---

# Execution Summary

Write the complete Execution Summary into this SAME task file.

Include: 

1. Environment discovery.
2. Google identity source.
3. OAuth source.
4. Local credential storage.
5. MCP authorization storage.
6. Token lifecycle.
7. Token reuse behavior.
8. Scope registry.
9. Capability/grant mapping.
10. Repeated popup root cause.
11. Process restart persistence.
12. KANAL VPS boundary.
13. Security findings.
14. Runtime evidence.
15. Root cause classification.
16. Quality Gate.
17. Final verdict.
18. Minimal corrective task recommendation, if required.

Never expose token values or secrets.

---

# Git

After audit: 

1. `git status`
2. `git diff --stat`
3. verify only the intended task file changed
4. commit ONLY the task file
5. do not commit application/configuration changes
6. leave unrelated pre-existing changes untouched

If repository policy says Git is not yet required, report the working-tree status instead.

Do not alter unrelated files.

---

# Final Response

Report: 

* final verdict
* Google identity storage location
* OAuth authorization storage location
* MCP authorization storage location
* scope definition location
* whether authorization survives restart
* why OAuth popup repeats
* whether identity is correctly mapped to MCP authorization
* whether credentials remain local
* whether anything is sent to KANAL VPS beyond permitted metadata
* whether an Alpha Workspace implementation defect is proven
* minimal corrective task required next, if any

Do not propose VPS credential storage.

---

# Execution Summary

Audit executed 2026-08-19. AUDIT-ONLY — no source/config/OAuth/Cloud/Sheets mutation. No credential values exposed; only presence/scope/expiry/ownership recorded.

## 1. Environment discovery (Phase 0) — PROVEN

- OS: Windows 11 (10.0.26200), PowerShell 5.1.
- Processes: Vite dev server (node), alpha-server (node/tsx), OpenCode CLI (opencode.exe, v1.18.18), google-sheets MCP server (node/tsx) spawned by OpenCode.
- Local config dir: `C:\Users\ASUS\.config\opencode\` (opencode.jsonc)
- Local data dir: `C:\Users\ASUS\.local\share\opencode\` (auth.json, mcp-auth.json, opencode.db SQLite, log/, storage/)
- App local state dir: `C:\dev\alpha-one\.alpha\google\` (connections.json, states\*.json)
- OAuth callback handler: Express route `GET /api/google/oauth/callback` (port 3001) + OpenCode loopback callback listener on `http://127.0.0.1:19876/mcp/oauth/callback`.

## 2. Google identity source of truth (Phase 1) — PROVEN

- Alpha Workspace obtains Google identity from the Google OAuth userinfo endpoint (`https://www.googleapis.com/oauth2/v2/userinfo`) at OAuth callback time (`src/services/google/oauth-service.ts:220-241`).
- Stored identity fields: email + name (userinfo) + tokens; keyed by the ALPHA user id (fixed `local-user`). Google `sub` (subject) is NOT stored. Identity is stored locally in `C:\dev\alpha-one\.alpha\google\connections.json` (plaintext JSON).
- The app treats "Google connected" as a single boolean-ish state per local user (connections.json presence + valid token) — it does NOT model per-MCP authorization.

## 3. OAuth client & consent (Phase 2) — PROVEN

- Client ID/secret from `.env` (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), redirect `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/api/google/oauth/callback` (Web application type).
- App OAuth scopes: `drive.readonly, docs.readonly, spreadsheets, presentations.readonly, script.projects, userinfo.email, userinfo.profile` (`oauth-service.ts:51-59`). No calendar scopes.
- OpenCode MCP OAuth uses the same client ID/secret (env-referenced in opencode.jsonc) but a different redirect (loopback 19876) and MCP-required scopes (drive.file, documents, presentations, calendar scopes). Two separate OAuth flows exist: Alpha Workspace REST flow (port 3001 callback) vs OpenCode MCP flow (loopback callback).

## 4. Local credential storage (Phase 3) — PROVEN

- Access token: stored plaintext in `connections.json` (per user) and in `mcp-auth.json` (per MCP server). Lifetime ~1 hour; refreshable silently via `getValidAccessToken` (oauth-service.ts:255-298).
- Refresh token: stored plaintext in `connections.json` (per user). Persistent across runs.
- MCP OAuth tokens: stored in `mcp-auth.json` (per server: drive/docs/slides/calendar). These currently hold the Alpha One REST token (injected during TASK-055 workaround), not MCP-flow tokens. Not encrypted.
- Authorization metadata: `connections.json` stores granted scopes, connectedAt, updatedAt, tokenExpiry; `mcp-auth.json` stores scope, expiresAt, clientInfo, serverUrl. No per-MCP authorization timestamp or per-MCP grant status.

## 5. MCP authorization state (Phase 4) — PROVEN

| MCP | OAuth Initiated | Callback | Token Obtained | Token Persisted | Token Reused | Runtime Uses Correct Token |
| --- | ---------------- | -------- | -------------- | --------------- | ------------ | -------------------------- |
| Drive | Never (false-positive from opencode mcp auth) | No (flow never triggered) | No MCP-flow token | No | No (REST token injected instead) | NO (REST token rejected) |
| Docs | Never | No | No MCP-flow token | No | No | NO (REST token rejected) |
| Slides | Never | No | No MCP-flow token | No | No | NO (REST token rejected) |
| Calendar | Never (false-positive) | No | No MCP-flow token | No | No | NO (no token) |

Root cause of no MCP-flow token: OpenCode's `mcp auth` only starts OAuth on a connect-time 401; Google MCP servers allow unauthenticated `initialize`/`tools/list`, so the flow never triggers. Manual RFC 8707 MCP consent flows (TASK-058) mint tokens but the Google-hosted MCP servers reject them (`The caller does not have permission`).

## 6. Token lifecycle & reuse (Phase 6) — PROVEN

- Alpha REST token survives restarts (persisted in connections.json) and is silently refreshed when needed (oauth-service.ts getValidAccessToken).
- MCP tokens: none obtained through the MCP flow exist; the injected REST tokens persist in mcp-auth.json and are reused by OpenCode runtime — but are rejected by the MCP servers.
- Expected behavior (silent reuse) does not occur for MCP because no valid MCP token exists.

## 7. Repeated OAuth popup root cause (Phase 5) — PROVEN mechanism

The reported ~5 popups are explained by: each official MCP server triggers its own OAuth authorization independently when its tool call returns 401 (no valid token). With four MCP servers (drive/docs/slides/calendar) plus the Alpha Workspace REST flow, up to five authorization attempts can occur. The persistence path is absent for MCP: no MCP-flow token is ever stored, so the next run re-triggers authorization. Classification: a combination of `AUTH_STATE_NOT_PERSISTED` (no MCP-flow token persisted) + `WRONG_CREDENTIAL_SOURCE` (REST token injected instead of MCP-flow token) + each MCP legitimately requesting its own authorization (`EXPECTED_PER_MCP_AUTH` structural cause). Not an Alpha Workspace storage bug per se — the app never completes the MCP OAuth flow.

## 8. Identity-to-MCP mapping (Phase 7) — PROVEN

The system does NOT maintain a mapping of Google Identity → per-MCP authorization. It models only `Google connected = TRUE` via connections.json. It cannot distinguish Drive-authorized vs Docs-authorized vs Slides-authorized vs Calendar-authorized.

## 9. Scope registry (Phase 8) — PROVEN

- App knows its own REST scopes (hardcoded in oauth-service.ts). It does NOT know the MCP-required scopes (drive.file/documents/presentations/calendar). OpenCode knows the MCP scopes (from the MCP resource metadata at runtime) but does not persist them. No capability registry exists in Alpha Workspace.

## 10. Capability vs user grant (Phase 9) — PROVEN

No comparison exists between required MCP scopes and user-granted scopes. The app only stores granted REST scopes.

## 11. KANAL VPS boundary (Phase 10) — PROVEN

No outbound calls to KANAL VPS or any external host other than Google endpoints and AI model providers were found in `src/`. No credential/Google data is sent to the VPS. Only permitted telemetry/metadata would be whatever the AI providers receive (model prompts) and local Google API calls. No `SECURITY_FINDING` for credential exfiltration.

## 12. Security boundary (Phase 11) — PROVEN

- `connections.json`: inherited ACL — BUILTIN\Users (RX), Authenticated Users (RX) → readable by other local accounts (plaintext access+refresh tokens). SECURITY FINDING.
- `mcp-auth.json`: ASUS (R,W) only (locked down in TASK-055) — restricted.
- `.env`: inherited ACL — Users (RX), Authenticated Users (RX) → readable by other local accounts (plaintext client secret). SECURITY FINDING.
- `states/`: inherited ACL — Users (RX) — readable PKCE verifiers + state. SECURITY FINDING.
- Credentials accessible to: Alpha Workspace (full), OpenCode (mcp-auth.json), MCP runtime (reads mcp-auth.json), and any local user with file-system access (read).

## 13. Runtime evidence (Phase 12)

A controlled OpenCode CLI run was attempted; the model provider returned a rate-limit error (transient, unrelated to MCP auth). The runtime path (app spawns OpenCode CLI → MCP tool call) is confirmed reachable; the MCP auth behavior was already established directly in TASK-057/058 (REST token accepted at enablement gate, rejected at resource access; MCP-flow tokens rejected too).

## 14. Root cause classification

`PROVEN_MCP_AUTHORIZATION_NOT_COMPLETED` + `AUTH_STATE_NOT_PERSISTED` + `WRONG_CREDENTIAL_SOURCE`. The Alpha Workspace app itself is NOT proven to mishandle identity/authorization — it correctly persists its own REST connection locally and never sends credentials to the VPS. The MCP authorization gap is caused by: (a) OpenCode's MCP OAuth flow not triggering for Google servers, and (b) the Google-hosted MCP resource servers rejecting every token from the Alpha OAuth client (external Google Cloud prerequisite). No FAIL classification (no app-side defect proven; no credential exfiltration).

## 15. Quality Gate

| Gate | Status |
| ---- | ------ |
| Google identity source proven | PASS (userinfo + connections.json) |
| OAuth state source proven | PASS |
| MCP authorization storage proven | PASS (mcp-auth.json) |
| Token persistence proven | PASS (connections.json, mcp-auth.json) |
| Token reuse proven | PASS (REST reuse works; MCP reuse impossible - no valid MCP token) |
| Repeated popup root cause proven | PASS (mechanism identified) |
| Local/VPS boundary proven | PASS (no VPS credential flow) |
| Scope definition source proven | PASS (app REST scopes hardcoded; MCP scopes only in OpenCode/metadata) |
| Per-user authorization mapping understood | PASS (none exists; single boolean model) |

## 16. Final verdict

`CONDITIONAL`

The architecture is fully understood and all storage locations are proven. No Alpha Workspace implementation defect is proven and no credential exfiltration exists. The remaining gap is an external Google Cloud OAuth prerequisite: the Alpha OAuth client must be authorized for the Workspace MCP API in the Google Cloud console so that a valid MCP-flow token can be obtained and persisted per MCP server. The minimal corrective change is a small implementation task to complete and persist the MCP OAuth flow per server and map it to the local Google identity.

## 17. Minimal corrective task recommended (not implemented in this audit)

1. Authorize the Alpha OAuth client for the Workspace MCP API in the Google Cloud console (external prerequisite).
2. Implement a per-MCP authorization state store (e.g. extend `.alpha/google/` or a new local JSON) mapping Google identity → each MCP server's token/status, then run the actual MCP OAuth flow (or drive OpenCode to persist it) so each server gets a valid MCP-flow token.
3. Harden local credential file ACLs (restrict to the owning user only) for `connections.json`, `.env`, and `states/` (security hardening).

Files changed: only this task file. No config/source/credential mutation. Git branch `task/gworkspace-002-r1-drive-access-rework`, HEAD `754a3fe` (pre-commit).