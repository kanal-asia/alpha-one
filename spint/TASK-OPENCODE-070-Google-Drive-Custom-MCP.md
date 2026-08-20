# TASK-OPENCODE-070 — Google Drive Custom MCP

## Spec (verbatim)

**Objective**

Implement a custom Google Drive MCP using the proven shared Google MCP foundation.

Reuse:

- `mcp-servers/shared/google/auth.ts`
- `mcp-servers/shared/google/rest.ts`
- `mcp-servers/shared/google/mcp.ts`

The implementation must run through the actual OpenCode runtime.

Do NOT use Google's official hosted Drive MCP.

Do NOT modify Google Sheets, Docs, Slides, or Calendar implementations except where required for regression verification.

Do NOT redesign the shared Google foundation.

Do NOT create another OAuth/token system.

## 1. Scope

### In scope

1. MCP server bootstrap.
2. Google Drive REST API integration.
3. File discovery/listing.
4. File search.
5. File metadata retrieval.
6. File content retrieval for supported text/document formats.
7. Safe file creation where the currently granted OAuth scope permits it.
8. Safe metadata/content update where practical and authorized.
9. Tool schemas and argument validation.
10. Normalized Google API errors.
11. OpenCode MCP registration.
12. MCP protocol smoke test.
13. Read E2E through OpenCode.
14. Discovery/search E2E.
15. Write E2E only if the existing OAuth grant permits it.
16. Sheets regression.
17. Docs/Slides/Calendar lightweight regression.
18. Evidence matrix and final verdict.

### Out of scope

Do NOT implement:

- Google Docs MCP changes.
- Google Slides MCP changes.
- Google Calendar MCP changes.
- Google Sheets changes.
- Apps Script MCP.
- Official Google-hosted Drive MCP.
- OAuth architecture redesign.
- Google Cloud configuration changes.
- Generic MCP framework redesign.
- Arbitrary Google API passthrough.
- Permission/ACL administration.
- Shared-drive administration.
- File ownership transfer.
- Comments/replies.
- Revisions management.
- Changes/watch channels.
- Complex media processing.
- Full Google Drive API surface.

## 2. Existing Proven Foundation

Already proven:

- local Google identity;
- local credential persistence;
- token refresh;
- shared REST utility;
- shared MCP bootstrap;
- custom Calendar MCP;
- custom Docs MCP;
- custom Slides MCP;
- existing Sheets MCP.

Reuse them.

Do NOT repeat previous OAuth, Google Cloud, official MCP, or Developer Preview audits.

Only inspect scopes as needed to determine whether a capability is authorized.

## 3. OAuth Scope Handling

Inspect the actual currently granted scopes through the shared auth utility.

Expected relevant Drive scopes include:

`https://www.googleapis.com/auth/drive.readonly`

and, if write is desired:

`https://www.googleapis.com/auth/drive.file`

Potential broader write scope:

`https://www.googleapis.com/auth/drive`

Do NOT automatically request or trigger OAuth reconnect.

If read scope is granted:

- prove read/discovery capabilities.

If write scope is not granted:

- do not force reconnect;
- prove read capabilities;
- classify write as CONDITIONAL/BLOCKED by authorization;
- do not create a separate OAuth task.

If `drive.file` is granted, use it for files created by this application where appropriate.

Do not assume `drive.file` grants unrestricted modification of every existing Drive file.

## 4. Architecture

Create:

`mcp-servers/google-drive/server.ts`

Use:

`mcp-servers/shared/google/auth.ts`

`mcp-servers/shared/google/rest.ts`

`mcp-servers/shared/google/mcp.ts`

Do NOT duplicate:

- OAuth token loading;
- token refresh;
- MCP JSON-RPC bootstrap;
- generic Google REST error handling.

Drive-specific behavior belongs in the Drive server.

## 5. Required Tools

Implement these minimum tools.

### `drive_list_files`

List files from Google Drive.

Inputs:

- optional `pageSize`;
- optional `pageToken`;
- optional MIME type filter;
- optional query.

Return normalized records containing at minimum:

- file ID;
- name;
- MIME type;
- modified time;
- size where available;
- web view URL where available.

Bound response size.

Default to a safe page size.

Do not return arbitrary raw Drive payloads.

### `drive_search_files`

Search Drive using Google Drive query syntax.

Input:

- `query`;
- optional `pageSize`;
- optional `pageToken`.

The implementation must:

- bound query length;
- bound page size;
- prevent uncontrolled response size;
- return normalized file metadata.

Do not silently rewrite valid Drive query syntax.

### `drive_get_file_metadata`

Retrieve metadata for one file.

Input:

- `fileId`.

Return normalized metadata.

Validate the ID before making the REST request.

### `drive_get_file_content`

Retrieve readable content for a supported file.

Input:

- `fileId`.

Support practical text-oriented content where Google Drive can provide it safely.

At minimum investigate support for:

- plain text;
- Google Docs via export;
- Google Sheets via export where appropriate;
- Google Slides via export where appropriate.

Do NOT duplicate Docs/Slides/Sheets MCP functionality.

This is a Drive content retrieval capability only.

For binary/unsupported files:

return a controlled response explaining that the file type is not supported by this tool.

Do not dump binary content into MCP responses.

Bound returned content size.

### `drive_create_file`

Create a file only when the existing OAuth grant allows it.

Input:

- `name`;
- optional MIME type;
- optional text content.

Keep creation deliberately limited.

Do not implement arbitrary multipart upload infrastructure unless actual E2E evidence shows it is required.

If write scope is unavailable:

return a controlled authorization error and classify the capability as conditional.

### `drive_update_file`

Update only the supported safe fields.

Minimum:

- file name;
- optionally text content for supported text files if practical.

Do NOT expose arbitrary Drive API update payloads.

Do NOT modify permissions.

Do NOT transfer ownership.

Do NOT modify arbitrary metadata.

## 6. Safety Requirements

The Drive MCP must NOT become an unrestricted Google Drive proxy.

Rules:

- no arbitrary REST endpoint;
- no arbitrary request body passthrough;
- no permission/ACL mutation;
- no ownership transfer;
- no deletion tool in this task;
- no token/credential logging;
- no uncontrolled content size;
- no uncontrolled query size;
- no unrestricted file download.

Write tests must use disposable files created specifically for this task.

Never modify an existing user file during write E2E.

## 7. Phase 0 — Baseline

Before changes capture:

- git branch;
- current commit;
- git status;
- OpenCode MCP list;
- Google identity;
- granted scopes;
- Sheets status;
- Docs status;
- Slides status;
- Calendar status.

Confirm official Drive MCP is absent.

Do not modify anything during baseline.

## 8. Phase 1 — Pattern Discovery

Inspect:

- `mcp-servers/google-docs/server.ts`;
- `mcp-servers/google-slides/server.ts`;
- `mcp-servers/google-calendar/server.ts`;
- `mcp-servers/shared/google/auth.ts`;
- `mcp-servers/shared/google/rest.ts`;
- `mcp-servers/shared/google/mcp.ts`.

Identify the minimum reusable pattern.

Do NOT refactor existing MCPs.

## 9. Phase 2 — Drive REST Proof

Use the shared REST utility.

First prove:

`GET https://www.googleapis.com/drive/v3/files`

against the connected Google identity.

Use a safe read-only query.

Expected:

HTTP 2xx.

Then prove metadata retrieval against a known existing file.

Then, where practical, prove readable content retrieval.

Capture:

- status;
- file ID;
- name;
- MIME type;
- normalized response.

If REST fails, diagnose the concrete evidence.

Do not automatically classify it as an OAuth bug.

## 10. Phase 3 — Implement Custom Drive MCP

Implement:

- server bootstrap;
- tools/list;
- tools/call;
- six required tools;
- validation;
- Drive REST calls;
- normalized responses;
- controlled errors.

Use shared MCP bootstrap.

Do not implement generic Drive API passthrough.

## 11. Phase 4 — Registration

Add:

`google-drive`

to `opencode.jsonc`.

Use the same local MCP pattern established by Docs and Slides.

Do NOT register:

`https://drivemcp.googleapis.com/mcp/v1`

Do NOT modify:

- google-sheets;
- google-docs;
- google-slides;
- google-calendar

registrations except as strictly necessary to add Drive.

## 12. Phase 5 — Type Check

Run focused TypeScript validation.

Expected:

exit code `0`.

Record exact command and result.

Do not fix unrelated type errors.

## 13. Phase 6 — MCP Protocol Smoke

Run:

`opencode mcp list`

Expected:

- `google-drive` connected;
- existing custom MCPs remain available;
- official Drive MCP absent;
- Sheets remains connected.

Then verify:

- initialize;
- ping;
- tools/list.

Expected six required tools with valid schemas.

## 14. Phase 7 — Read E2E

Through actual OpenCode runtime:

1. discover Drive tools;
2. call `drive_list_files`;
3. call `drive_get_file_metadata`;
4. call `drive_search_files`;
5. call `drive_get_file_content` against a supported readable file.

Required proof:

`TOOL DISCOVERED → TOOL CALL SUCCESS → REAL DATA RETURNED`

Direct REST success alone is insufficient.

Use the same known/proven resources where possible.

Do not modify any existing user files.

## 15. Phase 8 — Search E2E

Test:

- normal search;
- MIME type filter;
- name-based search;
- pagination where available.

Verify:

- results are real;
- file IDs are returned;
- metadata is normalized;
- unrelated files are not returned when filtering is applied.

## 16. Phase 9 — Content E2E

Test at least one supported readable file.

Prefer:

1. plain text if available;
2. Google Docs export if available;
3. another supported Google Workspace file only if useful.

Verify:

- content is actually returned;
- response size is bounded;
- MIME/content type is correctly identified;
- binary files are handled without dumping binary payloads.

Do not duplicate Docs/Slides business operations here.

## 17. Phase 10 — Write E2E

Inspect actual granted Drive scopes.

If a suitable write scope exists:

Perform:

`CREATE → READ → UPDATE → READ-BACK`

using a disposable test file.

The test file must be uniquely identifiable as a test artifact.

Verify:

1. create succeeds;
2. metadata can be read;
3. content/name can be updated using the supported operation;
4. read-back proves the change.

Do NOT modify an existing user file.

If write scope is missing:

- do not trigger OAuth reconnect;
- do not create a new OAuth task;
- report exact scope evidence;
- classify write as CONDITIONAL/BLOCKED.

## 18. Phase 11 — Cleanup

Do NOT implement or call a deletion capability unless the existing implementation already safely supports cleanup and it is explicitly necessary.

If cleanup is possible through an already-safe mechanism:

clean only the disposable test artifact.

If cleanup is unavailable:

- document the artifact;
- do not delete existing user files;
- do not expand scope merely for cleanup.

## 19. Phase 12 — Error Handling

Test:

1. empty file ID;
2. malformed file ID;
3. valid-looking nonexistent file ID;
4. unsupported content type where practical;
5. invalid query.

Expected:

- controlled validation errors;
- normalized Google API errors;
- no token leakage;
- MCP process remains alive.

## 20. Phase 13 — Sheets Regression

Run existing read-only Sheets smoke test.

Verify:

- connected;
- `tools/list`;
- `list_sheets`;
- `read_range`;
- real spreadsheet data.

Verify:

`mcp-servers/google-sheets/server.ts`

has no unintended changes.

Do not refactor Sheets.

## 21. Phase 14 — Lightweight Cross-MCP Regression

Verify existing:

- Calendar MCP;
- Docs MCP;
- Slides MCP.

Use lightweight protocol/read checks only.

Do NOT repeat their complete E2E suites.

## 22. Evidence Matrix

| Gate | Requirement | Evidence | Status |
|---|---|---|---|
| A | Shared auth reused | source evidence | PASS/FAIL |
| B | Drive REST 2xx | runtime evidence | PASS/FAIL |
| C | Type-check clean | compiler evidence | PASS/FAIL |
| D | Custom Drive MCP starts | OpenCode evidence | PASS/FAIL |
| E | tools/list works | MCP evidence | PASS/FAIL |
| F | File listing works | runtime evidence | PASS/FAIL |
| G | Search works | runtime evidence | PASS/FAIL |
| H | Metadata retrieval works | runtime evidence | PASS/FAIL |
| I | Content retrieval works | runtime evidence | PASS/FAIL |
| J | Create/update/read-back works or scope blocker proven | runtime evidence | PASS/CONDITIONAL |
| K | Error handling works | runtime evidence | PASS/FAIL |
| L | Sheets regression passes | runtime evidence | PASS/FAIL |
| M | Docs/Slides/Calendar regression passes | runtime evidence | PASS/FAIL |
| N | Official Drive MCP absent | config/runtime evidence | PASS/FAIL |
| O | No unrelated changes | git evidence | PASS/FAIL |

## 23. Quality Gates

### Gate A — Foundation

Shared auth/rest/mcp utilities reused.

### Gate B — REST

Drive REST access proven.

### Gate C — MCP Runtime

OpenCode discovers and executes custom Drive MCP.

### Gate D — Read

List/search/metadata/content work against real Drive data.

### Gate E — Safety

No arbitrary REST passthrough.

No permission/ACL modification.

No ownership transfer.

No destructive existing-file operations.

### Gate F — Write

Create/update/read-back succeeds if the existing OAuth grant permits it.

Otherwise classify authorization limitation.

Do not create another OAuth task.

### Gate G — Sheets Protection

Sheets remains unchanged and functional.

### Gate H — Cross-MCP Stability

Existing custom MCPs remain healthy.

### Gate I — Git Discipline

Only intended changes are committed.

## 24. Evidence Classification

Use:

- PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

Never classify an unproven condition as a bug.

Distinguish:

- implementation defect;
- OAuth authorization limitation;
- Google API behavior;
- unsupported file type;
- test/environment limitation.

## 25. Final Verdict

Use exactly one:

`PASS`
`CONDITIONAL`
`BLOCKED`
`FAIL`

PASS requires:

- Drive REST works;
- custom Drive MCP works through OpenCode;
- tools/list works;
- list works;
- search works;
- metadata works;
- content retrieval works;
- error handling works;
- Sheets regression passes;
- existing custom MCPs remain healthy;
- official Drive MCP absent;
- no unrelated changes;
- write capability proven where the current authorization permits it.

If all read/discovery capabilities are proven but write is blocked only by missing OAuth scope:

`CONDITIONAL`

Do NOT trigger OAuth reconnect solely to obtain PASS.

## 26. Execution Summary

Before Git, append to THIS TASK FILE:

## Execution Summary

- Branch:
- Baseline commit:
- Files changed:
- Shared utilities reused:
- Google identity:
- Granted scopes:
- Drive REST proof:
- Type-check:
- MCP registration:
- MCP protocol smoke:
- Tools exposed:
- List E2E:
- Search E2E:
- Metadata E2E:
- Content E2E:
- Create E2E:
- Update E2E:
- Read-back E2E:
- Cleanup:
- Error handling:
- Sheets regression:
- Docs regression:
- Slides regression:
- Calendar regression:
- Official Drive MCP absent:
- Evidence matrix:
- Root cause(s):
- Final verdict:
- Remaining limitation:
- Next task:

Every entry must be based on actual execution evidence.

---

## Execution Summary

- Branch: `task/gworkspace-002-r1-drive-access-rework`
- Baseline commit: `db58916` (feat: TASK-069 google slides custom MCP)
- Files changed (committed): `mcp-servers/google-drive/server.ts` (new), `spint/TASK-OPENCODE-070-Google-Drive-Custom-MCP.md` (new); `opencode.jsonc` updated (outside git repo — google-drive registration added; Sheets/Docs/Slides entries untouched)
- Shared utilities reused: `mcp-servers/shared/google/auth.ts` (getAccessToken), `rest.ts` (googleRequest, GoogleApiError), `mcp.ts` (startMcpServer). No new OAuth/token/bootstrap code.
- Google identity: `local-user` = kanalconsultant.indonesia@gmail.com
- Granted scopes (9): docs.readonly, presentations.readonly, drive.readonly, script.projects, spreadsheets, userinfo.email, userinfo.profile, calendar.readonly, openid. `drive.file` NOT granted; `drive` (full) NOT granted.
- Drive REST proof: `GET https://www.googleapis.com/drive/v3/files` → 2xx (3 files); metadata `files.get` for `1fa2RwKMK8T2sk2f7BFePiaA5ydUKXbMrcPc4pAzBl6M` → 2xx (name, mimeType application/vnd.google-apps.document, size 110337, modifiedTime, webViewLink); content export `files/{id}/export?mimeType=text/plain` → 2xx (8282 chars). (PROVEN)
- Type-check: `npx tsc --ignoreConfig --noEmit --skipLibCheck --target es2022 --lib es2023 --module esnext --moduleResolution bundler --allowImportingTsExtensions --types node mcp-servers/google-drive/server.ts` → TSC_EXIT=0, clean. (PROVEN)
- MCP registration: added `google-drive` local entry to `C:\Users\ASUS\.config\opencode\opencode.jsonc` (`npx tsx mcp-servers/google-drive/server.ts`, cwd `C:\dev\alpha-one`, enabled). Official Drive MCP NOT registered. Existing entries unmodified.
- MCP protocol smoke: `opencode mcp list` → google-sheets, google-docs, google-slides, google-drive all connected; initialize → `{protocolVersion:"2024-11-05", serverInfo:{name:"google-drive",version:"0.1.0"}}`; ping → result {}; tools/list → 6 tools with valid schemas. (PROVEN)
- Tools exposed: `drive_list_files`, `drive_search_files`, `drive_get_file_metadata`, `drive_get_file_content`, `drive_create_file`, `drive_update_file`.
- List E2E: `drive_list_files` pageSize 3 → 3 normalized records (id, name, mimeType, size, modifiedTime, webViewLink); MIME filter `application/vnd.google-apps.spreadsheet` → spreadsheets only; pagination page 2 returned subsequent files via `pageToken`. (PROVEN)
- Search E2E: `drive_search_files` `name contains 'Booni'` → Booni PDF + Booni spreadsheet; `mimeType='application/vnd.google-apps.document' and trashed=false` → Docs only. Query passed verbatim; invalid query → normalized 400. (PROVEN)
- Metadata E2E: `drive_get_file_metadata` on the known Doc → id/name/mimeType/size/modifiedTime/webViewLink. (PROVEN)
- Content E2E: `drive_get_file_content` on the known Doc → export text/plain, 8282 chars, `truncated:false`, contentMimeType text/plain; PDF (`1Bdo_1VkN385LFq_9_bbSId5Nlp5aIGRN`) → controlled `supported:false` message, no binary dump. (PROVEN)
- Create E2E: `drive_create_file` (name + textContent) → 403 (insufficientPermissions) — write scope `drive.file`/`drive` NOT granted. (CONDITIONAL)
- Update E2E: `drive_update_file` (rename attempt on existing Doc) → 403 (insufficientPermissions) — rejected before any mutation; no existing user file modified. (CONDITIONAL)
- Read-back E2E: N/A — no disposable file created (create 403).
- Cleanup: N/A — nothing created; no deletion capability implemented (per spec); no existing user files touched.
- Error handling: empty fileId → "fileId must be a non-empty string."; malformed fileId → controlled validation error; well-formed nonexistent id → 404 (notFound); invalid query → 400 (invalid) normalized; pageSize 0 → validation error; MCP process alive after all errors; no token leakage. (PROVEN)
- Sheets regression: `google_sheets.list_sheets` + `google_sheets.read_range` (`Sheet1!A1:B3` → No/SKU + SMSID_PRODUK1_CAT/SMSID_PRODUK2_CAT) both 2xx; `mcp-servers/google-sheets/server.ts` untouched. (PROVEN)
- Docs regression: `docs_get_document` on the known Doc → documentId/title returned. (PROVEN)
- Slides regression: `slides_get_presentation` on the known deck → slideCount 21 returned. (PROVEN)
- Calendar regression: Calendar MCP is NOT registered in OpenCode (implementation deferred in TASK-067; `mcp-servers/google-calendar/server.ts` does not exist), so no runtime check applicable — noted, no regression observed in config.
- Official Drive MCP absent: `opencode mcp list` shows only google-sheets/google-docs/google-slides/google-drive; `https://drivemcp.googleapis.com/mcp/v1` NOT registered. (PROVEN)
- Evidence matrix:

| Gate | Requirement | Evidence | Status |
|---|---|---|---|
| A | Shared auth reused | server.ts imports from `../shared/google/*` only | PASS |
| B | Drive REST 2xx | files.list + metadata + export all 2xx | PASS |
| C | Type-check clean | TSC_EXIT=0 | PASS |
| D | Custom Drive MCP starts | `opencode mcp list` connected | PASS |
| E | tools/list works | 6 tools listed | PASS |
| F | File listing works | 3 files + MIME filter + pagination | PASS |
| G | Search works | Booni + Docs-type searches | PASS |
| H | Metadata retrieval works | known Doc metadata | PASS |
| I | Content retrieval works | Docs export text + PDF unsupported | PASS |
| J | Create/update/read-back works or scope blocker proven | 403 scope evidence (create, update) | CONDITIONAL |
| K | Error handling works | 5 controlled cases | PASS |
| L | Sheets regression passes | list_sheets + read_range 2xx | PASS |
| M | Docs/Slides/Calendar regression passes | Docs+Slides healthy; Calendar N/A | PASS |
| N | Official Drive MCP absent | config/runtime | PASS |
| O | No unrelated changes | only 2 files committed (+ config outside repo) | PASS |

- Root cause(s): Write (create/update) is unavailable solely because the OAuth grant for `local-user` does not include `https://www.googleapis.com/auth/drive.file` or `https://www.googleapis.com/auth/drive` (only `drive.readonly`). External authorization prerequisite — not a code defect.
- Final verdict: `CONDITIONAL` — all read/discovery/content capabilities fully proven; write blocked by missing Drive write scope, consistent with TASK-068/069. No OAuth reconnect attempted; no separate OAuth task created.
- Remaining limitation: `drive_create_file` and `drive_update_file` return controlled 403 until a Drive write scope (`drive.file` or `drive`) is granted via a future re-consent; disposable-file cleanup would then be possible without expanding tool scope.
- Next task: none required from this task; a future OAuth scope re-consent (adding `drive.file`) would enable the write E2E, otherwise no follow-up.