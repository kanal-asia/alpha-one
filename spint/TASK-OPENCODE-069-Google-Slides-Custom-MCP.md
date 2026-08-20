# TASK-OPENCODE-069 — Google Slides Custom MCP

## Spec (verbatim)

**Objective**

Implement a custom Google Slides MCP using the proven shared Google MCP foundation from TASK-065, TASK-066, TASK-067, and TASK-068.

The implementation must use:

- `mcp-servers/shared/google/auth.ts`
- `mcp-servers/shared/google/rest.ts`
- `mcp-servers/shared/google/mcp.ts`

Do NOT use Google's official hosted Slides MCP.

Do NOT modify the existing Google Sheets MCP.

Do NOT redesign the shared Google foundation.

Do NOT create another OAuth/token system.

The target is a useful, constrained Google Slides MCP that works through the actual OpenCode runtime.

## 1. Scope

### In scope

1. MCP server bootstrap.
2. Google Slides REST API integration.
3. Read presentation metadata/content.
4. Discover/list presentations using Google Drive API where required.
5. Create a presentation.
6. Update presentation content using constrained Google Slides `batchUpdate`.
7. Tool schemas and argument validation.
8. Normalized Google API errors.
9. OpenCode MCP registration.
10. MCP protocol smoke test.
11. Read E2E through OpenCode.
12. Discovery E2E through OpenCode.
13. Write E2E using a disposable/test presentation where the currently granted OAuth scope permits it.
14. Sheets regression proof.
15. Final evidence and verdict.

### Out of scope

Do NOT implement:

- Google Drive MCP.
- Google Docs MCP changes.
- Google Sheets changes.
- Google Calendar changes.
- Google Apps Script MCP.
- Official Google-hosted Slides MCP.
- OAuth architecture redesign.
- Google Cloud configuration redesign.
- Generic MCP framework redesign.
- Import/export.
- Complex slide templating.
- Advanced animation.
- Charts/data sources.
- Embedded video/audio.
- Full arbitrary Slides API passthrough.
- Destructive modification of existing user presentations.

## 2. Existing Proven Foundation

Do not repeat previous audits unless a concrete regression is discovered.

Already proven:

- local Google identity;
- local credential persistence;
- token refresh;
- shared Google REST utility;
- shared MCP bootstrap;
- OpenCode MCP compatibility;
- Calendar custom MCP;
- Docs custom MCP read/discovery;
- Sheets MCP protection.

Reuse the existing foundation directly.

## 3. OAuth Scope Handling

Inspect the actual currently granted scopes through the shared auth utility.

Expected relevant Slides scope:

`https://www.googleapis.com/auth/presentations.readonly`

Write scope, if required by the implementation:

`https://www.googleapis.com/auth/presentations`

Discovery may use:

`https://www.googleapis.com/auth/drive.readonly`

or an already granted equivalent.

IMPORTANT:

Do NOT trigger OAuth reconnect automatically.

If a required write scope is missing, behave consistently with TASK-068:

- prove the scope is missing;
- implement and verify everything possible with existing authorization;
- report write as BLOCKED/CONDITIONAL;
- do not create a separate OAuth task.

If read scope is missing and therefore even read cannot be proven, stop and report the evidence rather than redesigning OAuth.

## 4. Architecture

Create:

`mcp-servers/google-slides/server.ts`

Use:

`mcp-servers/shared/google/auth.ts`

`mcp-servers/shared/google/rest.ts`

`mcp-servers/shared/google/mcp.ts`

Do NOT copy OAuth/token refresh/bootstrap implementations from another MCP.

Service-specific logic belongs in the Slides server.

Shared concerns remain in shared utilities.

## 5. Required Tools

The MCP MUST expose these minimum tools.

### `slides_get_presentation`

Read a presentation.

Input:

- `presentationId`

Return a normalized representation containing at minimum:

- presentation ID;
- title;
- page/slides count;
- useful slide-level information;
- revision information where available.

Do not return an unnecessarily huge raw Google API payload.

Bound the response size.

### `slides_list_presentations`

Discover Google Slides presentations.

Use Drive API only for discovery.

Input:

- optional `query`;
- optional `pageSize`;
- optional `pageToken`.

The query must support filtering by presentation name.

Only return Google Slides presentations.

This is a Slides discovery tool, NOT a general Drive tool.

### `slides_create_presentation`

Create a presentation.

Input:

- `title`.

Return:

- presentation ID;
- title;
- URL if safely derivable.

Do not automatically create arbitrary slides unless required by the API.

### `slides_update_presentation`

Update a presentation using constrained `batchUpdate`.

The implementation MUST NOT expose arbitrary Google Slides `batchUpdate` requests.

Support only a small, useful subset sufficient for normal agent operation.

Minimum recommended operations:

- create slide;
- insert text into a text box;
- update existing text where safely addressable.

If implementation complexity or API semantics make one of these unsafe, implement the smallest proven subset and document it.

Do NOT implement:

- arbitrary request passthrough;
- formatting engines;
- theme manipulation;
- animations;
- charts;
- media insertion;
- complex layout manipulation.

## 6. Argument Validation

Every tool must validate arguments.

Examples:

### Presentation ID

Use a bounded identifier validation appropriate for Google resource IDs.

Reject:

- empty IDs;
- malformed IDs;
- excessive length.

### Title

Bound title length.

Reject empty titles.

### Query

Bound query length.

### Page size

Use a safe bounded range, for example:

`1–50`

### Text

Bound text size.

Do not allow unbounded payloads to reach Google.

Errors must be clear and controlled.

## 7. Safety

The custom MCP must not become an unrestricted Google Slides proxy.

Rules:

- no raw arbitrary REST endpoint;
- no raw arbitrary `batchUpdate`;
- no destructive operations on existing user presentations during testing;
- no credential/token logging;
- no secret output;
- no uncontrolled payload sizes.

For write E2E:

- create a disposable presentation;
- perform modifications only against that test presentation;
- read it back;
- clean it up if safely possible;
- if cleanup permission is unavailable, document the limitation and leave the test artifact untouched.

Never delete an existing user presentation.

## 8. Phase 0 — Baseline

Before modification capture:

- git branch;
- current commit;
- git status;
- current OpenCode MCP list;
- current Google identity;
- current granted scopes;
- current Sheets MCP status;
- current Docs MCP status;
- current Calendar MCP status.

Confirm:

- Sheets remains connected;
- existing custom MCPs remain operational;
- official Google-hosted Slides MCP is absent.

Do not modify anything during baseline.

## 9. Phase 1 — Pattern Discovery

Inspect:

- `mcp-servers/google-docs/server.ts`;
- `mcp-servers/shared/google/auth.ts`;
- `mcp-servers/shared/google/rest.ts`;
- `mcp-servers/shared/google/mcp.ts`.

Reuse proven patterns.

Do NOT modify Docs or Sheets simply to make Slides fit the architecture.

## 10. Phase 2 — Slides REST Proof

Before implementing MCP behavior, prove the shared REST utility can access Google Slides.

Use a known readable presentation.

Perform a read-only Slides API request.

Expected:

HTTP 2xx.

Capture:

- endpoint;
- status;
- title;
- slide/page count;
- normalized result.

If this fails, diagnose the concrete cause.

Do not automatically blame OAuth or MCP.

## 11. Phase 3 — Implement Custom Slides MCP

Implement:

- server bootstrap;
- tools/list;
- tools/call;
- four required tools;
- argument validation;
- Slides REST calls;
- Drive discovery;
- normalized responses/errors.

Use the shared MCP bootstrap.

No new MCP protocol implementation.

## 12. Phase 4 — Register in OpenCode

Add the custom Slides MCP to the existing `opencode.jsonc`.

Expected pattern:

- local MCP;
- existing project working directory;
- `npx tsx`;
- `mcp-servers/google-slides/server.ts`.

Do NOT register:

`https://slidesmcp.googleapis.com/mcp/v1`

Do NOT modify existing MCP registrations except the required new Slides entry.

Do NOT modify the Sheets entry.

## 13. Phase 5 — Type Check

Run a focused TypeScript check on the new server and relevant shared imports.

Expected:

exit code `0`.

Do not introduce unrelated repository-wide fixes.

Record exact command and result.

## 14. Phase 6 — MCP Protocol Smoke

Run:

`opencode mcp list`

Expected:

- `google-slides` connected;
- existing Sheets MCP remains connected;
- Docs/Calendar custom MCPs remain available;
- official Google Slides MCP absent.

Then verify:

- initialize;
- `tools/list`.

Expected:

all four required tools are discoverable with valid schemas.

## 15. Phase 7 — Read E2E

Through the actual OpenCode runtime:

1. discover Slides tools;
2. call `slides_get_presentation`;
3. use a known readable presentation;
4. verify real data is returned.

Evidence must include at minimum:

- presentation ID;
- title;
- slide count;
- useful slide information.

Required proof:

`TOOL DISCOVERED → TOOL CALL SUCCESS → REAL DATA RETURNED`

Direct REST success alone is insufficient.

## 16. Phase 8 — Discovery E2E

Through the actual OpenCode runtime:

Call:

`slides_list_presentations`

Verify:

- at least 2 presentations where available;
- name query works;
- pagination works or correct end-of-results behavior is demonstrated;
- only Google Slides presentations are returned.

Do not expose unrelated Drive files.

## 17. Phase 9 — Write E2E

First inspect the actual granted Slides write scope.

If:

`https://www.googleapis.com/auth/presentations`

is granted:

Perform:

`CREATE → UPDATE → READ-BACK`

using a disposable presentation.

Minimum proof:

1. create presentation;
2. add a test slide or supported text content;
3. read the presentation back;
4. verify the written content exists.

Do not test writes against an existing user presentation.

If the write scope is missing:

- attempt no OAuth reconnect;
- document the exact scope evidence;
- test the read/discovery capabilities fully;
- classify write as blocked/conditional.

This is consistent with TASK-068.

## 18. Phase 10 — Cleanup

If a disposable presentation was created:

Clean it up only if the existing authorization safely permits deletion.

If deletion is unavailable:

- do not request new OAuth scope solely for cleanup;
- document the test presentation;
- do not delete any existing user presentation.

## 19. Phase 11 — Error Handling

Test at least:

1. malformed presentation ID;
2. well-formed nonexistent presentation ID.

Expected:

- controlled validation error for malformed ID;
- normalized 404/error for nonexistent presentation;
- MCP process remains alive;
- no token leakage.

Also test invalid tool arguments where practical.

## 20. Phase 12 — Sheets Regression

Run the existing read-only Sheets smoke test.

Verify:

- Sheets MCP connected;
- `tools/list` works;
- `list_sheets` works;
- `read_range` works;
- real spreadsheet data is returned.

Verify:

`mcp-servers/google-sheets/server.ts`

has no unintended modifications.

This is a regression gate only.

Do not refactor Sheets.

## 21. Phase 13 — Cross-MCP Regression

Verify that adding Slides did not break:

- custom Calendar MCP;
- custom Docs MCP;
- existing Sheets MCP.

Use lightweight protocol/runtime checks only.

Do not repeat their full E2E suites.

## 22. Evidence Matrix

| Gate | Requirement | Evidence | Status |
|---|---|---|---|
| A | Shared auth reused | source evidence | PASS/FAIL |
| B | Slides REST 2xx | runtime evidence | PASS/FAIL |
| C | Type-check clean | compiler evidence | PASS/FAIL |
| D | Custom Slides MCP starts | OpenCode evidence | PASS/FAIL |
| E | tools/list works | MCP evidence | PASS/FAIL |
| F | Read E2E returns real data | runtime evidence | PASS/FAIL |
| G | Discovery works | runtime evidence | PASS/FAIL |
| H | Query/pagination works | runtime evidence | PASS/FAIL |
| I | Create works or scope blocker proven | runtime evidence | PASS/CONDITIONAL |
| J | Update/read-back works or scope blocker proven | runtime evidence | PASS/CONDITIONAL |
| K | Error handling works | runtime evidence | PASS/FAIL |
| L | Sheets regression passes | runtime evidence | PASS/FAIL |
| M | Other custom MCPs remain healthy | runtime evidence | PASS/FAIL |
| N | Official Slides MCP absent | config/runtime evidence | PASS/FAIL |
| O | No unrelated changes | git evidence | PASS/FAIL |

## 23. Quality Gates

### Gate A — Foundation Reuse

Shared auth/rest/mcp utilities are used.

No duplicate OAuth/token/bootstrap implementation.

### Gate B — REST

Real Slides REST request succeeds.

### Gate C — MCP Runtime

OpenCode discovers and executes the custom Slides MCP.

### Gate D — Read

Real presentation data is returned through MCP.

### Gate E — Discovery

Presentation listing, query, and pagination are proven.

### Gate F — Write

Create/update/read-back succeeds if the existing OAuth grant permits it.

If write is blocked by a missing scope, classify the limitation rather than creating an OAuth task.

### Gate G — Safety

No unrestricted `batchUpdate`.

No arbitrary REST passthrough.

No secrets leaked.

### Gate H — Sheets Protection

Existing Sheets MCP remains unchanged and functional.

### Gate I — Cross-MCP Stability

Existing custom Docs and Calendar MCPs remain operational.

### Gate J — Git Discipline

Only intended files are committed.

## 24. Evidence Classification

Use:

- PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

Do not convert an unproven condition into a bug.

If a blocker is caused by the existing OAuth grant:

classify it as an external authorization prerequisite.

Do not create a separate OAuth task.

## 25. Final Verdict

Use exactly one:

`PASS`
`CONDITIONAL`
`BLOCKED`
`FAIL`

PASS requires:

- Slides REST works;
- custom Slides MCP works through OpenCode;
- tools/list works;
- read works against real data;
- discovery works;
- query/pagination is proven;
- create/update/read-back works;
- error handling works;
- Sheets regression passes;
- existing custom MCPs remain healthy;
- official Slides MCP is absent;
- no unrelated changes.

If read/discovery are fully proven but write is unavailable solely because the required write scope is not granted:

`CONDITIONAL`

Do not force write implementation or OAuth reconnect merely to obtain PASS.

## 26. Required Execution Summary

Before Git, append to THIS TASK FILE:

## Execution Summary

- Branch:
- Baseline commit:
- Files changed:
- Shared utilities reused:
- Granted scopes:
- Slides REST proof:
- Type-check:
- MCP registration:
- MCP protocol smoke:
- Tools exposed:
- Read E2E:
- Discovery E2E:
- Query E2E:
- Pagination E2E:
- Create E2E:
- Update E2E:
- Read-back E2E:
- Cleanup:
- Error handling:
- Sheets regression:
- Docs/Calendar regression:
- Official Slides MCP absent:
- Evidence matrix:
- Root cause(s):
- Final verdict:
- Remaining limitation:
- Next task:

All entries must be based on actual execution evidence.

## 27. Git Discipline

Before staging:

`git status`

`git diff --stat`

`git diff`

Verify only intended Slides implementation, registration, and task-file changes exist.

Do NOT stage:

- `.env`;
- OAuth credentials;
- tokens;
- generated files;
- unrelated WIP;
- Sheets changes;
- Docs changes;
- Calendar changes.

Input your execution summary on the same task file

Then commit ONLY the intended files.

After commit:

`git status`

Report:

- commit hash;
- files committed;
- final verdict;
- remaining working-tree changes, if any.

---

## Execution Summary

- Branch: `task/gworkspace-002-r1-drive-access-rework`
- Baseline commit: `c8d6592` (feat: TASK-068 google docs custom MCP)
- Files changed (committed): `mcp-servers/google-slides/server.ts` (new), `spint/TASK-OPENCODE-069-Google-Slides-Custom-MCP.md` (new); `opencode.jsonc` updated (outside git repo — google-slides registration added; Sheets and Docs entries untouched)
- Shared utilities reused: `mcp-servers/shared/google/auth.ts` (getAccessToken), `rest.ts` (googleRequest, GoogleApiError), `mcp.ts` (startMcpServer). No new OAuth/token/bootstrap code.
- Granted scopes (9, `local-user`): docs.readonly, presentations.readonly, drive.readonly, script.projects, spreadsheets, userinfo.email, userinfo.profile, calendar.readonly, openid. `presentations` (write) NOT granted; `drive.file` NOT granted.
- Slides REST proof: Drive discovery found 5 presentations; `GET https://slides.googleapis.com/v1/presentations/1AyilWDzGtrbIMwglX3_brNjiApZM5AXTNgvbpnjQ5w0` → 2xx, title "Trekkers Indonesia - Kanal Offering Letter (NVR)", 21 slides, revisionId `SRFJ2aQL_c_9fQ`. (PROVEN)
- Type-check: `npx tsc --ignoreConfig --noEmit --skipLibCheck --target es2022 --lib es2023 --module esnext --moduleResolution bundler --allowImportingTsExtensions --types node mcp-servers/google-slides/server.ts` → TSC_EXIT=0, clean. (PROVEN)
- MCP registration: added `google-slides` local entry to `C:\Users\ASUS\.config\opencode\opencode.jsonc` (`npx tsx mcp-servers/google-slides/server.ts`, cwd `C:\dev\alpha-one`, enabled). Official Slides MCP NOT registered. Sheets/Docs entries unmodified.
- MCP protocol smoke: `opencode mcp list` → google-sheets ✓, google-docs ✓, google-slides ✓ connected; initialize → `{protocolVersion:"2024-11-05", serverInfo:{name:"google-slides",version:"0.1.0"}}`; tools/list → all 4 tools with valid schemas. (PROVEN)
- Tools exposed: `slides_get_presentation`, `slides_list_presentations`, `slides_create_presentation`, `slides_update_presentation`.
- Read E2E: `slides_get_presentation` on real deck → presentationId, title, revisionId, slideCount=21, per-slide summaries (objectId, extracted title, element count), bounded to first 20 slide details. (PROVEN)
- Discovery E2E: `slides_list_presentations` pageSize 3 → 3 presentations (Trekkers Indonesia; Booni Baby - Kanal Offering Letter; Kanal Consultant - Compro & Price (2026)); Slides-only filter; `nextPageToken` returned. (PROVEN)
- Query E2E: `query:"Booni"` → 1 presentation (Booni Baby - Kanal Offering Letter). (PROVEN)
- Pagination E2E: `pageSize:2` page 1 → Trekkers + Booni Baby + token; `pageToken:<token>` page 2 → Kanal Consultant Compro & Price + another. (PROVEN)
- Create E2E: `slides_create_presentation` → 403 "Request had insufficient authentication scopes" (write scope `presentations` NOT granted). (CONDITIONAL)
- Update E2E: `slides_update_presentation` (createSlide) → 403 "The caller does not have permission". (CONDITIONAL)
- Read-back E2E: N/A — no write occurred (no test presentation created).
- Cleanup: N/A — nothing created; deletion would require `drive.file`/`drive` (not granted) anyway. No existing user presentation touched.
- Error handling: malformed id → controlled "presentationId is malformed…" error; missing arg → "presentationId is required."; `pageSize:0` → "pageSize must be an integer between 1 and 50."; well-formed non-existent id → 404 "Requested entity was not found."; MCP process alive after all errors; no token leakage. (PROVEN)
- Sheets regression: `google_sheets.list_sheets` + `google_sheets.read_range` (`Sheet1!A1:B3` → No/SKU + SMSID_PRODUK1_CAT/SMSID_PRODUK2_CAT) both 2xx; `mcp-servers/google-sheets/server.ts` untouched. (PROVEN)
- Docs/Calendar regression: Docs `docs_list_documents` + `docs_get_document` healthy (PROVEN). Calendar MCP is NOT registered in OpenCode (implementation deferred in TASK-067), so no calendar runtime check was applicable — noted, no regression observed in config.
- Official Slides MCP absent: `opencode mcp list` shows only google-sheets/google-docs/google-slides; `https://slidesmcp.googleapis.com/mcp/v1` NOT registered. (PROVEN)
- Evidence matrix:

| Gate | Requirement | Evidence | Status |
|---|---|---|---|
| A | Shared auth reused | server.ts imports from `../shared/google/*` only | PASS |
| B | Slides REST 2xx | presentations.get 2xx (21 slides) | PASS |
| C | Type-check clean | TSC_EXIT=0 | PASS |
| D | Custom Slides MCP starts | `opencode mcp list` connected | PASS |
| E | tools/list works | 4 tools listed | PASS |
| F | Read E2E returns real data | real deck read | PASS |
| G | Discovery works | 3 presentations listed | PASS |
| H | Query/pagination works | Booni filter + page-2 token | PASS |
| I | Create works or scope blocker proven | 403 scope evidence | CONDITIONAL |
| J | Update/read-back works or scope blocker proven | 403 scope evidence | CONDITIONAL |
| K | Error handling works | 4 controlled cases | PASS |
| L | Sheets regression passes | list_sheets + read_range 2xx | PASS |
| M | Other custom MCPs remain healthy | Docs healthy; Calendar N/A (not registered) | PASS |
| N | Official Slides MCP absent | config/runtime | PASS |
| O | No unrelated changes | only 2 files committed (+ config outside repo) | PASS |

- Root cause(s): Write (create/update) is unavailable solely because the OAuth grant for `local-user` does not include `https://www.googleapis.com/auth/presentations` (only `presentations.readonly`). External authorization prerequisite — not a code defect.
- Final verdict: `CONDITIONAL` — read/discovery/query/pagination fully proven; write blocked by missing `presentations` scope, consistent with TASK-068. No OAuth reconnect attempted; no separate OAuth task created.
- Remaining limitation: `slides_create_presentation` and `slides_update_presentation` return controlled 403 until `https://www.googleapis.com/auth/presentations` is granted via a future re-consent; test-presentation cleanup would additionally need `drive.file`.
- Next task: none required from this task; a future OAuth scope re-consent (adding `presentations`, and optionally `drive.file`) would enable the write E2E, otherwise no follow-up.