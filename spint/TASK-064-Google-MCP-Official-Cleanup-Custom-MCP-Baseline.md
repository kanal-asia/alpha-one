# TASK-064 — Google MCP Official Cleanup & Custom MCP Baseline

## 1. Objective

Membersihkan dependency Google Official MCP yang sudah tidak digunakan dan menetapkan `google-sheets` custom MCP yang sudah proven sebagai reference implementation untuk custom Google MCP berikutnya.

Task ini **BUKAN** implementasi Drive/Docs/Slides/Calendar/Apps Script custom MCP.

Scope hanya:

1. Audit baseline MCP saat ini.
2. Remove official Google MCP registrations yang tidak digunakan.
3. Pertahankan `google-sheets` custom MCP tanpa perubahan behavior/source.
4. Verifikasi tidak ada dependency/config runtime yang masih membutuhkan official Google MCP.
5. Dokumentasikan pattern custom Sheets yang dapat dijadikan reference.
6. E2E smoke test Sheets sebagai protection gate.
7. Pastikan working tree / Git hanya berubah sesuai scope task.

---

## 2. Hard Scope

### IN SCOPE

- OpenCode MCP configuration.
- Official Google MCP registrations:
  - Drive
  - Docs
  - Slides
  - Calendar
- Existing custom `google-sheets` MCP.
- MCP discovery/runtime baseline.
- Dependency/config reference audit.
- Sheets protection smoke test.
- Documentation of proven custom-MCP pattern.

### OUT OF SCOPE

JANGAN:

- membuat custom Drive MCP;
- membuat custom Docs MCP;
- membuat custom Slides MCP;
- membuat custom Calendar MCP;
- membuat custom Apps Script MCP;
- mengubah `google-sheets/server.ts`;
- redesign OAuth;
- membuat shared Google MCP framework;
- membuat generic Google API abstraction;
- mengubah Google Cloud API enablement;
- mengubah Google Cloud OAuth client;
- mengubah consent screen;
- mengubah scope;
- mengubah `.alpha/google/connections.json` schema;
- mengubah VPS/backend architecture;
- melakukan refactor unrelated;
- memperbaiki issue yang ditemukan tetapi berada di luar scope.

Jika ditemukan dependency yang memerlukan perubahan code di luar OpenCode MCP configuration, STOP dan dokumentasikan sebagai finding.

---

# 3. Current Intended Architecture

Target MCP configuration setelah task:

    OpenCode
       │
       └── google-sheets
              │
              ▼
       mcp-servers/google-sheets/server.ts
              │
              ▼
       Google Sheets REST API

Official Google MCP:

    Drive MCP      → REMOVED
    Docs MCP       → REMOVED
    Slides MCP     → REMOVED
    Calendar MCP   → REMOVED

Jangan menghapus Google Cloud APIs.

Yang dihapus hanya dependency / registration MCP dari OpenCode.

---

# 4. Reference Implementation

Gunakan existing:

    mcp-servers/google-sheets/server.ts

sebagai **PROVEN REFERENCE IMPLEMENTATION**, bukan sebagai alasan untuk melakukan refactor.

Audit minimal:

- MCP transport / JSON-RPC mechanism.
- tool registration.
- tool schema.
- local Google credential loading.
- REST API invocation.
- token handling.
- error handling.
- OpenCode registration.
- runtime behavior.

Catat pattern yang benar-benar ditemukan dari source.

Jangan menggeneralisasikan pattern yang belum terbukti diperlukan oleh service lain.

---

# 5. Phase 0 — Environment & Baseline Discovery

Audit read-only terlebih dahulu.

Capture:

- OS.
- current working directory.
- Git branch.
- Git status.
- relevant OpenCode configuration path.
- current MCP registrations.
- installed/runtime MCP state.
- existing `mcp-servers/google-sheets/server.ts`.
- relevant Google local credential storage references.

Gunakan evidence aktual.

Jangan menganggap konfigurasi berdasarkan task history.

### Required baseline evidence

Minimal capture:

    opencode mcp list

dan konfigurasi MCP aktual yang digunakan OpenCode.

Capture Git baseline:

    git status --short
    git branch --show-current
    git log -5 --oneline

Jika ada pre-existing changes:

- jangan reset;
- jangan stash;
- jangan commit;
- jangan modify.

---

# 6. Phase 1 — Official MCP Inventory

Identifikasi seluruh official Google MCP yang saat ini registered.

Expected obsolete registrations:

- `drive`
- `docs`
- `slides`
- `calendar`

Verify masing-masing:

- registration exists / absent;
- transport type;
- endpoint;
- OAuth configuration;
- runtime connection state.

Juga verifikasi:

    google-sheets

tetap merupakan custom/local MCP dan bukan official Google MCP.

---

# 7. Phase 2 — Dependency / Reference Audit

Search repository/configuration untuk reference terhadap official MCP berikut:

    drivemcp.googleapis.com
    docsmcp.googleapis.com
    slidesmcp.googleapis.com
    calendarmcp.googleapis.com

dan registration key:

    drive
    docs
    slides
    calendar

Tujuan:

menentukan apakah removal cukup dilakukan di OpenCode MCP configuration atau terdapat dependency runtime lain.

Classification:

- PROVEN_ACTIVE
- PROVEN_DEAD
- UNKNOWN

Jangan menghapus arbitrary references hanya karena ditemukan.

Jika reference merupakan historical documentation/task evidence, jangan diubah kecuali memang termasuk active runtime configuration.

---

# 8. Phase 3 — Remove Official MCP Registration

Remove only the active OpenCode MCP registrations for:

    drive
    docs
    slides
    calendar

Preserve:

    google-sheets

Preserve its:

- command;
- cwd;
- enabled state;
- timeout;
- source;
- credential behavior.

Do not modify:

    mcp-servers/google-sheets/server.ts

unless an unexpected compile/runtime issue proves that modification is absolutely required.

Jika modification terhadap Sheets diperlukan, STOP dan report instead of silently expanding scope.

---

# 9. Phase 4 — Runtime Verification

Run:

    opencode mcp list

Expected:

    google-sheets → connected

Expected absence:

    drive
    docs
    slides
    calendar

Official Google MCP endpoints must no longer be active OpenCode MCP registrations.

Verify OpenCode can still discover the custom Sheets MCP.

---

# 10. Phase 5 — Sheets Protection Gate

This is a mandatory regression gate.

Do not change Sheets source/configuration.

Perform read-only agent/runtime smoke test using the existing custom Sheets MCP.

At minimum prove:

1. MCP is discoverable.
2. MCP connection succeeds.
3. At least one read operation succeeds.
4. Google Sheets REST-backed operation returns real data.
5. No official Google Sheets MCP is being used.

Use an existing safe spreadsheet/resource already used by the project.

Do not create, update, delete, or mutate spreadsheet data unless the existing test procedure explicitly requires it.

---

# 11. Phase 6 — Custom MCP Baseline Documentation

Document the proven pattern from `google-sheets/server.ts`.

The documentation must distinguish:

### PROVEN

Things directly verified from source/runtime.

Examples:

- custom MCP is local;
- MCP communicates through OpenCode;
- MCP invokes Google REST API;
- credentials are resolved locally;
- Sheets remains independent from official Google MCP.

### DERIVED

Reasonable architectural conclusions based on proven evidence.

### UNKNOWN

Anything that cannot yet be proven for Drive/Docs/Slides/Calendar/Apps Script.

Do NOT state that the future custom MCP services are already implemented.

---

# 12. Phase 7 — Quality Gate

## Gate A — Official MCP Cleanup

PASS only if:

- active official Drive MCP is absent;
- active official Docs MCP is absent;
- active official Slides MCP is absent;
- active official Calendar MCP is absent.

## Gate B — Sheets Protection

PASS only if:

- custom Sheets MCP remains registered;
- Sheets source unchanged;
- Sheets MCP connects;
- read-only E2E succeeds;
- no official Sheets MCP is involved.

## Gate C — Configuration Integrity

PASS only if:

- no unrelated MCP configuration is changed;
- no Google Cloud API is disabled;
- no OAuth configuration is changed;
- no credential storage schema is changed.

## Gate D — Scope

PASS only if:

- no Drive/Docs/Slides/Calendar/Apps Script implementation was started;
- no generic MCP framework was introduced;
- no unrelated cleanup was performed.

---

# 13. Expected Final State

OpenCode:

    google-sheets
        type: local
        command: npx tsx mcp-servers/google-sheets/server.ts

Official Google MCP:

    drive     → absent
    docs      → absent
    slides    → absent
    calendar  → absent

Google Cloud APIs:

    UNCHANGED

OAuth:

    UNCHANGED

Sheets source:

    UNCHANGED

---

# 14. Evidence Matrix

Record:

| Area | Evidence | Status |
|---|---|---|
| Git baseline | command output | PROVEN |
| MCP baseline | `opencode mcp list` | PROVEN |
| Official Drive MCP | config/runtime | PROVEN |
| Official Docs MCP | config/runtime | PROVEN |
| Official Slides MCP | config/runtime | PROVEN |
| Official Calendar MCP | config/runtime | PROVEN |
| Sheets custom MCP | source/config | PROVEN |
| Official MCP references | repository search | PROVEN |
| Official MCP removed | post-change config/runtime | PROVEN |
| Sheets E2E | runtime evidence | PROVEN |
| Sheets source unchanged | git diff | PROVEN |
| Google Cloud APIs unchanged | config/cloud evidence | PROVEN |
| Future custom MCP capability | not implemented | UNKNOWN |

---

# 15. Git Safety

Before any commit:

    git status --short
    git diff --stat
    git diff

Only intended OpenCode MCP cleanup changes may be committed.

Do NOT:

- reset unrelated changes;
- stash unrelated changes;
- amend previous commits;
- commit unrelated files;
- modify Sheets source;
- create implementation files for future MCP services.

Commit only the intended TASK-064 changes and task documentation according to the existing project workflow.

---

# 16. Execution Summary

After execution, write the execution summary into this same task file.

Include:

### Changed

Exact files changed.

### Removed

Exact official MCP registrations removed.

### Preserved

Confirm:

- `google-sheets/server.ts`
- Sheets MCP configuration
- Google OAuth configuration
- Google Cloud APIs
- local credential architecture

### Evidence

Include relevant command outputs / file paths / verification results.

### Findings

Classify each as:

- PROVEN
- DERIVED
- UNKNOWN
- INSUFFICIENT_EVIDENCE

### Sheets Regression Result

State:

- PASS / FAIL
- exact read-only smoke test performed
- evidence of real Google Sheets data access

### Final Verdict

Use exactly one:

- PASS
- CONDITIONAL
- BLOCKED

Do not declare PASS if any required quality gate lacks evidence.

---

# 17. Final Constraint

This task establishes the baseline only.

Do NOT proceed into implementation of:

- Drive Custom MCP
- Docs Custom MCP
- Slides Custom MCP
- Calendar Custom MCP
- Apps Script Custom MCP

Those are separate subsequent tasks.

The purpose of TASK-064 is only:

    REMOVE UNUSED OFFICIAL MCP
          +
    PROTECT PROVEN GOOGLE-SHEETS MCP
          +
    DOCUMENT PROVEN CUSTOM-MCP BASELINE

After completion, stop and report the evidence and verdict.

---

# 18. Execution Summary

## Changed

- `C:\Users\ASUS\.config\opencode\opencode.jsonc` — removed the four official Google MCP registrations (`drive`, `docs`, `slides`, `calendar`); preserved the `google-sheets` block exactly as baseline (`type: "local"`, `command: ["npx","tsx","mcp-servers/google-sheets/server.ts"]`, `cwd: "C:\\dev\\alpha-one"`, `enabled: true`, `timeout: 15000`). File reduced from 47 to 15 lines.
- `spint/TASK-064-Google-MCP-Official-Cleanup-Custom-MCP-Baseline.md` — this task file (execution summary appended).

Note: `opencode.jsonc` lives in the user config directory outside the git repo (`C:\Users\ASUS\.config\opencode\`), so the git commit for this task contains only this task file.

## Removed

Active OpenCode MCP registrations removed (all were remote OAuth MCPs with `clientId: "{env:GOOGLE_CLIENT_ID}"` / `clientSecret: "{env:GOOGLE_CLIENT_SECRET}"`):

| Key | Endpoint |
|---|---|
| `drive` | `https://drivemcp.googleapis.com/mcp/v1` |
| `docs` | `https://docsmcp.googleapis.com/mcp/v1` |
| `slides` | `https://slidesmcp.googleapis.com/mcp/v1` |
| `calendar` | `https://calendarmcp.googleapis.com/mcp/v1` |

Google Cloud API enablement was NOT touched (only OpenCode MCP registrations removed, per scope).

## Preserved

- `mcp-servers/google-sheets/server.ts` — unchanged (no modification made; scope protection respected).
- `google-sheets` MCP configuration — unchanged (identical block to baseline).
- Google OAuth configuration — `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`) unchanged; `.alpha/google/connections.json` schema unchanged. (The server's own token refresh wrote back an updated access token to `connections.json` during the smoke test — normal runtime bookkeeping, not a schema/config change.)
- Google Cloud APIs — unchanged.
- Local credential architecture (`local-user` connection via `.alpha/google/connections.json`) — unchanged.

## Evidence

- **Phase 0 baseline:** branch `task/gworkspace-002-r1-drive-access-rework`, HEAD `067ddc6`, opencode 1.18.18, Windows 11 NT 10.0.26200.0. Baseline `opencode mcp list` showed `drive`/`docs`/`slides`/`calendar` (remote OAuth) + `google-sheets` (local; initially `failed — Operation timed out after 15000ms`, later confirmed transient). Baseline `opencode.jsonc` = 47 lines.
- **Phase 1 inventory:** read current `opencode.jsonc` — confirmed 4 official remote MCP registrations + 1 custom local MCP (`google-sheets`).
- **Phase 2 dependency/reference audit:** repo-wide grep for `drivemcp.googleapis.com`, `docsmcp.googleapis.com`, `slidesmcp.googleapis.com`, `calendarmcp.googleapis.com` and keys `drive`/`docs`/`slides`/`calendar`. Matches exist ONLY in historical spint task documentation (TASK-055/056/057/058/060/061/062/063) and this task file. No active runtime/config dependency in `src/` or in OpenCode config beyond the removed registrations. Classification: **PROVEN_DEAD** (runtime) — all other references are historical evidence and were NOT edited.
- **Phase 3 removal:** `opencode.jsonc` edited → only `google-sheets` remains (15 lines, verified by re-read).
- **Phase 4 runtime verification:** `opencode mcp list` → `✓ google-sheets connected` only; `drive`, `docs`, `slides`, `calendar` absent. Additional runtime confirmation: the official Drive MCP tool (`drive_search_files`) is no longer available (returns "The caller does not have permission") because the registration is gone.
- **Phase 5 Sheets protection gate (read-only smoke test):** spawned `mcp-servers/google-sheets/server.ts` via `npx tsx` with `.env` loaded (production-equivalent env) and drove JSON-RPC over stdio:
  - `initialize` → OK (`protocolVersion 2024-11-05`, capabilities `{tools:{}}`, serverInfo google-sheets 1.0.0).
  - `tools/list` → 11 tools (list_sheets, get_spreadsheet, read_range, read_ranges, write_range, write_ranges, write_formulas, append_rows, insert_dimension, create_sheet, update_spreadsheet).
  - `tools/call google_sheets.list_sheets` on `1qmtFLkix4fOo94K71JyFlKIHj12p0PD-AA0ejVqeF_8` → real metadata: spreadsheet `ALPHA_ONE_MCP049SCR_2026-08-18T11-36-11-972Z`, sheets `Sheet1` (sheetId 0, 1000×26) and `FlashSale049SCR` (sheetId 983420913, 1000×26).
  - `tools/call google_sheets.read_range` `Sheet1!A1:B3` → real values: header `No`/`SKU`, rows `1 SMSID_PRODUK1_CAT`, `2 SMSID_PRODUK2_CAT`.
  - Token auto-refreshed by the server via `oauth2.googleapis.com/token` (refresh_token grant) — server's own bookkeeping only. No official Sheets MCP involved; no create/update/delete performed.
- **Git:** `git status --short` / `git diff --stat` — the only change attributable to this task inside the repo is the task file itself; all other working-tree changes are pre-existing and untouched (not reset/stashed/committed).

## Findings

- **PROVEN:** Official Google MCP registrations (`drive`, `docs`, `slides`, `calendar`) removed from OpenCode config; runtime `opencode mcp list` shows only `google-sheets` connected.
- **PROVEN:** Custom `google-sheets` MCP is a local stdio JSON-RPC 2.0 server (`mcp-servers/google-sheets/server.ts`, 2020 lines), launched by OpenCode via `npx tsx mcp-servers/google-sheets/server.ts` with cwd `C:\dev\alpha-one`.
- **PROVEN:** Credentials resolved locally from `.alpha/google/connections.json` (`local-user`); expired access token refreshed locally via `oauth2.googleapis.com/token` using `.env` client id/secret; Sheets REST base `https://sheets.googleapis.com/v4`.
- **PROVEN:** Sheets tool surface (11 tools) matches the OpenCode `google-sheets` MCP tools; read operations return real Google Sheets REST data.
- **PROVEN:** No active runtime dependency on official Google MCP endpoints anywhere in the repo (`src/`, config) — references exist only in historical task documentation.
- **DERIVED:** The custom Sheets MCP pattern (local server + local credential file + direct REST + local token refresh) is a valid reference for future custom MCP services; Drive/Docs/Slides/Calendar/Apps Script have NO custom MCP implementation and NO official MCP registration anymore.
- **UNKNOWN:** Whether future custom Drive/Docs/Slides/Calendar/Apps Script MCPs need additional scopes or different token handling — not proven; must not be generalized from Sheets alone.
- **UNKNOWN:** Official Google MCP endpoint behavior if re-enabled later — irrelevant to this task's baseline (removed).

## Sheets Regression Result

- **PASS**
- Read-only smoke test performed: JSON-RPC stdio session against the custom Sheets MCP — `initialize` → `tools/list` (11 tools) → `google_sheets.list_sheets` → `google_sheets.read_range` (`Sheet1!A1:B3`) on existing spreadsheet `1qmtFLkix4fOo94K71JyFlKIHj12p0PD-AA0ejVqeF_8`.
- Evidence of real Google Sheets data access: `list_sheets` returned the true spreadsheet title `ALPHA_ONE_MCP049SCR_2026-08-18T11-36-11-972Z` with real sheet structure; `read_range` returned real cell values (header `No`/`SKU`, product rows). No create/update/delete. No official Sheets MCP used.

## Quality Gates

- **Gate A — Official MCP Cleanup:** PASS — `drive`/`docs`/`slides`/`calendar` absent from config and runtime.
- **Gate B — Sheets Protection:** PASS — `google-sheets` remains registered; `server.ts` unchanged; MCP connects; read-only E2E succeeded; no official Sheets MCP involved.
- **Gate C — Configuration Integrity:** PASS — no unrelated MCP config change; no Google Cloud API disabled; no OAuth config change; no credential-storage schema change.
- **Gate D — Scope:** PASS — no Drive/Docs/Slides/Calendar/Apps Script implementation started; no generic MCP framework introduced; no unrelated cleanup performed.

## Final Verdict

PASS