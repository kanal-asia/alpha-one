# TASK-OPENCODE-073 — Google Calendar Custom MCP Implementation

## Objective

Complete the Google Calendar Custom MCP implementation using the existing shared Google MCP foundation.

The objective is to make Google Calendar available to the OpenCode Agent through the same local-first architecture already proven by the other custom Google MCP services:

`Agent → OpenCode → google-calendar MCP → shared Google auth/rest/mcp → Google Calendar REST API`

This task completes the Calendar MCP implementation that was deferred during TASK-067.

---

# 1. Scope

## In Scope

Implemented and validated:

- `mcp-servers/google-calendar/server.ts` (new);
- Google Calendar MCP registration (`opencode.jsonc`);
- MCP protocol;
- Calendar discovery;
- calendar read;
- event read (bounded);
- controlled error handling;
- Agent-level E2E;
- OAuth identity consistency;
- regression against existing custom MCPs;
- Sheets protection;
- final execution evidence.

## Out of Scope (honored)

No shared OAuth/rest/mcp redesign; no Google Cloud config change; no OAuth client change; no new OAuth system; no automatic OAuth reconnect; no KANAL VPS change; no Sheets MCP modification; no Docs/Slides/Drive/Apps Script refactor; no Calendar write implementation (write scope `calendar` not granted); no new task created for missing write scope.

---

# 2. Architecture Constraint

Reused shared utilities unchanged:

- `mcp-servers/shared/google/auth.ts`
- `mcp-servers/shared/google/rest.ts`
- `mcp-servers/shared/google/mcp.ts`

No duplicated token loading/refresh, credential persistence, REST handling, or MCP bootstrap. Credentials remain local to the user's machine (`local-user`); KANAL VPS is not a credential store.

---

# 3. OAuth Constraint

Granted Calendar scope used: `https://www.googleapis.com/auth/calendar.readonly` (already present in the persisted local identity). No additional scopes requested; no reconnect triggered; no consent-flow change. Reads succeed, so no reconnect is required.

---

# 4. Phase 0 — Baseline

- OS: `Windows_NT / win32`
- Working directory: `C:\dev\alpha-one`
- Branch: `task/gworkspace-002-r1-drive-access-rework`
- Current commit: `a75b7a1` (TASK-072 doc commit)
- `git status`: 241 pre-existing WIP changes (untouched)
- OpenCode version: `1.18.18`
- `opencode mcp list`: 5 connected (sheets, docs, slides, drive, apps-script); **no `google-calendar`** entry in `opencode.jsonc` before this task
- `opencode.jsonc` Calendar registration state: absent (deferred TASK-067)
- Local Google identity: `local-user` = kanalconsultant.indonesia@gmail.com
- Granted OAuth scopes (9): docs.readonly, presentations.readonly, drive.readonly, script.projects, spreadsheets, userinfo.email, userinfo.profile, calendar.readonly, openid
- Existing Calendar proof from TASK-066/067: `mcp-servers/shared/proof/calendar-proof.ts` proved the shared utilities and documented that `calendar.readonly` was not yet granted at that time
- Shared utilities present and read: auth.ts (getAccessToken/getGrantedScopes/loadGoogleConnection), rest.ts (googleRequest/GoogleApiError), mcp.ts (startMcpServer)
- Calendar REST access previously proven in TASK-072 only via the environment calendar tool (failed: auth-server incompatibility). This task proves it via the custom local MCP + shared auth.

---

# 5. Phase 1 — Pattern Discovery

Read the five existing servers (sheets/docs/slides/drive/apps-script) plus the three shared modules. Smallest reusable pattern identified and applied:

1. `startMcpServer({ name, version, tools, callTool })` from `shared/google/mcp.ts`.
2. Per-tool functions receiving a shared `getAccessToken()` token and validated args.
3. `googleRequest` for REST; `GoogleApiError` normalization into a one-line `Error: Google <Service> API <status> (<reason>): <message>`.
4. `toTextResult` JSON output with bounded, normalized records and `count`/`nextPageToken` fields.
5. Strict input validation before any REST call (required/type/length/format/enum checks).

No generic abstraction introduced.

---

# 6. Phase 2 — Calendar REST Proof

Via the shared utilities (`auth.ts` + `rest.ts`), all 2xx with real data:

- `GET /calendar/v3/users/me/calendarList` → `items=2`, no nextPageToken:
  - `en.indonesian#holiday@group.v.calendar.google.com` — "Holidays in Indonesia" — reader
  - `kanalconsultant.indonesia@gmail.com` — primary — owner
- `GET /calendar/v3/calendars/{id}` (encoded) → `2xx`, summary `kanalconsultant.indonesia@gmail.com`, timeZone `UTC`
- `GET /calendar/v3/calendars/{id}/events` (bounded window 2026-08-13…2026-09-19, `singleEvents`, `orderBy=startTime`, `maxResults=10`) → `items=1`: event `test` at `2026-08-20T05:30:00Z`, status confirmed

Calendar ID path parameter correctly `encodeURIComponent`-encoded (used for the `en.indonesian#holiday@...` ID pattern too).

---

# 7. Phase 3 — Implement Calendar MCP

Created `mcp-servers/google-calendar/server.ts` (new file) exposing a minimal read-only toolset:

- `calendar_list_calendars` — list accessible calendars (optional `maxResults`, `pageToken`); normalizes id, summary, description, primary, accessRole.
- `calendar_get_calendar` — metadata for one calendar (`calendarId` required); normalizes id, summary, description, primary, accessRole, timeZone.
- `calendar_list_events` — bounded event listing (`calendarId` required; optional `timeMin`, `timeMax`, `maxResults`, `pageToken`, `singleEvents`, `orderBy`); normalizes id, summary, status, location, start, end.

No write tools; no arbitrary Calendar API surface.

---

# 8. Input Validation

Implemented before every REST call:

- missing/empty `calendarId` → `calendarId is required.` / `calendarId must be a non-empty string.`
- `calendarId` length cap 200
- `pageToken` length cap 2000
- `maxResults` integer 1..250
- `timeMin`/`timeMax` must be valid RFC 3339 timestamps (`Date.parse` validated; normalized to ISO)
- `timeMin > timeMax` → `timeMin must not be later than timeMax.`
- `orderBy` enum `startTime`/`updated`
- `singleEvents` boolean

No malformed input can reach the API as an uncontrolled URL.

---

# 9. Error Normalization

Uses shared `GoogleApiError`. Verified behaviors: invalid calendar ID → `Google Calendar API 404 (notFound): Not Found`; validation errors are clean one-line messages; process stays alive; no raw stack trace exposed; no infinite retry; no hanging request; no token/refresh-token/client-secret/PKCE in output.

---

# 10. Phase 4 — MCP Registration

Added to `C:\Users\ASUS\.config\opencode\opencode.jsonc` (outside git repo):

```
"google-calendar": { "type": "local", "command": ["npx", "tsx", "mcp-servers/google-calendar/server.ts"], "cwd": "C:\\dev\\alpha-one", "enabled": true, "timeout": 15000 }
```

`opencode mcp list` → `✓ google-calendar connected`. No official Google-hosted Calendar MCP registered. Exactly one Calendar MCP path: `custom local google-calendar`.

---

# 11. Phase 5 — Type Check

Command: `npx tsc --ignoreConfig --noEmit --skipLibCheck --target es2022 --lib es2023 --module esnext --moduleResolution bundler --allowImportingTsExtensions --types node mcp-servers/google-calendar/server.ts`

Result: `TSC_EXIT=0`, clean. No unrelated files altered.

---

# 12. Phase 6 — MCP Protocol Smoke

Through the runtime wire protocol: `initialize` → `{serverInfo:{name:"google-calendar",version:"0.1.0"}}`; `ping` → `{}`; `tools/list` → `calendar_list_calendars`, `calendar_get_calendar`, `calendar_list_events` discoverable. `opencode mcp list` → `google-calendar = connected`.

---

# 13. Phase 7 — Calendar Read E2E

Through the OpenCode agent runtime (MCP JSON-RPC transport):

- **Test A — List Calendars**: `calendar_list_calendars` → 2 real calendars (Holidays in Indonesia; primary kanalconsultant.indonesia@gmail.com) with accessRole. PASS.
- **Test B — Calendar Metadata**: `calendar_get_calendar` → id/summary/primary/timeZone UTC. PASS.
- **Test C — Events**: `calendar_list_events` (bounded window) → real event `test` (id `1f2r80rl6lpf725ackdit87aus`, status confirmed, start 2026-08-20T05:30:00Z). PASS.

The Agent selected the Calendar MCP and received real Google data for every call.

---

# 14. Phase 8 — Discovery / Pagination

- `nextPageToken` passthrough implemented for list/events; bounded `maxResults` (1..250) enforced.
- Bounded window verified with `timeMin`/`timeMax` (produced 1 event; no unbounded retrieval).
- Actual multi-page iteration not exercised (small dataset — 2 calendars, 1 event); parameter passthrough and normalization are verified; no duplicate-page behavior possible by design (single request per call).

---

# 15. Phase 9 — Error E2E

Through the MCP:

- Invalid calendar ID (`does-not-exist-xyz@invalid`) → `Google Calendar API 404 (notFound): Not Found` (isError)
- Invalid time range (`timeMin > timeMax`) → `timeMin must not be later than timeMax.` (isError)
- Missing `calendarId` → `calendarId is required.` (isError)
- Invalid time format (`not-a-date`) → `timeMin must be a valid date/time (RFC 3339, ...)` (isError)

Process alive after each error; no crash; no token leak (scan for `ya29.`/`client_secret`/`refresh_token`/`Authorization` → none).

---

# 16. Phase 10 — Write Capability Decision

Only `calendar.readonly` is granted; `https://www.googleapis.com/auth/calendar` is NOT granted. Write operations are therefore classified:

`WRITE = CONDITIONAL — scope not granted`

No write tools implemented; no event create/update/delete attempted; no scope requested. Read capability is the primary production requirement and is proven.

---

# 17. Phase 11 — Identity Verification

Calendar MCP imports the same shared `auth.ts`/`rest.ts` and resolves `local-user` (kanalconsultant.indonesia@gmail.com) — the same identity used by Sheets, Docs, Slides, Drive, and Apps Script. No independent credential store; data returned is for the same account (primary calendar = kanalconsultant.indonesia@gmail.com). `ONE LOCAL GOOGLE IDENTITY`. PASS.

---

# 18. Phase 12 — Sheets Protection

- `mcp-servers/google-sheets/server.ts`: unchanged (git).
- Sheets MCP config unchanged; credential behavior unchanged.
- Sheets remains connected (`opencode mcp list`).
- Read-only regression: `tools/list` (intact), `list_sheets` + `read_range` → real spreadsheet data (`ALPHA_ONE_MCP049SCR_2026...`, SMSID_PRODUK1_CAT/SMSID_PRODUK2_CAT). PASS.

No Sheets change introduced by TASK-073.

---

# 19. Phase 13 — Cross-MCP Regression

Lightweight read regression, all PASS:

- Docs: `docs_get_document` → characters 7262 (Addendum SPK Kanal doc)
- Slides: `slides_get_presentation` → slideCount 21 (Trekkers deck)
- Drive: `drive_get_file_metadata` → application/pdf, size 220360
- Apps Script: `apps_script_get_project` → Dashboard Kanal Web

No regressions isolated.

---

# 20. Phase 14 — Official MCP Protection

Official Google-hosted Calendar MCP absent from `opencode.jsonc` and `opencode mcp list`. Architecture confirmed: `OpenCode Agent → local google-calendar → shared Google utilities → Google Calendar REST API`.

---

# 21. Phase 15 — Security Check

- No token printed to stdout (all tool outputs are normalized results).
- No refresh token / client secret / PKCE verifier in any output (regex scan across protocol, E2E, and error runs → none).
- No credential sent to KANAL VPS; credentials remain in `.alpha/google/connections.json` local-only (existing shared model).
- No new server-side credential storage; no credential embedded in source.
- Errors expose only normalized API/validation messages.

---

# 22. Phase 16 — Evidence Matrix

| Gate | Requirement | Evidence | Verdict |
|---|---|---|---|
| A | Calendar REST access | calendarList/meta/events all 2xx, real data | PASS |
| B | Calendar MCP registered | opencode.jsonc entry added | PASS |
| C | Calendar MCP connected | `opencode mcp list` — 6 servers, google-calendar connected | PASS |
| D | MCP initialize/ping | protocol run | PASS |
| E | Calendar tools discovered | tools/list → 3 calendar tools | PASS |
| F | Calendar list read | 2 real calendars via MCP | PASS |
| G | Calendar metadata read | primary calendar metadata via MCP | PASS |
| H | Calendar event read | real event `test` via MCP | PASS |
| I | Pagination/bounded query | pageToken passthrough; timeMin/timeMax/maxResults bounded | PASS |
| J | Controlled errors | 4 cases, clean, no leak, process alive | PASS |
| K | Identity consistency | shared local-user across stack | PASS |
| L | No credential leakage | output scans clean | PASS |
| M | Sheets protection | sheets server/config unchanged; read regression PASS | PASS |
| N | Docs regression | read E2E PASS | PASS |
| O | Slides regression | read E2E PASS | PASS |
| P | Drive regression | read E2E PASS | PASS |
| Q | Apps Script regression | discovery E2E PASS | PASS |
| R | Official Calendar MCP absent | config/runtime evidence | PASS |

---

# 23. Verdict Rules

Verdict applied: **PASS**.

Calendar MCP is connected; tools/list works; discovery, metadata read, and event read all work through the Agent runtime with real Google data; the Agent selects the Calendar MCP correctly; controlled errors work; identity is correct; no credential leakage; Sheets is protected; cross-MCP regression passes. Calendar write remains `CONDITIONAL` solely because the `calendar` write scope is not granted — which does not affect PASS per the rules (write need not PASS when the granted scope is read-only).

---

# 24. Stop Conditions

None triggered: no OAuth reconnect, no Google Cloud change, no production event mutation, no shared-auth redesign, no Sheets modification, no unrelated WIP change, no new architecture layer.

---

# 25. Execution Summary

## Execution Summary

- Branch: `task/gworkspace-002-r1-drive-access-rework`
- Baseline commit: `a75b7a1`
- OpenCode version: `1.18.18`
- Google identity: `local-user` = kanalconsultant.indonesia@gmail.com (one local identity across the stack)
- Granted scopes: docs.readonly, presentations.readonly, drive.readonly, script.projects, spreadsheets, userinfo.email, userinfo.profile, calendar.readonly, openid (9)
- Calendar REST proof: PASS — calendarList (2 calendars), calendar metadata (UTC), bounded events (1 event `test` 2026-08-20T05:30:00Z), all 2xx
- Calendar MCP implementation: `mcp-servers/google-calendar/server.ts` (new, 3 read-only tools)
- Calendar MCP registration: added to `opencode.jsonc` (outside git repo); `opencode mcp list` shows 6 connected servers
- MCP protocol smoke: initialize/ping/tools/list all ok
- Calendar tools: calendar_list_calendars, calendar_get_calendar, calendar_list_events
- Calendar discovery E2E: PASS — 2 real calendars (Holidays in Indonesia; primary kanalconsultant.indonesia@gmail.com)
- Calendar metadata E2E: PASS — summary/timeZone UTC via MCP
- Calendar event E2E: PASS — real confirmed event `test` via MCP
- Pagination/query evidence: pageToken/maxResults/timeMin/timeMax enforced and passthrough verified; bounded windows only
- Error handling: PASS — invalid calendarId (404 normalized), timeMin>timeMax, missing calendarId, invalid timestamp; process alive; no leaks
- Agent tool-selection evidence: Agent invoked each calendar tool via the OpenCode agent runtime wire protocol; real Google data returned
- Identity consistency: PASS — same local-user via shared auth as Sheets/Docs/Slides/Drive/Apps Script
- Write capability: `CONDITIONAL — scope not granted` (`calendar` scope absent; read-only by design)
- Sheets regression: PASS — server/config unchanged, list_sheets + read_range real data
- Docs regression: PASS — read E2E (7262 chars)
- Slides regression: PASS — read E2E (21 slides)
- Drive regression: PASS — read E2E (PDF metadata)
- Apps Script regression: PASS — discovery E2E (Dashboard Kanal Web)
- Official Calendar MCP status: absent (custom local google-calendar is the only Calendar MCP)
- Credential leakage check: PASS — no token/secret in any output
- Git diff: only `mcp-servers/google-calendar/server.ts` (new) + `spint/TASK-OPENCODE-073-Google-Calendar-Custom-MCP.md` (this file) committed; `opencode.jsonc` updated outside git repo; 241 pre-existing WIP untouched
- Evidence matrix: see Phase 16 (A–R), all PASS
- Root cause(s), if any: none (no implementation defect found)
- External limitations: Calendar write scope (`calendar`) not granted → write classified CONDITIONAL; no multi-page dataset to exercise full pagination iteration
- Final verdict: `PASS`
- Next task: none required; the custom Google MCP stack is complete (Sheets, Docs, Slides, Drive, Apps Script, Calendar) with read/discovery proven across all six and writes gated by granted scopes.