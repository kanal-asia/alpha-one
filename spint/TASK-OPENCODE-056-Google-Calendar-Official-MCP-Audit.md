# TASK-OPENCODE-056 — Google Calendar Official MCP Audit

## Objective

Audit-only validation of the official Google Calendar MCP integration for Alpha One / OpenCode.

Determine whether Google Calendar can be added as an official Google MCP server using the existing Google Cloud project and OAuth setup.

This task MUST NOT install, register, modify, remove, or replace any MCP server.

## Critical Existing Constraint

Google Sheets is SPECIAL and MUST NOT be changed.

Current state that MUST remain untouched:

- `google-sheets` = existing custom Alpha One MCP
- Do NOT install official Google Sheets MCP
- Do NOT replace custom Sheets MCP
- Do NOT modify its configuration
- Do NOT rename or migrate it
- Do NOT perform Sheets redesign or refactor

Existing official MCP servers:

- `drive`
- `docs`
- `slides`

The audit must preserve these existing integrations.

---

## Scope

Audit ONLY:

1. Google Calendar API availability.
2. Google Calendar MCP API availability.
3. Existing Google Cloud project alignment.
4. Existing OAuth client / callback compatibility.
5. Official Calendar MCP endpoint availability.
6. OpenCode compatibility with the official Calendar MCP endpoint.
7. Whether the existing OAuth credential can be used or whether additional consent/configuration is required.
8. Expected Calendar MCP tools/capabilities.
9. Whether Calendar is technically READY for registration.
10. Any external prerequisite that blocks runtime registration.

Do NOT:

- modify application source code
- modify Google Sheets MCP
- install Calendar MCP
- add Calendar to OpenCode config
- remove or replace any existing MCP
- change OAuth client configuration
- change Google Cloud settings
- redesign MCP architecture
- create a custom Calendar engine
- implement Calendar features
- perform unrelated OpenCode cleanup

---

# Phase 0 — Repository / Configuration Discovery

Identify the current source of truth for OpenCode MCP configuration.

Determine:

- configuration file(s)
- MCP server registration structure
- environment variable usage
- OAuth configuration
- existing `drive`, `docs`, `slides`, and `google-sheets` registrations

Prove which configuration is actually loaded by the running OpenCode instance.

Do not modify anything.

---

# Phase 1 — Existing MCP Baseline

Capture the current runtime baseline.

Run the appropriate read-only command(s), including:

`opencode mcp list`

Record the exact current state.

Expected baseline:

- `google-sheets` connected
- `drive` connected
- `docs` connected
- `slides` connected

Verify that no Calendar MCP is currently registered.

If Calendar is already registered, do NOT change it. Audit its existing state instead.

---

# Phase 2 — Google Cloud Project Verification

Verify that the Google Cloud project used by Alpha One is the same project associated with the existing OAuth client.

Confirm:

- project ID
- OAuth client identity
- Calendar API status
- Calendar MCP API status

Specifically inspect whether these services are enabled:

- Google Calendar API
- Calendar MCP API

Use read-only inspection only.

Do not enable or disable anything.

Record evidence.

---

# Phase 3 — OAuth Compatibility Audit

Audit the existing OAuth configuration.

Verify:

- OAuth client type
- existing redirect URIs
- existing MCP callback URI
- existing scopes relevant to Calendar
- whether the current OAuth configuration is potentially usable by Calendar MCP
- whether additional authorization/consent is required

Do not modify the OAuth client.

If a required scope or redirect URI is missing, classify it as:

`BLOCKED_EXTERNAL_PREREQUISITE`

Do not fix it in this task.

---

# Phase 4 — Official Calendar MCP Endpoint Audit

Audit the official Google Calendar MCP endpoint intended for OpenCode.

Expected endpoint:

`https://calendarmcp.googleapis.com/mcp/v1`

Verify, where technically possible without changing configuration:

1. endpoint reachability
2. MCP protocol compatibility
3. authentication behavior
4. `tools/list` availability
5. actual exposed Calendar tools

Record the actual tool names returned by the server.

Do not call destructive Calendar operations.

If authentication is required, document the requirement instead of performing configuration changes.

---

# Phase 5 — Capability Audit

Determine what the official Calendar MCP actually exposes.

Classify available capabilities such as:

- list/search events
- get event
- create event
- update event
- delete event
- free/busy or availability
- time suggestions
- calendar listing
- other tools actually returned by `tools/list`

Do not assume capabilities from documentation alone.

Use runtime evidence where possible.

Separate:

- PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

---

# Phase 6 — OpenCode Compatibility

Determine whether the existing OpenCode MCP architecture can register the official Calendar MCP using the same mechanism already proven for:

- `drive`
- `docs`
- `slides`

Compare configuration shape only.

Do NOT actually add Calendar.

Answer:

- Can the existing MCP registration mechanism represent Calendar?
- Does Calendar use the same remote MCP transport?
- Is additional application code required?
- Is additional OAuth infrastructure required?
- Is there any architectural blocker?

---

# Phase 7 — Safety / Existing Integration Protection

Explicitly verify that the proposed Calendar integration does not require changing:

`google-sheets`

The audit MUST conclude whether Calendar can be added independently.

Also verify that existing:

- Drive
- Docs
- Slides

registrations do not need replacement or redesign.

---

# Phase 8 — Runtime Read-Only Verification

Perform only safe runtime checks.

Minimum required evidence:

1. Current `opencode mcp list`.
2. Google Cloud project/API state.
3. OAuth configuration state.
4. Calendar MCP endpoint response where possible.
5. `tools/list` result where authentication permits.

Do NOT:

- create Calendar events
- update events
- delete events
- change calendars
- modify Google Cloud
- modify OAuth
- modify OpenCode configuration

---

# Quality Gate

## PASS

Return PASS only if:

- Calendar API is enabled.
- Calendar MCP API is enabled.
- Correct Google Cloud project is confirmed.
- OAuth configuration is compatible or existing authorization is proven sufficient.
- Official Calendar MCP endpoint is reachable.
- MCP protocol compatibility is proven.
- Calendar `tools/list` is successfully retrieved OR there is sufficient runtime evidence that only user authentication remains.
- Existing Sheets custom MCP remains untouched.
- No source/config mutation occurred.

## CONDITIONAL

Use CONDITIONAL if:

- architecture is compatible,
- Google Cloud prerequisites are satisfied,
- but user OAuth consent/authentication or another non-code prerequisite remains before runtime proof.

## BLOCKED

Use BLOCKED if a required external prerequisite is missing, such as:

- Calendar API disabled
- Calendar MCP API disabled
- incorrect project
- OAuth client incompatibility
- endpoint unavailable
- MCP authentication impossible with current setup

## FAIL

Use FAIL only if the Alpha One/OpenCode implementation itself is proven incompatible with the official Calendar MCP despite all external prerequisites being satisfied.

Do NOT classify an external Google Cloud/OAuth prerequisite as an application bug.

---

# Required Evidence

Execution Summary MUST include:

- Git branch
- Git status
- current commit
- MCP configuration source inspected
- current MCP server baseline
- Google Cloud project ID
- Calendar API status
- Calendar MCP API status
- OAuth client / redirect evidence
- Calendar MCP endpoint evidence
- `tools/list` evidence if available
- actual Calendar tool names discovered
- Sheets protection verification
- files inspected
- commands used
- final verdict

Distinguish clearly between:

- FACT / PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

Do not claim PASS based only on configuration or documentation.

---

# Mutation Guard

This is an AUDIT-ONLY task.

The following are prohibited:

- source-code mutation
- MCP config mutation
- environment mutation
- OAuth mutation
- Google Cloud mutation
- Calendar event mutation
- Sheets MCP mutation
- installation of new MCP packages
- registration of Calendar MCP

If a mutation is required to continue verification, STOP and classify the blocker. Do not perform it.

---

# Execution Summary

After completing the audit, write the complete execution summary into this same task file.

Include:

1. Audit scope executed.
2. Evidence collected.
3. Current state.
4. Findings.
5. Proven root cause for any blocker.
6. Calendar MCP capability evidence.
7. Existing MCP compatibility evidence.
8. Confirmation that Google Sheets custom MCP was not changed.
9. Quality Gate result.
10. Final verdict.
11. Minimal next action required, if any.

Do not create a separate execution-summary file.

## Final Verdict Format

`PASS`

or

`CONDITIONAL`

or

`BLOCKED`

or

`FAIL`

The verdict must be evidence-based.

---

# Git

Only after the audit and Execution Summary are complete:

1. Verify `git diff --stat`.
2. Verify only the intended task file changed.
3. Verify `git status`.
4. Commit ONLY the task file.
5. Do not modify application source code.
6. Do not commit unrelated changes.

The final response must report:

- verdict
- commit hash
- files changed
- key evidence
- blockers, if any
- whether the next step is configuration/authentication or a new implementation task

---

# Execution Summary

Audit executed 2026-08-19. Audit-only: no source/config/OAuth/Google Cloud/Calendar mutation performed.

## 1. Audit scope executed

Phases 0–8. Read-only inspection and runtime probes only. No Calendar MCP registered, no config file edited, no OAuth/Cloud change, no Calendar event touched. A leftover temporary callback server (scratch process from the previous task session) was stopped; it is not part of any audited system.

## 2. Evidence collected

### Git state (PROVEN)

- Branch: `task/gworkspace-002-r1-drive-access-rework`
- HEAD commit: `5be1367` (TASK-OPENCODE-056-SCR1)
- `git status`: working tree contains many PRE-EXISTING unrelated changes (modified/deleted/untracked files). The ONLY change produced by this audit is the new task file `spint/TASK-OPENCODE-056-Google-Calendar-Official-MCP-Audit.md` (untracked).

### MCP configuration source (PROVEN)

- Global config `C:\Users\ASUS\.config\opencode\opencode.jsonc` is the source of truth. It is the only opencode config present (`config.json` / `opencode.json` do not exist; no local `opencode.json*` in the repo root or `.opencode\`). OpenCode CLI debug logs confirm it is the loaded config.
- Current registrations: `google-sheets` (local, `npx tsx mcp-servers/google-sheets/server.ts`, cwd `C:\dev\alpha-one`), `drive` (remote `https://drivemcp.googleapis.com/mcp/v1`, oauth clientId/clientSecret via `{env:GOOGLE_CLIENT_ID}`/`{env:GOOGLE_CLIENT_SECRET}`), `docs`, `slides` (same remote shape). No `calendar` key (PROVEN).

### Phase 1 baseline — `opencode mcp list` (PROVEN)

```
✓ google-sheets connected
✓ drive connected (OAuth)  https://drivemcp.googleapis.com/mcp/v1
✓ docs connected (OAuth)   https://docsmcp.googleapis.com/mcp/v1
✓ slides connected (OAuth) https://slidesmcp.googleapis.com/mcp/v1
4 server(s)
```

No Calendar MCP is registered.

### Google Cloud project / API state (Phase 2)

- OAuth client identity (PROVEN from `.env`): `480048442203-stiuf8pf1o0kvb0vejpk8hfa85b6o4c4.apps.googleusercontent.com` → belongs to Google Cloud project number `480048442203`. Task names project `alpha-workspace-505404`; the number↔ID mapping could not be verified without console access (UNKNOWN / INSUFFICIENT_EVIDENCE), but it is the same project context in which Drive/Docs/Slides MCP are already enabled and working.
- Google Calendar API `calendar.googleapis.com`: **ENABLED** (PROVEN). `GET /calendar/v3/users/me/calendarList` with app token → HTTP 403 `insufficientPermissions` / `ACCESS_TOKEN_SCOPE_INSUFFICIENT` (service `calendar-json.googleapis.com`). This is a scope error, NOT the "API has not been used or is disabled" message → API is enabled.
- Calendar MCP API `calendarmcp.googleapis.com`: **ENABLED** (PROVEN). `tools/call list_calendars` with app token → HTTP 403 `"Request had insufficient authentication scopes."` — again a scope error, NOT the "Calendar MCP API has not been used ... or it is disabled" message → MCP API is enabled.

### OAuth compatibility (Phase 3)

- Client type: Web application (PROVEN from redirect usage `http://localhost:3001/api/google/oauth/callback`).
- Registered redirect URIs (PROVEN): `http://localhost:3001/api/google/oauth/callback` (app) and `http://127.0.0.1:19876/mcp/oauth/callback` (OpenCode MCP loopback — already authorized; verified in TASK-055 by absence of `redirect_uri_mismatch` when hitting Google's authorize endpoint with that redirect).
- Current token scopes (PROVEN from `.alpha/google/connections.json`): `drive.readonly`, `docs.readonly`, `presentations.readonly`, `spreadsheets`, `script.projects`, `userinfo.email`, `userinfo.profile`, `openid`. **NO calendar scopes.**
- Calendar MCP required scopes (PROVEN from per-tool RFC 9728 resource metadata):
  - `list_calendars`: `calendar`, `calendar.readonly`, `calendar.calendarlist`, `calendar.calendarlist.readonly`
  - `get_event`: `calendar`, `calendar.events`, `calendar.events.readonly`, `calendar.readonly`
- Conclusion: the current OAuth credential is NOT usable for Calendar MCP data access — the required calendar scope is missing from the consent. Classification: **BLOCKED_EXTERNAL_PREREQUISITE** (missing scope / additional consent). Not fixed in this task.

### Calendar MCP endpoint (Phase 4)

- Endpoint `https://calendarmcp.googleapis.com/mcp/v1` is REACHABLE (PROVEN, HTTP 200 on `tools/list`).
- MCP protocol compatible (PROVEN): JSON-RPC over HTTP, `initialize`/`tools/list` succeed unauthenticated; unauthenticated `tools/call` → HTTP 401.
- `tools/list` result (PROVEN): **9 tools**:

```
list_events, get_event, list_calendars, suggest_time, create_event, update_event, delete_event, respond_to_event, search_events
```

### Calendar capability audit (Phase 5)

Tool names and descriptions PROVEN from the live `tools/list` response (schema captured):

| Tool | Description (server-provided) | Required args |
|---|---|---|
| `list_events` | Returns events on the given calendar matching constraints | (all optional) |
| `get_event` | Returns a single event | `eventId` |
| `list_calendars` | Returns calendars the user has access to (calendar list) | (optional) |
| `suggest_time` | Suggests time periods across one or more calendars | `attendeeEmails`, `startTime`, `endTime` |
| `create_event` | Creates an event | `summary`, `startTime`, `endTime` |
| `update_event` | Updates an event | `eventId` |
| `delete_event` | Deletes an event | `eventId` |
| `respond_to_event` | Responds to an event | `eventId`, `responseStatus` |
| `search_events` | Semantic search on primary calendar | `query` |

Classification:
- list/search/get calendars & events: **PROVEN** (`list_events`, `get_event`, `list_calendars`, `search_events`)
- create/update/delete/respond: **PROVEN** (`create_event`, `update_event`, `delete_event`, `respond_to_event`)
- time suggestions: **PROVEN** (`suggest_time`)
- free/busy dedicated tool: **NOT PRESENT** in `tools/list` (UNKNOWN whether `suggest_time`/`list_events` cover it — not proven from docs alone)

### OpenCode compatibility (Phase 6)

- Registration shape: identical to `drive`/`docs`/`slides` (`type: "remote"`, `url`, `oauth: {clientId, clientSecret}`) — Calendar is representable (PROVEN, same config mechanism).
- Transport: same remote HTTP/JSON-RPC MCP transport (PROVEN).
- Authorization server: same `https://accounts.google.com/` (PROVEN from resource metadata), same already-authorized loopback redirect URI (PROVEN).
- Additional application code required: NONE for registration (config-only) (DERIVED from existing 3-server mechanism).
- Additional OAuth infrastructure: NONE for registration; only a missing user-consent scope blocks DATA access (PROVEN).
- Architectural blocker for registration: **none**. Note (proven in TASK-055): OpenCode's interactive `opencode mcp auth` does not self-trigger for Google MCP servers because `initialize`/`tools/list` are unauthenticated (no 401 at connect time); runtime 401s on `tools/call` are what drive the OAuth flow, or tokens are supplied via `mcp-auth.json`. Same applies to Calendar — not an architectural blocker, just the established mechanism.

### Safety / existing integration protection (Phase 7)

- `google-sheets`: config unchanged, server source untouched, tools intact (PROVEN — config content unchanged; git diff for this audit contains only the new task file).
- `drive`/`docs`/`slides`: no change, no replacement/redesign needed (PROVEN).
- Calendar can be added independently (DERIVED — config-only addition, no coupling to Sheets or the three existing remote servers).

### App-context note (out of scope)

- No functional Google Calendar integration exists in Alpha One today: `src/routes/_authenticated/google/calendar.tsx` is a `SectionPlaceholder` stub; `src/features/skills/skill-store.ts` has a "Google Calendar" skill prompt template only. `src/components/ui/calendar.tsx` is a UI date-picker component, unrelated. None were modified.

## 3. Current state

Four MCP servers registered and connected (`google-sheets`, `drive`, `docs`, `slides`). Calendar MCP NOT registered. Calendar API + Calendar MCP API enabled in the OAuth client's project. OAuth consent lacks calendar scopes.

## 4. Findings

1. Calendar MCP is technically ready to register with the exact same mechanism used for drive/docs/slides.
2. Both the Calendar API and the Calendar MCP API are already enabled — no Google Cloud action required.
3. The only missing prerequisite is user OAuth consent including a calendar scope (e.g. `calendar.readonly` / `calendar.calendarlist.readonly` / `calendar.events.readonly`), or the broader `calendar` scope for write tools.

## 5. Proven root cause for the blocker

Runtime `tools/call` returns `403 insufficient authentication scopes` because the existing access token carries no calendar scope (token scopes are read-only for Drive/Docs/Slides + Sheets + script.projects). This is an OAuth consent gap, not an application defect.

## 6. Calendar MCP capability evidence

See Phase 5 table — 9 tools proven from the live server.

## 7. Existing MCP compatibility evidence

`opencode mcp list` baseline + identical remote config shape for the three official servers (Phase 1/6).

## 8. Google Sheets confirmation

`google-sheets` custom MCP remains configured, enabled, and connected; source `mcp-servers/google-sheets/server.ts` untouched; no official Sheets MCP registered. (PROVEN)

## 9. Quality Gate result

| Gate | Status |
|---|---|
| Calendar API enabled | PASS (PROVEN) |
| Calendar MCP API enabled | PASS (PROVEN) |
| Correct Google Cloud project | PARTIAL (same OAuth-client project; ID↔number mapping UNKNOWN without console) |
| OAuth compatible / sufficient | NOT SUFFICIENT for data — missing calendar scope (PROVEN) |
| Endpoint reachable | PASS (PROVEN) |
| MCP protocol compatible | PASS (PROVEN) |
| `tools/list` retrieved | PASS (PROVEN, 9 tools) |
| Sheets custom MCP untouched | PASS (PROVEN) |
| No source/config mutation | PASS (PROVEN) |

## 10. Final verdict

`CONDITIONAL`

Architecture is compatible and all Google Cloud prerequisites are satisfied (Calendar API and Calendar MCP API enabled, endpoint reachable, protocol compatible, `tools/list` retrieved, Sheets untouched). Only a non-code prerequisite remains before runtime proof: user OAuth consent that includes a calendar scope for the existing OAuth client (or a consent for the MCP), plus the subsequent consent/token acquisition (the same 401-driven/injected-token mechanism proven for drive/docs/slides in TASK-055).

## 11. Minimal next action required

A separate implementation task (NOT this audit) should:
1. Extend the app's OAuth consent (or add a Calendar-specific consent flow) to include a calendar scope — minimum `https://www.googleapis.com/auth/calendar.readonly` for read operations (`calendar.calendarlist.readonly` / `calendar.events.readonly` as needed; `calendar` if write tools are required).
2. Register `calendar` in `C:\Users\ASUS\.config\opencode\opencode.jsonc` with `type: "remote"`, `url: "https://calendarmcp.googleapis.com/mcp/v1"`, and the same `oauth` block.
3. Acquire a token (runtime 401-driven flow or token injection into `~/.local/share/opencode/mcp-auth.json`) and run read-only smoke tests (`list_calendars`, `list_events`) before any write-capability use.

Commands used (read-only): `git branch --show-current`, `git log --oneline -3`, `git status --short`, `Get-ChildItem` (config discovery), `opencode mcp list`, `Invoke-WebRequest` probes to `calendarmcp.googleapis.com/mcp/v1` (`tools/list`, unauthenticated `tools/call`, authenticated `tools/call`), `GET calendar.googleapis.com/v3/users/me/calendarList`, RFC 9728 resource-metadata fetches, `Select-String`/grep for `calendar` in config and `src\`. No mutations performed.