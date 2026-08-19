# TASK-OPENCODE-057 — Google Workspace MCP Resource Access Revalidation

## Objective

Melakukan audit-only re-validation terhadap official Google Workspace MCP yang saat ini terhubung di OpenCode setelah E2E smoke test menunjukkan:

- Drive MCP tool-call reachable tetapi permission denied.
- Docs MCP tool-call reachable tetapi resource yang diuji menghasilkan REST 404.
- Slides MCP tool-call reachable tetapi resource yang diuji menghasilkan REST 404.
- Calendar MCP terdaftar tetapi OAuth token belum tersedia.

Tujuan utama task ini adalah membedakan secara evidence-first:

1. masalah resource/test-data,
2. masalah OAuth/token,
3. masalah permission/access,
4. masalah official Google MCP server,
5. atau masalah Alpha One/OpenCode runtime.

Task ini AUDIT-ONLY.

---

# Critical Existing Constraint

## Google Sheets MUST NOT be touched

`google-sheets` adalah custom Alpha One MCP dan harus tetap seperti sekarang.

Dilarang:

- mengubah konfigurasi Sheets
- mengganti custom Sheets dengan official Sheets MCP
- mengubah source `mcp-servers/google-sheets/server.ts`
- mengubah OAuth/scopes khusus Sheets
- melakukan smoke test terhadap Sheets
- melakukan redesign/refactor Sheets MCP

Scope task ini:

- `drive`
- `docs`
- `slides`
- `calendar`

---

# Current Baseline

Current expected MCP registration:

- `google-sheets` — custom local MCP
- `drive` — official Google remote MCP
- `docs` — official Google remote MCP
- `slides` — official Google remote MCP
- `calendar` — official Google remote MCP

Previous smoke test established:

### Drive

Agent successfully reached Drive MCP tools, but tool calls returned:

`The caller does not have permission`

At the same time, the OAuth token used for REST verification successfully accessed Google Drive REST API and returned real files.

Therefore the previous smoke test does NOT prove an MCP server defect.

### Docs

Agent called:

`docs_read_doc`

The tested document ID returned MCP permission failure.

Direct Docs REST API returned:

`404 Not Found`

Therefore resource accessibility/identity was not proven.

### Slides

Agent called:

`slides_read_presentation`

The tested presentation ID returned MCP permission failure.

Direct Slides REST API returned:

`404 Not Found`

Therefore resource accessibility/identity was not proven.

### Calendar

Calendar MCP is registered and reachable.

Previous smoke test returned:

`Unauthorized`

because `mcp-auth.json` did not contain a Calendar access token.

---

# Scope

Audit ONLY:

1. Current MCP baseline.
2. Current OAuth/token state.
3. Drive resource discovery using the authenticated Google account.
4. Drive MCP access to a resource proven accessible through Drive REST.
5. Docs resource discovery using the same authenticated account.
6. Docs MCP access to a resource proven accessible.
7. Slides resource discovery using the same authenticated account.
8. Slides MCP access to a resource proven accessible.
9. Calendar OAuth state.
10. Calendar MCP read-only access if OAuth is already available.
11. Whether failures are caused by resource identity/access or MCP/runtime.
12. Whether any evidence exists that official Google MCP itself is defective.
13. Protection of the existing custom Sheets MCP.

Do NOT implement fixes.

---

# Mutation Guard

This task is strictly AUDIT-ONLY.

PROHIBITED:

- modifying application source code
- modifying MCP configuration
- modifying OAuth client configuration
- changing Google Cloud configuration
- changing OAuth scopes
- installing MCP packages
- replacing MCP servers
- modifying `google-sheets`
- creating/updating/deleting Drive files
- modifying/deleting Docs
- modifying/deleting Slides
- creating/updating/deleting Calendar events
- changing calendar data
- changing permissions
- changing sharing settings
- committing application/config changes

If a required verification needs mutation:

STOP.

Classify the blocker instead.

---

# Phase 0 — Baseline

Capture:

- current git branch
- current HEAD
- git status
- current MCP configuration source
- `opencode mcp list`

Verify:

- Drive connected
- Docs connected
- Slides connected
- Calendar registered/connected
- Sheets remains present and unchanged

Do not modify anything.

---

# Phase 1 — OAuth / Identity Verification

Identify the authenticated Google account used by the existing MCP/REST verification.

Record:

- Google account/email where safely available
- OAuth client identity
- access-token presence
- token expiration
- actual scopes

Determine separately:

### Drive

Does the token have the required Drive scope?

### Docs

Does the token have the required Docs scope?

### Slides

Does the token have the required Presentations scope?

### Calendar

Does a Calendar token currently exist for MCP?

Classify each:

- PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

Do not modify scopes.

---

# Phase 2 — Drive Resource Discovery

Do NOT reuse the previous arbitrary Drive file ID.

Using the authenticated Google account and read-only Drive REST API:

1. list/search accessible files.
2. identify at least one real file returned by the API.
3. capture:
   - file ID
   - name
   - MIME type
   - accessibility evidence.

Prefer a simple, known-safe file.

The selected resource MUST be proven to exist and be accessible by the same Google account used for the MCP verification.

Do not mutate the file.

---

# Phase 3 — Drive MCP Re-validation

Using the exact Drive file proven accessible in Phase 2:

Call the corresponding official Drive MCP read-only tool.

Examples where available:

- `drive_list_recent_files`
- `drive_search_files`
- `drive_get_file_metadata`

Do not create/update/delete files.

The important comparison is:

`Google Drive REST API → resource succeeds`

versus:

`Official Drive MCP → same resource`

Record exact result.

### Interpretation

If REST and MCP both succeed:

`PASS — previous failure was resource/test selection or transient state.`

If REST succeeds for the same resource but MCP fails with permission:

`UNRESOLVED MCP AUTHORIZATION DISCREPANCY`

Do NOT call it an Alpha One bug unless application evidence proves the runtime is supplying incorrect credentials.

If MCP succeeds with the same resource:

previous Drive failure is classified as:

`TEST_RESOURCE_OR_CONTEXT_ISSUE`

---

# Phase 4 — Docs Resource Discovery

Do NOT reuse the previous Docs document ID.

Use the authenticated Drive account to discover an actual accessible Google Docs document.

Preferred method:

- Drive REST API search/list
- filter for Google Docs MIME type

Expected MIME type:

`application/vnd.google-apps.document`

Select a document that is actually returned by the authenticated account.

Capture:

- document ID
- document name
- MIME type
- REST accessibility result

Then perform a direct Google Docs REST read using that exact document ID.

Do not modify the document.

---

# Phase 5 — Docs MCP Re-validation

Using the exact Docs document proven accessible in Phase 4:

Call:

`docs_read_doc`

or the corresponding official Docs MCP read-only tool actually exposed by the server.

Record:

- tool name
- request
- response
- returned document metadata/content
- exact error if failure occurs

### Interpretation

If:

`Drive REST → found`

and

`Docs REST → succeeds`

and

`Docs MCP → succeeds`

then previous Docs failure was:

`TEST_RESOURCE_ISSUE`

If:

`Drive REST → found`

and

`Docs REST → succeeds`

but:

`Docs MCP → permission denied`

then classify:

`MCP_AUTHORIZATION_DISCREPANCY`

Do NOT classify as Alpha One application bug without evidence that OpenCode supplied incorrect credentials.

---

# Phase 6 — Slides Resource Discovery

Do NOT reuse the previous Slides presentation ID.

Use the authenticated Drive account to discover an actual accessible Google Slides presentation.

Preferred method:

- Drive REST API search/list
- filter for Google Slides MIME type

Expected MIME type:

`application/vnd.google-apps.presentation`

Capture:

- presentation ID
- presentation name
- MIME type
- REST accessibility result

Then perform a direct Google Slides REST read using that exact presentation ID.

Do not modify the presentation.

---

# Phase 7 — Slides MCP Re-validation

Using the exact Slides presentation proven accessible in Phase 6:

Call:

`slides_read_presentation`

or the corresponding official Slides MCP read-only tool actually exposed by the server.

Record:

- tool name
- request
- response
- returned presentation metadata
- exact error if failure occurs

### Interpretation

If REST and MCP both succeed:

`PASS`

If REST succeeds but MCP fails permission:

`MCP_AUTHORIZATION_DISCREPANCY`

Do not classify as Alpha One bug without evidence of incorrect credential injection.

---

# Phase 8 — Calendar OAuth Re-validation

Check whether Calendar OAuth has now been completed.

Inspect only read-only authentication state.

Determine:

- whether Calendar token exists
- whether Calendar scope exists
- whether token is valid
- whether token belongs to the expected Google account

If no Calendar token exists:

classify:

`BLOCKED_EXTERNAL_PREREQUISITE`

Do not attempt to modify OAuth configuration.

If a Calendar token exists, perform only read-only calls:

1. `list_calendars`
2. `list_events` or `search_events`

Do NOT:

- create events
- update events
- delete events
- respond to events

---

# Phase 9 — OpenCode Runtime Consistency

Determine whether OpenCode is actually using the expected MCP configuration and OAuth credentials.

For each official MCP:

- Drive
- Docs
- Slides
- Calendar

verify:

1. registered endpoint
2. OAuth configuration
3. runtime MCP connection
4. tool discovery
5. tool call
6. returned data

The goal is to distinguish:

`OpenCode configuration problem`

from:

`Google OAuth problem`

from:

`Google-hosted MCP authorization/resource problem`

from:

`invalid test resource`

---

# Phase 10 — Sheets Protection Verification

Verify that this audit did not alter:

`google-sheets`

Evidence should include:

- configuration unchanged
- server source unchanged
- no official Sheets MCP registered
- no Sheets tool call performed

Classify:

`PROVEN`

---

# Evidence Matrix

Produce this table:

| MCP | Resource Proven Accessible | REST Read | MCP Tool Call | Data Returned | Classification | Verdict |
|---|---|---|---|---|---|---|
| Drive | | | | | | |
| Docs | | | | | | |
| Slides | | | | | | |
| Calendar | N/A | N/A | | | | |

For Drive/Docs/Slides, the SAME resource identity must be used for REST and MCP comparison.

This is mandatory.

---

# Root Cause Classification

Use only evidence-supported classifications.

Allowed classifications:

### `TEST_RESOURCE_ISSUE`

Use when the previous test resource was invalid/inaccessible but a valid accessible resource succeeds.

### `OAUTH_SCOPE_ISSUE`

Use when the token demonstrably lacks the required scope.

### `OAUTH_TOKEN_MISSING`

Use when required MCP token does not exist.

### `MCP_AUTHORIZATION_DISCREPANCY`

Use when:

- same account
- same valid token
- same proven accessible resource
- REST succeeds
- official MCP fails permission

### `OPEN_CODE_CONFIGURATION_ISSUE`

Use only if evidence proves OpenCode supplies incorrect endpoint/credentials/configuration.

### `GOOGLE_MCP_SERVER_FAILURE`

Use only if the same valid credentials and proven accessible resource consistently fail at the Google-hosted MCP server and sufficient evidence rules out resource and OAuth problems.

### `UNKNOWN`

Use when evidence is insufficient.

Do NOT guess.

---

# Quality Gate

## PASS

For a service:

- resource is proven accessible
- REST read succeeds where applicable
- MCP tool call succeeds
- real data is returned

Overall task can be PASS only if the audit conclusively establishes the state of every in-scope service and no unresolved implementation defect remains.

## CONDITIONAL

Use if:

- architecture is valid,
- some services are proven,
- but external OAuth/resource/access prerequisites remain unresolved.

## BLOCKED

Use if required external authentication/access prevents meaningful verification.

## FAIL

Use only if Alpha One/OpenCode implementation is proven to be the cause despite valid external prerequisites.

Do NOT use FAIL for Google-hosted MCP permission errors unless application-side cause is proven.

---

# Required Evidence

Execution Summary MUST include:

- git branch
- HEAD commit
- git status
- MCP configuration source
- `opencode mcp list`
- authenticated account evidence
- OAuth scopes
- Drive resource discovery evidence
- Drive REST result
- Drive MCP result
- Docs resource discovery evidence
- Docs REST result
- Docs MCP result
- Slides resource discovery evidence
- Slides REST result
- Slides MCP result
- Calendar OAuth state
- Calendar read-only result if authenticated
- exact tools used
- exact errors
- root-cause classification
- Sheets protection verification
- files inspected
- commands used
- final verdict

Clearly distinguish:

- PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

---

# Execution Summary

After the audit is complete, write the complete Execution Summary into this SAME task file.

Do not create a separate summary file.

Include:

1. Scope executed.
2. Evidence collected.
3. Resource identities tested.
4. REST vs MCP comparison.
5. OAuth/token findings.
6. Root cause for each service.
7. Calendar status.
8. Sheets protection confirmation.
9. Quality Gate.
10. Final verdict.
11. Minimal next action, if any.

---

# Git

This task is AUDIT-ONLY.

Before any commit:

1. Verify `git diff --stat`.
2. Verify only the intended task file changed.
3. Verify `git status`.
4. Commit ONLY the task file.
5. Do not commit application/config/source changes.
6. Do not commit unrelated pre-existing changes.

If repository policy says Git is not yet part of execution, leave the task file uncommitted and report its working-tree status instead.

Do not alter unrelated files.

---

# Final Response Required

Report:

- final verdict
- Drive result
- Docs result
- Slides result
- Calendar result
- root cause classification per service
- whether official Google MCP has actually been proven usable
- whether any Alpha One/OpenCode bug was proven
- whether Sheets remained untouched
- next minimal action

---

# Execution Summary

Audit executed 2026-08-19. Strictly audit-only: no source/config/OAuth/Google Cloud/Drive/Docs/Slides/Calendar mutation performed. No `google-sheets` tool call performed. No commit of app/config changes.

## 1. Scope executed

Phases 0–10. Read-only REST + MCP probes only. For Drive/Docs/Slides the SAME resource identity was used for the REST and MCP comparison (mandatory per task). Calendar inspected for OAuth state only.

## 2. Baseline (Phase 0) — PROVEN

- Git branch: `task/gworkspace-002-r1-drive-access-rework`
- HEAD commit: `d80918e` (TASK-OPENCODE-056 audit)
- `git status`: working tree contains many PRE-EXISTING unrelated changes; the ONLY change produced by this audit is the new task file `spint/TASK-OPENCODE-057-Google-Workspace-MCP-Resource-Access-Revalidation.md` (untracked).
- MCP config source of truth: `C:\Users\ASUS\.config\opencode\opencode.jsonc` (global; no local config exists).
- `opencode mcp list` baseline:

```
✓ google-sheets connected   (local, npx tsx mcp-servers/google-sheets/server.ts)
✓ drive connected (OAuth)   https://drivemcp.googleapis.com/mcp/v1
✓ docs connected (OAuth)    https://docsmcp.googleapis.com/mcp/v1
✓ slides connected (OAuth)  https://slidesmcp.googleapis.com/mcp/v1
✓ calendar connected        https://calendarmcp.googleapis.com/mcp/v1
5 server(s)
```

Calendar is registered in config (added externally between TASK-056 and TASK-057; not added by this audit). `google-sheets` config entry unchanged.

## 3. OAuth / identity (Phase 1) — PROVEN

- Account: `kanalconsultant.indonesia@gmail.com` (from `.alpha/google/connections.json`, user `local-user`).
- OAuth client: `480048442203-stiuf8pf1o0kvb0vejpk8hfa85b6o4c4.apps.googleusercontent.com` (Web application; redirects `http://localhost:3001/api/google/oauth/callback` + MCP loopback `http://127.0.0.1:19876/mcp/oauth/callback`).
- `~/.local/share/opencode/mcp-auth.json` token state:
  - `drive`: tokens present (access+refresh, not expired) — scope includes `drive.readonly`
  - `docs`: tokens present (not expired) — scope includes `docs.readonly`
  - `slides`: tokens present (not expired) — scope includes `presentations.readonly`
  - `calendar`: entry exists but EMPTY (no tokens)
- These stored MCP tokens are the Alpha One application token (refreshed from `connections.json`), same token used for the REST verification.

Per-service scope classification:
- Drive: token HAS `drive.readonly`; `drive.readonly` is an accepted scope for every Drive MCP tool (PROVEN via per-tool RFC 9728 resource metadata). → scope PRESENT.
- Docs: token HAS `docs.readonly`; accepted by `read_doc` (PROVEN from resource metadata). → scope PRESENT.
- Slides: token HAS `presentations.readonly`; accepted by `read_presentation` (PROVEN from resource metadata). → scope PRESENT.
- Calendar: NO calendar token and NO calendar scope (token scopes: drive.readonly, docs.readonly, presentations.readonly, spreadsheets, script.projects, userinfo.email/profile, openid). → OAUTH_TOKEN_MISSING.

## 4. Resource identities tested (Phases 2, 4, 6) — PROVEN

Discovered via authenticated Drive REST API (not reused from previous smoke test):

| Resource | ID | Name | MIME | Drive REST accessibility |
|---|---|---|---|---|
| Drive file | `1Bdo_1VkN385LFq_9_bbSId5Nlp5aIGRN` | Booni Baby - Weekly Closing - 16 Aug 2026.pdf | application/pdf | GET /drive/v3/files/{id} → 200 (name+mime returned) |
| Docs doc | `1fa2RwKMK8T2sk2f7BFePiaA5ydUKXbMrcPc4pAzBl6M` | Addendum SPK Kanal - Doni - For U Tissue (1 Aug 2026 - 31 Aug 2026) | application/vnd.google-apps.document | found via Drive search; GET /drive/v3/files/{id} → 200 |
| Slides pres | `1AyilWDzGtrbIMwglX3_brNjiApZM5AXTNgvbpnjQ5w0` | Trekkers Indonesia - Kanal Offering Letter (NVR) | application/vnd.google-apps.presentation | found via Drive search; GET /drive/v3/files/{id} → 200 |

## 5. REST vs MCP comparison (Phases 3, 5, 7) — PROVEN

| Service | REST result | MCP tool(s) called (same resource, same token) | MCP result |
|---|---|---|---|
| Drive | GET /drive/v3/files/{pdfId} → 200 OK (metadata) | `drive_get_file_metadata` (fileId), `drive_read_file_content` (fileId) | `The caller does not have permission` (isError=true, HTTP 200 envelope) |
| Docs | GET /docs/v1/documents/{docId} → 200 OK (title + body text returned) | `docs_read_doc` (documentId) | `The caller does not have permission` (isError=true) |
| Slides | GET /slides/v1/presentations/{presId} → 200 OK (title returned) | `slides_read_presentation` (presentationId) | `The caller does not have permission` (isError=true) |

Exact tools used (verified present via live `tools/list`):
- Drive: `get_file_metadata` (required fileId), `read_file_content` (required fileId), `search_files`, `list_recent_files` (schemas captured)
- Docs: `read_doc`, `update_doc`
- Slides: `read_presentation`, `update_presentation`
- Calendar: `list_events`, `get_event`, `list_calendars`, `suggest_time`, `create_event`, `update_event`, `delete_event`, `respond_to_event`, `search_events`

## 6. OAuth/token findings (Phase 8)

- Calendar MCP token: DOES NOT EXIST (mcp-auth.json `calendar` entry empty). PROVEN.
- Calendar MCP unauthenticated `tools/call list_calendars` → HTTP 401 Unauthorized. PROVEN.
- App token has NO calendar scope. PROVEN.
- No Calendar read-only call was possible → classified `OAUTH_TOKEN_MISSING` / `BLOCKED_EXTERNAL_PREREQUISITE`. No OAuth modification attempted.

## 7. Root cause per service

- Drive: `MCP_AUTHORIZATION_DISCREPANCY` — same account, same valid token (with accepted scope `drive.readonly`), same proven-accessible resource; REST succeeds; official Drive MCP fails with permission. Not an Alpha One bug: the token supplied to MCP is byte-identical to the token that succeeds on REST; presentation (Bearer header) is identical. The Google-hosted MCP resource server rejects the app's plain OAuth token despite valid scopes.
- Docs: `MCP_AUTHORIZATION_DISCREPANCY` — same pattern (token has accepted `docs.readonly`; REST succeeds; MCP fails permission).
- Slides: `MCP_AUTHORIZATION_DISCREPANCY` — same pattern (token has accepted `presentations.readonly`; REST succeeds; MCP fails permission).
- Calendar: `OAUTH_TOKEN_MISSING` → `BLOCKED_EXTERNAL_PREREQUISITE` (no token, no calendar scope).

The consistent failure across three independent Google-hosted MCP servers with valid-scope tokens strongly indicates the MCP authorization model requires a token obtained through the MCP-specific OAuth flow (or an OAuth client explicitly authorized for the MCP API), which the Alpha One plain OAuth consent does not produce. This is an external OAuth prerequisite, NOT an application defect.

## 8. OpenCode runtime consistency (Phase 9) — PROVEN/DERIVED

- Registered endpoints: config matches the official endpoints for drive/docs/slides/calendar (PROVEN).
- OAuth config: oauth blocks present with env-referenced `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (PROVEN).
- Runtime connection: `opencode mcp list` shows all connected (PROVEN).
- Tool discovery: `tools/list` works on all four (PROVEN).
- Tool call: returns the errors in section 5 (PROVEN).
- Credentials supplied: opencode reads the same app token from `mcp-auth.json` that succeeds on REST (DERIVED from file inspection + identical REST/MCP results). No evidence of incorrect endpoint or credential injection → NOT an `OPEN_CODE_CONFIGURATION_ISSUE`.

## 9. Sheets protection (Phase 10) — PROVEN

- Config entry `google-sheets` unchanged (PROVEN).
- `mcp-servers/google-sheets/server.ts` unchanged (git status clean for that path) (PROVEN).
- No `sheetsmcp`/official Sheets MCP anywhere in config (PROVEN).
- No Sheets tool call performed in this audit (PROVEN).
- Custom Sheets toolset intact (11 tools: list_sheets, get_spreadsheet, read_range, read_ranges, write_range, write_ranges, write_formulas, append_rows, insert_dimension, create_sheet, update_spreadsheet).

## 10. Evidence matrix

| MCP | Resource Proven Accessible | REST Read | MCP Tool Call | Data Returned | Classification | Verdict |
|---|---|---|---|---|---|---|
| Drive | Yes — PDF `1Bdo_1VkN385LFq_9_bbSId5Nlp5aIGRN` | OK (200) | get_file_metadata / read_file_content → permission error | No | MCP_AUTHORIZATION_DISCREPANCY | NOT USABLE (external OAuth prereq) |
| Docs | Yes — Doc `1fa2RwKMK8T2sk2f7BFePiaA5ydUKXbMrcPc4pAzBl6M` | OK (200, content returned) | read_doc → permission error | No | MCP_AUTHORIZATION_DISCREPANCY | NOT USABLE (external OAuth prereq) |
| Slides | Yes — Pres `1AyilWDzGtrbIMwglX3_brNjiApZM5AXTNgvbpnjQ5w0` | OK (200, title returned) | read_presentation → permission error | No | MCP_AUTHORIZATION_DISCREPANCY | NOT USABLE (external OAuth prereq) |
| Calendar | N/A | N/A | list_calendars (no token) → HTTP 401 | No | OAUTH_TOKEN_MISSING (BLOCKED_EXTERNAL_PREREQUISITE) | BLOCKED |

## 11. Quality Gate

- Per-service PASS: none. Drive/Docs/Slides fail MCP data access with the current token (REST succeeds, MCP permission-denied). Calendar has no token.
- No unresolved Alpha One/OpenCode implementation defect proven.
- All in-scope services' state conclusively established.

## 12. Final verdict

`CONDITIONAL`

Architecture is valid and every in-scope service's state was conclusively established. All remaining gaps are external OAuth/authorization prerequisites: the Google-hosted MCP servers reject the Alpha One plain OAuth token for data access despite valid read scopes (Drive/Docs/Slides), and Calendar has no token at all. No Alpha One/OpenCode bug was proven; no evidence of incorrect credential injection.

## 13. Files inspected / commands used

Files inspected: `C:\Users\ASUS\.config\opencode\opencode.jsonc`, `~/.local/share/opencode/mcp-auth.json`, `.alpha/google/connections.json`, `.env` (keys only), `mcp-servers/google-sheets/server.ts` (tool names only), `spint/TASK-OPENCODE-057-...md` (this file).

Commands used (read-only): `git branch --show-current`, `git log --oneline`, `git status --short`, `opencode mcp list`, `Invoke-RestMethod`/`Invoke-WebRequest` to Drive/Docs/Slides/Calendar REST + MCP endpoints (`tools/list`, `tools/call`), RFC 9728 resource-metadata fetches, Drive search queries for `application/vnd.google-apps.document` / `...presentation`, `Select-String`/grep. No mutations performed.

## 14. Minimal next action

Complete the MCP-specific OAuth consent for the Alpha One OAuth client (add the MCP/calendar scopes to the consent screen and run the actual MCP OAuth flow — the 401-driven runtime flow or a proper consent with the MCP authorization), then re-run read-only MCP calls against the same proven-accessible resources above. This is an external Google OAuth/console prerequisite, not an Alpha One code change.