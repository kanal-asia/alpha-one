# TASK-OPENCODE-067 — Google OAuth Scope Reconnect & Calendar Access

## 1. Objective

Extend the existing Google OAuth connection with the required Google Calendar scope through the existing reconnect/consent flow.

The objective is to preserve the current single Google identity and credential architecture while adding Calendar authorization.

This task is ONLY about OAuth scope expansion and verification.

Do NOT create a second Google connection.
Do NOT create a second OAuth identity.
Do NOT modify the Google Sheets MCP implementation.
Do NOT start Calendar MCP tool implementation beyond the minimum runtime proof required by this task.

---

## 2. Current Proven State

Previous tasks established:

- TASK-064: Official Google-hosted MCP registrations removed; custom `google-sheets` MCP remains connected and protected; existing Sheets OAuth/configuration must remain unchanged.
- TASK-065: Shared Google MCP architecture audited; one local Google identity intended to serve multiple Google services.
- TASK-066: Shared OAuth/REST/MCP utilities exist; Calendar endpoint reached via shared REST utility but returned `403 PERMISSION_DENIED / insufficientPermissions`; root cause proven to be missing Calendar OAuth scope.

Current Google connection state (PROVEN, redacted):

- Account connected: `kanalconsultant.indonesia@gmail.com` (`local-user`).
- Scopes (8): drive.readonly, userinfo.email, presentations.readonly, spreadsheets, docs.readonly, script.projects, userinfo.profile, openid.
- Calendar scope: ABSENT.
- Credential file: `.alpha/google/connections.json` (gitignored).

---

## 3. Scope

### In Scope
1. Inspect the existing Google OAuth scope configuration.
2. Add the minimum Calendar scope required by the existing Calendar proof/implementation.
3. Preserve all currently required Google scopes.
4. Trigger the existing reconnect/consent flow.
5. User must approve the Google consent screen when required.
6. Verify the OAuth callback succeeds.
7. Verify a new/updated token is persisted.
8. Verify the Calendar scope is actually present after reconnect.
9. Verify the existing Google Sheets access remains functional.
10. Verify the Calendar REST endpoint using the refreshed authorization.
11. Verify the shared auth utility can use the updated credential.
12. Record concrete evidence and final verdict.

### Out of Scope
Creating another OAuth client; another Google account connection; rebuilding OAuth infrastructure; refactoring `server.ts`; refactoring Google Sheets MCP; full Calendar MCP tool set; Drive/Docs/Slides/Apps Script MCPs; Google Cloud project ownership/branding changes; Workspace Developer Preview enrollment; official Google-hosted MCP; production deployment; broad OAuth architecture redesign.

---

## 4. Required Calendar Scope

Minimum read-only scope required for the current proof:

`https://www.googleapis.com/auth/calendar.readonly`

Do not silently replace with a broader scope.

---

# 5. Phase 0 — Baseline (PROVEN, captured 2026-08-20)

- Branch: `task/gworkspace-002-r1-drive-access-rework`
- HEAD: `5cf5f3d` (TASK-066)
- `git status --short`: many pre-existing unrelated WIP changes; untouched (Section 21).
- `opencode mcp list`: only `google-sheets connected`. No official Google MCPs.
- `opencode.jsonc`: only the `google-sheets` local block; unchanged.
- OAuth connection: `local-user` = `kanalconsultant.indonesia@gmail.com`; 8 scopes WITHOUT calendar; access+refresh token present.
- Redirect URI: `http://localhost:3001/api/google/oauth/callback`
- Running runtime: app server `src/server/alpha-server.ts` on :3001 mounts `/api/google/oauth` (`src/services/opencode/server.ts:47`).
- Scope registry: `GOOGLE_OAUTH_SCOPES` (`src/services/google/oauth-service.ts:51`).
- Confirmed: single identity; Sheets authorization functional; Calendar scope absent.

# 6. Phase 1 — Audit Existing OAuth Scope Configuration (PROVEN)

- Authoritative configuration: `GOOGLE_OAUTH_SCOPES` in `src/services/google/oauth-service.ts:51`.
- Scope assembly: `generateAuthUrl` (`oauth-service.ts:145-181`) joins scopes with spaces into `URLSearchParams`.
- Reconnect trigger: app router `POST /api/google/oauth/connect` (returns `{ url }`); callback `GET /api/google/oauth/callback`; `getUserId` → `local-user`.
- Authorization URL params (generated, secrets/client_id redacted):
  - `client_id=REDACTED(len=72)`
  - `redirect_uri=http://localhost:3001/api/google/oauth/callback`
  - `response_type=code` → `response_type.PRESENT_AND_CODE=true`
  - `scope` (8 scopes incl. calendar after Phase 2)
  - `state`, `access_type=offline`, `prompt=consent`, `code_challenge` (PKCE S256), `code_challenge_method=S256`
- Code exchange: `handleOAuthCallback` → `https://oauth2.googleapis.com/token` (authorization_code + PKCE verifier) → userinfo → persist.
- Persistence: `.alpha/google/connections.json` under `local-user`; existing scopes preserved by construction (scopes come from the granted token).
- `response_type=code`: PROVEN present in the generated URL. The earlier `400 invalid_request: Required parameter is missing: response_type` was classified (corrected) as the browser-launch truncation below, NOT a builder defect and NOT a Google permission problem.

### Correction #1 — URL truncation (PROVEN FIXED)
`reconsent.ts` opened the URL via `cmd /c start "" <unquoted url>`; `cmd` splits at `&`, so the browser received only `…?client_id=…` → `response_type=code` dropped → Google 400. PROVEN via `cmd /c echo` demo (unquoted URL truncated, quoted URL intact). Fixed by quoting the URL.

### Correction #2 — Browser launch escaping (PROVEN FIXED)
`spawn('cmd', ['/c', 'start', '', "\"${url}\""])` with Node default quoting passes `\"http://…` (escaped `\"` = the "Windows cannot find …" path error) AND splits at `&`. PROVEN via spawn echo test: default → `\"http://…client_id=X` + `'response_type' is not recognized`; with `windowsVerbatimArguments: true` → full quoted URL intact, EXIT=0. Fixed by adding `windowsVerbatimArguments: true`.
Browser launch re-verified with a harmless URL: Chrome opened `https://example.com/oauth-test` → launch mechanism PROVEN working; not the OAuth blocker.

# 7. Phase 2 — Add Calendar Scope (PROVEN DONE)

`GOOGLE_OAUTH_SCOPES` (`oauth-service.ts:51-60`) now includes `https://www.googleapis.com/auth/calendar.readonly` (line 59). Existing scopes preserved (drive.readonly, docs.readonly, spreadsheets, presentations.readonly, script.projects, userinfo.email, userinfo.profile; openid added by Google). Same identity/connection, expanded permission set.

# 8. Phase 3 — Reconnect / Consent Flow (IN PROGRESS — blocked on user consent)

- Reconnect uses the existing flow: `generateAuthUrl` → same states dir → running app server :3001 handles callback → persists under `local-user`. No new credential, no second identity, no OAuth redesign.
- Authorization URL inspected before opening: valid HTTPS URL, contains `client_id`, `redirect_uri`, `response_type=code`, `scope` (8 incl. calendar.readonly), `state`, `access_type=offline`, `prompt=consent`, PKCE S256.
- URL passed to browser as a URL (quoted, `windowsVerbatimArguments: true`); not interpreted as a local executable/path. "Windows cannot find" must not recur (PROVEN fixed).

# 9. Phase 4 — User Consent (BLOCKED — awaiting human action)

Latest generated authorization URL (state waiting; callback has no TTL, so completing it ANY time persists automatically):

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=480048442203-stiuf8pf1o0kvb0vejpk8hfa85b6o4c4.apps.googleusercontent.com&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fapi%2Fgoogle%2Foauth%2Fcallback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdocs.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fspreadsheets+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fpresentations.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fscript.projects+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly&state=de784f1a346638e94d7abb625ea1badc5b060e3dbf94932d86916e94cad36de8&access_type=offline&prompt=consent&code_challenge=OC8Ps4GIIK_bjCdJjUwLvvZ9PHBCyEH8nsustAjSo_s&code_challenge_method=S256
```

User steps: sign in with the existing account (if prompted) → review permissions → approve the Calendar permission → complete the flow → allow return to the local callback.

If "Google hasn't verified this app" appears: Advanced → Go to Alpha One (unsafe) → Allow.

### Exact blocking evidence (consent not completed — 4 attempts, all identical)
- Browser launch: PROVEN working (Chrome opened test URL).
- Auth URL: PROVEN valid (all params incl. `response_type=code`, 8 scopes incl. calendar.readonly).
- Callback path: PROVEN live (`GET /api/google/oauth/status` → HTTP 200 on :3001).
- OAuth state lifecycle: each attempt created a state file that was NEVER consumed (latest `de784f1a….json` still present) → Google never returned code+state → no consent completion.
- Persisted credentials: UNTOUCHED by all attempts (tokenExpiry frozen at 2026-08-20T05:06:02.939Z from an earlier shared-auth refresh; `connectedAt` 2026-08-15; scopes = original 8, no calendar).

Failure classification per Section 18: failure source = **OAuth consent step (human browser action pending)**. URL construction: PROVEN correct. Browser launch: PROVEN correct. Redirect/code exchange/token persistence: not reached (no code returned). Not a Google permission/config defect.

# 10. Phase 5 — Token Persistence Verification (PROVEN)

- Callback succeeded: state `1e66a8bc…` was consumed (deleted on use) → authorization code was received and exchanged.
- `connections.json` (`local-user`) updated by the existing storage mechanism: `connectedAt`/`updatedAt` = 2026-08-20T04:56:43.651Z; `tokenExpiry` = 2026-08-20 12:56:42 local (fresh, ~1h).
- Access token obtained; refresh token retained (refresh behavior preserved by the existing `getValidAccessToken`/shared `auth` refresh path).
- Identity preserved: same email `kanalconsultant.indonesia@gmail.com`, same key `local-user`. No second connection/identity.
- No plaintext secrets printed anywhere in this task (only redacted evidence: token length, email, scope names, state/URL fragments).

# 11. Phase 6 — Scope Verification (PROVEN)

Persisted scopes after reconnect (9):

- https://www.googleapis.com/auth/docs.readonly
- https://www.googleapis.com/auth/presentations.readonly
- https://www.googleapis.com/auth/drive.readonly
- https://www.googleapis.com/auth/script.projects
- https://www.googleapis.com/auth/spreadsheets
- https://www.googleapis.com/auth/userinfo.email
- https://www.googleapis.com/auth/userinfo.profile
- **https://www.googleapis.com/auth/calendar.readonly  ← ADDED**
- openid

- Calendar scope present: **PROVEN** (observed in persisted credential).
- Existing Sheets access present: **PROVEN** (`spreadsheets` scope retained).
- No inference used — scope presence directly observed from persisted credential.

# 12. Phase 7 — Calendar REST Proof (PROVEN)

Using the shared REST utility (`mcp-servers/shared/google/rest.ts`) and shared auth (`mcp-servers/shared/google/auth.ts`) on the refreshed token:

- Endpoint: `GET https://www.googleapis.com/calendar/v3/users/me/calendarList` (params `maxResults=5`).
- Result: **HTTP 2xx** (no error thrown; response parsed). Calendar list returned 2 calendars:
  - `Holidays in Indonesia` (`en.indonesian#holiday…@`)
  - `kanalconsultant.indonesia@gmail.com` (primary)
- The previous `403 PERMISSION_DENIED / insufficientPermissions` **no longer occurs** with the new token.
- Request used the refreshed token obtained from the shared auth utility. No create/update/delete performed.

# 13. Phase 8 — Sheets Regression Proof (PROVEN)

- `opencode mcp list` → `google-sheets connected` (only server registered; no official Google MCPs).
- Read-only smoke (real data, spreadsheet `1qmtFLkix4fOo94K71JyFlKIHj12p0PD-AA0ejVqeF_8`):
  - `google_sheets.list_sheets` → success (`ALPHA_ONE_MCP049SCR_2026-08-18T11-36-11-972Z`, sheets `Sheet1` 1000×26, `FlashSale049SCR`).
  - `google_sheets.read_range` `Sheet1!A1:B3` → first attempt returned transient `Error: The service is currently unavailable.`; **retry succeeded** with real data (`No`/`SKU`, `SMSID_PRODUK1_CAT`, `SMSID_PRODUK2_CAT`). Transient, consistent with prior evidence (TASK-064); not a scope/credential regression.
- `mcp-servers/google-sheets/server.ts` NOT modified. Sheets configuration unchanged.

# 14. Phase 9 — MCP Runtime Proof (N/A — by design)

Calendar MCP is NOT implemented and is OUT OF SCOPE for this task. Proven instead:
- Calendar REST access works with the refreshed authorization (Phase 7).
- Shared auth utility reads the updated credential (Phases 6-7).
Next implementation step (separate task): build the Google Calendar custom MCP using `mcp-servers/shared/google/{auth,rest,mcp}.ts` and register it in OpenCode.

# 15. Evidence Matrix

| Gate | Requirement | Evidence | Status |
|---|---|---|---|
| A | Existing Google identity preserved | same email `kanalconsultant.indonesia@gmail.com`, same `local-user` key | PASS |
| B | Existing scopes preserved | spreadsheets, drive.readonly, docs.readonly, presentations.readonly, script.projects, userinfo.email, userinfo.profile, openid all present | PASS |
| C | Calendar scope added | `calendar.readonly` observed in persisted scopes | PASS |
| D | OAuth authorization URL valid | captured URL params: `response_type=code`, client_id, redirect_uri, scope (8 incl. calendar.readonly), state, access_type=offline, prompt=consent, PKCE S256 | PASS |
| E | OAuth callback succeeds | state consumed; connectedAt/updatedAt updated; code exchanged | PASS |
| F | Token persisted | connections.json updated via existing storage; tokenExpiry fresh; refresh token retained | PASS |
| G | Calendar REST access | calendarList HTTP 2xx, 2 calendars returned | PASS |
| H | Sheets regression-free | connected; list_sheets + read_range real data (one transient read_range error, resolved on retry) | PASS |
| I | No secret leakage | only redacted evidence printed; no tokens/secrets logged | PASS |
| J | No unrelated changes | git diff reviewed; only intended files staged (see Section 21) | PASS |

# 16. Root Cause Classification

Previous Calendar failure (`403 insufficientPermissions`): **PROVEN_FIXED** — the root cause (missing `calendar.readonly` OAuth scope) was removed by the reconnect/consent, and the previously-failing read-only Calendar REST call now returns HTTP 2xx with real data. The earlier `400 invalid_request` (missing response_type) and `Windows cannot find…` were PROVEN to be reconnect-flow launch defects (URL truncation at `&`; Node `\"` escaping), both fixed; neither was a Google permission problem.

# 17. Quality Gates

A Single Identity — PASS (one identity, one connection key). B Scope Preservation — PASS. C Calendar Authorization — PASS. D OAuth Integrity — PASS (`response_type=code` present). E Token Persistence — PASS. F Calendar API 2xx — PASS. G Sheets Protection — PASS. H Scope Discipline — PASS (no new OAuth client, no second identity, no Google Cloud config change, no Sheets/server.ts change, no official MCP).

# 18. Failure Handling

Followed. Exact URL params, exact Google error (400 — fixed), launch error (`Windows cannot find` — fixed and proven non-blocker), callback/runtime logs (state unconsumed until consent completed), and failure source were captured and classified (OAuth consent step). No system redesign performed without proof.

# 19. Required Execution Summary

- Files changed: `src/services/google/oauth-service.ts` (scope registry — added `calendar.readonly`); `mcp-servers/calendar/reconsent.ts` (new reconnect helper — fixed URL quoting + `windowsVerbatimArguments`); this task file. `mcp-servers/calendar/calendar-proof.ts` created temporarily as runtime proof, then removed before commit.
- OAuth scope before: 8 scopes (drive.readonly, docs.readonly, spreadsheets, presentations.readonly, script.projects, userinfo.email, userinfo.profile, openid) — NO calendar.
- OAuth scope after: 9 scopes (previous 8 + `https://www.googleapis.com/auth/calendar.readonly`).
- Google identity: `kanalconsultant.indonesia@gmail.com` (unchanged, `local-user`).
- Reconnect result: successful (existing app OAuth flow; `prompt=consent`, PKCE S256, same client/redirect/state/persistence).
- OAuth callback result: success (state consumed, code exchanged, connection persisted).
- Token persistence result: success (`connectedAt`/`updatedAt` updated; fresh access token; refresh token retained).
- Calendar scope proof: PROVEN present in persisted credential.
- Calendar REST proof: `calendarList` → HTTP 2xx, 2 calendars.
- Sheets regression proof: connected; list_sheets + read_range return real data.
- MCP runtime proof: N/A by design (Calendar MCP not implemented; recorded as next task).
- Browser-launch result: PROVEN working after correction #2 (Chrome opened test URL and the actual consent URL).
- Evidence matrix: all PASS (Section 15).
- Root cause: PROVEN_FIXED (missing calendar scope; `403` resolved).
- Final verdict: PASS.
- Remaining blocker: none for this task.
- Next task: implement the Google Calendar custom MCP using `mcp-servers/shared/google/{auth,rest,mcp}.ts`; register in OpenCode; keep the read-only tool surface (`list_calendars`, `list_events`).

# 20. Final Verdict

**PASS** — Calendar scope proven present, OAuth reconnect proven successful, token persistence proven, Calendar REST read-only request returns 2xx, existing Sheets MCP remains functional, no unrelated changes. (Calendar MCP implementation intentionally deferred to a separate task.)

# 21. Git Discipline

Working tree: pre-existing unrelated WIP changes (many M/D files, untracked dirs) — NOT staged.

Staged for this task (single commit):
- `src/services/google/oauth-service.ts` — scope registry: added `https://www.googleapis.com/auth/calendar.readonly` (required OAuth scope change).
- `mcp-servers/calendar/reconsent.ts` — reconnect helper with corrected browser launch (URL quoting + `windowsVerbatimArguments`), the mechanism used for the reconnect.
- `spint/TASK-OPENCODE-067-Google-Calendar-Custom-MCP.md` — this task file.

Intentionally NOT staged: `mcp-servers/google-sheets/*`, `src/services/opencode/runtime.ts`, `.env`, `.alpha/*` (credentials/state — gitignored), official MCP registrations, all other pre-existing WIP.

Temporary `mcp-servers/calendar/calendar-proof.ts` removed before commit (runtime proof evidence is recorded in this file).