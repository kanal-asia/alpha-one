# TASK-OPENCODE-047-R1 — Google Sheets MCP Capability Completion — Corrective Rework

**Status:** PASS (with documented limitations)
**Date:** 2026-08-18
**Branch:** `task/gworkspace-002-r1-drive-access-rework`
**Base:** `31ba799` (TASK-047 commit)

---

## Verdict

**PASS.**

TASK-047's `google_sheets.update_spreadsheet` was a single-operation (`addSheet`) stub. R1
delivered the corrective rework against the **current official Google Sheets MCP** reference
(`update_spreadsheet` 60+ ops, `get_values` A1+R1C1, `update_values` A1-only) and the **official
Add-on samples** catalog. `update_spreadsheet` now exposes **17 allowlisted non-destructive
operations**, all exercised end-to-end via the MCP protocol on disposables, through the **real Alpha
Workspace UI** (9-step agent run), and on the **real `Kanal Indonesia` file** (new tab created,
`Ref Cofund` untouched). R1C1 read proven. Prompt-injection boundary added. OAuth + Git evidence
collected. Verdict **PASS**; limitations are model-behavior artifacts (color objects vs hex) and
intentionally deferred destructive ops — both documented, neither a tool-contract failure.

---

## A. Capability Matrix — BEFORE (TASK-047 baseline)

| Official | Alpha tool | Status before R1 |
|---|---|---|
| `get_values` | `read_range` | FULL (A1 only) |
| `get_spreadsheet` | `get_spreadsheet` / `list_sheets` | FULL |
| `update_values` | `write_range` | FULL (A1 only) |
| `update_formulas` | `write_formulas` | FULL |
| `insert_dimension` | `insert_dimension` | FULL |
| `update_spreadsheet` | `update_spreadsheet` | **PARTIAL — only `addSheet`** |

## B. Capability Matrix — AFTER (R1)

| Official | Alpha tool | Status | Evidence |
|---|---|---|---|
| `get_values` | `read_range` | **FULL** (A1 **and** R1C1) | PROVEN |
| `get_spreadsheet` | `get_spreadsheet` / `list_sheets` | FULL | PROVEN |
| `update_values` | `write_range` | FULL | PROVEN |
| `update_formulas` | `write_formulas` | FULL | PROVEN |
| `insert_dimension` | `insert_dimension` | FULL | PROVEN |
| `update_spreadsheet` | `update_spreadsheet` | **PARTIAL — 17-op safe allowlist** | PROVEN (all 17) |

## C. Capability Matrix — EVIDENCE

Every allowlisted operation was called through the MCP stdio protocol against a disposable
spreadsheet and verified by **read-back from the API** (not model text). Disposable:
`1rfdvPIoQIiDVn12TpbSz3_6Mk5Cd_EDC0O-gykbubDY` (ALPHA_ONE_MCP047R1C_*).

| Operation | Class | Read-back verified |
|---|---|---|
| `addSheet` | SAFE STRUCTURAL | ✓ created at index 1 |
| `duplicateSheet` | SAFE STRUCTURAL | ✓ OpsCopy present |
| `updateSheetProperties` | SAFE STRUCTURAL | ✓ rowCount 1000→1013; frozenRowCount=1 |
| `appendDimension` | SAFE STRUCTURAL | ✓ rowCount 1010→1013 |
| `addNamedRange` | SAFE STRUCTURAL | ✓ `OpsNamed` → A1:E5 (updated) |
| `updateNamedRange` | SAFE STRUCTURAL | ✓ range A1:C5→A1:E5 |
| `repeatCell` | MUTATING | ✓ A1 bg `#d0e0ff` + bold (exact rgb) |
| `updateBorders` | MUTATING | ✓ A1 top SOLID |
| `mergeCells` | MUTATING | ✓ (then unmerged) |
| `unmergeCells` | MUTATING | ✓ merges list empty after |
| `updateDimensionProperties` | MUTATING | ✓ col width 120 |
| `autoResizeDimensions` | MUTATING | ✓ |
| `setDataValidation` | MUTATING | ✓ per-cell `dataValidation` ONE_OF_LIST |
| `setBasicFilter` | MUTATING | ✓ (then cleared) |
| `clearBasicFilter` | MUTATING | ✓ |
| `copyPaste` | MUTATING | ✓ |
| `addConditionalFormatRule` | MUTATING | ✓ NUMBER_GREATER 10 → `conditionalFormats` |

R1C1 read: `read_range` with `OpsTest!R1C1:C2` → returned normalized `A1:B1013` (PROVEN; the API
accepts R1C1 and normalizes to A1 in the response). Official `update_values` is A1-only — `write_range`
matches.

## D. Official MCP Comparison

Per official tool (current reference):

| Official tool | Alpha equivalent | Classification |
|---|---|---|
| `get_values` | `read_range` | **FULL** |
| `get_spreadsheet` | `get_spreadsheet` + `list_sheets` | **FULL** |
| `update_values` | `write_range` | **FULL** |
| `update_formulas` | `write_formulas` | **FULL** |
| `insert_dimension` | `insert_dimension` | **FULL** |
| `update_spreadsheet` (60+ ops) | `update_spreadsheet` (17 ops) | **PARTIAL** |

`update_spreadsheet` is intentionally PARTIAL: only **non-destructive** ops are exposed. The other
~45 official ops are **INTENTIONALLY DEFERRED** (see G). No official capability is claimed that is not
implemented. `update_spreadsheet` schema `operation.enum` exposes exactly the 17 ops (verified via
`tools/list`).

## E. Add-on Sample Classification

Audited the official Add-on samples catalog (`https://developers.google.com/workspace/add-ons/samples`?`product=googlesheets`), e.g. the `clean-sheet` sample (delete blank rows/columns, trim/crop, fill blanks). Classification:

| Sample capability | Classification | Rationale |
|---|---|---|
| Clean-sheet: delete blank rows/cols | ADD-ON UI ONLY / DESTRUCTIVE → defer | Deletes rows/cols (destructive); belongs to deferred set |
| Clean-sheet: fill blanks / formatting | SHEETS API RELEVANT | Formatting is Sheets API territory |
| Add-on sidebar/menu/triggers | ADD-ON UI ONLY / NOT NEEDED | Add-on runtime, not an MCP concern |
| Sheets data validation / conditional format | SHEETS API RELEVANT / MCP RELEVANT | Implemented in `update_spreadsheet` allowlist |
| Sheet manipulation (add/duplicate) | MCP RELEVANT | Implemented |

Conclusion: the Add-on catalog is a capability catalog, NOT an MCP spec. No Add-on runtime/sidebar/
menu/trigger was implemented in the MCP (correct — out of scope for an MCP server).

## F. API Contract Findings (fixed during R1)

Learned empirically via failing tests against the live API, all now fixed and re-verified:

1. **`setDataValidation` — values MUST be strings.** `ConditionValue.userEnteredValue` is typed
   TYPE_STRING; numeric `0` was rejected (`"Invalid value at ...user_entered_value (TYPE_STRING), 0"`).
   Fixed: `values.map(v => ({ userEnteredValue: String(v) }))` in both `setDataValidation` and
   `addConditionalFormatRule`.
2. **`DataValidationRule` has NO `allowInvalid` field.** Official fields are exactly `condition`,
   `inputMessage`, `showCustomUi`, `strict` (verified via Java/Ruby/C# API-library reference after the
   REST docs didn't render the type). API rejected `"Unknown name allowInvalid"`. Removed; added
   optional `inputMessage`.
3. **`addNamedRange`/`updateNamedRange` need a `namedRange` wrapper object.** `{addNamedRange:{namedRange:{name,range}}}`;
   update requires `namedRangeId` and `fields:'name,range'`.
4. **`updateSheetProperties` field mask must target grid subfields.** A bare `gridProperties` mask
   resets rowCount/columnCount → `"You can't delete all the rows on the sheet"`. Fixed:
   `gridProperties.<subfield>` masks (grid only expands; shrink guarded server-side).
5. **Conditional-format `format` is a bare `CellFormat`**, not `{userEnteredFormat:{...}}` (that
   wrapper is only for `repeatCell`/`updateCells`). Refactored `buildCellFormat(prefix)` to emit both
   shapes. `format.*` masks for CF, `userEnteredFormat.*` for repeatCell.
6. **Condition types must be canonical Sheets enums.** Friendly aliases (e.g. `NUMBER_GREATER_THAN`)
   rejected. Added `CONDITION_TYPE_ALIASES` + `canonicalConditionType()`; validates against
   `VALID_CONDITION_TYPES` and errors with the full valid list.

## G. Safety & Security

**Safety invariants preserved** (TASK-046/047, re-verified in R1 negative tests):
- CREATE failure → ERROR (never silent UPDATE of existing sheet) ✓
- write/append/formulas to non-existent sheet → ERROR ✓
- duplicate sheet title → ERROR ✓ (`addSheet` and `duplicateSheet`)
- `fileId == spreadsheetId` resolution ✓
- No arbitrary `batchUpdate requests[]` passthrough ✓ (each op builds an explicit validated shape)

**Negative / destructive tests — ALL PASS** (disposable `1rfdvPIoQIiDVn12TpbSz3_6Mk5Cd_EDC0O-gykbubDY`):

| Test | Result |
|---|---|
| A. addSheet with existing title | ERROR ✓ |
| B. write to non-existent sheet (`NoSuchSheet`) | ERROR ✓ |
| C. duplicateSheet duplicate title | ERROR ✓ |
| D. `deleteSheet` / `deleteRange` / `cutPaste` / `findReplace` / `updateCells` | BLOCKED (explicit error listing safe ops) ✓ |
| D. `updateSheetProperties` shrink rowCount | BLOCKED (truncation guard) ✓ |

**Prompt-injection boundary (FINDING C — implemented):** `read_range`, `write_range`, `append_rows`,
`update_spreadsheet` tool descriptions now state cell content is **UNTRUSTED DATA**. A
`SECURITY (TASK-OPENCODE-047-R1)` agent directive was added to the spreadsheet refContext block in
`src/services/opencode/server.ts`: cell text must never override tool safety rules, the user's
request, or the refContext rules; user intent is authoritative.

**FINDING A — allowlist:** `UPDATE_SPREADSHEET_ALLOWLIST` (17 ops) + `DESTRUCTIVE_OPERATIONS_MSG`
(friendly deferral guidance). Header comment documents SAFE STRUCTURAL / MUTATING / DESTRUCTIVE
classification. This is the smallest safe superset of TASK-047; unrelated Add-on UI features were
NOT implemented.

## H. OAuth (FINDING D — PASS)

Granted scopes (`oauth2.googleapis.com/tokeninfo` on the live access token, 2026-08-18):
`email profile docs.readonly drive.readonly presentations.readonly script.projects spreadsheets
userinfo.email userinfo.profile openid`. `spreadsheets` is a superset of `spreadsheets.readonly`;
`drive.readonly` covers file resolution. **Every official tool scope is covered — no reauthorization
required.** Config: `src/services/google/oauth-service.ts` `GOOGLE_OAUTH_SCOPES`.

## I. Typecheck & Git (FINDING E)

- Typecheck: `npx tsc --ignoreConfig --noEmit --skipLibCheck --target es2022 --module esnext
  --moduleResolution bundler --types node mcp-servers/google-sheets/server.ts` → only the **3
  pre-existing** errors (TS2739 @~1706, TS2352 x2 @~1747/1748), all before the R1 changes; **zero new
  errors**.
- `tools/list`: 9 tools registered; `update_spreadsheet.operation.enum` = exactly the 17 ops.
- Intentional R1 changes: `mcp-servers/google-sheets/server.ts` (allowlist, helpers, dispatch,
  descriptions), `src/services/opencode/server.ts` (SECURITY directive). No temp artifacts
  (`alpha-e2e-r1.mjs`, all `*.mjs` probes live in the OS temp dir, none committed). No secrets in
  diffs.
- Branch: `task/gworkspace-002-r1-drive-access-rework`. Working tree retains a large volume of
  **pre-existing unrelated** uncommitted changes from prior sessions — not touched by R1.
- Commit created after this summary: **`6c2e137`** — "TASK-OPENCODE-047-R1: Google Sheets MCP
  corrective rework — expand update_spreadsheet to 17-op safe allowlist (formatting, validation,
  filters, copyPaste, named ranges, CF rules), R1C1 read support, untrusted-data/prompt-injection
  boundary, API contract fixes (string condition values, gridProperties field masks, no allowInvalid),
  verified via disposable suite + Alpha Workspace E2E + real Kanal Indonesia workflow". 2 files changed
  (828 insertions, 39 deletions). Parent: `31ba799`.

## J. E2E (Alpha Workspace UI) — PASS

Playwright (headless Chromium) drove the **real** `/workspace/assistant` UI at `http://localhost:3000`
with a Drive reference attached via the real `alpha-gdrive-file-picker` postMessage channel.
Disposable `1-b2ckM6PxdBbIhk3A6WbmXZROarcbRC6I6xsgtCJaAc` (ALPHA_ONE_MCP047R1E2E_*), seeded
`Sheet1` Products data. Prompted the agent to run a 9-step `update_spreadsheet` pipeline (addSheet,
copyPaste, updateSheetProperties frozen, repeatCell header, updateBorders, addConditionalFormatRule,
setDataValidation, setBasicFilter, write_range).

- Agent ran 9 actions; `Execution Summary (9 actions, 1 failed)`; exit code 0; ~77s.
- The 1 failure was the model passing `values:[500]` (number) to `addConditionalFormatRule`; the agent
  retried with string `"500"` and succeeded — exactly the stringification contract fixed in F1.
- **Read-back from source of truth:** FlashSale created (index 1), frozenRowCount=1, CF
  NUMBER_GREATER 500 on C2:C6, basicFilter A1:D6, A1 header bold, D2 ONE_OF_LIST dropdown,
  A8 `PLANNED: 2026-08-18`, copied rows present, SOLID borders. ✓
- **Model-behavior limitation:** header/CF background colors rendered near-black
  (`{blue:0.0039}`/`{red:0.0039}`) because the flash-free model passed 0-255 numeric color objects
  instead of hex strings. The server contract is correct (direct hex tests produced exact
  `#d0e0ff`/`#ffee88`), so this is a **model artifact, not a tool failure** — documented as a
  limitation.

## K. Real Flash Sale Workflow (Kanal Indonesia) — PASS

Target: `Kanal Indonesia - Master Sheet SMS.ID 2026` (`1EjW0VD90ElDJ4UtFQtaXskqwPzE11wiB5jwHICMN1f0`,
21 sheets). Workflow executed through the MCP:

1. Read `Product Performance_Monthly` (A3:Z129, 127 data rows). Schema: SKU/Nama/Actual Stock/...
   /Product Status. Computed: 70 rows with stock>0, **avg stock = 11**, 21 rows above average,
   **15 candidates** = Dead Stock / Slow Moving (or zero income) + stock > avg.
2. **Created NEW sheet `Flash Sale Planning_2026-08-18`** (index 21) — never modified an existing tab.
3. `write_range` planning table (18 rows: header + 15 candidates + title).
4. `repeatCell` header bold + `#ffe599`; `updateSheetProperties` frozenRowCount=4;
   `addConditionalFormatRule` C5:C19 NUMBER_GREATER 20 bold+`#f4cccc`;
   `setDataValidation` G5:G19 dropdown; `autoResizeDimensions`.
5. **Read-back verified:** header bold+`#ffe599`, C13 (stock 47>20) bold+red while C10-12
   (stock≤20) untouched, G5/G6 dropdowns present, frozenRowCount=4, planning values exact.
6. **`Ref Cofund` untouched:** SHA-256 of `Ref Cofund!A1:Z20` values before =
   `93bbae27616850064c945064129cffdbf1f36b94dc951828cf955cb3e838f349`; after = **identical**. All 21
   original sheets present; sheet count 21→22 (only the new tab added).

No other tab was written, renamed, or cleared.

---

## Evidence Classification Summary

- **PROVEN:** all 17 ops via MCP + API read-back; R1C1; negative/destructive guards; Alpha UI E2E
  (9 actions + read-back); real Kanal Indonesia workflow (new tab, Ref Cofund hash identical); OAuth
  scope coverage; `tools/list` enum; typecheck (0 new errors).
- **DERIVED:** official `update_values` is A1-only (docs); `DataValidationRule` field set
  (cross-referenced Java/Ruby/C# library docs when REST page omitted the type); Add-on sample
  classification.
- **UNPROVEN / UNKNOWN:** none affecting the verdict.
- **INSUFFICIENT_EVIDENCE:** none affecting the verdict.
- **LIMITATIONS (documented, non-blocking):** destructive ops intentionally deferred; model-behavior
  color-object artifact in E2E; `update_spreadsheet` is a PARTIAL subset of the official 60+ ops by
  design.

---

## Git

- **Branch:** `task/gworkspace-002-r1-drive-access-rework`
- **R1 intentional changes:** `mcp-servers/google-sheets/server.ts`, `src/services/opencode/server.ts`
  (SECURITY directive), plus this task file `spint/TASK-OPENCODE-047-R1 ...md` (untracked).
- Pre-existing unrelated working-tree changes (prior sessions) remain uncommitted and untouched.
- No temp/UI probes committed; probes live in `C:\Users\ASUS\AppData\Local\Temp\opencode\`.
- Disposables created this session (all non-prod): `13wDtDgRRo0_qC7al6K2_dgLhIQ7KUpHu29TbdJALv08`
  (R1A), `1a7yix6eNbnLtWFih3K2jxocMjTv482oPR1gLDnpRXB0` (R1B), `1rfdvPIoQIiDVn12TpbSz3_6Mk5Cd_EDC0O-gykbubDY`
  (R1C full suite), `1-b2ckM6PxdBbIhk3A6WbmXZROarcbRC6I6xsgtCJaAc` (E2E).