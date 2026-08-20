# TASK-OPENCODE-066 — Shared Google MCP Utilities

## 1. Objective

Implement the **small shared Google MCP utility layer** proven necessary by TASK-065.

Goal:

> Extract only genuinely reusable Google MCP infrastructure from the proven Google Sheets implementation pattern, without refactoring or modifying the existing Google Sheets MCP.

The shared layer must support future custom MCPs:

- Google Calendar
- Google Drive
- Google Docs
- Google Slides
- Google Apps Script

This task is **IMPLEMENTATION**, but deliberately narrow.

---

# 2. Architecture Decision

TASK-065 established:

**OPTION B — Small shared utilities + independent service MCPs**

Shared responsibilities:

1. Google OAuth/token access
2. Google REST request handling
3. Google API error normalization
4. MCP stdio/bootstrap initialization

Service-specific responsibilities remain inside each MCP:

- API endpoints
- request payloads
- resource models
- tool definitions
- validation
- pagination semantics
- service-specific errors
- service-specific safety rules

## Hard rule

Do NOT build a generic Google MCP framework.

Do NOT create generic abstractions for service-specific behavior.

---

# 3. Critical Sheets Protection Rule

The existing custom Google Sheets MCP is a **PROVEN, WORKING reference implementation**.

Do NOT refactor it in this task.

Do NOT change:

- `mcp-servers/google-sheets/server.ts`
- existing Sheets MCP configuration
- existing Sheets OAuth behavior
- existing Sheets scopes
- existing Sheets credential format
- existing Sheets tools
- existing Sheets safety guards

The new utilities must initially be consumed by **new MCPs only**.

Do not migrate Sheets to the new utilities.

Reason:

> Shared infrastructure must be proven independently before touching the production-proven Sheets implementation.

---

# 4. Phase 0 — Baseline

Capture before implementation:

    git status --short
    git branch --show-current
    git log -5 --oneline

Capture:

    opencode mcp list

Verify:

- `google-sheets` is connected;
- no official Google Drive/Docs/Slides/Calendar MCP is registered;
- existing unrelated working-tree changes are preserved.

Record baseline.

---

# 5. Phase 1 — Re-read Proven Sheets Implementation

Read the relevant sections of the existing Sheets MCP identified by TASK-065.

Specifically verify the previously identified reusable areas:

### OAuth/token handling

Approximately:

    server.ts L51–115

### REST + error normalization

Approximately:

    server.ts L117–207

### MCP stdio/bootstrap

Approximately:

    server.ts L1961–2020

Do not blindly copy.

Reconfirm the exact current implementation before extraction.

If line numbers changed, use the actual current source.

---

# 6. Phase 2 — Design Utility Boundary

Create the smallest reasonable utility structure.

A suitable structure may be:

    mcp-servers/
      shared/
        google/
          auth.ts
          rest.ts
          mcp.ts

The exact filenames may differ if the repository has a stronger existing convention.

Do NOT create unnecessary layers such as:

    services/
    repositories/
    adapters/
    providers/
    factories/
    base-mcp/
    abstract-google-service/

unless existing repository architecture proves they are necessary.

## Utility responsibilities

### `auth`

Responsible only for:

- loading existing local Google credentials;
- obtaining access token;
- checking expiry;
- refreshing access token when required;
- returning the token needed by the REST layer.

It must NOT:

- define service-specific scopes;
- define Drive/Docs/Slides/Calendar/Apps Script tools;
- make API calls;
- know MCP tool names.

---

### `rest`

Responsible only for:

- authenticated Google REST requests;
- HTTP method;
- URL;
- headers;
- request body;
- timeout;
- response parsing;
- common HTTP error normalization.

It must NOT:

- know Sheets ranges;
- know Drive files;
- know Docs documents;
- know Slides presentations;
- know Calendar events;
- know Apps Script operations.

---

### `mcp`

Responsible only for common MCP process/bootstrap behavior that is genuinely reusable.

It must NOT contain:

- service tools;
- service schemas;
- service-specific validation;
- service-specific API calls.

---

# 7. Phase 3 — Authentication Implementation

Implement the shared auth utility using the **existing local credential architecture**.

Important architecture boundary:

    User Machine
        │
        ├── OpenCode
        ├── Custom MCP
        ├── Local Google credentials
        └── Google OAuth / REST APIs

The KANAL VPS must NOT receive:

- access tokens;
- refresh tokens;
- client secrets;
- Google API payloads;
- Google MCP execution traffic.

Do not introduce server-side credential storage.

## Multi-user requirement

Each local installation/user must have independent Google authorization state.

Do not hardcode:

- email;
- Google subject;
- client identity;
- user ID;
- project-specific token.

---

# 8. Phase 4 — Scope Handling

The shared auth utility must NOT silently expand scopes.

Scopes belong to the service authorization layer.

The utility may:

- inspect existing credentials;
- expose granted scopes if available;
- refresh an existing authorized token.

The utility must NOT decide:

    Drive → request drive.readonly
    Docs → request documents.readonly
    etc.

That belongs to each service's OAuth/authorization flow.

If the current credential architecture cannot support future service-specific scope expansion cleanly, document the limitation rather than redesigning OAuth globally.

---

# 9. Phase 5 — REST Utility Implementation

Implement a minimal authenticated REST helper.

Required behavior:

1. obtain access token from shared auth utility;
2. construct request;
3. send request;
4. enforce reasonable timeout;
5. parse successful JSON response;
6. normalize non-2xx responses;
7. preserve useful Google error information;
8. never log access/refresh tokens.

Support at minimum:

- GET
- POST
- PATCH
- PUT
- DELETE

Do not add:

- automatic pagination;
- generic batching;
- file upload abstraction;
- media download abstraction;
- resource-specific helpers.

Those are service-specific unless later evidence proves otherwise.

---

# 10. Phase 6 — Error Normalization

Create a common error shape only if it materially simplifies MCP implementations.

The normalized error should preserve, where available:

- HTTP status;
- Google error code;
- Google message;
- reason;
- service response body where safe.

Never expose:

- access tokens;
- refresh tokens;
- client secrets;
- OAuth authorization codes.

Do not destroy useful Google API diagnostic information.

---

# 11. Phase 7 — MCP Bootstrap Utility

Extract only the common MCP stdio/bootstrap behavior proven by TASK-065.

Potential responsibilities:

- create MCP server;
- establish stdio transport;
- common startup;
- common fatal-error handling.

Do not abstract tool registration.

Service MCPs must still explicitly register their own tools.

Example conceptual architecture:

    Calendar MCP
        │
        ├── shared/google/auth
        ├── shared/google/rest
        ├── shared/google/mcp
        │
        └── calendar-specific tools/API logic

---

# 12. Phase 8 — Consumer Proof

Before considering the shared utilities complete, create a **minimal internal proof consumer** for the next planned service: Google Calendar.

This proof must be intentionally small.

It should prove only:

1. shared auth can obtain a valid local Google access token;
2. shared REST utility can call a Calendar REST endpoint;
3. response can be returned successfully;
4. errors are normalized;
5. no credential is exposed.

Do NOT build the Calendar MCP yet.

Do NOT implement Calendar tools yet.

The proof consumer may be temporary if appropriate.

If a permanent test is cleaner, use a test rather than production MCP code.

---

# 13. Phase 9 — Runtime Verification

Run the existing Sheets MCP first.

Verify:

    opencode mcp list

Then execute the existing Sheets read-only smoke test.

The expected result:

- Sheets still connects;
- Sheets tools remain available;
- Sheets can still read real data.

The shared utility implementation must not alter Sheets behavior.

Then execute the Calendar proof consumer against a read-only Calendar REST endpoint.

Do not perform:

- create event;
- update event;
- delete event.

---

# 14. Phase 10 — Regression Audit

Compare before/after:

    git diff --stat
    git diff -- mcp-servers/google-sheets/server.ts

Expected:

    mcp-servers/google-sheets/server.ts
    UNCHANGED

Also verify:

- OpenCode configuration unchanged unless strictly necessary for the temporary proof;
- OAuth credential files unchanged;
- Google Cloud configuration unchanged;
- official Google MCP registrations remain absent.

If a proof consumer requires configuration, keep it isolated and document it.

---

# 15. Phase 11 — Security Verification

Verify that:

- access tokens are never printed;
- refresh tokens are never printed;
- client secrets are never printed;
- Authorization headers are never logged;
- Google response payloads are not sent to KANAL VPS;
- credentials remain local.

Inspect source for accidental logging.

Use redacted evidence only.

---

# 16. Phase 12 — Quality Gates

## Gate A — Sheets Protection

PASS only if:

- `google-sheets/server.ts` unchanged;
- Sheets config unchanged;
- existing Sheets MCP remains connected;
- existing Sheets read-only test still succeeds.

## Gate B — Shared Boundary

PASS only if:

- shared utilities contain no service-specific business logic;
- no generic Google MCP framework was created;
- service-specific code remains independent.

## Gate C — Auth

PASS only if:

- local credentials are used;
- token refresh works where applicable;
- no credentials leave the user's machine;
- scopes are not silently expanded.

## Gate D — REST

PASS only if:

- authenticated request works;
- JSON response works;
- non-2xx error is normalized;
- sensitive credentials are not exposed.

## Gate E — Calendar Proof

PASS only if:

- a read-only Calendar REST request succeeds using shared utilities;
- no Calendar MCP implementation was created prematurely.

## Gate F — Runtime

PASS only if:

- Sheets remains E2E healthy;
- official Google MCPs remain absent;
- new utilities do not break existing runtime.

---

# 17. Evidence Classification

Every finding must be classified:

- PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

Do not mark a utility reusable merely because it looks reusable.

The implementation must be justified by the evidence from TASK-065.

---

# 18. Stop Conditions

STOP implementation if:

- extracting a utility requires changing Sheets;
- OAuth architecture requires redesign;
- shared abstraction starts containing service-specific behavior;
- Calendar proof requires a broad framework;
- the utility becomes more complex than the duplicated implementation it replaces.

In any of those cases:

1. preserve the existing working implementation;
2. document the blocker;
3. classify the finding;
4. do not force the abstraction.

---

# 19. Final Execution Summary

Update this task file with:

## Implementation Summary

List:

- files created;
- files modified;
- files intentionally untouched.

## Shared Utilities

Document:

- auth;
- REST;
- MCP bootstrap.

## Calendar Proof

Document:

- endpoint;
- request;
- response;
- authentication result.

Do not expose tokens.

## Sheets Regression

Document:

- connection;
- tool count;
- read-only verification;
- evidence that source/config remained unchanged.

## Security

Document credential boundary.

## Quality Gate

Provide:

| Gate | Verdict | Evidence |
|---|---|---|
| Sheets Protection | PASS/FAIL | ... |
| Shared Boundary | PASS/FAIL | ... |
| Auth | PASS/FAIL | ... |
| REST | PASS/FAIL | ... |
| Calendar Proof | PASS/FAIL | ... |
| Runtime | PASS/FAIL | ... |

## Final Verdict

Choose:

- PASS
- CONDITIONAL
- BLOCKED

---

# 20. Git Policy

Before Git:

    git status --short
    git diff --stat
    git diff

Verify only intended implementation files are changed.

Do NOT commit:

- Sheets changes;
- OpenCode unrelated changes;
- credentials;
- `.env`;
- OAuth state;
- token files;
- runtime artifacts.

Commit only:

- shared utility implementation;
- required tests/proof code;
- this task file.

Use one commit only.

---

# 19. Final Execution Summary

## Implementation Summary

Files created:

- `mcp-servers/shared/google/auth.ts` — shared local Google OAuth credential access (load connection, get token, local refresh, write-back, granted-scope view).
- `mcp-servers/shared/google/rest.ts` — minimal authenticated Google REST client (GET/POST/PATCH/PUT/DELETE, timeout, JSON parse, normalized non-2xx errors).
- `mcp-servers/shared/google/mcp.ts` — minimal MCP stdio bootstrap (initialize/ping/notifications/tools/list/tools/call, pending tracking, clean exit).
- `mcp-servers/shared/proof/calendar-proof.ts` — temporary read-only Calendar proof consumer (never creates/updates/deletes).
- `mcp-servers/shared/proof/mcp-bootstrap-smoke.ts` — temporary MCP bootstrap smoke (line-delimited JSON-RPC over stdio).

Files modified: none.

Files intentionally untouched:

- `mcp-servers/google-sheets/server.ts` (PROVEN reference — UNCHANGED).
- `src/services/opencode/runtime.ts` (pre-existing unrelated working-tree change — preserved, not committed).
- OpenCode configuration, `.env`, `.alpha/google/connections.json` (credential write-back only on token refresh), Google Cloud configuration.

## Shared Utilities

- `auth`: loads the existing local credential file (`.alpha/google/connections.json`, key `local-user`; env-overridable via `GOOGLE_CONNECTIONS_FILE` / `GOOGLE_CONNECTION_KEY`); returns a token with a 5-minute freshness buffer; refreshes locally via `https://oauth2.googleapis.com/token` when needed and writes back only the token fields (runtime bookkeeping, gitignored). Exposes `getGrantedScopes()` so service authorization layers can inspect, but never defines or expands scopes. No server-side storage; credentials stay on the user's machine.
- `rest`: `googleRequest<T>()` supports GET/POST/PATCH/PUT/DELETE, query params, JSON body, custom headers, optional reused token, default 15 s timeout via `AbortController`. 204 → null; JSON parse; non-2xx → `GoogleApiError` preserving HTTP status, Google code, message, gRPC-style status, first error reason, and safe parsed body. Never logs Authorization headers or tokens.
- `mcp`: `startMcpServer({name, version, tools, callTool})` implements JSON-RPC 2.0 framing over stdio, `initialize` (2024-11-05), `notifications/initialized`, `tools/list`, `tools/call` (unknown tool → `-32601`; tool error → `{content, isError:true}`), `ping`, async-response pending tracking, and clean exit. Tool registration is intentionally left to each service MCP (not abstracted).

## Calendar Proof

- Endpoint (read-only): `https://www.googleapis.com/calendar/v3/users/me/calendarList` (`GET`, params `maxResults=5`). No create/update/delete performed.
- Authentication: shared `auth` obtained a valid local access token (redacted, length-only) and exposed the 8 granted scopes.
- 2xx control call: `https://www.googleapis.com/oauth2/v2/userinfo` → 200 with `id` and `email` domain (`gmail.com`) returned — proves authenticated request + JSON response.
- Calendar response: non-2xx normalized by shared `rest` into `GoogleApiError` — `status=403`, `code=403`, `googleStatus=PERMISSION_DENIED`, `reason=insufficientPermissions`, message "Request had insufficient authentication scopes."
- Cause: the current local credentials grant 8 scopes but NOT a calendar scope (proven via `getGrantedScopes`, `calendar scope granted: false`). The Calendar read cannot return 2xx until a calendar scope is granted in the local OAuth consent — an external authorization prerequisite consistent with TASK-063/065. The shared utilities themselves are fully exercised against the real Calendar endpoint (auth + request + error normalization all proven).
- No tokens, headers, or secrets printed.

## Sheets Regression

- `opencode mcp list` → only `google-sheets connected`; no official Google MCP registered.
- Read-only smoke (real data): `google_sheets.list_sheets` on spreadsheet `1qmtFLkix4fOo94K71JyFlKIHj12p0PD-AA0ejVqeF_8` returned `ALPHA_ONE_MCP049SCR_2026-08-18T11-36-11-972Z` with sheets `Sheet1` (rowCount 1000, columnCount 26) and `FlashSale049SCR`; `google_sheets.read_range` `Sheet1!A1:B3` returned `No/SKU` header + 2 product rows (`SMSID_PRODUK1_CAT`, `SMSID_PRODUK2_CAT`).
- `git diff -- mcp-servers/google-sheets/server.ts` → empty (UNCHANGED). Sheets config and OpenCode config unchanged.

## Security

Credential boundary verified:

- Access tokens, refresh tokens, and client secrets are never printed or logged (source inspected; only redacted evidence — token length, email domain — is emitted).
- Authorization headers are never logged; `rest.ts` sets `Authorization` only on the outgoing request.
- No Google API payloads or MCP execution traffic are sent to KANAL VPS; everything runs locally on the user's machine.
- Credentials remain local; shared `auth` refreshes and writes back only token fields into the gitignored local credential file.

## Quality Gate

| Gate | Verdict | Evidence |
|---|---|---|
| Sheets Protection | PASS | `server.ts` unchanged (git diff empty); config unchanged; `opencode mcp list` shows `google-sheets connected`; read-only smoke on real data succeeded. |
| Shared Boundary | PASS | `auth`/`rest`/`mcp` contain no service-specific logic (no Sheets/Drive/Docs/Slides/Calendar/Apps Script specifics); no generic framework; tools/service logic remain independent. |
| Auth | PASS | Local credentials used; token obtained (valid, length-only evidence); refresh path implemented and exercised (token freshness buffer); no credentials leave the machine; scopes not silently expanded (`calendar scope granted: false`). |
| REST | PASS | userinfo GET → 200 + parsed JSON; Calendar GET → non-2xx normalized to `GoogleApiError` with `status/code/googleStatus/reason/message`; no sensitive data exposed. |
| Calendar Proof | CONDITIONAL | Shared utilities proven against the real Calendar endpoint (auth + request + error normalization). A 2xx Calendar read requires a calendar scope in the local OAuth consent — external authorization prerequisite (consistent with TASK-063), not a utility defect. No Calendar MCP created. |
| Runtime | PASS | Sheets E2E healthy; official Google MCPs remain absent; new utilities do not alter runtime. |

## Final Verdict

CONDITIONAL — the smallest shared infrastructure was extracted, proven against the real Google Calendar endpoint, and the Sheets MCP is fully preserved and working. A 2xx Calendar read (the next custom MCP) additionally requires a calendar scope to be granted in the local Google OAuth consent before the Calendar MCP task can reach full E2E success.

---

# 21. Final Rule

The success criterion is NOT:

> "We created a reusable framework."

The success criterion is:

> "We extracted the smallest proven reusable infrastructure that makes the next custom Google MCP faster to build, while preserving the already-working Google Sheets MCP."

After execution, **do not automatically start TASK-067**.

Report the evidence and stop.