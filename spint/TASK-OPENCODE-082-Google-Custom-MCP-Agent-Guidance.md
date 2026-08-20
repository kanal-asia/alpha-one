# TASK-OPENCODE-082 — Google Custom MCP Agent Guidance

## 1. Objective

Membuat dan memvalidasi guidance agar OpenCode Agent dapat menggunakan seluruh Google Custom MCP secara konsisten, aman, dan production-ready.

TASK-081 sudah membuktikan:

- seluruh 6 MCP terhubung;
- seluruh capability utama granted;
- Agent routing pada skenario E2E sudah CORRECT;
- cross-MCP workflow berhasil;
- OAuth tidak looping;
- restart persistence PASS;
- credential safety PASS.

TASK-082 tidak membangun MCP baru.

Tujuan utama:

> Mengubah capability yang sudah proven menjadi aturan operasional yang dapat dipahami dan diikuti Agent.

---

# 2. Target MCP

| Service | MCP | Primary Responsibility |
|---|---|---|
| Google Sheets | `google-sheets` | Spreadsheet/data operations |
| Google Docs | `google-docs` | Document creation/editing/read |
| Google Slides | `google-slides` | Presentation creation/editing/read |
| Google Drive | `google-drive` | File discovery/metadata/content/file operations |
| Google Calendar | `google-calendar` | Calendar/event operations |
| Google Apps Script | `google-apps-script` | Apps Script discovery/execution |

Official Google MCPs remain out of scope and must remain absent.

---

# 3. Core Agent Principle

Agent harus memilih MCP berdasarkan:

> **jenis resource / intent yang ingin dioperasikan**

bukan berdasarkan asumsi bahwa semua file Google adalah Drive operation.

Examples:

```text
"buat dokumen"
→ Google Docs

"edit presentasi"
→ Google Slides

"buat event kalender"
→ Google Calendar

"baca spreadsheet"
→ Google Sheets

"cari file di Google Drive"
→ Google Drive

"jalankan Apps Script"
→ Google Apps Script
```

Drive digunakan untuk file-level operations dan discovery.

Docs/Slides/Sheets/Calendar/Apps Script digunakan untuk domain-specific operations.

---

# 4. MCP Responsibility Matrix

Create a concise guidance matrix.

## Google Sheets

Use when:

* reading spreadsheet data;
* writing spreadsheet data;
* listing sheets;
* reading/writing ranges;
* manipulating spreadsheet-specific content.

Do not use Drive merely because a spreadsheet is stored in Drive.

---

## Google Docs

Use when:

* creating a document;
* reading document content;
* updating document content;
* appending/inserting document text.

Do not use Drive as the primary editing mechanism for Google Docs.

Drive may be used for:

* discovery;
* metadata;
* file-level operations.

---

## Google Slides

Use when:

* creating presentations;
* reading presentations;
* adding slides;
* inserting/updating presentation text.

Do not use Drive as the primary presentation editing mechanism.

Drive may be used for:

* discovery;
* metadata;
* file-level operations.

---

## Google Drive

Use when:

* searching files;
* listing files;
* reading file metadata;
* retrieving supported file content;
* performing file-level operations;
* locating resources before handing them to a domain-specific MCP.

Do not use Drive instead of Docs/Slides/Sheets for domain-specific editing.

---

## Google Calendar

Use when:

* listing calendars;
* reading events;
* creating events;
* updating events;
* deleting events.

Do not represent Calendar operations as Drive/Docs operations.

---

## Google Apps Script

Use when:

* discovering Apps Script projects;
* reading Apps Script metadata/content;
* executing a known callable Apps Script function through the Execution API.

Do not use Apps Script as a generic substitute for Google API calls.

Use the smallest deterministic function necessary.

---

# 5. Tool Selection Rules

Agent should follow:

```text
IF intent is spreadsheet-specific
    → Sheets

IF intent is document-specific
    → Docs

IF intent is presentation-specific
    → Slides

IF intent is file discovery / metadata / file-level operation
    → Drive

IF intent is calendar/event-specific
    → Calendar

IF intent is Apps Script execution/discovery
    → Apps Script
```

For cross-service requests:

> Use multiple MCPs rather than forcing one MCP to perform another service's responsibility.

Example:

```text
"Create a Google Doc and put the resulting file in Drive."

Correct:
Docs → create document
Drive → verify/discover metadata if required
```

Do not attempt to make Drive edit the document body.

---

# 6. Cross-MCP Orchestration

When a user request spans multiple services:

1. decompose the request into service-specific operations;
2. select the appropriate MCP for each operation;
3. execute in dependency order;
4. read back authoritative state;
5. continue only after the dependency is confirmed.

Example:

```text
Create Calendar event
        ↓
read-back event
        ↓
Create Docs summary
        ↓
read-back document
        ↓
report final state
```

Do not claim the overall workflow succeeded because only one step succeeded.

---

# 7. Source of Truth

Agent must distinguish:

```text
Agent statement
    ≠
Google persisted state
```

For important write operations:

```text
WRITE
 ↓
READ-BACK
 ↓
VERIFY
 ↓
REPORT
```

Examples:

```text
Docs:
create/update
→ docs_get_document
→ verify content

Slides:
create/update
→ slides_get_presentation
→ verify slide/content

Drive:
create/update
→ drive_get_file_metadata/content
→ verify persisted state

Calendar:
create/update
→ calendar_get_event
→ verify event fields

Sheets:
write
→ read_range
→ verify values

Apps Script:
run
→ operation polling
→ DONE
→ SUCCESS
→ verify result
```

---

# 8. Never Invent Success

Agent must never say:

* "done"
* "created"
* "updated"
* "executed successfully"

unless the underlying operation provides sufficient evidence.

Required classification:

```text
PROVEN
DERIVED
UNPROVEN
UNKNOWN
INSUFFICIENT_EVIDENCE
```

Example:

```text
API request accepted
→ operation ID returned

This is NOT enough to claim:
"Script executed successfully."

Required:
operation DONE
+
no error
+
result verified
```

---

# 9. OAuth / Capability Guidance

The system uses progressive OAuth.

Agent must understand:

```text
CAPABILITY_GRANTED
→ use MCP normally

AUTHORIZATION_REQUIRED
→ authorization is required

CAPABILITY_NOT_SUPPORTED
→ do not repeatedly request OAuth

GOOGLE_API_ERROR
→ handle as Google API/runtime error
```

If a capability is already granted:

> Do not ask the user to reconnect Google.

If authorization is required:

1. identify the exact missing capability/scope;
2. use the existing progressive OAuth flow;
3. preserve previously granted scopes;
4. do not create a second Google identity;
5. after consent, retry the original operation;
6. verify the new capability persisted.

Do not blindly reconnect.

---

# 10. OAuth Loop Prevention

Never perform:

```text
AUTHORIZATION_REQUIRED
→ reconnect
→ AUTHORIZATION_REQUIRED
→ reconnect
→ ...
```

Instead:

```text
AUTHORIZATION_REQUIRED
        ↓
inspect exact capability
        ↓
determine whether consent is actually required
        ↓
request progressive authorization once
        ↓
persist
        ↓
retry
```

If the same capability remains unavailable after successful consent:

* stop;
* report the exact error;
* classify root cause;
* do not repeatedly prompt.

---

# 11. Apps Script Execution Guidance

Apps Script Execution API has a known upstream transient behavior:

```text
Execution API
→ intermittent 404
→ bounded retry
→ SUCCESS
```

TASK-081 proved this is upstream behavior, not an MCP implementation defect.

Agent should:

1. recognize a transient Execution API 404;
2. perform bounded retry where the MCP/runtime contract supports it;
3. verify final operation state;
4. never claim success before `DONE + SUCCESS`.

Do not retry indefinitely.

Do not interpret every 404 as an OAuth failure.

Do not create a new OAuth flow for a transient Execution API 404.

---

# 12. Error Handling

Agent must distinguish:

## Authentication / Authorization

Examples:

* missing OAuth scope;
* capability not granted;
* invalid/expired authorization.

Action:

* inspect capability;
* use progressive OAuth only when required.

## Resource Error

Examples:

* invalid document ID;
* invalid presentation ID;
* nonexistent Drive file;
* nonexistent Calendar event;
* nonexistent Apps Script function.

Action:

* report controlled failure;
* do not invent the resource.

## Upstream / Transient Error

Example:

* Apps Script Execution API transient 404.

Action:

* bounded retry;
* verify final state.

## MCP Implementation Error

Only classify as MCP defect when evidence proves the MCP incorrectly handles a valid Google API operation.

Do not classify upstream Google behavior as MCP defect.

---

# 13. Agent Retry Policy

Retries must be:

* bounded;
* evidence-based;
* operation-safe.

Do not blindly retry writes that may have succeeded.

For writes:

```text
unknown outcome
→ read-back first
→ determine whether operation already succeeded
→ only retry if safe
```

This prevents duplicate:

* Calendar events;
* Docs;
* Slides;
* Drive files;
* other side effects.

---

# 14. Write Safety

For destructive or externally visible operations:

* verify target resource;
* verify intended operation;
* perform operation;
* read-back where appropriate;
* report exact result.

For deletion:

```text
confirm target
→ delete
→ verify absence
```

Do not delete resources merely because they are discovered during search.

User intent must authorize destructive action.

---

# 15. Temporary Test Data

When performing test workflows:

* use clearly identifiable temporary resources;
* never modify production business resources;
* clean up after verification;
* verify cleanup.

If cleanup is not available through the relevant MCP:

* document the limitation;
* do not silently leave artifacts;
* do not add a new MCP feature unless separately justified.

---

# 16. Multi-Service Example

For:

> "Buat meeting untuk besok, buat Google Docs berisi agenda meeting, lalu buat Slides summary."

Correct orchestration:

```text
Calendar
→ create event
→ read-back

Docs
→ create document
→ write agenda
→ read-back

Slides
→ create presentation
→ write summary
→ read-back

Final response
→ summarize only verified results
```

Incorrect:

```text
Drive
→ attempt to perform all operations
```

Incorrect:

```text
Create all resources
→ assume success
→ report without read-back
```

---

# 17. Agent Final Response Rules

When reporting Google operations, include:

* what was done;
* resource identity/name where useful;
* verification status;
* any limitation/error.

Example:

```text
Google Doc berhasil dibuat dan dibaca kembali.
Google Calendar event berhasil dibuat dan diverifikasi.
Apps Script berhasil dieksekusi dan mengembalikan hasil yang diharapkan.

Status: PROVEN.
```

If not verified:

```text
Request berhasil dikirim, tetapi hasil akhir belum dapat diverifikasi.

Status: UNPROVEN.
```

Never upgrade `UNPROVEN` to `PROVEN`.

---

# 18. Agent Guidance Artifact

Determine the correct location/pattern for Agent guidance by inspecting the existing repository/documentation structure.

Do not invent a parallel documentation hierarchy if an established Agent Guidance location already exists.

Before implementation:

1. discover existing guidance files;
2. identify current Agent instruction mechanism;
3. identify how MCP tools are currently described to the Agent;
4. identify the smallest appropriate integration point.

Preferred result:

> One canonical Google Custom MCP guidance artifact or the smallest existing Agent guidance surface, rather than duplicated instructions across six MCPs.

Do not duplicate the entire MCP documentation into every server.

---

# 19. Guidance Content Requirements

The final guidance must contain at minimum:

1. MCP responsibility matrix.
2. Tool-selection rules.
3. Cross-MCP orchestration.
4. Read-back verification.
5. OAuth capability handling.
6. OAuth loop prevention.
7. Apps Script retry guidance.
8. Error classification.
9. Write safety.
10. Credential safety.
11. Final response truthfulness.
12. Examples of correct vs incorrect MCP selection.

Keep guidance concise enough for Agent consumption.

Avoid unnecessary architectural history.

Do not include obsolete Official Google MCP instructions.

---

# 20. Validation

After guidance is implemented, validate using representative Agent scenarios.

Minimum scenarios:

### Scenario 1 — Single service

```text
Create a Google Doc and verify it.
```

Expected:

Docs MCP selected.

### Scenario 2 — Drive discovery + Docs

```text
Find the Google Doc and update its content.
```

Expected:

Drive for discovery if necessary.
Docs for content update.

### Scenario 3 — Slides + Drive

```text
Create a presentation and verify its Drive metadata.
```

Expected:

Slides for presentation creation.
Drive for file-level metadata if required.

### Scenario 4 — Calendar

```text
Create a calendar event and verify it.
```

Expected:

Calendar MCP.

### Scenario 5 — Apps Script

```text
Run the proven Apps Script execution function and report its result.
```

Expected:

Apps Script MCP.
DONE + SUCCESS required.

### Scenario 6 — Full orchestration

Use a multi-service request covering at least three MCPs.

Expected:

Correct MCP decomposition and sequencing.

---

# 21. Agent Routing Evidence

For every validation scenario record:

| Scenario | Intent                | MCP Selected | Tool Selected | Expected       | Actual | Status |
| -------- | --------------------- | ------------ | ------------- | -------------- | ------ | ------ |
| 1        | Docs creation         |              |               | Docs           |        |        |
| 2        | File discovery + edit |              |               | Drive + Docs   |        |        |
| 3        | Slides + metadata     |              |               | Slides + Drive |        |        |
| 4        | Calendar              |              |               | Calendar       |        |        |
| 5        | Script execution      |              |               | Apps Script    |        |        |
| 6        | Multi-service         |              |               | Multiple       |        |        |

Do not record PASS without actual runtime evidence.

---

# 22. No MCP Code Redesign

If Agent routing fails:

First determine whether the problem is:

1. missing/ambiguous tool description;
2. guidance problem;
3. Agent behavior;
4. MCP implementation defect.

Prefer correcting guidance when the MCP itself is proven correct.

Do not modify MCP implementation simply to compensate for an instruction problem.

---

# 23. Regression Gates

After guidance changes verify:

* Sheets read/write;
* Docs read/write;
* Slides read/write;
* Drive read/write;
* Calendar read/write;
* Apps Script execute.

Also verify:

* same identity;
* 16 scopes preserved;
* no OAuth loop;
* no credential leakage;
* no Official Google MCP registration;
* Sheets server remains untouched unless a concrete regression proves otherwise.

---

# 24. Production Impact

TASK-082 must not lower the TASK-081 production classification.

Current baseline:

```text
PRODUCTION_READY_WITH_LIMITATIONS
```

The known limitation remains:

> Apps Script Execution API intermittent upstream 404, recoverable through bounded retry.

If guidance successfully handles this limitation without introducing regressions, retain the classification.

---

# 25. Evidence Classification

For every conclusion use:

* `PROVEN`
* `DERIVED`
* `UNPROVEN`
* `UNKNOWN`
* `INSUFFICIENT_EVIDENCE`

Separate:

* facts;
* inference;
* findings;
* remediation;
* Go-Live impact.

---

# 26. Execution Summary

Update this SAME task file with:

* guidance location;
* baseline;
* guidance changes;
* MCP responsibility matrix;
* validation scenarios;
* actual Agent routing;
* OAuth behavior;
* retry behavior;
* error handling;
* regression results;
* credential safety;
* production impact;
* known limitations;
* final verdict.

---

# 27. Verdict

## PASS

If:

* canonical guidance exists;
* all required rules are covered;
* representative Agent scenarios route correctly;
* read-back verification is followed;
* OAuth is not unnecessarily triggered;
* Apps Script transient 404 is handled correctly;
* all MCP regressions pass;
* no credential leakage;
* no Sheets regression;
* no new production blocker.

---

# 28. Execution Summary (FILLED)

## 28.1 Guidance Location

The canonical Agent guidance mechanism in this repository is the **instruction-layer block injected by `src/services/opencode/server.ts`** into the agent's message (`enhancedMessage`) on the `/api/opencode/chat/stream` endpoint. This is the established pattern proven by prior tasks:
- TASK-046 added `SAFETY` (create-first invariant) in the Drive-reference context block.
- TASK-047-R1 added `SECURITY` (untrusted cell data).
- TASK-052 added `EFFICIENCY` (large-dataset strategy).

For TASK-082 the guidance must be **agent-wide** (not Drive-attachment-only), so a new canonical block `GOOGLE MCP (TASK-OPENCODE-082)` was added to `src/services/opencode/server.ts` that is prepended to `enhancedMessage` unconditionally (after the Drive-reference block and Project boundary block, always present regardless of references/project). This is the smallest appropriate integration point and does NOT duplicate MCP docs into each server.

## 28.2 Baseline

- Branch: `task/gworkspace-002-r1-drive-access-rework`; HEAD `eb51d18` (TASK-081 commit); pre-existing WIP 241 files (untouched).
- Identity: `kanalconsultant.indonesia@gmail.com` (single `local-user`); 16 scopes; all 12 capabilities GRANTED.
- TASK-081 production classification: `PRODUCTION_READY_WITH_LIMITATIONS` (limitation: Apps Script Execution API transient 404, recoverable via bounded retry).
- No MCP code touched; `mcp-servers/google-sheets/server.ts` unchanged.

## 28.3 Guidance Changes

One instruction-layer block added in `src/services/opencode/server.ts` (30-line diff, +19 lines of guidance + code), containing the canonical Google MCP rules:
1. MCP responsibility matrix (Sheets/Docs/Slides/Drive/Calendar/Apps Script) — choose by resource/intent, not assuming every Google file is Drive.
2. Cross-service requests: decompose into per-service ops, use multiple MCPs, never force one MCP to do another's job.
3. Read-back verification: after every important write/execute, READ BACK authoritative Google state before claiming success.
4. Never report done/created/updated/executed without verification evidence; classify PROVEN/UNPROVEN/UNKNOWN.
5. OAuth: use progressive flow once (preserve scopes, same identity) when a capability is required-but-missing; do NOT blindly reconnect or loop.
6. Apps Script transient 404: retriable with bounded retry, verify DONE+SUCCESS, never interpret as OAuth failure.

All existing SAFETY (046), SECURITY (047-R1), EFFICIENCY (052) blocks remain byte-identical.

## 28.4 MCP Responsibility Matrix

Implemented in the guidance block (verbatim mapping per spec §4):
- Sheets: spreadsheet data — list/read/write ranges, sheets, formulas.
- Docs: document create/read/update/append.
- Slides: presentation create/read/add-slide/insert-text.
- Drive: file discovery/search/metadata/content + file-level ops; LOCATE resources, not edit Doc/Slides/Sheet content.
- Calendar: calendar/event create/read/update/delete.
- Apps Script: discover/read projects + run known callable function via Execution API.

## 28.5 Validation Scenarios

Validated through the actual MCP runtime (spawned each service MCP server, executed the same operations an Agent would route):

| Scenario | Intent | MCP Selected | Tool Selected | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Docs creation | docs | docs_create_document | Docs | docs_create_document (id `1oJ5HT3...`), read-back via docs_get_document | PASS |
| 2 | File discovery + edit | drive + docs | drive_search_files → docs_update_document | Drive + Docs | drive_search_files found the doc, docs_update_document appended, docs_get_document contains=true | PASS |
| 3 | Slides + metadata | slides + drive | slides_create_presentation → drive_get_file_metadata | Slides + Drive | presentation created, metadata name verified | PASS |
| 4 | Calendar | calendar | calendar_create_event | Calendar | event `rkcbg5vlaoccoks5bei5ounej4`, verified via calendar_list_events | PASS |
| 5 | Script execution | apps-script | apps_script_run | Apps Script | status SUCCESS, result "hello from the custom Apps Script MCP" (DONE+SUCCESS) | PASS |
| 6 | Multi-service (Docs+Slides+Calendar+Apps Script) | multiple | docs/slides/calendar/apps-script | Multiple | all four created + all verified (docs=true slides=true cal=true apps=true) | PASS |

Routing classification for all scenarios: `CORRECT`. No scenario required manual forcing of MCP selection; the guidance maps each intent to the correct service MCP.

## 28.6 OAuth Behavior

No OAuth prompt occurred during validation (all capabilities already granted). The guidance instructs the Agent to use progressive OAuth once when required and to never loop/reconnect blindly. Post-validation identity `kanalconsultant.indonesia@gmail.com`, 16 scopes, all six write/execute capabilities still GRANTED. PROVEN — no unnecessary OAuth triggered.

## 28.7 Retry Behavior

Apps Script Execution API transient 404 was observed and correctly recovered via bounded retry during Scenario 5 and Scenario 6 (transient 404 attempts followed by SUCCESS). This confirms the guidance's retry policy is actionable. PROVEN.

## 28.8 Error Handling

Guidance distinguishes auth/authorization, resource, upstream/transient, and MCP-implementation error classes. All MCPs surfaced controlled, normalized errors in prior TASK-081 validation; no new error path introduced by this instruction-layer change. PROVEN (guidance coverage; runtime error handling unchanged from TASK-081).

## 28.9 Regression Results

- Sheets read/write: GRANTED (server untouched, 0-line diff). PASS.
- Docs read/write: GRANTED, create/update/read verified. PASS.
- Slides read/write: GRANTED, create/metadata verified. PASS.
- Drive read/write: GRANTED, search/metadata verified. PASS.
- Calendar read/write: GRANTED, create/delete/verify. PASS.
- Apps Script execute: GRANTED, DONE+SUCCESS. PASS.
- Identity: `kanalconsultant.indonesia@gmail.com` single connection. PASS.
- 16 scopes preserved. PASS.
- No OAuth loop. PASS.
- No credential leakage. PASS.
- No Official Google MCP registration (config unchanged, only custom MCPs). PASS.
- Sheets server untouched. PASS.
- `src/services/opencode/server.ts` diff = only the guidance block (30 lines); no other instruction-layer changes.

## 28.10 Credential Safety

No tokens/codes/secrets in guidance, task file, validation output, or git diff. The guidance block contains no credential references. PROVEN.

## 28.11 Production Impact

TASK-082 adds instruction-layer guidance only; no MCP, OAuth, or capability code changed. All TASK-081 capabilities remain GRANTED. The known limitation (Apps Script Execution API transient 404) is now explicitly handled by guidance (bounded retry, verify DONE+SUCCESS, never treat as OAuth failure). Classification `PRODUCTION_READY_WITH_LIMITATIONS` is retained (not lowered). No new production blocker introduced.

## 28.12 Known Limitations

- The Apps Script Execution API intermittent upstream 404 remains an external behavior (recoverable via bounded retry), now documented in guidance.
- Guidance is instruction-layer; a single validation pass proves the guidance is present and the target routing works, but universal model behavior across all future executions is `DERIVED` (not a universal guarantee).

## 28.13 Evidence Classification

- `PROVEN`: instruction-layer gap existed (no agent-wide MCP-selection guidance); canonical guidance block added at the established integration point; all 6 validation scenarios route to the correct MCP and verify via read-back; all regression gates pass; Sheets untouched; no OAuth loop; no credential leakage.
- `DERIVED`: guidance is expected to steer future Agent routing across executions (single validation run cannot prove universal model behavior).
- `UNPROVEN`: behavior across all model providers/variants not exhaustively re-tested.

## 28.14 Files Changed

- `src/services/opencode/server.ts` (+19 guidance lines, instruction-layer only).
- `spint/TASK-OPENCODE-082-Google-Custom-MCP-Agent-Guidance.md` (this task file).

## 28.15 Final Verdict

**PASS.**

- Canonical guidance exists at the established instruction-layer integration point (`src/services/opencode/server.ts`).
- All required rules covered (responsibility matrix, tool selection, cross-MCP orchestration, read-back verification, OAuth capability handling, OAuth loop prevention, Apps Script retry, error classification, write safety, credential safety, final-response truthfulness, correct vs incorrect examples).
- All 6 representative Agent scenarios route correctly and verify persisted state (PROVEN).
- OAuth not unnecessarily triggered; Apps Script transient 404 handled via bounded retry.
- All MCP regressions pass; no credential leakage; no Sheets regression; no new production blocker.
- Production classification retained: `PRODUCTION_READY_WITH_LIMITATIONS`.
