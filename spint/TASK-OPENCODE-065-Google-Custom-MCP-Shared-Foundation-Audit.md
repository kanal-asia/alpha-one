# TASK-065 — Google Custom MCP Shared Foundation

## 1. Objective

Audit existing custom Google Sheets MCP sebagai reference implementation untuk menentukan apakah diperlukan shared foundation untuk custom Google MCP berikutnya:

- Google Drive
- Google Docs
- Google Slides
- Google Calendar
- Google Apps Script

Task ini adalah **AUDIT-ONLY**.

Tidak boleh membuat shared framework, abstraction layer, generic Google MCP engine, atau mengubah existing Google Sheets MCP.

Tujuan akhirnya:

> PROVE apakah shared foundation memang diperlukan, bagian mana yang genuinely reusable, dan apakah foundation tersebut akan mempercepat implementasi MCP berikutnya tanpa menambah complexity yang tidak diperlukan.

---

# 2. Hard Constraints

## MUST

- Audit existing `google-sheets` MCP secara mendalam.
- Trace source → credential → OAuth/token → Google REST API → MCP tool → OpenCode runtime.
- Identifikasi reusable patterns.
- Identifikasi service-specific patterns.
- Estimasi effort jika:
  1. setiap MCP dibuat independently mengikuti pattern Sheets;
  2. dibuat shared foundation.
- Tentukan apakah shared foundation layak dibuat.
- Gunakan evidence aktual dari repository/runtime.
- Audit-only: tidak melakukan production/code mutation.

## MUST NOT

Jangan:

- mengubah `mcp-servers/google-sheets/server.ts`;
- membuat `shared/`, `lib/google/`, `google-mcp-core/`, atau abstraction baru;
- refactor Sheets;
- mengubah OAuth;
- mengubah credential storage;
- mengubah OpenCode config;
- membuat Drive MCP;
- membuat Docs MCP;
- membuat Slides MCP;
- membuat Calendar MCP;
- membuat Apps Script MCP;
- mengubah Google Cloud configuration;
- membuat generic API client;
- melakukan Git commit terhadap implementation code.

Jika menemukan code smell pada Sheets, dokumentasikan saja.

---

# 3. Current Proven Baseline

TASK-064 sudah membuktikan:

- official Drive MCP removed;
- official Docs MCP removed;
- official Slides MCP removed;
- official Calendar MCP removed;
- custom Google Sheets MCP tetap aktif;
- Sheets MCP berhasil `tools/list`;
- Sheets MCP berhasil read-only data access;
- Sheets MCP menggunakan Google REST API;
- credential/token handling berjalan secara lokal;
- token dapat auto-refresh;
- Google Sheets source/config tidak berubah.

Karena itu `google-sheets` adalah **PROVEN REFERENCE**, bukan template yang boleh langsung direfactor.

---

# 4. Architecture Question

Jawab pertanyaan utama berikut:

> Apakah Google Drive, Docs, Slides, Calendar, dan Apps Script custom MCP sebaiknya menggunakan satu shared foundation, atau masing-masing cukup menggunakan pattern sederhana dari Google Sheets?

Jangan menganggap jawabannya "yes".

Possible verdict:

### A. SHARED FOUNDATION JUSTIFIED

Jika terdapat substantial reusable logic yang:

- identik;
- stabil;
- service-independent;
- mengurangi duplicated code secara nyata;
- tidak mengorbankan clarity;
- tidak membutuhkan premature abstraction.

### B. LIGHTWEIGHT SHARED UTILITIES ONLY

Jika hanya beberapa utility yang genuinely common, misalnya:

- OAuth token retrieval;
- token refresh;
- HTTP request wrapper;
- Google API error normalization;
- common MCP response/error handling.

### C. NO SHARED FOUNDATION NEEDED

Jika service-specific behavior jauh lebih dominan dan abstraction justru menambah complexity.

---

# 5. Phase 0 — Baseline Discovery

Capture:

    git status --short
    git branch --show-current
    git log -5 --oneline

Capture current MCP state:

    opencode mcp list

Identify:

    mcp-servers/google-sheets/

Do not modify anything.

Record existing working-tree changes.

Do not reset/stash/clean unrelated changes.

---

# 6. Phase 1 — Google Sheets Source Audit

Read the complete existing custom Sheets MCP source.

Audit at minimum:

### MCP Layer

- server initialization;
- transport;
- tool registration;
- tool schema;
- request handling;
- response handling;
- error handling.

### Google API Layer

- REST endpoints;
- HTTP client;
- headers;
- request construction;
- response parsing;
- pagination;
- retries;
- error handling.

### Authentication

- credential source;
- OAuth access token;
- refresh token;
- token expiry;
- refresh logic;
- persistence;
- account identity;
- scope handling.

### Configuration

- environment variables;
- local paths;
- OpenCode configuration;
- runtime assumptions.

### Runtime

- process lifecycle;
- cwd;
- stdin/stdout;
- logging;
- error boundaries.

Create a source map:

| Component | Location | Reusable? | Evidence |
|---|---|---|---|
| MCP initialization | ... | ... | ... |
| Tool registration | ... | ... | ... |
| OAuth | ... | ... | ... |
| Token refresh | ... | ... | ... |
| REST client | ... | ... | ... |
| Error handling | ... | ... | ... |
| Sheets API logic | ... | NO | ... |

---

# 7. Phase 2 — Dependency Boundary Audit

For every dependency used by Sheets, classify:

- MCP-specific;
- Google-auth-specific;
- Google-REST-specific;
- Sheets-specific;
- OpenCode-specific;
- generic Node/runtime dependency.

Determine whether each dependency can theoretically support:

- Drive;
- Docs;
- Slides;
- Calendar;
- Apps Script.

Do not implement anything.

---

# 8. Phase 3 — Authentication Reusability Audit

This is a critical phase.

Determine whether future MCPs can reuse the existing local Google identity/token architecture.

Audit:

- OAuth client;
- refresh token;
- account identity;
- scopes;
- token persistence;
- token refresh;
- local storage;
- multi-user implications.

Build a matrix:

| Service | Existing OAuth identity reusable? | Additional scopes | Separate authorization likely? | Evidence |
|---|---|---|---|---|
| Sheets | PROVEN | ... | ... | ... |
| Drive | ... | ... | ... | ... |
| Docs | ... | ... | ... | ... |
| Slides | ... | ... | ... | ... |
| Calendar | ... | ... | ... | ... |
| Apps Script | ... | ... | ... | ... |

Important:

Do NOT assume that because OAuth identity is shared, every service has identical authorization requirements.

Separate:

- identity;
- token;
- scope;
- resource authorization.

---

# 9. Phase 4 — REST API Pattern Audit

Map the Google REST pattern used by Sheets:

    MCP Tool
       ↓
    REST Request
       ↓
    Google API
       ↓
    Response
       ↓
    MCP Response

Determine what is genuinely generic.

Examples to investigate:

- authenticated HTTP request;
- Bearer token;
- JSON parsing;
- HTTP error normalization;
- retry behavior;
- timeout;
- pagination;
- logging.

Then identify service-specific behavior.

Examples:

- Sheets spreadsheet/range model;
- Drive file/resource model;
- Docs document/body model;
- Slides presentation/page model;
- Calendar event/calendar model;
- Apps Script project/deployment/version model.

---

# 10. Phase 5 — MCP Tool Pattern Audit

Analyze the existing Sheets tools.

For each tool classify:

### Generic pattern

Potentially reusable:

- input validation;
- tool schema;
- handler structure;
- error boundary;
- result serialization.

### Service-specific

Examples:

- spreadsheet operations;
- range operations;
- sheet/tab operations.

Create:

| Sheets Tool | Generic Handler Pattern | Google-Service Logic | Reusable |
|---|---|---|---|
| ... | ... | ... | YES/NO |

Do not create a generic tool framework.

---

# 11. Phase 6 — Future Service Complexity Audit

Without implementing anything, inspect the official REST API requirements/documentation for:

- Drive API
- Docs API
- Slides API
- Calendar API
- Apps Script API

For each service determine:

- authentication requirements;
- major REST resources;
- likely CRUD operations;
- pagination;
- long-running operations;
- upload/download requirements;
- batch operations;
- special request formats;
- special error semantics.

Classification:

- SIMPLE
- MODERATE
- COMPLEX

Expected purpose:

Determine whether a common foundation would actually reduce implementation work.

---

# 12. Phase 7 — Shared Foundation Candidate Matrix

Identify candidate shared components.

Examples:

### Candidate 1 — Google OAuth Client

Potential responsibility:

- access token retrieval;
- refresh;
- persistence;
- expiry.

### Candidate 2 — Google REST Client

Potential responsibility:

- authenticated requests;
- timeout;
- retry;
- JSON handling;
- error normalization.

### Candidate 3 — MCP Server Bootstrap

Potential responsibility:

- server initialization;
- transport;
- standard logging;
- process lifecycle.

### Candidate 4 — Tool Registration Helper

Potential responsibility:

- common tool schema/handler pattern.

For each candidate:

| Candidate | Reuse | Complexity | Risk | Benefit | Verdict |
|---|---:|---:|---:|---:|---|
| OAuth client | ... | ... | ... | ... | ... |
| REST client | ... | ... | ... | ... | ... |
| MCP bootstrap | ... | ... | ... | ... | ... |
| Tool helper | ... | ... | ... | ... | ... |

Use:

- JUSTIFIED
- POSSIBLE
- NOT JUSTIFIED
- UNKNOWN

---

# 13. Phase 8 — Implementation Effort Simulation

Do not implement.

Estimate relative implementation complexity.

## Strategy A — Independent MCP

Each service follows the Sheets pattern independently:

    Drive
    Docs
    Slides
    Calendar
    Apps Script

Estimate:

- duplicated infrastructure;
- implementation effort;
- maintenance burden.

## Strategy B — Lightweight shared utilities

Only proven common infrastructure extracted.

Estimate:

- initial foundation effort;
- implementation effort per service;
- maintenance.

## Strategy C — Generic Google MCP Framework

Evaluate but treat as high-risk.

Estimate:

- abstraction complexity;
- debugging complexity;
- service-specific escape hatches;
- premature architecture risk.

Do not build it.

---

# 14. Phase 9 — Security Boundary Audit

Confirm proposed shared components would remain local.

Important architecture:

    User Machine
        │
        ├── OpenCode
        ├── Custom MCP
        ├── Google OAuth credentials
        └── Google REST API
                 │
                 ▼
             Google

KANAL VPS:

    ONLY
    ├── download/source telemetry
    └── OAuth-connected email metadata if applicable

The VPS must NOT become:

- credential broker;
- token storage;
- Google API proxy;
- MCP execution server.

This is a hard architectural boundary.

---

# 15. Phase 10 — Multi-User / Open Source Audit

The application will be used by different users.

Determine:

- whether local identity is sufficient;
- whether credential storage is user-local;
- whether OAuth authorization belongs to each user;
- whether one user's token can ever be shared with another user;
- whether any server-side identity mapping is actually necessary.

Expected principle:

> Each installation/user owns its own Google authorization state.

Do not design centralized OAuth storage unless evidence requires it.

---

# 16. Phase 11 — Recommendation

Provide one final architecture recommendation.

Choose exactly one:

### OPTION A

Independent custom MCPs using the Sheets pattern.

### OPTION B

Small shared Google authentication/REST utilities + independent MCP services.

### OPTION C

Generic Google MCP framework.

Recommendation must be evidence-based.

Prefer the smallest architecture that materially reduces repeated work.

---

# 17. Phase 12 — Quality Gate

## Gate A — Sheets Protection

PASS only if:

- `google-sheets/server.ts` unchanged;
- Sheets configuration unchanged;
- Sheets behavior unchanged.

## Gate B — Audit Integrity

PASS only if:

- complete Sheets source audited;
- authentication flow audited;
- REST flow audited;
- MCP flow audited;
- future service complexity assessed.

## Gate C — No Premature Implementation

PASS only if:

- no shared foundation created;
- no MCP service created;
- no refactor performed.

## Gate D — Evidence

PASS only if every architecture recommendation can be traced to:

- source evidence;
- runtime evidence;
- official API documentation;
- or explicitly labeled inference.

---

# 18. Evidence Classification

Every finding must be classified:

- PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

Never convert UNKNOWN into a requirement.

Never convert a possible reuse opportunity into an architectural requirement without evidence.

---

# 19. Final Deliverable

Write the complete execution summary into this task file.

Include:

## Executive Verdict

One of:

- PASS
- CONDITIONAL
- BLOCKED

## Proven Sheets Architecture

Describe what actually exists.

## Reusable Components

List only genuinely reusable components.

## Service-Specific Components

List what must remain independent.

## Architecture Recommendation

Choose A/B/C.

## Estimated Complexity

Provide relative comparison:

| Strategy | Initial Cost | Per-Service Cost | Maintenance | Risk |
|---|---:|---:|---:|---|
| Independent | ... | ... | ... | ... |
| Lightweight shared | ... | ... | ... | ... |
| Generic framework | ... | ... | ... | ... |

## Next Task Recommendation

Recommend the smallest next task.

Do NOT implement it during TASK-065.

---

# 20. Git Policy

This task is AUDIT-ONLY.

Do not commit implementation changes.

If the project workflow requires committing the task documentation itself, commit ONLY:

    TASK-OPENCODE-065-Google-Custom-MCP-Shared-Foundation-Audit.md

Before commit:

    git status --short
    git diff --stat
    git diff

Verify:

- no Sheets source changes;
- no OpenCode config changes;
- no OAuth changes;
- no Google Cloud changes;
- no new MCP implementation.

---

# 21. Stop Condition

After completing the audit:

STOP.

Do not automatically start Drive/Docs/Slides/Calendar/Apps Script implementation.

The next implementation task must be decided from the evidence produced by TASK-065.

Primary objective:

    DO NOT BUILD A FRAMEWORK
    UNLESS THE AUDIT PROVES IT WILL SAVE WORK.

---

# 22. Execution Summary

## Executive Verdict

PASS

All quality gates passed. This was an audit-only task; no code, configuration, OAuth, credential, or Google Cloud state was changed. The audit produced an evidence-based recommendation (OPTION B).

---

## Phase 0 — Baseline (PROVEN)

- Branch: `task/gworkspace-002-r1-drive-access-rework`; HEAD `bac04ba` (TASK-064 commit).
- `opencode mcp list` → only `google-sheets` connected (`npx tsx mcp-servers/google-sheets/server.ts`, cwd `C:\dev\alpha-one`).
- Only pre-existing working-tree change relevant to this audit: `M src/services/opencode/runtime.ts` — untouched (not reset/stashed/committed).
- `mcp-servers/google-sheets/` contains a single file: `server.ts` (91,172 bytes, 2020 lines). NO `package.json` in that directory (PROVEN — zero npm runtime dependencies).
- Runtime: Node `v26.5.0`; `tsx ^4.19.1` is a root `devDependency` (used only as the runner, never imported).

## Phase 1 — Google Sheets Source Audit (PROVEN, full source lines 1–2020)

### Source map

| Component | Location | Reusable? | Evidence |
|---|---|---|---|
| MCP initialization / `initialize` + `notifications/initialized` | `handleRequest` L1784–1802 | YES (generic) | `protocolVersion 2024-11-05`, capabilities `{tools:{}}`, serverInfo google-sheets 1.0.0 |
| Stdio transport (JSON-RPC 2.0 framing, pending tracking, exit wait) | L1961–2020 | YES (generic) | line-delimited JSON, `process.stdin`, `writeResponse`, `pending` set, `allSettled` on end |
| Tool registration (`TOOLS` array, 11 tools) | L1497–1780 | NO (service names/schemas) | tools named `google_sheets.*`; schemas are Sheets-specific |
| Tool dispatch (`tools/call` switch) | L1813–1942 | PARTIAL | handler shape reusable; dispatch keys service-specific |
| OAuth credential loading (`loadConnection`) | L51–59 | YES | reads `.alpha/google/connections.json`, `local-user` key |
| Token refresh (`getAccessToken`) | L61–115 | YES | 5-min buffer, `oauth2.googleapis.com/token` refresh_token grant, writes back token |
| REST client (`sheetsGet`/`sheetsPut`/`sheetsPost`) | L117–207 | YES (as one generic request fn) | 3 near-identical functions; Bearer header; JSON; error normalization |
| Error normalization (401/403/404 + message) | L134–144, L164–174, L194–204 | YES | maps `error.message`, 401→reconnect, 403→permission, 404→not found |
| Sheets REST base `https://sheets.googleapis.com/v4` | L41 | NO (service) | service base URL constant |
| Result serialization (`ToolResult`, `JSON.stringify(…, null, 2)`) | L296–299 + each tool | YES (pattern) | consistent text content + `isError` |
| Sheets API logic (metadata/range/sheet/batch/format/safety guards) | L214–1460 | NO | spreadsheet/range/A1/GridRange/ConditionType/cell-format logic |

### Auth flow traced (PROVEN)
`.alpha/google/connections.json` → `local-user` (`kanalconsultant.indonesia@gmail.com`) → accessToken/refreshToken/tokenExpiry → `getAccessToken()` validates expiry (5-min buffer) → refresh via POST `oauth2.googleapis.com/token` (client_id/secret from env) → writes refreshed token back to the same file → returns Bearer token for Sheets REST.

### MCP flow traced (PROVEN)
OpenCode spawns server via stdio (`npx tsx`, cwd `C:\dev\alpha-one`) → JSON-RPC `tools/list` → `tools/call` → dispatch switch → tool fn → `sheetsGet/Put/Post` → Google REST → `ToolResult` JSON → stdout.

### Code smells (documented only, NOT fixed — out of scope)
- `sheetsGet`/`sheetsPut`/`sheetsPost` are ~30-line near-duplicates of each other (three copies of the same fetch + error block).
- Error normalization and `ToolResult` construction are repeated inline in every tool function.
- No timeout and no retry configured on `fetch` (relies on Google's own reliability).
- No pagination support (Sheets values are bounded; not needed today, but would be needed for Drive/Docs/Calendar).
- Single-writer assumption on `connections.json` (fine for one local MCP; two MCPs writing simultaneously could race).

## Phase 2 — Dependency Boundary Audit (PROVEN)

Dependencies used by the Sheets MCP:

| Dependency | Type | Can support Drive/Docs/Slides/Calendar/Apps Script? |
|---|---|---|
| `node:fs/promises` (readFile / dynamic writeFile) | generic Node built-in | YES — all services |
| `node:path` (join) | generic Node built-in | YES |
| `fetch` / `URL` / `URLSearchParams` (global) | generic Node built-in | YES — all Google REST APIs use the same HTTPS+JSON+Bearer pattern |
| `process` (stdin/stdout/env/exit) | generic Node built-in | YES |
| `tsx` (runner only, root devDependency) | generic Node/runtime | YES — identical launch pattern |

Conclusion: there are ZERO service-specific or MCP-specific npm dependencies. Every dependency is Node built-in + one runner. The dependency boundary is already fully generic → nothing blocks a shared utilities module from serving all five future services (DERIVED: a shared utility that only imports Node built-ins adds no new dependency surface).

## Phase 3 — Authentication Reusability Audit

Current granted scopes (`connections.json`, PROVEN): `drive.readonly`, `docs.readonly`, `presentations.readonly`, `spreadsheets`, `script.projects`, `userinfo.email`, `userinfo.profile`, `openid`.

| Service | Existing OAuth identity reusable? | Additional scopes | Separate authorization likely? | Evidence |
|---|---|---|---|---|
| Sheets | PROVEN | none (already granted) | No | `spreadsheets` scope in `connections.json`; read/write smoke tests pass (TASK-064) |
| Drive | PROVEN (identity + read-only) | `drive`/`drive.file` for write | Only to extend consent (new scope) | `drive.readonly` granted; write not yet consented |
| Docs | PROVEN (identity + read-only) | `documents` for write | Only to extend consent | `docs.readonly` granted |
| Slides | PROVEN (identity + read-only) | `presentations` for write | Only to extend consent | `presentations.readonly` granted |
| Calendar | Identity PROVEN; token scope NOT granted | `calendar.calendarlist.readonly` + `calendar.events.readonly` (+`calendar.events`) | Yes — new consent round required | NO calendar scope in `connections.json` (TASK-056/057 also proved no calendar token) |
| Apps Script | PROVEN (identity + read project metadata) | `script.deployments`, `script.processes`, `script.scriptapp` for run/deploy; API-Executable also requires a **standard GCP project association** | Consent extension required | `script.projects` granted; official docs: deployments.create requires `script.deployments`; API Executable requires switching from default project to a standard project |

Key separation (PROVEN/DERIVED): identity, token, scope, and resource authorization are separate concerns. One identity + one OAuth client + one persisted refresh token CAN serve all services, but each service needs its scopes present in the granted consent. Calendar is the only one with zero coverage today; Drive/Docs/Slides/Apps Script already have read-level coverage. Reusing the existing OAuth/token machinery (refresh, persistence, expiry) is therefore directly viable for all five services.

## Phase 4 — REST API Pattern Audit (PROVEN + DERIVED)

Generic (genuinely reusable across all five services):
- Authenticated HTTPS request with `Authorization: Bearer <token>`.
- JSON request/response handling (global `fetch`, `URLSearchParams`).
- Error normalization: 401 → re-auth needed; 403 → permission; 404 → not found; else surface API `error.message`.
- No retry/timeout today (a shared client could add bounded retry + timeout uniformly).

Service-specific (must remain per-service):
- Sheets: spreadsheet/sheet/range (A1/R1C1) model, `values` + `batchUpdate` request shapes.
- Drive: file/folder model, `fields=` projection, `nextPageToken` pagination, **media upload host** (`/upload/drive/v3`), `alt=media` download, `export`, `supportsAllDrives`, trash vs delete.
- Docs: structured `StructuralElement`/`TextRun` model, UTF-16 index arithmetic, atomic `batchUpdate` (all-or-nothing).
- Slides: presentation/page/page-element/layout model, `batchUpdate`, thumbnail.
- Calendar: calendar/event model, pagination, recurring-event `instances`, free/busy.
- Apps Script: project/content/deployment/version model, **async `scripts.run` returning an `Operation`** (polling), metrics/processes.

## Phase 5 — MCP Tool Pattern Audit

| Sheets Tool | Generic Handler Pattern | Google-Service Logic | Reusable |
|---|---|---|---|
| google_sheets.list_sheets | validate id → call → serialize | `spreadsheets.get` metadata mapping | NO (service) |
| google_sheets.get_spreadsheet | validate → call → serialize | metadata + optional gridData | NO |
| google_sheets.read_range | validate → call → serialize | `values.get` + A1 encoding | NO |
| google_sheets.read_ranges | validate → call → serialize | `values.batchGet` | NO |
| google_sheets.write_range | validate + target-sheet guard → call → serialize | `values.update` USER_ENTERED | NO |
| google_sheets.append_rows | validate + guard → call → serialize | `values.append` | NO |
| google_sheets.write_formulas | validate + guard → call → serialize | `values.update` USER_ENTERED | NO |
| google_sheets.write_ranges | validate + guards → call → serialize | `values.batchUpdate` | NO |
| google_sheets.create_sheet | validate + dup-guard → call → serialize | `batchUpdate addSheet` | NO |
| google_sheets.insert_dimension | validate + resolve sheet → call → serialize | `batchUpdate InsertDimensionRequest` | NO |
| google_sheets.update_spreadsheet | validate allowlist → per-op build → call → serialize | 17 safe ops (batchUpdate request builders) | NO |

Reusable generic shape (PROVEN): every tool is `(validate inputs → optional safety guard → call service fn → serialize to { content:[{type:'text'}], isError })`. This handler shape + error boundary + serialization is a consistent, reusable pattern; but the tool names, schemas, and service logic are 100% service-specific (NO reusable tool among the 11).

## Phase 6 — Future Service Complexity Audit (official API documentation)

| Service | Auth | Major resources | Pagination | Long-running/Upload/Batch | Classification |
|---|---|---|---|---|---|
| Drive API v3 | OAuth Bearer | files (list/get/create/update/delete/copy/download/export), permissions, changes, revisions, about | YES `nextPageToken` (+ `fields=` required) | YES — media upload host, resumable/multipart; export; `supportsAllDrives` | MODERATE→COMPLEX |
| Docs API v1 | OAuth Bearer | documents (get/create/batchUpdate), tabs, structured elements | no | YES — atomic batchUpdate; UTF-16 index arithmetic | MODERATE→COMPLEX |
| Slides API v1 | OAuth Bearer | presentations (get/batchUpdate), pages, pageElements, thumbnails | no | YES — batchUpdate; page/layout model | MODERATE→COMPLEX |
| Calendar API v3 | OAuth Bearer | calendars, events (CRUD), calendarList, freebusy, acl | YES `nextPageToken`/`nextSyncToken` | recurring instances; free/busy | SIMPLE→MODERATE |
| Apps Script API v1 | OAuth Bearer + scopes | projects (get/create/updateContent/getContent), deployments (CRUD), versions, scripts.run, processes | YES (list pages) | YES — **async run → Operation (poll)**, metrics; API Executable requires standard GCP project | COMPLEX |

Evidence: official references — Drive `REST Resource: files`/`files.list` (developers.google.com/workspace/drive/api/reference/rest/v3/files, /files/list); Docs `documents` + `documents.batchUpdate` + "Structure of a Google Docs document" (developers.google.com/workspace/docs/api/reference/rest/v1/documents); Apps Script `projects.deployments.create` (scope `script.deployments`), deployments guide (API Executable / standard project association), script API `Operation` run model (developers.google.com/apps-script/api/reference/rest/v1). Calendar/Slides previously documented in TASK-056/057/055 audits.

Implication (DERIVED): only Calendar approaches "simple"; Drive/Docs/Slides/Apps Script are all at least MODERATE and bring transport-level needs the current Sheets code lacks (media upload, byte download, pagination, async polling). A shared foundation would NOT materially reduce the dominant service-model work.

## Phase 7 — Shared Foundation Candidate Matrix

| Candidate | Reuse | Complexity | Risk | Benefit | Verdict |
|---|---:|---:|---:|---:|---|
| Google OAuth client (load/refresh/persist/expiry) | ~65 lines; needed by all 5 services | LOW | LOW (pure function + fs) | Eliminates identical token code ×5 | JUSTIFIED |
| Google REST client (auth header, JSON, error normalization, optional timeout/retry) | ~70–90 lines; needed by all 5 | LOW | LOW–MEDIUM (must allow non-JSON responses: Drive media bytes, Apps Script Operation polling) | Removes triplicated fetch/error blocks; gives uniform retry/timeout | JUSTIFIED |
| MCP server bootstrap (stdio framing, initialize/ping, lifecycle) | ~120 lines; needed by all 5 | LOW | LOW | Removes identical transport boilerplate ×5 | JUSTIFIED |
| Tool registration helper (generic tool schema/handler factory) | partial; only the handler shape | MEDIUM | MEDIUM (abstraction over wildly different service payloads; escape hatches required) | Small win vs abstraction cost | NOT JUSTIFIED |

## Phase 8 — Implementation Effort Simulation (estimates = DERIVED inference)

Relative to the Sheets MCP as baseline (its real build spanned TASK-047→052 with multiple iterations for capability + safety hardening):

| Strategy | Initial Cost | Per-Service Cost | Maintenance | Risk |
|---|---:|---:|---:|---|
| A — Independent MCPs (Sheets pattern) | 0 | ~1.0× Sheets each (Drive/Docs/Slides/Apps Script ≥1.0×; Calendar ~0.5×) | ~250–280 lines of auth+REST+MCP boilerplate duplicated per service (≈1250 lines across 5 services) | LOW, but duplicated fixes must be applied N times |
| B — Lightweight shared utilities (OAuth + REST + MCP bootstrap) | ~250–280 lines, one-time | ~0.85× Sheets each (boilerplate removed) | Single copy of token/transport/error code; per-service model code still separate | LOW; small coupling risk only if utilities grow |
| C — Generic Google MCP framework | HIGH (framework + per-service adapters) | ~0.7× Sheets each (if it fits) | HIGH — framework must support media upload, byte download, pagination, async polling, per-service request builders | HIGH (premature abstraction; debugging across layers; Sheets would need refactor to adopt) |

Duplicated infrastructure (PROVEN counts): auth ~65 lines, REST wrapper ~90 lines, MCP transport/dispatch shell ~120–239 lines, error/serialization pattern ~30 lines → ≈ 250–280 lines of genuinely service-independent code that Strategy A would copy per service.

## Phase 9 — Security Boundary Audit (PROVEN/DERIVED)

- All custom MCPs run on the user machine (like Sheets). Credentials stay in `.alpha/google/connections.json` locally; tokens are used directly against Google REST endpoints from the local process (PROVEN for Sheets, TASK-064; same transport would hold for the other services).
- KANAL VPS must remain ONLY download/source telemetry + OAuth-connected email metadata if applicable. It must NOT become a credential broker, token storage, Google API proxy, or MCP execution server.
- A shared utilities module (local code) does NOT move credentials or requests to the server → the boundary is preserved (DERIVED: extraction of local utilities keeps the same trust model).

## Phase 10 — Multi-User / Open Source Audit (PROVEN/DERIVED)

- `connections.json` is per-machine, per-installation, keyed by `local-user` (PROVEN). OAuth authorization is granted per user account (identity + scopes live in that user's consent).
- Principle: each installation/user owns its own Google authorization state. One user's refresh/access token must never be shared with another user (PROVEN by storage location + OAuth semantics).
- No server-side identity mapping is necessary unless evidence requires it — no such evidence exists today (DERIVED). Centralized OAuth storage would be a security regression, not an improvement.

---

## Proven Sheets Architecture (what actually exists)

A single-file, zero-dependency Node/TypeScript process (`mcp-servers/google-sheets/server.ts`, 2020 lines) that:
1. Is launched by OpenCode as a local stdio MCP (`npx tsx mcp-servers/google-sheets/server.ts`, cwd `C:\dev\alpha-one`, timeout 15000).
2. Speaks JSON-RPC 2.0 over stdin/stdout (`initialize`, `tools/list`, `tools/call`, `ping`; protocolVersion `2024-11-05`).
3. Loads a local credential (`connections.json` → `local-user`) and refreshes the access token locally when near expiry (refresh_token grant using env client id/secret, then writes the refreshed token back).
4. Invokes Google Sheets REST (`https://sheets.googleapis.com/v4`) directly with `Authorization: Bearer`, normalizes errors (401/403/404 → friendly messages), and returns `{ content:[{type:'text',text:JSON}], isError }`.
5. Exposes 11 `google_sheets.*` tools with explicit schemas and heavy safety guards (write-to-missing-sheet refused, duplicate create refused, destructive ops blocked).
6. Keeps process alive, buffers stdin, tracks pending async calls, and exits cleanly after stdin closes.

## Reusable Components (only genuinely reusable)

1. OAuth token client — load/validate/refresh/persist (currently `loadConnection` + `getAccessToken`, L51–115).
2. Generic Google REST request wrapper with error normalization (currently the triplicated `sheetsGet/Put/Post`, L117–207) — must support JSON (all services) and escape hatches for media bytes (Drive) and async/polling (Apps Script).
3. MCP stdio bootstrap — JSON-RPC framing, `initialize`/`ping`/`notifications`, pending-tracking, clean shutdown (L1961–2020) and the `handleRequest` shell (L1782–1955).
4. `ToolResult` error-boundary + serialization pattern.

## Service-Specific Components (must remain independent)

- All 11 Sheets tools and their schemas; A1/R1C1 parsing; GridRange; sheet metadata; ConditionType aliases; cell-format/color normalization; the update_spreadsheet allowlist and every safety guard.
- The future per-service models: Drive file/permission/media; Docs structural-element/index model; Slides page/page-element model; Calendar event/instance model; Apps Script project/deployment/version/Operation model.

## Architecture Recommendation

OPTION B — **Small shared Google authentication/REST utilities + independent MCP services.**

Rationale (evidence-based):
- The genuinely reusable core is small and stable (~250–280 lines: OAuth token client + generic REST client + MCP stdio bootstrap + error normalization) and is provably service-independent (Phase 1–2).
- Service-specific logic is dominant (~80%+ of Sheets is service logic + safety), so a generic framework (C) would add abstraction without proportionate savings, and Sheets itself would need a risky refactor to adopt it (explicitly out of scope).
- Strategy A would duplicate the same ~250–280 lines five times (≈1250 lines) with multiplied maintenance (every auth/transport fix applied N times).
- The single local identity architecture (Phase 3) already proves one OAuth/refresh pipeline can serve all five services, differing only in scopes → a single shared OAuth utility is a natural fit.
- Boundary: the shared utilities remain purely local, preserving the security and multi-user posture (Phase 9–10).

Explicit caution: the shared REST client must NOT force a JSON-only or sync-only contract; Drive (media upload/download) and Apps Script (async Operation polling) need explicit escape hatches. Do NOT refactor the existing Sheets MCP to adopt the utilities — Sheets remains the reference; new utilities are for future services only.

## Estimated Complexity

| Strategy | Initial Cost | Per-Service Cost | Maintenance | Risk |
|---|---:|---:|---:|---|
| A — Independent (Sheets pattern) | 0 | ~1.0× (Drive/Docs/Slides/Apps Script), ~0.5× (Calendar) | ~250–280 lines boilerplate ×5 (~1250 lines) | LOW |
| B — Lightweight shared utilities | ~250–280 lines one-time | ~0.85× | Single copy of auth/transport/error; per-service models separate | LOW (small coupling risk if utilities grow) |
| C — Generic framework | HIGH | ~0.7× (if it fits) | HIGH (media/async/pagination abstractions) | HIGH (premature abstraction) |

## Next Task Recommendation

The smallest next task: implement a **shared local Google OAuth + REST utility module (auth + request + error normalization only)**, delivered together with ONE consumer — the **Google Calendar custom MCP** (the lowest-complexity service, SIMPLE→MODERATE, and currently the only service with zero scope coverage, which also exercises the consent-extension path).

This is deliberately NOT started in TASK-065. It validates the shared utilities on the smallest service before any Drive/Docs/Slides/Apps Script work, keeps risk minimal, and does not touch the proven Sheets MCP.

---

## Quality Gates

- **Gate A — Sheets Protection:** PASS — `google-sheets/server.ts` unchanged; Sheets configuration unchanged (`opencode mcp list` still shows `google-sheets` connected with the same local command/cwd); Sheets behavior unchanged (no invocation, no mutation this task; prior read-only smoke evidence from TASK-064 preserved).
- **Gate B — Audit Integrity:** PASS — complete source audited (all 2020 lines read); authentication flow, REST flow, and MCP flow each traced with line-level evidence; future service complexity assessed against official API documentation (Drive/Docs/Apps Script references captured; Slides/Calendar from prior audits).
- **Gate C — No Premature Implementation:** PASS — no shared foundation created; no MCP service created; no refactor performed; no OAuth/credential/config/Google Cloud change; no git commit of implementation code.
- **Gate D — Evidence:** PASS — every recommendation traces to source evidence (server.ts line references), runtime evidence (TASK-064 `opencode mcp list` + read-only smoke test; baseline captured this task), official API documentation (Drive/Docs/Apps Script URLs above; Slides/Calendar prior audits), or is explicitly labeled inference (effort estimates in Phase 8/Estimated Complexity).

## Final Verdict

PASS
