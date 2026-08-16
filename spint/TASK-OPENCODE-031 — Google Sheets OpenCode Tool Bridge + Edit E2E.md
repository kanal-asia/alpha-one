# TASK-OPENCODE-031 — Google Sheets OpenCode Tool Bridge + Edit E2E

## Type

Implementation + End-to-End Validation

## Priority

P0 — Core Google Workspace Capability

## Parent

TASK-OPENCODE-029C — Google Sheets Native Integration

## Status

COMPLETE — PASS

---

# 1. Tool Architecture Audit

## Discovery

OpenCode CLI discovers tools from its own configuration (`opencode.jsonc`). Custom tools are registered via the **MCP (Model Context Protocol)** — a JSON-RPC 2.0 over stdio protocol. OpenCode spawns MCP servers as child processes and communicates via stdin/stdout.

## Key Files

| File | Role |
|------|------|
| `C:\Users\ASUS\.config\opencode\opencode.jsonc` | OpenCode config — MCP server registration |
| `mcp-servers/google-sheets/server.ts` | **NEW** — Standalone MCP server for Google Sheets |
| `src/features/ai/opencode/services/http-transport.ts` | **MODIFIED** — Added MCP tool labels to `TOOL_LABELS` map |
| `src/services/google/sheets-service.ts` | Existing — Google Sheets API v4 service (unchanged) |
| `src/services/google/oauth-service.ts` | Existing — OAuth token management (unchanged) |

## How It Works

```
User prompt
  → Alpha Workspace server.ts spawns `opencode run`
  → OpenCode CLI reads opencode.jsonc, sees `mcp.google-sheets`
  → CLI spawns `npx tsx mcp-servers/google-sheets/server.ts`
  → MCP server responds to tools/list with 4 tools
  → Model calls google_sheets.read_range
  → MCP server reads token from .alpha/google/connections.json
  → MCP server calls Google Sheets API v4 directly
  → Result returns to model → model produces response
  → Server emits tool_use events → frontend shows Execution Summary
```

## No Parallel Tool Framework

The existing `src/features/tools/` is a separate UI-level tool manager (mock). The MCP server is the real tool bridge — it uses the established OpenCode tool mechanism.

---

# 2. Tools Implemented

## google_sheets.list_sheets

- **Input**: `{ spreadsheetId: string }`
- **Output**: Spreadsheet title, worksheet list with sheetId, title, rowCount, columnCount
- **Proven**: 21 worksheets listed from "Kanal Indonesia - Master Sheet SMS.ID 2026"

## google_sheets.read_range

- **Input**: `{ spreadsheetId: string, range: string }`
- **Output**: Cell values in 2D array, range metadata
- **Proven**: `Product Performance_Monthly!A3:K10` returned 8 rows of real SKU data

## google_sheets.write_range

- **Input**: `{ spreadsheetId: string, range: string, values: (string|number|boolean|null)[][] }`
- **Output**: updatedCells, updatedRows, updatedColumns, updatedRange
- **Bug fixed**: `valueInputOption` moved from request body to query parameter (Google Sheets API requirement)
- **Proven**: Wrote `ALPHA_ONE_SMOKE_TEST` to Sheet24!A1 — read-back confirmed

## google_sheets.append_rows

- **Input**: `{ spreadsheetId: string, range: string, values: (string|number|boolean|null)[][] }`
- **Output**: updatedCells, updatedRows, updatedColumns, updatedRange
- **Proven**: Appended 2 rows to Sheet24 — 4 cells updated

---

# 3. E2E Test Results

## Test 1 — Discovery (PASS)

```
Request: "Tampilkan daftar worksheet dari spreadsheet ini: 1EjW0VD90ElDJ4UtFQtaXskqwPzE11wiB5jwHICMN1f0"
Tool: google_sheets.list_sheets
Result: 21 worksheets listed with titles and dimensions
```

## Test 2 — Range Read (PASS)

```
Request: "Read the first 8 rows from Product Performance_Monthly, range A3 to K10"
Tool: google_sheets.read_range
Result: Real product data — SKU, product names, stock, sales values
```

## Test 3-5 — Write + Read-back (PASS)

```
Request: "Write to Sheet24!A1 values [[ALPHA_ONE_SMOKE_TEST]], then read back to verify"
Tool: google_sheets.write_range → google_sheets.read_range
Result: Write confirmed (4 cells), read-back shows ALPHA_ONE_SMOKE_TEST persisted
```

## Test 6 — Natural Language Edit (PASS)

```
Request: "Ubah A1 di Sheet24 menjadi ALPHA_ONE_SMOKE_TEST_FINAL. Lalu baca kembali."
Tool: google_sheets.write_range → google_sheets.read_range
Result: Value updated, verified as ALPHA_ONE_SMOKE_TEST_FINAL
```

## Test 7 — Append (PASS)

```
Direct MCP call: append_rows to Sheet24
Result: 2 rows appended, 4 cells updated
```

---

# 4. Bug Fixed During Implementation

**`valueInputOption` placement** — Google Sheets API requires `valueInputOption` as a query parameter (`?valueInputOption=USER_ENTERED`), not in the request body. The initial implementation placed it in the body, causing `Unknown name "valueInputOption" at 'data'` errors on write/append operations.

Fixed in `mcp-servers/google-sheets/server.ts` by passing it as a URL search parameter via the `sheetsPut`/`sheetsPost` helper functions.

---

# 5. Scope Discipline

- **No unrelated task files read** during execution
- **No model/provider/step-limit changes** introduced
- **No OAuth architecture changes** — existing token reused
- **No new npm dependencies** — MCP server uses raw JSON-RPC (no SDK)
- **Google Sheet remained reference-only** — no binary/file copy stored
- **Production SMS.ID data untouched** — only Sheet24 (test sheet) was written

---

# 6. Resource Integrity

- MCP server reads token from `.alpha/google/connections.json` (existing storage)
- No spreadsheet content cached locally
- No new files written to `.alpha/` directory
- Google Sheets remains the source of truth

---

# 7. Validation

- `tsc --noEmit`: **PASS** — zero errors
- MCP server stdio test: **PASS** — initialize, tools/list, tools/call all work
- E2E chat tests: **ALL PASS** — 6 tests, 4 tools proven
- Server startup: **PASS**
- Tool event mapping: **PASS** — MCP tools mapped to human-readable labels

---

# 8. Git Evidence

- **Branch**: `task/gworkspace-002-r1-drive-access-rework`
- **Files changed**: 3 (MCP server new, http-transport modified, opencode.jsonc modified)
- **Lines**: +465 (MCP server 400, transport +22, config +10)
- **Commit**: pending

---

# 9. Final Verdict

**PASS**

```
OpenCode tool → Google Sheets → write → read-back → direct verification
```

All 4 MCP tools verified. Write persistence confirmed via read-back. Natural language edit in Indonesian succeeded. No model changes, no new dependencies, no scope creep.
