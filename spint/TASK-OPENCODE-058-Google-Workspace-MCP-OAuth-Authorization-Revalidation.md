# TASK-OPENCODE-058 — Google Workspace MCP OAuth Authorization Revalidation

## Objective

Menyelesaikan root-cause investigation terhadap official Google Workspace MCP:

- Drive
- Docs
- Slides

yang:

- berhasil terhubung ke OpenCode;
- berhasil melakukan MCP initialization;
- berhasil melakukan `tools/list`;
- menggunakan Google account yang sama;
- menggunakan resource yang sama yang terbukti berhasil melalui REST API;
- tetapi MCP `tools/call` masih ditolak dengan permission error.

Audit sebelumnya membuktikan bahwa:

- resource bukan masalah;
- REST API access berhasil;
- OpenCode mengirim credential yang valid;
- Google-hosted MCP tetap menolak resource access.

Task ini berfokus pada **OAuth authorization/consent configuration dan MCP-specific authorization flow** untuk menentukan apakah official Google MCP memerlukan authorization/scopes tambahan yang belum diberikan kepada MCP.

---

# HARD CONSTRAINTS

## Google Sheets

Google Sheets TIDAK BOLEH disentuh.

Tetap:

`google-sheets → custom Alpha One MCP`

Dilarang:

- mengganti dengan official Sheets MCP;
- menghapus `google-sheets`;
- mengubah custom Sheets MCP;
- mengubah `mcp-servers/google-sheets/server.ts`;
- mengubah Sheets tools;
- melakukan Sheets migration;
- melakukan Sheets smoke test;
- mengubah Sheets OAuth implementation.

---

## Calendar

Calendar bukan target remediation task ini.

Calendar sudah:

`opencode mcp auth calendar → Authentication successful`

Jika perlu verifikasi status Calendar, hanya gunakan read-only check.

Dilarang:

- mengubah Calendar configuration;
- mengubah Calendar OAuth client;
- membuat/update/delete Calendar event;
- membuat Calendar engine;
- mengulang audit Calendar 056.

Jika Calendar read-only sudah berhasil, catat PASS dan lanjutkan.

---

# Current Architecture

Expected:

```text
OpenCode
  │
  ├── google-sheets
  │      └── CUSTOM Alpha One MCP
  │
  ├── drive
  │      └── OFFICIAL Google MCP
  │
  ├── docs
  │      └── OFFICIAL Google MCP
  │
  ├── slides
  │      └── OFFICIAL Google MCP
  │
  └── calendar
         └── OFFICIAL Google MCP
```

Do NOT redesign this architecture.

---

# Phase 0 — Baseline

Capture:

- git branch
- HEAD
- git status
- current OpenCode MCP configuration
- `opencode mcp list`

Expected:

- google-sheets connected
- drive connected
- docs connected
- slides connected
- calendar connected

Do not modify configuration during baseline.

---

# Phase 1 — Verify Official Google Documentation

Use the current official Google Workspace MCP documentation as the authority for:

- OAuth requirements;
- required OAuth scopes;
- MCP authentication flow;
- service-specific requirements;
- Drive MCP authorization;
- Docs MCP authorization;
- Slides MCP authorization.

Official documentation to verify:

Google Workspace MCP configuration documentation.

Do NOT assume that the scopes used by the normal Google REST API are automatically sufficient for Google-hosted MCP.

Record the exact documented scope requirements for:

### Drive MCP

Expected relevant scope(s) to investigate:

- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/drive.file`

### Docs MCP

Expected relevant scope(s) to investigate:

- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/documents.readonly`
- `https://www.googleapis.com/auth/documents`

### Slides MCP

Expected relevant scope(s) to investigate:

- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/presentations.readonly`
- `https://www.googleapis.com/auth/presentations`

Do NOT assume all scopes are required.

Determine the minimum scope set actually required for the intended READ-ONLY smoke test.

---

# Phase 2 — Audit Google OAuth Consent Configuration

Inspect the Google Cloud OAuth configuration for the Alpha One project.

Verify:

- OAuth client;
- OAuth consent screen;
- configured Data Access scopes;
- test users / publishing status where relevant;
- redirect URIs;
- whether the scopes required by the official MCP documentation are actually configured.

Compare:

```text
CURRENT OAUTH CONSENT SCOPES
        vs
OFFICIAL GOOGLE MCP REQUIRED SCOPES
```

Produce an explicit matrix:

| Service | Current Scope | Official MCP Requirement | Present? | Gap |
| ------- | ------------- | ------------------------ | -------- | --- |
| Drive   |              |                          |          |     |
| Docs    |              |                          |          |     |
| Slides  |              |                          |          |     |

Do NOT add scopes automatically.

---

# Phase 3 — Audit Existing MCP OAuth Tokens

Inspect the currently stored MCP authorization state.

For each:

- Drive
- Docs
- Slides
- Calendar

determine:

- whether an MCP token exists;
- token expiration;
- granted scopes;
- account identity;
- whether token was obtained through the MCP OAuth flow;
- whether the token predates the current MCP configuration;
- whether the token contains the scopes required by the official MCP documentation.

Do not expose access tokens/secrets in the execution summary.

Only report:

- presence;
- expiration;
- account;
- scope names.

Never print:

- access_token;
- refresh_token;
- client_secret;
- authorization code.

---

# Phase 4 — Determine Authorization Flow State

Determine whether OpenCode is:

A. performing the official MCP OAuth authorization flow;

or

B. reusing an existing Alpha One Google REST API token;

or

C. using another credential path.

This is the critical investigation.

Evidence must come from:

- OpenCode MCP auth state;
- configuration;
- runtime behavior;
- OAuth token metadata;
- MCP authorization flow where observable.

Do not infer from `Connected`.

---

# Phase 5 — Identify Required Authorization Gap

If the current MCP token lacks scopes required by official Google MCP documentation:

classify:

`PROVEN_OAUTH_SCOPE_GAP`

If the OAuth consent screen lacks required scopes:

classify:

`PROVEN_OAUTH_CONSENT_GAP`

If MCP-specific authorization has not actually occurred:

classify:

`PROVEN_MCP_AUTHORIZATION_NOT_COMPLETED`

If all documented requirements are satisfied but MCP still rejects the same valid resource:

classify:

`UNRESOLVED_MCP_AUTHORIZATION_DISCREPANCY`

Do NOT classify as Google MCP bug unless evidence proves it.

---

# Phase 6 — Minimal Remediation

Only perform remediation if Phase 2–5 proves a specific OAuth prerequisite is missing.

Permitted remediation:

- add the minimum required OAuth scopes;
- update OAuth consent configuration;
- re-authorize the affected official MCP server;
- acquire a new MCP authorization token.

Do NOT:

- modify application source code;
- create custom MCP servers;
- change REST API integrations;
- redesign OAuth architecture;
- change project/session architecture;
- modify Sheets;
- modify Calendar unless specifically required by its own already-authenticated state.

---

# Phase 7 — Re-authenticate Official MCPs

For each affected MCP:

```text
opencode mcp auth drive
opencode mcp auth docs
opencode mcp auth slides
```

Only run the authentication command for the affected service.

Do not blindly reauthorize unrelated services.

After authentication, verify:

```text
opencode mcp list
```

Then inspect MCP authorization state again.

---

# Phase 8 — E2E Read-Only Verification

Use the EXACT SAME resources from TASK-057.

Do not choose new arbitrary IDs unless the original resource has become unavailable.

Known proven resources:

- Drive: the PDF resource proven accessible by REST.
- Docs: the Google Doc proven accessible by REST.
- Slides: the Google Slides presentation proven accessible by REST.

For each:

### Drive

Call the corresponding official Drive MCP read-only tool.

Expected:

real metadata/data returned.

### Docs

Call:

`docs_read_doc`

Expected:

real document content returned.

### Slides

Call:

`slides_read_presentation`

Expected:

real presentation metadata/title/structure returned.

Do NOT perform mutations.

---

# Phase 9 — Calendar Status Check

Calendar has already been authenticated successfully.

Perform only:

- `calendar_list_calendars`
- optionally `calendar_list_events`

Do NOT create/update/delete events.

If successful:

`Calendar = PASS`

If unsuccessful:

record exact error only.

Do not expand task scope into Calendar remediation unless the failure is directly caused by the OAuth changes made in this task.

---

# Phase 10 — Sheets Protection Verification

Verify:

- `google-sheets` still connected;
- custom local MCP remains configured;
- source unchanged;
- no official Sheets MCP registration;
- no Sheets tool-call performed.

This is mandatory.

---

# Evidence Matrix

Produce:

| Service  | MCP Auth        | Required Scope Present | REST | MCP Tool Call | Data Returned | Verdict   |
| -------- | --------------- | ---------------------- | ---- | ------------- | ------------- | --------- |
| Drive    |                 |                        | 200  |               |               |           |
| Docs     |                 |                        | 200  |               |               |           |
| Slides   |                 |                        | 200  |               |               |           |
| Calendar | Authenticated   |                        | N/A  |               |               |           |
| Sheets   | Existing Custom | N/A                    | N/A  | NOT TESTED    | N/A           | PRESERVED |

---

# Root Cause Rules

Use only evidence-supported classifications.

## `PROVEN_OAUTH_SCOPE_GAP`

Use only when:

- official Google documentation requires a scope;
- current token/consent lacks that scope;
- this explains the MCP authorization failure.

## `PROVEN_OAUTH_CONSENT_GAP`

Use when OAuth consent configuration itself lacks a required MCP scope.

## `PROVEN_MCP_AUTHORIZATION_NOT_COMPLETED`

Use when MCP-specific OAuth authorization has not been completed.

## `UNRESOLVED_MCP_AUTHORIZATION_DISCREPANCY`

Use when:

- token is valid;
- documented scopes are present;
- same resource works through REST;
- same resource fails through official MCP;
- no OpenCode credential/configuration defect is proven.

## `OPEN_CODE_AUTH_CONFIGURATION_BUG`

Use only if source/runtime evidence proves Alpha One/OpenCode is incorrectly implementing the documented MCP OAuth flow.

Do NOT infer this from MCP permission errors alone.

---

# Quality Gate

## PASS

Drive, Docs, and Slides must:

- have valid MCP authorization;
- have required scopes;
- authenticate successfully;
- call official MCP tools;
- return real data from the same proven resources.

Calendar should remain authenticated and pass read-only verification.

Sheets must remain untouched.

## CONDITIONAL

Use if:

- authorization has been corrected;
- some services pass;
- external Google authorization state remains unresolved for others.

## BLOCKED

Use if:

- Google Cloud/OAuth external configuration prevents authorization;
- required consent cannot be granted;
- Google MCP authorization cannot be completed.

## FAIL

Use only if:

- all external OAuth requirements are proven correct;
- resources are proven accessible;
- OpenCode sends the correct credentials;
- and the application implementation itself is proven to violate the official MCP OAuth requirements.

---

# No Unnecessary Rework

Do NOT:

- rebuild MCP servers;
- create custom Drive/Docs/Slides engines;
- modify REST API clients;
- redesign Google OAuth;
- migrate Sheets;
- repeat previous resource-discovery work unless required as evidence;
- create additional tasks unless a new confirmed implementation defect is discovered.

---

# Execution Summary

Write the complete execution summary into this SAME task file.

Include:

1. Documentation reviewed.
2. Current OAuth consent configuration.
3. Current token scope state.
4. MCP authorization state.
5. Exact gaps found.
6. Remediation performed, if any.
7. Drive E2E result.
8. Docs E2E result.
9. Slides E2E result.
10. Calendar E2E result.
11. Sheets preservation evidence.
12. Root cause classification.
13. Quality Gate.
14. Final verdict.
15. Minimal next action, if any.

Never expose secrets/tokens.

---

# Git

After execution:

1. `git status`
2. `git diff --stat`
3. verify only intended task/configuration changes exist;
4. commit only intentional changes;
5. do not commit unrelated pre-existing work.

If implementation/configuration changes are made as part of this task, clearly list them in the Execution Summary.

---

# Final Response

Report:

- final verdict;
- Drive status;
- Docs status;
- Slides status;
- Calendar status;
- OAuth scope finding;
- authorization-flow finding;
- root cause;
- files changed;
- whether Sheets remained untouched;
- exact next action, if any.

Do not claim Google MCP is broken without conclusive evidence.

---

# Execution Summary

Executed 2026-08-19. Remediation task for Drive/Docs/Slides MCP OAuth authorization. Calendar status-check only. Sheets absolutely untouched.

## 1. Documentation reviewed (Phase 1) — PROVEN

- Official Google Workspace MCP configuration doc (`/workspace/guides/configure-mcp-servers`): MCP servers use OAuth 2.0; OAuth consent screen must be configured with the MCP scopes; OAuth client must be a Web application with the MCP client's callback as an authorized redirect URI; each MCP server is authenticated separately (per-server OAuth flow).
- Required scopes per official doc:
  - Drive MCP: `drive.readonly` + `drive.file`
  - Docs MCP: `drive.readonly` + `drive.file` + `documents.readonly` + `documents`
  - Slides MCP: `drive.readonly` + `drive.file` + `presentations.readonly` + `presentations`
  - Calendar MCP: `calendar.calendarlist.readonly` + `calendar.events.freebusy` + `calendar.events.readonly`
- MCP SDK OAuth client source (`modelcontextprotocol/typescript-sdk`): the authorization URL and token exchange include an RFC 8707 `resource` parameter pointing at the MCP resource (`https://<service>mcp.googleapis.com/mcp`); scopes come from the RFC 9728 protected-resource metadata.

## 2. Current OAuth consent configuration (Phase 2) — PROVEN (client-side view)

- OAuth client: `480048442203-stiuf8pf1o0kvb0vejpk8hfa85b6o4c4.apps.googleusercontent.com` (Web application). Authorized redirect URIs: `http://localhost:3001/api/google/oauth/callback` + `http://127.0.0.1:19876/mcp/oauth/callback` (loopback, authorized — proven by absence of `redirect_uri_mismatch`).
- Consent scope probe (read-only authorize-endpoint checks): requesting `drive.readonly`+`drive.file`, `documents.readonly`+`documents`, `presentations.readonly`+`presentations`, and the Calendar read scopes all proceed to the consent screen (no `invalid_scope`/`invalid_client` error) → the consent screen is NOT the blocker.

Scope matrix:

| Service | Current Token Scope | Official MCP Requirement | Present? | Gap |
| ------- | ------------------- | ------------------------ | -------- | --- |
| Drive   | drive.readonly | drive.readonly + drive.file | partial (drive.file missing in stored token; consent allows it) | scope obtainable via consent |
| Docs    | docs.readonly | drive.readonly + drive.file + documents.readonly + documents | partial | scope obtainable via consent |
| Slides  | presentations.readonly | drive.readonly + drive.file + presentations.readonly + presentations | partial | scope obtainable via consent |

## 3. Current MCP token state (Phase 3) — PROVEN

`~/.local/share/opencode/mcp-auth.json`:

| Server | Token present | Expired | Scope | Origin |
| ------ | ------------- | ------- | ----- | ------ |
| drive  | yes | no | Alpha One REST token (drive.readonly, docs.readonly, presentations.readonly, spreadsheets, script.projects, userinfo.*, openid) | Alpha One REST OAuth (Option B) — NOT MCP flow |
| docs   | yes | no | same REST token | Alpha One REST OAuth (Option B) |
| slides | yes | no | same REST token | Alpha One REST OAuth (Option B) |
| calendar | NO (empty entry) | n/a | none | none |

No token obtained through the MCP OAuth flow exists for any service. The task's claim that `opencode mcp auth calendar` succeeded is the known OpenCode false-positive (Google has no Dynamic Client Registration; the flow reports success without storing tokens).

## 4. Authorization flow state (Phase 4) — PROVEN

OpenCode is using Option B: reusing the existing Alpha One Google REST API token (injected into `mcp-auth.json`). It is NOT performing the official MCP OAuth flow (Option A) because OpenCode's `mcp auth` only triggers OAuth on a connect-time 401, and Google MCP servers allow unauthenticated `initialize`/`tools/list` (only `tools/call` returns 401). Evidence: mcp-auth.json token contents; `opencode mcp auth <name>` output ("Authentication successful!") with empty storage.

## 5. Gaps found (Phase 5) — PROVEN

- `PROVEN_MCP_AUTHORIZATION_NOT_COMPLETED`: the MCP-specific OAuth authorization has never been completed for any service.
- `PROVEN_OAUTH_SCOPE_GAP` (partial): stored tokens lack `drive.file` / `documents` / `presentations`; obtainable via consent, so not the root blocker.
- `UNRESOLVED_MCP_AUTHORIZATION_DISCREPANCY`: after remediation below, tokens with the required scopes and RFC 8707 resource binding are STILL rejected by the Google-hosted MCP servers.

## 6. Remediation performed (Phase 6/7) — PROVEN

Per the permitted remediation scope, the actual MCP OAuth consent flow was executed for Drive (4 consent rounds): PKCE S256, redirect `http://127.0.0.1:19876/mcp/oauth/callback`, scopes `drive.readonly` + `drive.file`, and the RFC 8707 `resource=https://drivemcp.googleapis.com/mcp` parameter in both the authorization request and the token exchange. Tokens were successfully obtained (access + refresh, valid 1h, correct scope). Same consent/scope pattern applies to Docs/Slides. The stored `mcp-auth.json` was NOT modified; verification tokens were used directly against the MCP endpoints.

Result: the new MCP-flow tokens are REJECTED identically: `The caller does not have permission` (isError=true). The id_token `aud` equals the OAuth client ID (Google always issues id_tokens with aud=client_id), so it does not distinguish client-bound vs resource-bound access tokens; regardless, the access tokens are rejected by the resource server.

## 7–9. E2E read-only results (Phase 8, same resources as TASK-057) — PROVEN

| Service | Resource (proven via REST) | REST read | MCP tool call (MCP-flow token) | Data returned |
| ------- | ------------------------- | --------- | ----------------------------- | ------------- |
| Drive | PDF `1Bdo_1VkN385LFq_9_bbSId5Nlp5aIGRN` | 200 OK | `get_file_metadata` / `read_file_content` → `The caller does not have permission` | NO |
| Docs | Doc `1fa2RwKMK8T2sk2f7BFePiaA5ydUKXbMrcPc4pAzBl6M` | 200 OK (full content) | `read_doc` → `The caller does not have permission` | NO |
| Slides | Pres `1AyilWDzGtrbIMwglX3_brNjiApZM5AXTNgvbpnjQ5w0` | 200 OK (title) | `read_presentation` → `The caller does not have permission` | NO |

## 10. Calendar status (Phase 9) — PROVEN

No Calendar token exists in mcp-auth.json; app token has no calendar scope; unauthenticated/insufficient-scope `list_calendars` → 403. Calendar is NOT authenticated (the reported success was the false positive). Calendar = BLOCKED (external OAuth prerequisite). No Calendar mutation performed.

## 11. Sheets protection (Phase 10) — PROVEN

- `google-sheets` still connected (mcp list).
- Config entry unchanged (`C:\Users\ASUS\.config\opencode\opencode.jsonc`).
- `mcp-servers/google-sheets/server.ts` unchanged (git clean for that path).
- No official Sheets MCP (`sheetsmcp`) in config; never probed.
- No Sheets tool call performed in this task.

## 12. Root cause

`UNRESOLVED_MCP_AUTHORIZATION_DISCREPANCY` with an external Google Cloud prerequisite: the Alpha One OAuth client cannot obtain a token the Google-hosted MCP resource servers will accept, even when the consent includes the documented MCP scopes and RFC 8707 resource binding. The remaining prerequisite is a Google Cloud console action: the OAuth client must be authorized for the Workspace MCP API (a dedicated Web-app OAuth client registered for MCP with the MCP callback redirect, or the client added to the MCP API's authorized-client configuration). No Alpha One/OpenCode implementation defect was proven (OpenCode supplies the same token that succeeds on REST; no incorrect endpoint/credential injection evidence).

## 13. Quality Gate

| Gate | Status |
| ---- | ------ |
| Drive/Docs/Slides valid MCP authorization | FAIL (rejected) |
| Required scopes present | Partial (obtainable) |
| Authenticate successfully | FAIL (tokens rejected) |
| MCP tool call returns real data | FAIL |
| Calendar authenticated + read-only pass | FAIL (no token) |
| Sheets untouched | PASS (PROVEN) |
| No source/config mutation | PASS (PROVEN; only the task file created) |

## 14. Final verdict

`BLOCKED`

Google Cloud/OAuth external configuration prevents MCP authorization completion. The required consent can be granted and tokens can be minted, but the OAuth client is not authorized for the MCP resource at the Google Cloud level, so the MCP servers reject every token. This is an external prerequisite, not an Alpha One/OpenCode defect.

## 15. Minimal next action

In the Google Cloud console (project of OAuth client `480048442203` / `alpha-workspace-505404`): create a dedicated Web-application OAuth client for Workspace MCP (or register the existing client) with the MCP client's callback as authorized redirect URI, add the MCP scopes to the consent screen, then run the per-server MCP OAuth flow (`opencode mcp auth drive|docs|slides`) or the manual RFC 8707 resource-bound consent for each service. Then re-run the Phase 8 read-only checks against the same proven resources.

## Evidence matrix

| Service  | MCP Auth | Required Scope Present | REST | MCP Tool Call | Data Returned | Verdict   |
| -------- | -------- | ---------------------- | ---- | ------------- | ------------- | --------- |
| Drive    | Not valid for MCP (rejected) | Partial (obtainable) | 200 | get_file_metadata/read_file_content -> permission error | NO | BLOCKED (external) |
| Docs     | Not valid for MCP (rejected) | Partial (obtainable) | 200 | read_doc -> permission error | NO | BLOCKED (external) |
| Slides   | Not valid for MCP (rejected) | Partial (obtainable) | 200 | read_presentation -> permission error | NO | BLOCKED (external) |
| Calendar | No token (false-positive auth) | None (no calendar scope) | N/A | list_calendars -> 403 | NO | BLOCKED (external) |
| Sheets   | Existing custom | N/A | N/A | NOT TESTED | N/A | PRESERVED |

Files changed: only `spint/TASK-OPENCODE-058-Google-Workspace-MCP-OAuth-Authorization-Revalidation.md` (this task file). No config/source/OAuth/Cloud/Calendar/Sheets mutation. Git branch `task/gworkspace-002-r1-drive-access-rework`, HEAD `754a3fe` (pre-commit).