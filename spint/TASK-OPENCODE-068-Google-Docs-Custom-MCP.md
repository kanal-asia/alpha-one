# TASK-OPENCODE-068 — Google Docs Custom MCP

## Spec (verbatim)

**Goal**

Build a production-ready custom Google Docs MCP server (`google-docs`) using the proven shared foundation, without modifying the existing google-sheets MCP. Deliver evidence via the standard evidence template.

**Deliverables**

- New custom MCP server: `mcp-servers/google-docs/server.ts`
- Registration in `opencode.jsonc`
- Task record file in `spint/` following the naming convention
- Evidence matrix + execution summary appended to the task record file
- Single clean commit containing ONLY the intended files

**Constraints**

- Use ONLY the shared Google MCP foundation under `mcp-servers/shared/google/` (auth, rest, mcp). No new OAuth, token, or MCP-bootstrap code.
- Do NOT modify the existing google-sheets MCP server.
- Docs API access must be constrained: read, list/discover (Drive metadata only, Documents only), create, and update (batchUpdate with constrained operations only — NO unrestricted passthrough).
- No generic MCP framework redesign.
- Do NOT attempt official or hosted Docs MCP packages.

**Scope**

- Drive Discovery (for listing docs only)
- Docs REST API

**Out of Scope**

- Google Drive MCP (file management, folder navigation, moves, etc.)
- Slides, Sheets, Calendar, Apps Script, Chat, Gmail
- Deletion of existing user documents (destructive)
- Batch operations beyond single-document update
- Template creation / complex formatting
- Import/export

**Scope Requirements**

- The MCP MUST expose: `docs_get_document`, `docs_create_document`, `docs_update_document`, `docs_list_documents`.
- `docs_list_documents` MUST include an optional `query` parameter to filter by document name (name contains), and support pagination.
- `docs_update_document` MUST be constrained to text operations (insert, replace) — the requirement is normal text insertion/replacement, not full document editing. No formatting, styling, or structural changes.
- Argument validation with bounded inputs and clear error messages.
- Read, create, update, and list operations must not mutate or destroy user data beyond the operation itself.
- Reasonable response shaping: no huge payloads, no full raw API dumps, return the most relevant information.

**OAuth & Scopes**

- Reuse the existing local OAuth flow (no redesign).
- Inspect actual granted scopes before implementation. If the required Docs scope is already present, DO NOT trigger another OAuth reconnect.
- Expected relevant scopes already available from previous tasks include: drive.readonly, drive.file, documents.readonly, documents.
- If a required scope is genuinely missing, stop and report the evidence before changing OAuth configuration. Do not automatically create another task.

**Phase Plan**

- Phase 0: Baseline capture
- Phase 1: Pattern discovery
- Phase 2: Docs REST proof
- Phase 3: Implementation
- Phase 4: Registration
- Phase 5: MCP protocol smoke
- Phase 6: Read E2E
- Phase 7: Discovery E2E
- Phase 8: Write E2E
- Phase 9: Cleanup
- Phase 10: Regression
- Phase 11: Error handling
- Phase 12: Evidence + commit

**Baseline**

- git branch, last commit, working tree state (before any changes), opencode mcp list
- The google-sheets MCP connection must be listed as connected
- Scopes of the local-user identity at baseline

**Evidence Requirements**

- Type-check output
- Protocol smoke: initialize + tools/list
- Read E2E: docs_get_document on a known readable document (evidence: documentId, title, revisionId, paragraphs, characters)
- Discovery E2E: docs_list_documents (evidence: at least 2 docs, plus query filter evidence)
- Write E2E: create a disposable test doc, update it (insert text), read it back, verify the inserted text is present
- Cleanup: delete the disposable test doc (or document the limitation if scope does not permit)
- Error handling: invalid documentId (format), non-existent document (404)
- Regression: google-sheets tools still work after adding the new server
- Final verdict: PASS / CONDITIONAL / BLOCKED / FAIL

**Naming**

- Task record file: `spint/TASK-OPENCODE-068-Google-Docs-Custom-MCP.md`
- MCP server: `mcp-servers/google-docs/server.ts`
- Task record file title: TASK-OPENCODE-068 — Google Docs Custom MCP

---

## Execution Summary

Implemented `mcp-servers/google-docs/server.ts` (custom Google Docs MCP) on the shared foundation
(`mcp-servers/shared/google/auth.ts`, `rest.ts`, `mcp.ts`) — no new OAuth/token/MCP-bootstrap code.
Registered in `opencode.jsonc` (outside git repo). The google-sheets MCP was NOT modified.

### Baseline (Phase 0)

- Branch: `task/gworkspace-002-r1-drive-access-rework`
- Last commit: `ca10376` (TASK-067)
- Working tree: ~241 pre-existing unrelated WIP entries (none staged by this task)
- `opencode mcp list`: google-sheets `connected` (before; google-docs added after)
- `local-user` (`kanalconsultant.indonesia@gmail.com`) granted scopes (9):
  `docs.readonly`, `presentations.readonly`, `drive.readonly`, `script.projects`,
  `spreadsheets`, `userinfo.email`, `userinfo.profile`, `calendar.readonly`, `openid`
- Scope inspection (Section 4): `docs.readonly` (Documents read) PRESENT;
  **`documents` (write) and `drive.file` (cleanup) NOT granted**. Per the task rule,
  NO OAuth reconnect was triggered and NO additional task was auto-created.

### Evidence Matrix

| Gate | Evidence | Verdict |
|---|---|---|
| Type-check | `npx tsc --ignoreConfig --noEmit --skipLibCheck --target es2022 --lib es2023 --module esnext --moduleResolution bundler --allowImportingTsExtensions --types node mcp-servers/google-docs/server.ts` → TSC_EXIT=0, clean | PASS |
| Protocol smoke | initialize → `{protocolVersion:"2024-11-05", capabilities:{tools:{}}, serverInfo:{name:"google-docs",version:"0.1.0"}}`; tools/list → 4 tools present | PASS |
| Read E2E | `docs_get_document` on `1fa2RwKMK8T2sk2f7BFePiaA5ydUKXbMrcPc4pAzBl6M` → title "Addendum SPK Kanal - Doni - For U Tissue(1 Aug 2026 - 31 Aug 2026)", revisionId `AIroW372AiWh…`, paragraphs 109, characters 7262, content extracted | PASS |
| Discovery E2E | `docs_list_documents` pageSize 3 → 3+ docs returned; query "SOP" → 1 doc (SOP_Host_Live_For-U_Tissue_v2); `nextPageToken` surfaced | PASS |
| Write E2E | `docs_create_document` → 403 "Request had insufficient authentication scopes"; `docs_update_document` → 403 same (scope `documents` NOT granted) | BLOCKED by scope (per Section 4, reported, no reconnect) |
| Cleanup | No test doc created (create 403) → nothing to clean. `drive.file` scope absent, so deletion would not be permitted either way | N/A (documented) |
| Error handling | `documentId: "bad id!!"` → controlled "documentId is malformed…" error; well-formed non-existent id → 404 "Requested entity was not found." | PASS |
| Regression | google-sheets MCP untouched; `google_sheets.list_sheets` and `google_sheets.read_range` (`Sheet1!A1:B3` → No/SKU + SMSID_PRODUK1_CAT/SMSID_PRODUK2_CAT) both 2xx (one transient list_sheets "service currently unavailable" resolved on retry) | PASS |
| Constraint adherence | Read/list/create/update only; no unrestricted batchUpdate passthrough; no mutation of existing user docs (update 403 ⇒ no mutation occurred); bounded inputs; no tokens logged | PASS |

### Implementation notes

- Tools: `docs_get_document` (normalized title/documentId/revisionId/paragraphs/characters/content
  bounded to 8000 chars), `docs_list_documents` (Drive discovery, Documents-only, `query` name-contains
  filter, `pageSize` 1–50, `pageToken`), `docs_create_document` (title ≤ 200), `docs_update_document`
  (`batchUpdate.insertText` only; `mode: append|prepend`; text ≤ 10000).
- Argument validation: `documentId` regex `^[A-Za-z0-9_-]{1,120}$`; bounded strings; clear error messages.
- Errors normalized via shared `GoogleApiError` (status/reason/message), never exposing tokens.
- Fixed during development: Drive `q` clause bug (missing `and` between `mimeType=…` and `trashed=false` → 400 "Invalid Value"); corrected to `"mimeType='application/vnd.google-apps.document' and trashed=false"`.

### Final verdict

**CONDITIONAL** — Read (`docs_get_document`) and discovery (`docs_list_documents`) are fully proven.
Write (`docs_create_document`, `docs_update_document`) is unavailable because the `documents`
scope is NOT among the 9 granted scopes of `local-user`; the tools return controlled 403
"insufficient authentication scopes" errors. Per the task rule, the scope gap is reported here
as evidence and NO OAuth reconnect / new task was auto-created. A future re-consent to add
`https://www.googleapis.com/auth/documents` (and optionally `drive.file` for test-doc cleanup)
would unlock the write E2E.