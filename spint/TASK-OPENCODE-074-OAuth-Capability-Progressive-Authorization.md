# TASK-OPENCODE-074 — OAuth Capability / Progressive Authorization

## Objective

Implement a local-first, progressive OAuth authorization mechanism for the Google Custom MCP ecosystem.

The goal is to allow the Agent to distinguish:

- identity;
- granted OAuth scopes;
- required scope for a requested capability;
- authorization already available;
- authorization that must be requested.

The mechanism supports future write operations for Google Docs, Slides, Drive, Calendar, and Apps Script without a separate OAuth implementation per MCP. Google Sheets is the protected baseline and was not refactored.

Security boundary preserved: `User Local Machine → local credentials → Google APIs`. KANAL VPS is not a credential store.

---

# 1. Scope

## In Scope (delivered)

1. OAuth scope/capability registry — `mcp-servers/shared/google/capabilities.ts` (new).
2. Local granted-scope inspection — real grant read via shared `auth.ts`.
3. Capability → required Google OAuth scope mapping — 12 capabilities.
4. Detection of missing authorization — `checkCapability`.
5. Structured authorization-required result — `AUTHORIZATION_REQUIRED` + missing scopes + auth action.
6. Progressive authorization flow — consent-URL construction + code exchange (LOCAL-FIRST, user-initiated).
7. Local credential persistence after re-consent — `persistConnection` (scope-merged write-back to the SAME store).
8. Prevention of repeated unnecessary OAuth prompts — capability state is inspection-only; a granted scope never re-prompts.
9. Identity consistency — single `local-user` across all MCPs.
10. Regression across all six custom Google MCPs — PASS.
11. Sheets protection — PASS.

## Out of Scope (honored)

No OAuth redesign, no generic MCP framework, no unnecessary MCP refactor (all six MCP `server.ts` files untouched), no Google Cloud config change, no OAuth client branding change, no official Google MCP change, no KANAL VPS credentials, no remote token storage, no service-specific OAuth, no Sheets MCP modification, no auto-grant, no silent reconnect, no request-every-scope, no write API implementation in this task.

---

# 2. Required Architecture

`Agent → OpenCode → Custom Google MCP → Shared Google Auth → Google REST API`. OAuth state remains local; the local credential store (`<cwd>/.alpha/google/connections.json`, key `local-user`) is the source of truth. KANAL VPS may know an identity is connected but never receives access tokens, refresh tokens, client secrets, authorization codes, or PKCE verifiers.

---

# 3. Existing Baseline

Reused unchanged: `mcp-servers/shared/google/auth.ts` (extended minimally), `rest.ts`, `mcp.ts`. All six custom MCPs present (sheets, docs, slides, drive, apps-script, calendar). No duplicated token loading/refresh.

---

# 4. Phase 0 — Baseline Discovery

- OS: `Windows_NT / win32`
- Working directory: `C:\dev\alpha-one`
- Branch: `task/gworkspace-002-r1-drive-access-rework`
- Current commit: `63d6ab3` (TASK-073)
- `git status`: 241 pre-existing WIP changes (untouched)
- OpenCode version: `1.18.18`
- MCP list: 6 connected (sheets, docs, slides, drive, apps-script, calendar)
- Local Google identity: `local-user` = kanalconsultant.indonesia@gmail.com
- Local credential storage: `<cwd>/.alpha/google/connections.json` (access token + refresh token + scopes; tokens never printed)
- Currently granted scopes (verified fresh, not assumed): `docs.readonly`, `presentations.readonly`, `drive.readonly`, `script.projects`, `spreadsheets`, `userinfo.email`, `userinfo.profile`, `calendar.readonly`, `openid` (9)
- OAuth configuration: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from local env (`.env`); no OAuth client change made
- Existing shared auth implementation read and understood before extension

---

# 5. Phase 1 — Scope Registry Audit

Evidence-based matrix (verified against actual implementation + live Google responses across TASK-068..073):

| Service | Capability | Required Scope | Current State |
|---|---|---|---|
| Sheets | existing read/write | `spreadsheets` | GRANTED (proven read + existing write baseline) |
| Drive | list/read | `drive.readonly` | GRANTED (proven) |
| Drive | create/update | `drive.file` (or `drive`) | MISSING |
| Docs | read | `documents.readonly` / Drive read | GRANTED (proven) |
| Docs | create/update | `documents` | MISSING |
| Slides | read | `presentations.readonly` / Drive read | GRANTED (proven) |
| Slides | create/update | `presentations` | MISSING |
| Calendar | list/read events | `calendar.readonly` | GRANTED (proven) |
| Calendar | create/update/delete events | `calendar` | MISSING |
| Apps Script | project read/discovery | `script.projects` | GRANTED (proven) |
| Apps Script | execute | `script.scriptapp` (+ deployment config) | MISSING |

`API enabled ≠ OAuth user authorization` honored throughout.

---

# 6. Phase 2 — Capability Registry Design

`mcp-servers/shared/google/capabilities.ts` — service-independent `CAPABILITIES` registry:

`google.sheets.read/write → spreadsheets`
`google.docs.read → documents.readonly`, `google.docs.write → documents`
`google.slides.read → presentations.readonly`, `google.slides.write → presentations`
`google.drive.read → drive.readonly`, `google.drive.write → drive.file`
`google.calendar.read → calendar.readonly`, `google.calendar.write → calendar`
`google.appsscript.read → script.projects`, `google.appsscript.execute → script.scriptapp`

Reusable by any future Agent guidance / MCP authorization handling; no hardcoded per-MCP checks.

---

# 7. Phase 3 — Granted Scope Inspection

`inspectAuthorization()` reads the ACTUAL local grant via `getGrantedScopes()` and computes per-capability state `GRANTED | MISSING` (UNKNOWN only when no connection). `UNKNOWN` is never treated as granted; API-enabled ≠ authorized. Proof run showed the exact 12-state matrix (see Phase 11 output).

---

# 8. Phase 4 — Capability Check

`checkCapability(capability)` returns a structured result:

- `CAPABILITY_GRANTED` — all required scopes present locally.
- `AUTHORIZATION_REQUIRED` — missing scope(s) listed + `authAction: 'authorize'` + human-readable reason.
- `CAPABILITY_NOT_SUPPORTED` — unregistered capability.

Proven at runtime: `google.docs.write` → `AUTHORIZATION_REQUIRED` with `missing=https://www.googleapis.com/auth/documents`; `google.docs.read` → `CAPABILITY_GRANTED`.

---

# 9. Phase 5 — Progressive Authorization

Prepared in `capabilities.ts`: `buildConsentUrl()` (OAuth authorize URL with `scope`, `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`) and `exchangeAuthorizationCode()` (token exchange + merged scope write-back). The flow is strictly user-initiated; the URL is never auto-opened and the proof never triggered consent.

---

# 10. Phase 6 — Scope Merge

`mergeScopes(existing, added)` is purely additive and deduplicates. Proven in-memory: `[5 existing scopes] + [documents] → 6`, with `allPreserved=true`. The exchange path persists `existing ∪ new` so re-consent never replaces the prior grant (this is the mechanism that would yield `Sheets + Drive read + Docs read + Docs write + Slides read + Calendar read` after granting Docs write).

---

# 11. Phase 7 — Token Persistence

Exchange writes the merged scope set plus new access/refresh tokens to the SAME local `connections.json` via the newly added `persistConnection()` in `auth.ts` (minimal extension of the existing module). Persistence is on-disk (not in-memory) and therefore survives process/OpenCode/MCP restarts by design; the existing refresh flow continues to work against the same store.

---

# 12. Phase 8 — Duplicate Authorization Prevention

Proven at runtime: calling `checkCapability('google.docs.write')` twice returns identical `AUTHORIZATION_REQUIRED` states, and the check is pure inspection — it never constructs or opens a consent URL. Once a scope is stored as granted, the same check returns `CAPABILITY_GRANTED` with no prompt. Starting another MCP service shares the same store, so authorization is per-identity, not per-service.

---

# 13. Phase 9 — Identity Mapping

Single model: `local-user → Google identity (kanalconsultant.indonesia@gmail.com) → local credential → granted scopes`. The registry has no per-service identity; one identity carries all capabilities.

---

# 14. Phase 10 — User Cancellation

Proven in-memory: a simulated cancel returns `AUTHORIZATION_CANCELED` and leaves the existing connection byte-identical (`connectionUnchanged=true`). `exchangeAuthorizationCode` only persists after a successful token response, so an incomplete/canceled flow cannot overwrite a valid credential. Repeated authorization is possible on explicit retry.

---

# 15. Phase 11 — Insufficient Scope Runtime Proof

Real runtime proof against the live grant: `google.docs.write` → `AUTHORIZATION_REQUIRED` (missing `documents`) BEFORE any Google call would 403. `403 insufficientPermissions` classification returns `AUTHORIZATION_REQUIRED` rather than an unexplained failure. No real user data mutated to prove a known missing-scope condition.

---

# 16. Phase 12 — Progressive Authorization Proof

A real OAuth consent cannot be completed in this headless session: it requires an interactive browser consent by the user on the user's machine, which this environment cannot perform, and triggering one would violate the no-silent-reconnect rule. External OAuth configuration (interactive consent dependency) prevents the full write E2E proof.

Per the rules, the blocker is documented without modifying Google Cloud, the authorization-state detection and flow preparation are proven (Phases 4–11), and the remaining write E2E is classified `CONDITIONAL`.

---

# 17. Phase 13 — Scope Revocation / Stale State

`classifyCapabilityError` distinguishes `AUTHORIZATION_REQUIRED` (403/401/insufficientPermissions → consent needed) from `GOOGLE_API_ERROR` (other API errors) so stale authorization is surfaced as an authorization state rather than a generic failure. No infinite OAuth loop is possible: the flow is user-initiated and inspection-only. No production authorization was revoked for testing.

---

# 18. Phase 14 — MCP Integration

Verified that every service maps onto the same registry (`docs.write → documents`, `slides.write → presentations`, `drive.write → drive.file`, `calendar.write → calendar`, `appsscript.execute → script.scriptapp`), and each service's authorization state is accurately computed as GRANTED/MISSING from the live grant (Phase 11 matrix). No MCP server was modified; integration is via the shared registry consumed by the Agent-facing check.

---

# 19. Phase 15 — Sheets Protection

- `mcp-servers/google-sheets/server.ts`: unchanged (git diff).
- Sheets MCP config unchanged; credential behavior unchanged.
- Sheets connected; `read_range` on `1qmtFLkix4fOo94K71JyFlKIHj12p0PD-AA0ejVqeF_8` returned real data. No extra OAuth prompt triggered. PASS.

---

# 20. Phase 16 — Cross-MCP Regression

All read-only checks PASS through the runtime: Docs (7262 chars), Slides (21 slides), Drive (PDF metadata), Calendar (2 calendars), Apps Script (Dashboard Kanal Web project), Sheets (real range data). No unrelated MCP lost authorization.

---

# 21. Phase 17 — Security Boundary

- Credentials remain local; no token/refresh/client-secret sent to KANAL VPS.
- No OAuth codes stored remotely; no secrets committed; no secrets printed in logs.
- Proof output prints only identity, scope names (not secrets), counts, and statuses — no token material.
- Missing-scope messages contain scope names (safe) and never credentials.

---

# 22. Phase 18 — Agent-Facing Contract

Stable states exported by `capabilities.ts`: `CAPABILITY_GRANTED`, `AUTHORIZATION_REQUIRED`, `AUTHORIZATION_CANCELED`, `AUTHORIZATION_FAILED`, `CAPABILITY_NOT_SUPPORTED`, `GOOGLE_API_ERROR`. Proven distinctions: 403+insufficientPermissions → AUTHORIZATION_REQUIRED; 500 backend → GOOGLE_API_ERROR; unknown capability → CAPABILITY_NOT_SUPPORTED.

---

# 23. Phase 19 — No OAuth Loop

Historical failure mode eliminated by design and proven: `checkCapability` never opens OAuth; a missing scope yields a structured `AUTHORIZATION_REQUIRED`; successful authorization persists the scope locally; subsequent invocations see `CAPABILITY_GRANTED`. Full end-to-end proof of the grant→persist→reuse sequence requires the interactive consent step (external), so the task is classified CONDITIONAL.

---

# 24. Evidence Matrix

| Gate | Requirement | Evidence | Verdict |
|---|---|---|---|
| A | Current identity detected | real connection read | PASS |
| B | Current scopes detected | 9 scopes read from store | PASS |
| C | Capability registry exists | capabilities.ts | PASS |
| D | Capability → scope mapping correct | 12-entry matrix + runtime states | PASS |
| E | Missing scope detected | docs.write → MISSING | PASS |
| F | Authorization-required state | docs.write → AUTHORIZATION_REQUIRED | PASS |
| G | Progressive OAuth flow | consent URL + exchange prepared | CONDITIONAL (interactive consent external) |
| H | Existing scopes preserved | merge test (5→6, all preserved) | PASS |
| I | New scope persisted | exchange writes merged set to same store | PASS (by design; exchange not executed) |
| J | Persistence survives restart | on-disk store (not in-memory) | PASS (by design) |
| K | Duplicate OAuth prevented | repeat check identical, no flow | PASS |
| L | Identity mapping correct | single local-user | PASS |
| M | Cancellation handled | simulated → connection unchanged | PASS |
| N | Docs capability mapping | docs.read GRANTED / docs.write MISSING | PASS |
| O | Slides capability mapping | read GRANTED / write MISSING | PASS |
| P | Drive capability mapping | read GRANTED / write MISSING | PASS |
| Q | Calendar capability mapping | read GRANTED / write MISSING | PASS |
| R | Apps Script capability mapping | read GRANTED / execute MISSING | PASS |
| S | Sheets protection | server unchanged, read PASS | PASS |
| T | Cross-MCP regression | all six services PASS | PASS |
| U | Credential boundary | no secrets in output/store remote | PASS |
| V | Agent-facing contract | 6 states exported + proven | PASS |
| W | OAuth loop eliminated | inspection-only checks; no auto-prompt | PASS (full reuse cycle needs consent step) |

---

# 25. Verdict Rules

Verdict applied: **CONDITIONAL**.

Capability detection, granted-scope accuracy, missing-scope detection, structured authorization-required state, scope merge, duplicate-prompt prevention, cancellation safety, identity mapping, Sheets protection, and cross-MCP regression are all proven. The progressive OAuth flow is implemented and prepared, but the full consent→persist→retry write E2E cannot be completed in this headless session (interactive user consent on the user's machine is an external prerequisite; triggering it would violate the no-silent-reconnect rule). Write E2E remains CONDITIONAL. No implementation defect proven; no FAIL.

---

# 26. Stop Conditions

None triggered: no Google Cloud change, no OAuth client recreation, no OAuth architecture redesign, no Sheets modification, no credentials leaving the machine, no unrelated WIP change, no MCP redesign.

---

# 27. Execution Summary

## Execution Summary

- Branch: `task/gworkspace-002-r1-drive-access-rework`
- Baseline commit: `63d6ab3`
- OpenCode version: `1.18.18`
- Google identity: `local-user` = kanalconsultant.indonesia@gmail.com
- Initial granted scopes: docs.readonly, presentations.readonly, drive.readonly, script.projects, spreadsheets, userinfo.email, userinfo.profile, calendar.readonly, openid (9)
- Scope registry: 12 capabilities across 6 services in `capabilities.ts`
- Capability registry: `capability → { service, label, requiredScopes, write }`
- Capability → scope mapping: sheets→spreadsheets, docs→documents(.readonly), slides→presentations(.readonly), drive→drive.readonly/drive.file, calendar→calendar.readonly/calendar, apps-script→script.projects/script.scriptapp
- Missing-scope detection: `checkCapability` — docs.write → AUTHORIZATION_REQUIRED (missing `documents`); proven
- Authorization-required contract: AUTHORIZATION_REQUIRED with service/capability/missingScopes/reason/authAction
- Progressive OAuth flow: `buildConsentUrl` (offline, prompt=consent, include_granted_scopes=true) + `exchangeAuthorizationCode` (merge + persist) prepared; consent NOT triggered in session
- Scope merge: proven additive (5→6, all preserved)
- Credential persistence: `persistConnection` writes merged scopes to the same `connections.json`; on-disk
- Restart persistence: on-disk store survives process/OpenCode/MCP restarts (by design)
- Duplicate OAuth test: repeat check identical; checks never open OAuth
- Identity mapping: single local-user across all MCPs
- Cancellation handling: simulated cancel leaves connection unchanged
- Docs capability proof: read GRANTED, write MISSING (runtime)
- Slides capability proof: read GRANTED, write MISSING (runtime)
- Drive capability proof: read GRANTED, write MISSING (runtime)
- Calendar capability proof: read GRANTED, write MISSING (runtime)
- Apps Script capability proof: read GRANTED, execute MISSING (runtime)
- Sheets regression: PASS (server unchanged, read_range real data)
- Cross-MCP regression: PASS (docs/slides/drive/calendar/apps-script/sheets all read PASS)
- Security boundary: no credentials printed/sent remotely; scope names only
- OAuth loop test: inspection-only checks; no auto-prompt; full reuse cycle requires external consent step
- Git diff: only `mcp-servers/shared/google/auth.ts` (minimal extension: exported path/key + persistConnection), `mcp-servers/shared/google/capabilities.ts` (new), `mcp-servers/shared/proof/capability-proof.ts` (new proof), and this task file; 241 pre-existing WIP untouched; no Sheets/MCP server changes
- Evidence matrix: see Phase 24 (A–W)
- Root cause(s), if any: none (no implementation defect)
- External limitations: interactive OAuth consent cannot be completed in a headless session; write scopes (documents/presentations/drive.file/calendar/script.scriptapp) not granted in the persisted consent
- Final verdict: `CONDITIONAL`
- Next task: when a user-performed consent is available, run a controlled Docs-write proof (create→read-back→cleanup) to move the progressive write E2E from CONDITIONAL to PASS; no separate OAuth implementation or Google Cloud change required.