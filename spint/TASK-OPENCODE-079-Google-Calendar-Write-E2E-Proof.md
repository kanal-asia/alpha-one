# TASK-OPENCODE-079 — Google Calendar Write E2E Proof

## 1. Objective

Membuktikan secara nyata bahwa Google Calendar Custom MCP dapat melakukan WRITE menggunakan progressive OAuth yang sudah proven pada TASK-076/077/078.

Calendar WRITE capability → detect current scope → progressive authorization only if required → preserve existing scopes → create event → read-back → update event → read-back → cleanup → restart persistence.

Task ini adalah E2E proof. Jangan membuat OAuth foundation baru. Jangan membuat capability registry baru. Jangan mengubah Google Sheets MCP. Jangan mengulang audit OAuth yang sudah proven.

## 2. Scope

IN SCOPE: Audit baseline Calendar MCP; verifikasi identity; verifikasi scopes; verifikasi exact Calendar WRITE scope; progressive OAuth TASK-074/076; request hanya scope diperlukan; interactive consent; persist; CREATE; READ-BACK; UPDATE; READ-BACK setelah update; DELETE/CLEANUP; restart persistence; regression seluruh MCP; error handling; credential safety; evidence matrix; execution summary; single commit.

OUT OF SCOPE: OAuth redesign; generic MCP framework; new shared auth; Sheets changes; Docs/Slides/Drive redesign; Apps Script execution implementation; Calendar UI; webhook/push; production scheduler; broad unrelated scopes; disconnect/reconnect workaround.

## 3. Known State

- TASK-067: Calendar REST access proven.
- TASK-073: Calendar Custom MCP (read-only surface).
- Calendar READ/discovery/events PASS; Calendar WRITE belum dibuktikan.
- TASK-076/077/078: progressive OAuth + additive scope persistence proven (Docs/Slides/Drive WRITE PASS).
- Calendar WRITE tidak diasumsikan blocked; inspeksi scope state aktual terlebih dahulu.

## 4. Baseline

- Branch: `task/gworkspace-002-r1-drive-access-rework`; HEAD `3c7e7e4`; pre-existing WIP 241 files (untouched).
- Identity: `kanalconsultant.indonesia@gmail.com` (single `local-user`, refresh token stored).
- Persisted scopes (13): docs.readonly, presentations, script.projects, drive.file, spreadsheets.readonly, documents, presentations.readonly, spreadsheets, userinfo.profile, drive.readonly, userinfo.email, openid, calendar.readonly.
- Calendar MCP tools (before): calendar_list_calendars, calendar_get_calendar, calendar_list_events (read-only).
- Capability registry: `google.calendar.write` → `SCOPES.calendarWrite` = `https://www.googleapis.com/auth/calendar`.

## 5. Calendar WRITE Capability Analysis

- Implementation (`mcp-servers/google-calendar/server.ts`, TASK-073) exposed only read tools. Write surface absent → concrete implementation gap for the defined E2E (create/update/delete required).
- Registry requires `https://www.googleapis.com/auth/calendar`; only `calendar.readonly` was granted.
- Added minimal constrained write surface (TASK-079, following existing conventions):
  - `calendar_create_event` (POST /calendar/v3/calendars/{id}/events; summary, description, start, end).
  - `calendar_update_event` (PATCH; summary/description/start/end partial).
  - `calendar_delete_event` (DELETE).
  - Type-check clean. No new foundation; no duplicate OAuth/REST/MCP logic.

## 6. Root-Cause Gate

- Classification: `PROVEN_MISSING_SCOPE` (write scope `calendar` absent) AND `PROVEN_IMPLEMENTATION_GAP` (no write tools in the read-only MCP). Both blockers addressed: scope via progressive OAuth, tools via minimal constrained addition.

## 7. Capability Check

- `google.calendar.write -> AUTHORIZATION_REQUIRED`, missing `[https://www.googleapis.com/auth/calendar]`; `google.calendar.read -> CAPABILITY_GRANTED`.

## 8. Progressive OAuth

- Generated consent URL via existing `generateAuthUrl` (`scopes: ['https://www.googleapis.com/auth/calendar']`, `include_granted_scopes=true`, PKCE S256, redirect to running app callback, state saved).
- USER INTERACTIVE CHECKPOINT: user opened the URL, signed in as `kanalconsultant.indonesia@gmail.com`, approved Calendar access. Completion observed via persisted state.
- Post-consent: 14 scopes (all 13 prior preserved — superset) incl. `calendar`; `google.calendar.write -> CAPABILITY_GRANTED`. Same identity, no duplicate connection.

## 9. Calendar WRITE E2E

Through the custom Calendar MCP (stdio):

- CREATE: `calendar_create_event` (primary calendar) → `eventId: mvhuihb7utjh86hlkiifdeqdt4`, summary `KANAL MCP OAuth Proof - Calendar Write - 2026-08-20T09-10-36-615Z`, description `hello from the custom Calendar MCP`, start `2026-08-21T09:00:00Z`, end `2026-08-21T09:30:00Z`, htmlLink returned (real Google API success).
- READ-BACK: `calendar_list_events` (window 2026-08-20/22) → event present with matching id, summary, start, end. (Existing read tool does not surface `description` — read-path limitation, not a defect.)
- UPDATE: `calendar_update_event` → summary `...Write UPDATED...`, description `updated by the custom Calendar MCP`.
- READ-BACK after update: event summary shows `UPDATED` (persisted). Description persistence verified via direct Calendar API GET (read-only evidence): `summary="KANAL MCP OAuth Proof - Calendar Write UPDATED - ..." description="updated by the custom Calendar MCP" start=2026-08-21T09:00:00Z end=2026-08-21T09:30:00Z`.

## 10. Cleanup

- `calendar_delete_event` proven with a fresh event: created `9svohueoav8le8sc2u772sbr00` → deleted via MCP (`deleted: true`) → verified absent in `calendar_list_events` after propagation.
- First test event `mvhuihb7utjh86hlkiifdeqdt4` deleted (subsequent operations returned `410 (deleted)` and the event was absent from the list; initial direct GET showed eventual-consistency lag).
- Calendar left clean (only pre-existing `test` event remains). Cleanup: PROVEN.

## 11. Restart Persistence

- Fresh process (restart simulation): `calendar_list_calendars` → primary `kanalconsultant.indonesia@gmail.com`; created event `h8mt4v30695b1dvfgbfjce8gro` and deleted it via the MCP — WRITE survives restart with no second OAuth prompt. PROVEN.

## 12. Regression Gates

- Sheets: unchanged; `list_sheets` → 12 sheets; `read_range` → real rows. PASS.
- Docs: `docs_list_documents` → 5 docs; read/write capabilities GRANTED. PASS.
- Slides: read/write capabilities GRANTED (TASK-077). PASS.
- Drive: `drive_list_files` → 5 files; search OK; drive.write GRANTED. PASS.
- Apps Script: `apps_script_list_projects` → 1 project. PASS.
- Calendar: list calendars (2, primary identity), events read, new WRITE capability. PASS.
- Identity: all MCPs resolve to single `local-user` (`kanalconsultant.indonesia@gmail.com`). PASS.

## 13. Error Handling

- create missing summary → `summary is required.`
- create invalid time range → `start must be earlier than end.`
- create invalid date → `start must be a valid date/time (RFC 3339...).`
- update missing eventId → `eventId is required.`
- update nonexistent event → normalized `Google Calendar API 404 (notFound)`.
- delete nonexistent event → normalized `404 (notFound)`.
- unknown tool → MCP-level error.
- No crash, no raw credential leakage, no infinite OAuth loop. PASS.

## 14. Identity Consistency

- Single `local-user` connection; all MCPs use `kanalconsultant.indonesia@gmail.com`; no duplicate connection created. PASS.

## 15. Credential Safety

- No access token, refresh token, OAuth code, or client secret in task output, MCP responses, or evidence. No credential file committed. Git diff limited to the intended Calendar MCP change + this task file. PASS.

## 16. Evidence Matrix

| Gate | Evidence | Status |
| --- | --- | --- |
| Baseline | Branch/HEAD 3c7e7e4, 241 WIP, 13 scopes, identity | PROVEN |
| Identity | `kanalconsultant.indonesia@gmail.com` single connection | PROVEN |
| Current scopes | 13 pre / 14 post (calendar added, superset) | PROVEN |
| Calendar capability | write AUTHORIZATION_REQUIRED → CAPABILITY_GRANTED | PROVEN |
| Root cause | PROVEN_MISSING_SCOPE + PROVEN_IMPLEMENTATION_GAP | PROVEN |
| Progressive OAuth | Consent URL + user consent + persisted scope | PROVEN |
| Scope persistence | 13 prior scopes preserved, calendar added | PROVEN |
| Calendar CREATE | event `mvhuihb7utjh86hlkiifdeqdt4` (real API) | PROVEN |
| READ-BACK | list_events matches id/summary/start/end | PROVEN |
| UPDATE | summary + description updated | PROVEN |
| UPDATE READ-BACK | UPDATED summary + description via API GET | PROVEN |
| Cleanup | delete + absent verification; calendar clean | PROVEN |
| Restart | fresh process read + create/delete, no re-consent | PROVEN |
| Sheets regression | 12 sheets + real read | PASS |
| Docs regression | list OK; capabilities GRANTED | PASS |
| Slides regression | capabilities GRANTED | PASS |
| Drive regression | list/search OK | PASS |
| Apps Script regression | list OK | PASS |
| Error handling | 7/7 controlled/normalized | PASS |
| Credential safety | No leakage | PASS |

## 17. Verdict

- PASS — Calendar WRITE capability granted (`calendar` via real user consent, additive, same identity, superset preserved); CREATE, READ-BACK, UPDATE, UPDATE READ-BACK all proven against real Google API state; cleanup proven; restart persistence proven (incl. post-restart write); all regression gates pass; error handling controlled; no credential leakage. Implementation change was the minimal constrained write surface (create/update/delete) required to complete the defined E2E, justified by a proven implementation gap.

## 18. Change Discipline

- Root cause proven (missing scope + missing write tools). Existing read-only MCP extended with the smallest write surface; no new OAuth/capability/REST/MCP foundation. Sheets untouched. Unrelated WIP untouched.

## 19. Execution Summary

- Final verdict: PASS.
- Root cause: PROVEN_MISSING_SCOPE (`calendar`) + PROVEN_IMPLEMENTATION_GAP (no write tools).
- Identity: `kanalconsultant.indonesia@gmail.com` (local-user).
- Scopes before: 13 (calendar.readonly present). After: 14 (calendar added; all prior preserved).
- OAuth result: progressive consent completed; persisted.
- Calendar ID: primary (`kanalconsultant.indonesia@gmail.com`).
- Test event IDs: `mvhuihb7utjh86hlkiifdeqdt4` (CREATE/UPDATE/READ-BACK), `9svohueoav8le8sc2u772sbr00` (DELETE proof), `h8mt4v30695b1dvfgbfjce8gro` (restart probe). Times: 2026-08-21T09:00:00Z→09:30:00Z (main), delete probe 10:00–10:15Z, restart probe 11:00–11:10Z.
- CREATE evidence: event `mvhuihb7utjh86hlkiifdeqdt4` with htmlLink.
- READ-BACK evidence: list_events match.
- UPDATE evidence: summary UPDATED + description `updated by the custom Calendar MCP`.
- Cleanup evidence: 410 (deleted) + list absence + fresh delete round-trip.
- Restart evidence: fresh process read + create/delete, no re-consent.
- Regression results: Sheets/Docs/Slides/Drive/Apps Script/Calendar all PASS; identity consistent.
- Errors: 7/7 controlled/normalized.
- Files changed: `mcp-servers/google-calendar/server.ts` (+153/-4) — write surface; this task file.
- Commit hash: see git log for this task's commit.