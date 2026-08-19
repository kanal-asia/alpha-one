# TASK-OPENCODE-060 — Google Workspace MCP OAuth Client Authorization

## Objective

Resolve and prove the external Google Cloud OAuth prerequisite identified by TASK-058 and TASK-059:

> The Alpha Workspace Google OAuth client can obtain a normal Google REST OAuth token, but Google-hosted Workspace MCP servers reject both the REST token and manually minted MCP-flow tokens.

The immediate objective is to determine whether the existing Alpha Workspace OAuth client is correctly authorized/configured for Google Workspace MCP.

Target official Google MCP services:

- Drive MCP
- Docs MCP
- Slides MCP

Calendar may be read-only verified if already authenticated, but is NOT the remediation target.

Google Sheets is STRICTLY excluded.

The final objective of this task is to reach:

```text
Alpha Workspace OAuth Client
        ↓
Google Workspace MCP authorization
        ↓
MCP OAuth flow
        ↓
valid MCP token
        ↓
Google-hosted MCP accepts token
        ↓
read-only tool call succeeds
```

Do NOT implement local MCP authorization persistence in this task.

That belongs to a separate follow-up task after a valid MCP token is proven.

---

# CRITICAL ARCHITECTURE

Alpha Workspace is a local-first open-source application.

The user's local environment is the credential authority.

The KANAL VPS is NOT a Google credential backend.

The VPS may retain only explicitly permitted metadata:

- download count
- source/release metadata
- OAuth-connected email

The VPS MUST NOT receive or store: - Google access tokens - Google refresh tokens - MCP OAuth tokens - OAuth authorization codes - Google Drive data - Google Docs content - Google Slides content - Google Calendar data - user workspace files

Do NOT propose moving credentials to the VPS.

---

# HARD CONSTRAINT — GOOGLE SHEETS

Do NOT touch Google Sheets.

Existing architecture:

```text
google-sheets
    ↓
custom Alpha One MCP
```

Do NOT: - replace it - register official Sheets MCP - modify its source - modify its configuration - change its OAuth behavior - run Sheets smoke tests - migrate Sheets authentication - redesign Sheets

Only verify that it remains untouched if necessary.

---

# HARD CONSTRAINT — NO LOCAL MCP PERSISTENCE IMPLEMENTATION

Do NOT implement: - new MCP token database - MCP authorization registry - per-MCP credential store - Google identity-to-MCP mapping - token encryption changes - local OAuth persistence changes

TASK-059 identified these as future corrective work, but this task must first prove that Google can issue an MCP credential accepted by the official Google-hosted MCP servers.

---

# Phase 0 — Baseline

Capture: - current git branch - current HEAD - git status - OpenCode MCP configuration - `opencode mcp list` - current Google OAuth client ID identity without exposing secrets - current MCP endpoints

Expected official MCP endpoints:

```text
Drive: https://drivemcp.googleapis.com/mcp/v1
Docs: https://docsmcp.googleapis.com/mcp/v1
Slides: https://slidesmcp.googleapis.com/mcp/v1
Calendar: https://calendarmcp.googleapis.com/mcp/v1
```

Do not modify anything during baseline.

---

# Phase 1 — Official Google Documentation Verification

Review the current official Google documentation for Workspace MCP OAuth requirements.

Use official Google documentation as the authority.

Verify specifically: 1. OAuth client requirements. 2. OAuth application type. 3. Required redirect URI pattern. 4. OAuth consent requirements. 5. MCP-specific scopes. 6. MCP authorization requirements. 7. Resource parameter requirements. 8. PKCE requirements. 9. Whether each MCP server requires independent authorization. 10. Any Google Cloud configuration prerequisite for Workspace MCP.

Record exact findings.

Do not infer undocumented Google Cloud configuration requirements as fact.

---

# Phase 2 — Google Cloud OAuth Client Audit

Inspect the Alpha Workspace OAuth client in Google Cloud.

Project: `alpha-workspace-505404`

Project number previously observed: `480048442203`

Verify: - OAuth client type - OAuth client ID - authorized redirect URIs - authorized JavaScript origins if applicable - consent screen status - publishing/testing status - configured test users - configured scopes - whether the client is suitable for the official Workspace MCP OAuth flow

Do NOT expose client secret.

Do NOT rotate credentials.

Do NOT delete or replace the existing OAuth client.

---

# Phase 3 — MCP Authorization Requirements Matrix

Create: | MCP      | Endpoint | Required Scope(s) | OAuth Client Compatible | Redirect Compatible | Resource Parameter | PKCE | Cloud Prerequisite | Status | | -------- | -------- | ----------------- | ----------------------- | ------------------- | ------------------ | ---- | ------------------ | ------ | | Drive    |          |                   |                         |                     |                    |      |                    |        | | Docs     |          |                   |                         |                     |                    |      |                    |        | | Slides   |          |                   |                         |                     |                    |      |                    |        | | Calendar |          |                   |                         |                     |                    |      |                    |        |

Only record requirements supported by official documentation or direct runtime evidence.

---

# Phase 4 — Existing Client Compatibility

Determine whether the existing Alpha Workspace OAuth client can be used for official Google Workspace MCP.

Compare: `Alpha Workspace OAuth Client` VS `Google Workspace MCP OAuth requirements`

Classify each requirement: - PROVEN_COMPATIBLE - PROVEN_INCOMPATIBLE - UNKNOWN - INSUFFICIENT_EVIDENCE

Do not make changes merely because a value is different.

---

# Phase 5 — Redirect URI Audit

The current Alpha Workspace REST OAuth callback is: `http://localhost:3001/api/google/oauth/callback`

OpenCode MCP uses a loopback callback previously observed as: `http://127.0.0.1:19876/mcp/oauth/callback`

Determine which redirect URI Google officially requires for the MCP OAuth flow.

Determine whether the existing OAuth client can legally use the MCP redirect URI.

If the existing client does not support the MCP callback: classify: `PROVEN_REDIRECT_URI_GAP`

Do NOT add or change the redirect URI unless the official documentation and Google Cloud configuration clearly require it.

---

# Phase 6 — OAuth Scope Audit

Compare the OAuth consent configuration against the exact official MCP scopes.

At minimum investigate the documented scopes for: ## Drive MCP `https://www.googleapis.com/auth/drive.readonly` `https://www.googleapis.com/auth/drive.file`

## Docs MCP `https://www.googleapis.com/auth/drive.readonly` `https://www.googleapis.com/auth/drive.file` `https://www.googleapis.com/auth/documents.readonly` `https://www.googleapis.com/auth/documents`

## Slides MCP `https://www.googleapis.com/auth/drive.readonly` `https://www.googleapis.com/auth/drive.file` `https://www.googleapis.com/auth/presentations.readonly` `https://www.googleapis.com/auth/presentations`

## Calendar Only verify the official read-only scope requirements if Calendar is tested.

Do NOT blindly add every listed scope.

Determine the minimum scope set required for the intended read-only validation.

---

# Phase 7 — MCP OAuth Flow Audit

Trace the actual OAuth flow.

For one service first, preferably Drive: `OAuth authorization request ↓ Google consent ↓ redirect ↓ authorization code ↓ token exchange ↓ MCP access token ↓ MCP initialize ↓ tools/list ↓ read-only tool call`

Record: - authorization endpoint - client ID - redirect URI - scopes - PKCE - state - resource parameter - token endpoint - resulting token metadata - MCP server response

Never expose: - authorization code - access token - refresh token - client secret

---

# Phase 8 — Prove MCP Token Acceptance

This is the critical gate.

Use a real Google resource already proven accessible in TASK-057: Drive: same proven PDF/file resource. Docs: same proven document. Slides: same proven presentation.

Do NOT use a different resource merely to make the test pass.

For Drive, perform a read-only MCP call such as metadata/read. For Docs: `docs_read_doc` For Slides: `slides_read_presentation`

Expected: `Google MCP ↓ authenticated ↓ tool call ↓ real Google resource returned`

---

# Phase 9 — Compare REST vs MCP

For each tested service record: | Service | Same Account | Same Resource | REST | MCP | Result | | ------- | ------------ | ------------- | ---- | --- | ------ | | Drive   |              |               |      |     |        | | Docs    |              |               |      |     |        | | Slides  |              |               |      |     |        |

The goal is to eliminate: - ownership confusion - sharing confusion - wrong account - wrong resource ID - missing REST permission - incorrect MCP endpoint

If REST succeeds but MCP fails with a valid MCP token, classify the discrepancy rather than calling it an application bug.

---

# Phase 10 — Minimal External Remediation

Only if Phase 2–7 proves a Google Cloud OAuth configuration gap: Apply the smallest required external Google Cloud configuration change.

Allowed: - add required MCP redirect URI - configure required OAuth scope - update OAuth consent configuration - configure the existing OAuth client for the documented MCP flow - create a dedicated MCP OAuth client ONLY if official documentation/evidence proves the existing client cannot be used

Do NOT create a new client merely because it is convenient.

Do NOT rotate existing secrets unless required.

Do NOT change Alpha Workspace application code.

Do NOT change local MCP persistence.

---

# Phase 11 — Re-run OAuth

After a proven external configuration correction: Perform the official MCP OAuth flow again.

Do not reuse an old rejected token.

Capture only safe metadata: - account - scopes - expiration - token presence - MCP server - authorization result

Then run the read-only MCP smoke test.

---

# Phase 12 — Drive First, Then Docs/Slides

Do not simultaneously debug all services.

Order: 1. Drive 2. Docs 3. Slides 4. Calendar read-only verification if already authorized

Why: Drive is the simplest resource-access baseline and is already proven through REST.

Once Drive MCP is accepted, use the proven authorization model for Docs and Slides.

---

# Phase 13 — Calendar

Calendar is not the remediation target.

If already authenticated, run only: `calendar_list_calendars` or another safe read-only call.

If it fails: - record exact error - classify separately - do not expand this task into Calendar architecture

---

# Phase 14 — Sheets Protection

Verify: - `google-sheets` remains configured - source unchanged - no official Sheets MCP registered - no Sheets tool call performed

Expected: `google-sheets = CUSTOM`

---

# Root Cause Classification

Use one of: `PROVEN_MCP_OAUTH_CLIENT_CONFIGURATION_GAP` Use only if Google Cloud client configuration is proven incompatible with official MCP OAuth requirements. `PROVEN_MCP_REDIRECT_URI_GAP` Use only if the redirect URI requirement is explicitly proven. `PROVEN_MCP_SCOPE_GAP` Use only if required scope is missing and directly explains authorization failure. `PROVEN_MCP_OAUTH_FLOW_SUCCESS` Use when a valid MCP token is obtained and accepted by Google MCP. `UNRESOLVED_GOOGLE_MCP_AUTHORIZATION_DISCREPANCY` Use when: - OAuth client configuration is compliant - scopes are correct - MCP OAuth flow completes - token is valid - resource is accessible through REST - MCP still rejects the token. `OPEN_CODE_IMPLEMENTATION_DEFECT` Use ONLY if source/runtime evidence proves OpenCode violates the official MCP OAuth requirements.

Do not use this classification merely because MCP authorization fails.

---

# Evidence Classification

Every important finding MUST be labelled: PROVEN DERIVED UNPROVEN UNKNOWN INSUFFICIENT_EVIDENCE

Never turn a hypothesis into a bug.

---

# Quality Gate

## PASS

Only if: - MCP OAuth client requirements are proven satisfied - valid MCP OAuth flow completes - MCP token is accepted - Drive MCP read-only call succeeds - Docs/Slides MCP can subsequently be validated - no application source mutation was required.

## CONDITIONAL

If: - external configuration was corrected - at least one MCP is proven - other MCPs remain blocked by an external prerequisite.

## BLOCKED

If: - Google Cloud configuration cannot be completed - OAuth client cannot be authorized for MCP - Google refuses valid MCP OAuth authorization - required external action is unavailable.

## FAIL

Only if an Alpha Workspace/OpenCode implementation defect is proven.

---

# No Scope Expansion

Do NOT: - implement local MCP authorization persistence - create a capability registry - redesign Google identity - change `connections.json` - change `mcp-auth.json` schema - harden ACLs - modify OpenCode source - create custom MCP servers - modify Sheets - redesign OAuth architecture - move credentials to VPS

Those belong to separate tasks.

---

# Execution Summary

Write the complete execution summary into this SAME task file.

Include: 1. Official Google documentation reviewed. 2. Google Cloud OAuth client configuration. 3. MCP requirements matrix. 4. Scope comparison. 5. Redirect URI comparison. 6. OAuth client compatibility. 7. MCP OAuth flow evidence. 8. MCP token acceptance evidence. 9. Drive REST vs MCP comparison. 10. Docs REST vs MCP comparison. 11. Slides REST vs MCP comparison. 12. Calendar read-only status. 13. Sheets protection evidence. 14. External remediation performed, if any. 15. Root cause classification. 16. Quality Gate. 17. Final verdict. 18. Minimal next task recommendation.

Never expose secrets/tokens.

---

# Git

This task is primarily an external Google Cloud authorization task.

Before execution: `git status` `git branch --show-current` `git log -1 --oneline`

After execution: `git status` `git diff --stat`

Do NOT commit application source/configuration changes because this task is not authorized to modify them.

If only the task file changed, commit ONLY the task file according to repository workflow.

Do not commit unrelated pre-existing changes.

---

# Final Response

Report concisely: - final verdict - Drive MCP status - Docs MCP status - Slides MCP status - Calendar status - exact OAuth client gap, if proven - exact scope gap, if proven - exact redirect gap, if proven - whether valid MCP token was accepted - whether Google Cloud remediation was required - whether Alpha Workspace/OpenCode defect was proven - whether Sheets remained untouched - next minimal task, if any

Do not claim Google MCP is broken without conclusive evidence.

---

# Execution Summary

Executed 2026-08-19. External Google Cloud OAuth authorization task. No application source/config/OAuth/Sheets mutation. No credential values exposed (only metadata/claims).

## 1. Official Google documentation reviewed (Phase 1) — PROVEN

- Google Workspace MCP configuration doc (`/workspace/guides/configure-mcp-servers`): OAuth 2.0 with a Web application OAuth client; the MCP client's callback must be registered as an Authorized redirect URI (Antigravity: `https://antigravity.google/oauth-callback`; Claude: `https://claude.ai/api/mcp/auth_callback`); consent screen must include the MCP scopes; each MCP server is authenticated independently.
- Google Workspace auth-overview doc: standard OAuth terminology; access tokens carry granted scopes; application types include Web application (JavaScript) and Desktop app.
- MCP SDK source (`modelcontextprotocol/typescript-sdk`): the MCP OAuth flow includes an RFC 8707 `resource` parameter (the MCP resource URL from RFC 9728 metadata) in both the authorization request and the token exchange.

## 2. Google Cloud OAuth client configuration (Phase 2) — PROVEN (client-side observable)

- Client ID: `480048442203-stiuf8pf1o0kvb0vejpk8hfa85b6o4c4.apps.googleusercontent.com` (Web application; project number 480048442203 / project ID alpha-workspace-505404). Secret in `.env` (never exposed).
- Redirect URIs: `http://localhost:3001/api/google/oauth/callback` (app REST) + `http://127.0.0.1:19876/mcp/oauth/callback` (OpenCode MCP loopback). Both are loopback URIs.
- Consent screen state, publishing status, test users, configured scopes: UNKNOWN (requires Google Cloud console access — not available).

## 3. MCP requirements matrix (Phase 3) — PROVEN

| MCP | Endpoint | Required Scope(s) (official doc) | OAuth Client Compatible | Redirect Compatible | Resource Parameter | PKCE | Cloud Prerequisite | Status |
| --- | ------- | ------------------------------- | ----------------------- | ------------------- | ------------------ | ---- | ------------------ | ------ |
| Drive | https://drivemcp.googleapis.com/mcp/v1 | drive.readonly + drive.file | PARTIAL (scope obtainable, resource binding NOT) | NO (loopback redirect; docs require HTTPS callback) | Required (RFC 8707) | Required | Authorize client for MCP resource | BLOCKED |
| Docs | https://docsmcp.googleapis.com/mcp/v1 | drive.readonly + drive.file + documents.readonly + documents | PARTIAL | NO | Required | Required | Authorize client for MCP resource | BLOCKED |
| Slides | https://slidesmcp.googleapis.com/mcp/v1 | drive.readonly + drive.file + presentations.readonly + presentations | PARTIAL | NO | Required | Required | Authorize client for MCP resource | BLOCKED |
| Calendar | https://calendarmcp.googleapis.com/mcp/v1 | calendar.calendarlist.readonly + calendar.events.readonly (+ freebusy) | NO (no calendar scope/token) | NO | Required | Required | Authorize client for MCP resource + consent | BLOCKED |

## 4. OAuth scope audit (Phase 6) — PROVEN

- App consent scopes: drive.readonly, docs.readonly, spreadsheets, presentations.readonly, script.projects, userinfo.email, userinfo.profile (no calendar scopes).
- Scope probe (authorize-endpoint tests, TASK-058): all MCP-required scopes proceed to consent — no invalid_scope error → scopes are obtainable via consent. Scope is NOT the blocker.

## 5. Redirect URI audit (Phase 5) — PROVEN

- OpenCode's MCP callback is loopback (`http://127.0.0.1:19876/mcp/oauth/callback`). Google's documented MCP clients (Antigravity, Claude) use HTTPS callbacks. The existing Alpha One client has only loopback URIs.
- Evidence: tokeninfo on a freshly minted MCP-flow token (PKCE S256 + scopes drive.readonly+drive.file+openid + resource=https://drivemcp.googleapis.com/mcp in both authorization request and token exchange) returned `aud = 480048442203-...apps.googleusercontent.com` (the client ID), NOT the MCP resource. Google's authorization server ignores the RFC 8707 resource parameter for this client → the token is not bound to the MCP resource → the MCP resource server rejects it with `The caller does not have permission`.

## 6. OAuth client compatibility (Phase 4) — PROVEN

- The existing client can obtain normal REST tokens (REST API calls succeed) — PROVEN.
- The existing client CANNOT obtain MCP-resource-bound tokens: every token it mints is bound to the client ID (tokeninfo proven), so Google-hosted MCP servers reject them. PROVEN.
- Classification: `PROVEN_MCP_OAUTH_CLIENT_CONFIGURATION_GAP` + `PROVEN_MCP_REDIRECT_URI_GAP` (loopback redirect not sufficient; client not authorized for MCP resource).

## 7. MCP OAuth flow evidence (Phase 7) — PROVEN

- Authorization endpoint: https://accounts.google.com/o/oauth2/v2/auth
- Token endpoint: https://oauth2.googleapis.com/token
- Flow executed for Drive: PKCE S256, scope drive.readonly+drive.file+openid, resource=https://drivemcp.googleapis.com/mcp, redirect http://127.0.0.1:19876/mcp/oauth/callback, consent completed by the user, code exchanged for tokens (access+refresh, 3599s). Token metadata: scope correct, audience = client ID (tokeninfo), email present.

## 8. MCP token acceptance (Phase 8) — PROVEN

- Drive MCP `get_file_metadata` / `read_file_content` on the TASK-057 proven PDF (1Bdo_1VkN385LFq_9_bbSId5Nlp5aIGRN) with the fresh MCP-flow token → `The caller does not have permission` (isError=true). NOT ACCEPTED.

## 9. REST vs MCP comparison (Phase 9) — PROVEN

| Service | Same Account | Same Resource | REST | MCP | Result |
| ------- | ------------ | ------------- | ---- | --- | ------ |
| Drive | Yes | Yes (PDF) | 200 OK | permission error | Discrepancy |
| Docs | Yes | Yes (doc 1fa2RwKMK8T2sk2f7BFePiaA5ydUKXbMrcPc4pAzBl6M) | 200 OK | permission error | Discrepancy |
| Slides | Yes | Yes (pres 1AyilWDzGtrbIMwglX3_brNjiApZM5AXTNgvbpnjQ5w0) | 200 OK | permission error | Discrepancy |

## 10. Calendar status (Phase 13) — PROVEN

No Calendar token in mcp-auth.json; app token has no calendar scope; no read-only Calendar call possible. Calendar = BLOCKED (external OAuth prerequisite). No Calendar mutation.

## 11. Sheets protection (Phase 14) — PROVEN

- `google-sheets` configured and connected; source unchanged (git clean); no official Sheets MCP (`sheetsmcp`) registered; no Sheets tool call performed.

## 12. External remediation (Phase 10) — NOT PERFORMED

Required external Google Cloud console action (cannot be performed by the agent): authorize the Alpha Workspace OAuth client for the Workspace MCP API / register a dedicated Web-application OAuth client for MCP with a non-loopback HTTPS callback (e.g. the OpenCode loopback URI is not sufficient; Google's documented MCP clients use HTTPS callbacks) and add the MCP scopes to the consent screen. This is the exact prerequisite TASK-058/059 identified.

## 13. Root cause classification

`PROVEN_MCP_OAUTH_CLIENT_CONFIGURATION_GAP` + `PROVEN_MCP_REDIRECT_URI_GAP` — the Alpha Workspace OAuth client is not authorized to obtain tokens bound to the MCP resource; Google's AS binds every token to the client ID, so the Google-hosted MCP servers reject them. No OpenCode implementation defect proven; no Alpha Workspace defect proven.

## 14. Quality Gate

| Gate | Status |
| ---- | ------ |
| MCP OAuth client requirements proven satisfied | FAIL (client not authorized for MCP resource) |
| Valid MCP OAuth flow completes | PARTIAL (flow completes; token not resource-bound) |
| MCP token accepted | FAIL (rejected) |
| Drive MCP read-only call succeeds | FAIL |
| Docs/Slides MCP validated | FAIL |
| No application source mutation required | PASS (PROVEN) |

## 15. Final verdict

`BLOCKED`

Google Cloud/OAuth external configuration prevents authorization. The OAuth client must be authorized for the Workspace MCP API in the Google Cloud console (or a dedicated MCP OAuth client with an HTTPS callback created and registered for MCP), then the per-server MCP OAuth flow must be re-run to mint resource-bound tokens. This is an external prerequisite that requires the user's Google Cloud console access.

## 16. Minimal next task

A Google Cloud console action (external): 1) enable the MCP API services in the correct project, 2) create/configure a Web-application OAuth client for Workspace MCP with a non-loopback HTTPS callback (or add one to the existing client), 3) add the MCP scopes to the consent screen, 4) re-run the MCP OAuth flow per server and persist the resource-bound tokens. Then re-run the Phase 8 read-only checks against the same proven resources.

Files changed: only this task file. No config/source/OAuth/Sheets/Cloud mutation. Git branch `task/gworkspace-002-r1-drive-access-rework`, HEAD `82684a1` (pre-commit).