# TASK-OPENCODE-075 — Progressive OAuth Write E2E Proof

## Objective

Prove the real end-to-end progressive OAuth authorization flow created by TASK-074 using one controlled Google Docs write operation:

`missing write scope → AUTHORIZATION_REQUIRED → user consent → scope persistence → MCP write → read-back → cleanup → restart → reuse without OAuth`

This task is a validation/proof task against the existing local identity and existing Custom Google MCP architecture.

---

# 1. Scope

## In Scope (attempted)

1. Verify TASK-074 baseline — done.
2. Confirm `google.docs.write` is currently `MISSING` before consent — done (`AUTHORIZATION_REQUIRED`, `documents` missing).
3. Trigger the progressive authorization flow explicitly — consent URL constructed and presented for USER action; not auto-opened.
4. User completes Google OAuth consent interactively on the local machine — NOT completed in this headless session (external prerequisite).
5–13. Verify persistence, create, read-back, cleanup, restart, second-write, Sheets/cross-MCP regression — the regression gates were proven; the write-dependent gates require completed consent.

## Out of Scope (honored)

No OAuth redesign; no `capabilities.ts`/`auth.ts` redesign; no new OAuth system/MCP; no Google Cloud config change; no OAuth client branding change; no official Google MCP reintroduction; no KANAL VPS credential change; no credentials moved to VPS; no Sheets MCP modification; no unrelated scope request; no silent browser open; no blanket write-scope request; no Slides/Drive/Calendar write implementation; no unrelated WIP change.

---

# 2. Canonical Proof

`google.docs.write` → required scope `https://www.googleapis.com/auth/documents`, against the existing `local-user` identity and the existing local credential store. No second identity or store created.

---

# 3. Phase 0 — Baseline

- OS: `Windows_NT / win32`
- Working directory: `C:\dev\alpha-one`
- Branch: `task/gworkspace-002-r1-drive-access-rework`
- Current commit: `5ae1665` (TASK-074)
- `git status`: 241 pre-existing WIP changes (untouched)
- OpenCode version: `1.18.18`
- MCP list: 6 connected (sheets, docs, slides, drive, apps-script, calendar)
- Local Google identity: `local-user` = kanalconsultant.indonesia@gmail.com
- Local credential path: `<cwd>/.alpha/google/connections.json` (exists; tokens never printed)
- Current granted scopes (fresh read): docs.readonly, presentations.readonly, drive.readonly, script.projects, spreadsheets, userinfo.email, userinfo.profile, calendar.readonly, openid (9)
- `google.docs.write` capability state: `AUTHORIZATION_REQUIRED` (missing `https://www.googleapis.com/auth/documents`)

No consent has occurred since TASK-074; the expected initial condition holds. `documents` was NOT granted, so nothing was revoked.

---

# 4. Phase 1 — Validate TASK-074 Implementation

Inspected:

- `mcp-servers/shared/google/auth.ts` — exports `connectionsFilePath()`, `connectionKeyName()`, `persistConnection()`, `loadGoogleConnection()`, `getGrantedScopes()`, `getAccessToken()` (TASK-074 extension intact).
- `mcp-servers/shared/google/capabilities.ts` — capability registry, `checkCapability`, `buildConsentUrl`, `exchangeAuthorizationCode`, `mergeScopes`, contract states all present.
- Docs MCP (`mcp-servers/google-docs/server.ts`) — exposes `docs_get_document`, `docs_list_documents`, `docs_create_document`, `docs_update_document`; contains NO duplicated capability logic (the gate is the shared `checkCapability` consumed by the Agent).
- Local credential store — `connections.json` with 9 scopes.
- MCP registration — 6 local custom MCPs in `opencode.jsonc`.

Confirmed: `checkCapability("google.docs.write")` is the gate; no capability logic duplicated inside Docs MCP.

---

# 5. Phase 2 — Missing Scope Proof

Runtime proof (before any consent):

```
docs.write -> AUTHORIZATION_REQUIRED missing=[https://www.googleapis.com/auth/documents]
```

- service = google-docs, capability = `google.docs.write`
- missing scope includes `https://www.googleapis.com/auth/documents`
- `authAction = 'authorize'` (user consent required)

No Google Docs write was attempted before this gate.

---

# 6. Phase 3 — Interactive Authorization

The agent did NOT silently open a browser. The authorization action was constructed and is presented to the user:

- Required scope: `https://www.googleapis.com/auth/documents` ONLY (no presentations/drive-write/calendar-write/script.scriptapp requested).
- `include_granted_scopes=true` (preserves existing grants), `access_type=offline`, `prompt=consent` — built via TASK-074 `buildConsentUrl`.

Consent URL constructed (host `accounts.google.com`, scope `documents`, `include_granted_scopes=true`, offline) with state `TASK075-*` for callback validation. **Not opened automatically; not completed in this session** — completing it requires the user to open it in a browser on the local machine and approve (an external interactive step this headless session cannot perform).

---

# 7. Phase 4 — Verify Scope Merge

NOT executable: consent not completed, so no new scope persisted yet. The merge mechanism itself (`mergeScopes`, `include_granted_scopes=true`, `exchangeAuthorizationCode` persisting `existing ∪ new` to the same `connections.json` and same `local-user`) was proven in TASK-074 and remains in place; it will apply on the first successful exchange.

---

# 8. Phase 5 — Verify Capability State

Post-consent re-check NOT executable (no consent). Pre-consent state proven: `AUTHORIZATION_REQUIRED`. The check is pure local inspection and never opens a browser.

---

# 9. Phase 6 — Controlled Docs Write

NOT executable: `google.docs.write` is `AUTHORIZATION_REQUIRED`; writing before consent would be a scope violation and the task forbids calling Docs write before the gate. The write must go through `OpenCode → google-docs MCP → shared auth → Google Docs REST API` (docs_create_document) once the scope is granted.

---

# 10. Phase 7 — Read-Back Verification

NOT executable until a test document exists. Planned: read back via `docs_get_document`, verify title `Alpha One OAuth E2E Test - TASK-075`, content `Progressive OAuth write E2E proof for TASK-075.`, no auth error, record document ID.

---

# 11. Phase 8 — Cleanup

Docs MCP does not expose a delete capability (read/discovery/constrained-update only, per TASK-068). No new Docs API capability was introduced (explicitly out of scope). If the write proof runs later, the test document must be clearly identified as TASK-075 test data; cleanup limitation documented here.

---

# 12. Phase 9 — Restart Persistence

NOT executable until consent persists `documents`. Persistence is on-disk (`connections.json`), so the granted scope survives process/OpenCode/MCP restarts by design once written.

---

# 13. Phase 10 — No Duplicate OAuth Proof

NOT executable for the write path until consent completes. Proven for the read path in this session: all six MCPs performed reads with NO OAuth prompt (inspection-only capability checks; reads succeed with existing grants). After a successful consent, `checkCapability` will return `CAPABILITY_GRANTED` from the persisted store and the write will not re-prompt (by design and by the TASK-074 duplicate-prevention proof).

---

# 14. Phase 11 — Existing Scope Preservation

NOT executable until consent completes. The preserve mechanism is `include_granted_scopes=true` + `mergeScopes(existing, added)`; expected `scopes_before ⊆ scopes_after` with the only addition being `documents`.

---

# 15. Phase 12 — Sheets Protection

Proven: `mcp-servers/google-sheets/server.ts` unchanged (`git diff --stat` empty for it); Sheets configuration/credentials unchanged; Sheets connected; `read_range` returned real data; no OAuth prompt caused by any Docs/capability work. PASS.

---

# 16. Phase 13 — Cross-MCP Regression

All read-only checks PASS through the runtime with no OAuth prompts and no token leakage: Docs (get_document), Slides (21 slides), Drive (PDF metadata), Calendar (2 calendars), Apps Script (Dashboard Kanal Web), Sheets (real range data). PASS.

---

# 17. Phase 14 — Security Boundary

Proven: access/refresh tokens and client secret remain in local `.env` / `.alpha/google/connections.json` (gitignored); no credentials in any MCP output (regex scan for `ya29.`/`client_secret`/`refresh_token` → none); authorization code/PKCE never observed leaving the machine; no secrets committed; KANAL VPS receives no credentials. Scope names and capability states (non-secrets) used in evidence.

---

# 18. Phase 15 — OAuth Loop Regression

Historical loop (`request → 401 → popup → no persistence → popup again`) is structurally eliminated: `checkCapability` is inspection-only and never opens OAuth; a missing scope returns structured `AUTHORIZATION_REQUIRED`; a granted scope (persisted locally) yields `CAPABILITY_GRANTED` with no prompt. Proven for the read path here; the full `grant → persist → reuse` write cycle requires the external interactive consent step.

---

# 19. Phase 16 — Evidence Matrix

| Gate | Requirement | Evidence | Verdict |
|---|---|---|---|
| A | Baseline captured | command/output evidence | PASS |
| B | Docs write initially missing/granted state known | `AUTHORIZATION_REQUIRED`, documents missing | PASS |
| C | Interactive OAuth completed | consent URL presented; NOT completed (headless) | CONDITIONAL |
| D | `documents` scope granted | not persisted yet | NOT EXECUTED |
| E | Existing scopes preserved | merge mechanism proven (TASK-074); not applied yet | CONDITIONAL |
| F | Capability becomes GRANTED | not yet | NOT EXECUTED |
| G | Docs create succeeds | blocked by consent | NOT EXECUTED |
| H | Docs read-back succeeds | no test doc yet | NOT EXECUTED |
| I | Cleanup performed or limitation documented | no delete capability in Docs MCP; documented | PASS (limitation documented) |
| J | Credential survives restart | on-disk store by design; not re-proven without consent | CONDITIONAL |
| K | Capability remains GRANTED after restart | not yet | NOT EXECUTED |
| L | Second write requires no OAuth | not yet | NOT EXECUTED |
| M | No duplicate OAuth popup | reads produce no prompts; checks are inspection-only | PASS (read path) |
| N | Sheets protection | server unchanged + read PASS | PASS |
| O | Docs regression | read E2E PASS | PASS |
| P | Slides regression | read E2E PASS | PASS |
| Q | Drive regression | read E2E PASS | PASS |
| R | Calendar regression | read E2E PASS | PASS |
| S | Apps Script regression | read E2E PASS | PASS |
| T | Credential security boundary | no secrets in output; local-only store | PASS |
| U | OAuth loop eliminated | inspection-only checks; read path no re-prompt | PASS (write cycle pending consent) |

---

# 20. Verdict Rules

Verdict applied: **CONDITIONAL**.

An external interactive condition prevents full proof: the user has not completed OAuth consent (and this headless session cannot open the browser / complete the consent on the user's behalf — the agent is explicitly forbidden from silently opening it). All gates that do not require consent are proven (baseline, TASK-074 validation, missing-scope proof, consent-URL preparation with `include_granted_scopes`, Sheets protection, cross-MCP regression, security boundary, read-path no-OAuth-loop). The write E2E (create → read-back → cleanup → restart → second write) is blocked solely by the missing interactive consent. No implementation defect is proven; the implementation is NOT called broken.

---

# 21. Stop Conditions

None violated: no Google Cloud config change, no OAuth client recreation, no MCP redesign, no Sheets change, no credentials leaving the machine, no unrelated WIP change, no out-of-scope write capability required. (Recording the consent blocker and preserving working state.)

---

# 22. Execution Summary

## Execution Summary

- Branch: `task/gworkspace-002-r1-drive-access-rework`
- Baseline commit: `5ae1665`
- OpenCode version: `1.18.18`
- Google identity: `local-user` = kanalconsultant.indonesia@gmail.com
- Credential store: `<cwd>/.alpha/google/connections.json` (local, gitignored)
- Scopes before: docs.readonly, presentations.readonly, drive.readonly, script.projects, spreadsheets, userinfo.email, userinfo.profile, calendar.readonly, openid (9)
- `google.docs.write` state before: `AUTHORIZATION_REQUIRED` (missing `documents`)
- Interactive OAuth: consent URL constructed via TASK-074 `buildConsentUrl` (scope `documents`, `include_granted_scopes=true`, offline, prompt=consent) and presented to the user; NOT auto-opened
- User authorization result: NOT completed in this headless session (external interactive prerequisite)
- Scopes after: unchanged (9) — no consent occurred
- Scope merge verification: mechanism proven in TASK-074 (`mergeScopes` additive, `include_granted_scopes=true`); not applied yet
- `google.docs.write` state after: unchanged (`AUTHORIZATION_REQUIRED`)
- Docs create: NOT executed (blocked by gate/consent)
- Created document ID: n/a
- Read-back: n/a
- Cleanup: Docs MCP has no delete capability (TASK-068 design); no new capability added; limitation documented
- Restart: not re-proven (needs persisted scope); persistence is on-disk by design
- Capability after restart: n/a
- Second write: n/a
- OAuth popup on second write: n/a (read path shows no prompts; checks are inspection-only)
- Sheets regression: PASS (server unchanged, real read)
- Docs regression: PASS (read)
- Slides regression: PASS (read)
- Drive regression: PASS (read)
- Calendar regression: PASS (read)
- Apps Script regression: PASS (read)
- Security boundary: PASS (tokens/secrets local; none in output; none committed)
- OAuth loop result: read path no re-prompt; full write cycle pending consent
- Evidence matrix: see Phase 16 (A–U)
- Root cause(s), if any: none (no implementation defect)
- External limitations: interactive Google consent cannot be completed in a headless agent session (must be opened by the user on the local machine); the app's existing `oauth-router.ts`/`oauth-service.ts` path does not yet send `include_granted_scopes=true` on its own `generateAuthUrl`, so completing consent via that endpoint would not guarantee scope preservation — the TASK-074 URL/`exchangeAuthorizationCode` (merge + persist) is the correct path and should be wired to the callback before the user runs the flow
- Final verdict: `CONDITIONAL`
- Next task: have the user complete the consent (open the TASK-074 consent URL for `documents`, redirect to the local callback), then re-run TASK-075 to execute gates C–L (persistence → create → read-back → cleanup → restart → second write without OAuth); optionally wire the app OAuth callback to the TASK-074 merge exchange so the app's own UI flow also preserves scopes.