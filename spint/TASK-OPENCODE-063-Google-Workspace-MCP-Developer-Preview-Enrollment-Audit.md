# TASK-OPENCODE-063 — Google Workspace MCP Developer Preview Enrollment Audit

## Task Type

AUDIT-ONLY

## Objective

Determine whether the current Google Workspace MCP failure is caused by the Google Workspace Developer Preview Program enrollment/eligibility gate.

This task must NOT modify Alpha One application code, OpenCode configuration, OAuth client configuration, Google Cloud credentials, OAuth scopes, MCP configuration, or Sheets configuration.

The purpose is to prove or disprove the external Google prerequisite identified after TASK-OPENCODE-062.

---

# 1. Context

Previous audits established:

- TASK-OPENCODE-057:
  - Drive / Docs / Slides MCP endpoints reachable.
  - MCP `tools/list` works.
  - MCP `tools/call` fails with Google-side permission rejection.
  - Same Google identity/token can access the same proven resources through the corresponding REST APIs.
  - Calendar was separately blocked by missing/invalid MCP authorization state.

- TASK-OPENCODE-058:
  - OAuth scopes were accepted.
  - MCP-specific OAuth authorization was investigated.
  - Repeated OAuth authorization behavior was observed.

- TASK-OPENCODE-059:
  - Google identity is stored locally.
  - OAuth/MCP credentials are local to the user's machine.
  - KANAL VPS is NOT the credential backend.
  - Identity → per-MCP authorization mapping was incomplete.
  - Sheets remained protected.

- TASK-OPENCODE-060:
  - Fresh MCP authorization attempts still failed.
  - Google rejected MCP access despite apparently valid OAuth authorization.

- TASK-OPENCODE-061:
  - Loopback redirect was proven NOT to be the root cause.
  - OAuth code → token exchange succeeds.
  - Google token `aud` remains bound to the OAuth client.
  - REST APIs accept the same identity/token.
  - MCP rejects the token.
  - Calendar remained separately blocked.
  - Sheets remained protected.

- TASK-OPENCODE-062:
  - Existing OAuth client is correctly configured as a Web application.
  - Relevant OAuth scopes are configured.
  - MCP APIs are enabled.
  - Branding verification is NOT proven to be the cause.
  - API key absence is NOT the cause.
  - Redirect URI is NOT the cause.
  - File ownership/access is NOT the cause.
  - MCP endpoint is reachable and protocol-compatible.
  - `tools/list` succeeds.
  - `tools/call` returns authorization/permission failure.
  - Official Google documentation indicates Google Workspace MCP is part of the Google Workspace Developer Preview Program.
  - Current project enrollment status has NOT yet been proven.

Therefore this task focuses exclusively on the Developer Preview enrollment/eligibility layer.

---

# 2. Critical Product Boundary

Alpha One is an open-source/local-first SDK/application.

"Backend" in this project does NOT mean the KANAL VPS.

The user's local machine is the credential/runtime backend for Google OAuth and MCP authorization.

KANAL VPS only handles permitted product-level telemetry such as:

- download count;
- source/repository information;
- Google account email connected to OAuth, where explicitly required.

Google OAuth access tokens, refresh tokens, PKCE state, MCP authorization tokens, and local credential files MUST NOT be moved to or persisted on the KANAL VPS as part of this audit.

Do not redesign this architecture.

---

# 3. Protected Scope

## Google Sheets

STRICTLY PROTECTED.

Do NOT:

- modify Google Sheets MCP configuration;
- modify the local Google Sheets MCP server;
- invoke Google Sheets MCP tools;
- change Sheets OAuth scopes;
- change Sheets credentials;
- change Sheets source code;
- perform destructive or write operations against Sheets.

The existing Google Sheets integration is already working and must remain untouched.

---

# 4. Research Basis

Use official Google sources as the primary authority.

Required references to inspect:

1. Google Workspace MCP configuration documentation.
2. Google Workspace Developer Preview Program documentation.
3. Official Google Workspace MCP codelabs/setup documentation.
4. Official Google Cloud / Google Workspace MCP security documentation.
5. Official MCP-specific product documentation where relevant.

Do not treat third-party blogs, Reddit, Stack Overflow, GitHub issues, or AI-generated explanations as authoritative evidence.

Third-party material may only be used as secondary context after official documentation has been checked.

Record:

- exact official URL;
- relevant requirement;
- whether the requirement applies to:
  - Google account;
  - Google Workspace account;
  - Google Cloud project;
  - OAuth client;
  - MCP server;
  - organization;
  - user;
  - or some combination.

---

# 5. Phase 0 — Baseline

Capture and document:

- current Git branch;
- Git status;
- OpenCode version;
- current MCP registration;
- current MCP connectivity;
- current local MCP authorization state;
- current Google Cloud project ID;
- current OAuth client ID, redacted;
- currently enabled MCP APIs;
- current Google account identity, without exposing secrets.

Expected MCP servers:

- drive
- docs
- slides
- calendar

Google Sheets must be recorded as PROTECTED.

Do not modify anything.

---

# 6. Phase 1 — Official Developer Preview Requirement

Verify from official Google documentation:

1. Are Google Workspace MCP servers currently Developer Preview?
2. Is enrollment in the Google Workspace Developer Preview Program explicitly required?
3. Is the prerequisite:
   - project enrollment;
   - account enrollment;
   - Workspace domain enrollment;
   - or another eligibility mechanism?
4. Does enrollment apply to all Workspace MCP servers or only specific products?
5. Is there a distinction between:
   - being able to enable `drivemcp.googleapis.com`;
   - being able to obtain OAuth authorization;
   - being eligible to call the MCP server?
6. Is acceptance into the preview program required before MCP tool calls can succeed?
7. Does the official documentation describe an expected error when a non-enrolled project/account attempts MCP access?

Capture exact evidence.

---

# 7. Phase 2 — Determine Enrollment Mechanism

Determine exactly how Google currently handles Developer Preview enrollment.

Investigate whether enrollment is performed through:

- Google Workspace Developer Preview Program;
- Google Cloud Console;
- Google Workspace admin console;
- Google Cloud project registration;
- a Google form/application;
- API;
- gcloud;
- organization policy;
- or another Google-controlled mechanism.

Determine:

- who must enroll;
- what must be accepted;
- whether enrollment is tied to the Google account;
- whether enrollment is tied to the Google Cloud project;
- whether the project must be owned by the enrolling account;
- whether project ID `alpha-workspace-505404` can be verified as enrolled;
- whether the status is visible anywhere.

Do NOT submit an enrollment request automatically.

Do NOT change any configuration.

---

# 8. Phase 3 — Current Project Enrollment Status

Determine whether project:

`alpha-workspace-505404`

is currently enrolled/eligible.

Use read-only evidence only.

Possible evidence sources:

- Google Cloud Console;
- Google Workspace Developer Preview portal;
- official Google APIs;
- read-only CLI commands;
- project metadata;
- documented eligibility/status pages.

If the status cannot be queried programmatically, explicitly classify it as:

`UNKNOWN — NO READ-ONLY STATUS API/CONSOLE EVIDENCE`

Do not infer enrollment from:

- API enabled;
- OAuth client exists;
- OAuth consent works;
- token exists;
- MCP endpoint responds;
- `tools/list` works.

Those are separate states.

---

# 9. Phase 4 — Account Eligibility

Determine whether the Google account used for Alpha One:

`kanalconsultant.indonesia@gmail.com`

is eligible for Google Workspace MCP Developer Preview access.

Do NOT expose:

- OAuth access tokens;
- refresh tokens;
- client secrets;
- PKCE verifier;
- authorization codes.

Only record the minimum identity evidence needed to determine eligibility.

Determine whether:

- personal Google account;
- Google Workspace account;
- Workspace domain;
- Smart Features;
- admin approval;
- developer preview acceptance

affect MCP eligibility.

Do not assume that a Google account having Drive/Docs/Slides access automatically grants MCP access.

---

# 10. Phase 5 — Project vs Account vs OAuth Client Matrix

Produce a matrix:

| Requirement | Account | Workspace/domain | Cloud Project | OAuth Client | MCP Server | Status |
|---|---|---|---|---|---|---|
| Developer Preview enrollment | ? | ? | ? | ? | ? | PROVEN/UNKNOWN |
| MCP API enabled | — | — | YES/NO | — | YES/NO | ... |
| OAuth consent | YES/NO | — | YES/NO | YES/NO | — | ... |
| OAuth scopes | YES/NO | — | — | YES/NO | — | ... |
| MCP authorization | YES/NO | — | ? | YES/NO | YES/NO | ... |
| IAM requirement | — | ? | ? | — | ? | ... |

Do not collapse distinct authorization layers into one "Google connected" status.

---

# 11. Phase 6 — IAM / Security Prerequisite Audit

Investigate official Google documentation for any MCP-specific IAM/security prerequisite.

Specifically verify whether permissions such as:

- `mcp.tools.call`

or equivalent MCP-specific IAM permissions are actually required for this architecture.

Determine:

1. Which principal needs the permission.
2. Whether the permission is required for:
   - direct remote MCP client;
   - Gemini Enterprise;
   - Google Cloud-hosted agent;
   - local OpenCode;
   - ADK;
   - or all clients.
3. Whether this permission applies to Workspace MCP servers.
4. Whether absence of the permission can produce the observed `403` / `The caller does not have permission`.
5. Whether the current project has a relevant IAM policy that can be inspected read-only.

Do not grant or modify IAM permissions during this task.

---

# 12. Phase 7 — Error Semantics Comparison

Compare the observed failure:

`The caller does not have permission`

and/or:

`403`

against official Google documentation.

Determine whether this error is consistent with:

- Developer Preview enrollment missing;
- MCP authorization missing;
- OAuth scope missing;
- IAM permission missing;
- resource/file access missing;
- unsupported account;
- unsupported Workspace configuration;
- DLP/IRM policy;
- MCP server-side authorization;
- or another Google-side gate.

Do not classify an error solely from its text.

Use documented behavior plus the evidence from previous tasks.

---

# 13. Phase 8 — Drive-Specific Eligibility

Use the previously proven Drive resource as the test reference.

The same user/token already demonstrated:

- Drive REST API succeeds;
- the file is accessible to the Google account;
- MCP tool invocation is rejected.

Verify from official Google Drive MCP documentation whether Drive MCP imposes additional file eligibility requirements beyond ordinary Drive permissions.

Investigate, where documented:

- DLP;
- IRM;
- file type;
- file location;
- ownership;
- sharing;
- permission;
- organizational policy.

Do not modify the test file.

Do not create a new file.

Do not alter sharing.

The goal is to determine whether file eligibility could explain the MCP rejection.

---

# 14. Phase 9 — Docs / Slides Eligibility

Verify whether Docs MCP and Slides MCP have additional eligibility rules that could explain:

- REST succeeds;
- MCP tool call fails.

Use the same previously proven resources where possible.

Do not modify documents or presentations.

Do not create new resources.

---

# 15. Phase 10 — Calendar Eligibility

Calendar is a separate authorization path.

Verify:

- whether Calendar MCP requires Developer Preview enrollment;
- whether Calendar MCP requires standard Calendar API;
- whether Calendar MCP has a separate authorization prerequisite;
- whether Calendar requires a different OAuth scope;
- whether Calendar requires an MCP-specific OAuth authorization;
- whether the current "Authentication successful!" result from OpenCode actually resulted in a persisted MCP token.

Do not write calendar events.

Only perform read-only inspection if an already-valid token exists.

---

# 16. Phase 11 — Reconcile TASK-062

Explicitly compare this task's findings against TASK-OPENCODE-062.

For each previous conclusion:

- CONFIRMED;
- REFINED;
- DISPROVEN;
- UNKNOWN.

Pay special attention to:

1. Developer Preview Program as the suspected external prerequisite.
2. Branding verification.
3. OAuth client type.
4. Redirect URI.
5. API enablement.
6. OAuth scopes.
7. File ownership.
8. MCP-specific authorization.
9. IAM.

Do not silently rewrite the previous conclusion.

---

# 17. Phase 12 — Root Cause Classification

Classify the result using exactly one primary classification:

### PROVEN_ROOT_CAUSE

Evidence directly proves missing Developer Preview enrollment/eligibility is responsible for MCP rejection.

### PROVEN_NOT_ROOT_CAUSE

Evidence proves Developer Preview enrollment is not responsible.

### PROVEN_EXTERNAL_PREREQUISITE

Developer Preview enrollment is explicitly required, but current status cannot be established or the remaining blocker is another external Google prerequisite.

### UNKNOWN

Documentation confirms the feature is preview, but evidence is insufficient to connect enrollment status to the observed failure.

### INSUFFICIENT_EVIDENCE

Required evidence could not be obtained.

Do not label an unverified condition as the root cause.

---

# 18. Phase 13 — Go-Live Impact

Determine:

- whether Google Workspace MCP can currently be declared production-ready;
- whether Drive MCP is usable;
- whether Docs MCP is usable;
- whether Slides MCP is usable;
- whether Calendar MCP is usable;
- whether the blocker is local Alpha One code;
- whether the blocker is Google Cloud configuration;
- whether the blocker requires Google Preview enrollment.

Use:

- READY
- CONDITIONAL
- BLOCKED
- BACKLOG

Do not declare READY unless at least one real read-only MCP data retrieval succeeds.

---

# 19. Required Evidence Matrix

Produce:

| Service | API Enabled | OAuth | Preview Eligible | MCP Reachable | tools/list | tools/call | Data Returned | Root Cause | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| Drive | | | | | | | | | |
| Docs | | | | | | | | | |
| Slides | | | | | | | | | |
| Calendar | | | | | | | | | |
| Sheets | PROTECTED | PROTECTED | PROTECTED | PROTECTED | PROTECTED | DO NOT CALL | DO NOT CALL | PROTECTED | PROTECTED |

Every claim must be supported by concrete evidence.

---

# 20. Evidence Classification

For every important finding use:

- PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

Never convert UNKNOWN into a bug.

Never convert a Google-side error into an Alpha One defect without evidence.

---

# 21. Forbidden Actions

Do NOT:

- modify application source code;
- modify OpenCode source;
- modify `opencode.jsonc`;
- modify OAuth client configuration;
- create a new OAuth client;
- add/remove redirect URIs;
- change OAuth scopes;
- change Google Cloud IAM;
- enroll the project automatically;
- submit a Developer Preview application;
- change Branding;
- verify Branding;
- create API keys;
- modify MCP servers;
- modify Google Sheets;
- perform write operations against Google Workspace;
- create/delete/modify Drive files;
- create/delete/modify Docs;
- create/delete/modify Slides;
- create/update/delete Calendar events;
- upload credentials to KANAL VPS;
- commit unrelated files.

This is an audit-only task.

---

# 22. Git Safety

Before execution:

- capture `git status`;
- capture current branch.

After execution:

- verify only the intended task file changed;
- do not stage unrelated changes;
- do not modify unrelated files.

Only the task file may be committed.

---

# 23. Execution Summary

At the end of this task, write the complete execution summary into this same task file.

The summary MUST include:

1. Executive verdict.
2. Official Google documentation reviewed.
3. Developer Preview requirement.
4. Current project enrollment evidence.
5. Current account eligibility evidence.
6. IAM/security findings.
7. Drive eligibility findings.
8. Docs eligibility findings.
9. Slides eligibility findings.
10. Calendar findings.
11. TASK-062 reconciliation.
12. Evidence matrix.
13. Root-cause classification.
14. Go-Live impact.
15. Minimal next action.

Do not create a separate report.

---

# 24. Final Verdict Format

Use exactly:

FINAL VERDICT: <CLASSIFICATION>

ROOT CAUSE:
<one concise statement>

PROVEN:
- ...

DERIVED:
- ...

UNKNOWN:
- ...

NOT ROOT CAUSE:
- ...

GO-LIVE IMPACT:
- ...

MINIMAL NEXT ACTION:
- ...

SHEETS:
PROTECTED — NO CALL / NO CHANGE

---

# 25. Commit

Only after:

- audit is complete;
- execution summary has been written into this task file;
- evidence has been reviewed;
- verdict has been assigned;
- working tree has been checked.

Then:

1. `git diff -- <task-file>`
2. `git status`
3. `git add <task-file>`
4. `git commit -m "audit: TASK-OPENCODE-063 workspace mcp preview enrollment"`
5. `git status`

Commit ONLY:

`TASK-OPENCODE-063-Google-Workspace-MCP-Developer-Preview-Enrollment-Audit.md`

Do not commit any other file.

---

# 26. Execution Summary

Audit executed 2026-08-20. AUDIT-ONLY — no source/config/OAuth/Cloud/Sheets/MCP mutation. No secrets exposed (metadata/fingerprints only). No enrollment submitted, no IAM changed, no file/document/presentation/calendar modified.

## 1. Executive verdict

The Google Workspace Developer Preview Program enrollment/eligibility layer is a REAL and DOCUMENTED external prerequisite for all official Google Workspace MCP servers (Drive, Docs, Slides, Calendar, Gmail, Sheets, Chat, People, Universal). Official Google codelab and Developer Preview Program documentation prove that:

1. The Google Cloud project must be **enrolled in the Google Workspace Developer Preview Program** (application form → Google verifies the Workspace account → project registration → email confirmation).
2. A **Google Workspace account** (not merely a personal Google account) is required to enroll/use these servers.
3. MCP tool calls cannot succeed without this enrollment; the MCP servers are explicitly labeled "Available as part of the Google Workspace Developer Preview Program, which grants early access to certain features."

The current project's enrollment status CANNOT be verified read-only (no public status API, no console access in this environment, gcloud not installed), and the connected identity (`kanalconsultant.indonesia@gmail.com`) is a personal Google account domain, not a Google Workspace account domain. Therefore the Developer Preview enrollment is a PROVEN external prerequisite whose satisfaction status is UNKNOWN, and the observed MCP rejection is consistent with a non-enrolled/unsupported project or account.

`FINAL VERDICT: PROVEN_EXTERNAL_PREREQUISITE`

## 2. Official Google documentation reviewed

1. https://developers.google.com/workspace/preview (Google Workspace Developer Preview Program) — PROVEN: features in preview include all 8 Workspace MCP servers + Universal Search MCP; joining requires application form, Program Terms agreement, Google Workspace account + Google Cloud project information; Google verifies the Workspace account, adds email to a Google Group, then **registers the Google Cloud project** and sends a final email confirmation. Registration is per Google Workspace account and per Google Cloud project.
2. https://developers.google.com/workspace/guides/configure-mcp-servers (Configure the Google Workspace MCP servers) — PROVEN: carries the Developer Preview badge; requires a Google Cloud project; enable base Workspace APIs + MCP services; OAuth consent (Internal/External + test users); Web application client; scopes; per-server authentication. No IAM role mentioned for Workspace MCP servers.
3. https://developers.google.com/workspace/guides/configure-mcp-security — PROVEN: Developer Preview badge; security focus is Model Armor / prompt-injection screening; no enrollment/error semantics.
4. https://developers.google.com/workspace/drive/api/guides/configure-mcp-server (Drive MCP) — PROVEN: Developer Preview badge; enable drive.googleapis.com + drivemcp.googleapis.com; consent; Web client; drive scopes.
5. https://developers.google.com/workspace/drive/api/guides/drive-mcp-server-file-eligibility (Drive MCP file eligibility) — PROVEN: DLP/IRM/CAA/CSE/spam/trash eligibility rules; ineligible single-file access returns: "Item metadata cannot be retrieved for item <id> because it is ineligible to be used in generative AI contexts." — a DISTINCT error from the observed "The caller does not have permission".
6. https://developers.google.com/workspace/docs/api/guides/configure-mcp-server (Docs MCP) — PROVEN: Developer Preview badge; docs + docsmcp enable; consent; Web client; docs scopes.
7. https://developers.google.com/workspace/slides/api/guides/configure-mcp-server (Slides MCP) — PROVEN: Developer Preview badge; slides + slidesmcp enable; consent; Web client; slides scopes.
8. https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server (Calendar MCP) — PROVEN: Developer Preview badge; calendar-json + calendarmcp enable; consent; Web client; calendar scopes (calendar.calendarlist.readonly, calendar.events.freebusy, calendar.events.readonly).
9. https://docs.cloud.google.com/mcp/access-control (Access control with IAM) — PROVEN for Google/Google Cloud MCP servers: requires `roles/mcp.toolUser` (Tool User) with permission `mcp.tools.call` on the Google Cloud project. Documented under the Google Cloud MCP doc set, NOT referenced by the Workspace MCP configure docs.
10. https://docs.cloud.google.com/mcp/set-up-authentication-mcp-servers — PROVEN: required roles include `roles/mcp.toolUser` (`mcp.tools.call`) to make MCP tool calls; OAuth client ID+secret supported; Desktop for local apps, Web for internet apps; no DCR support.
11. https://docs.cloud.google.com/mcp/known-issues — reviewed; no entry for Workspace MCP "caller does not have permission".
12. https://codelabs.developers.google.com/google-workspace-mcp-antigravity (Google Workspace MCP servers in Antigravity codelab) — DECISIVE: "What you'll need: A Google Cloud project **enrolled in the Google Workspace Developer Preview Program**; **A Google Workspace account**; Antigravity…" and "Access to Google Workspace MCP servers is part of the Public Developer Preview Program. If you haven't already, please sign up and ensure your account is accepted into the program at https://developers.google.com/workspace/preview."

## 3. Developer Preview requirement (Phase 1)

- Are Workspace MCP servers Developer Preview? **YES — PROVEN.** Every official configure page (Drive/Docs/Slides/Calendar) and the Workspace configure-mcp-servers page carries the badge: "Available as part of the Google Workspace Developer Preview Program, which grants early access to certain features."
- Is enrollment explicitly required? **YES — PROVEN.** Official codelab lists "A Google Cloud project enrolled in the Google Workspace Developer Preview Program" and "A Google Workspace account" as prerequisites, and instructs signing up and ensuring account acceptance into the program before MCP access works.
- What is the prerequisite mechanism? **Project enrollment + account enrollment — PROVEN.** The preview program registers the Google Cloud project AND the Google Workspace account (adds email to a program Google Group; confirms project registration by email).
- Does it apply to all Workspace MCP servers? **YES — PROVEN.** All 8 product MCP servers + Universal Search MCP are listed in the program's "Features in Developer Preview"; the program grants access to all program features (FAQ: "the program provides access to all the features available in the program").
- Distinction between enabling APIs, OAuth authorization, and eligibility to call: **DOCUMENTED — PROVEN.** Enabling APIs/MCP services and OAuth consent are config steps any project owner can do; program enrollment (project registration + account acceptance) is the eligibility gate for calling the MCP servers. These are separate states.
- Is acceptance required before tool calls succeed? **YES — PROVEN (documented).** Codelab states sign up + acceptance into the program is needed for access to the MCP servers; the observed failure (REST works, MCP rejects) is consistent with the documented enrollment gate.
- Does official documentation describe an expected error for non-enrolled projects? **NOT DOCUMENTED — UNKNOWN.** No official page states the exact error text for a non-enrolled project. The observed "The caller does not have permission" is the standard Google permission-denied message and is consistent with the enrollment gate but is not verbatim documented.

## 4. Current project enrollment evidence (Phase 2 + Phase 3)

- Enrollment mechanism: Google Workspace Developer Preview Program application form (docs.google.com form referenced from developers.google.com/workspace/preview); no API/gcloud/console enrollment command exists; Google performs verification and project registration manually; confirmation is via email + Google Group membership.
- Who must enroll: the Google Workspace account holder; the Google Cloud project is registered by Google after verification.
- Is project ownership required? The FAQ ("Why do I have to provide a Google Cloud project number?" → "We provide you access to the program API features through your Google Cloud project(s)") and the application flow (provide Google Cloud project info) imply the enrolling account uses/owns the project; not explicitly stated as a hard ownership rule — UNKNOWN.
- Can project `alpha-workspace-505404` be verified as enrolled from here? **NO — UNKNOWN.** There is NO read-only status API/CLI/console evidence available in this environment:
  - gcloud: NOT installed (confirmed); no `~/.config/gcloud` present.
  - No public endpoint exposes preview-program enrollment status.
  - Console access was not available for this audit.
- Classified as: `UNKNOWN — NO READ-ONLY STATUS API/CONSOLE EVIDENCE`.
- Not inferred from: API enabled, OAuth client exists, consent works, token exists, MCP endpoint responds, tools/list works — these were explicitly NOT treated as enrollment proof.

## 5. Current account eligibility evidence (Phase 4)

- Connected identity: `kanalconsultant.indonesia@gmail.com` (from connections.json; no tokens/secrets exposed).
- Official requirement: a **Google Workspace account** is required (codelab "What you'll need"; program FAQ/service terms reference Google Workspace account verification).
- The `@gmail.com` domain indicates a personal Google account, not a Google Workspace account with a managed domain. Whether the user has a separate Google Workspace account that could be used/enrolled is UNKNOWN.
- Smart Features/admin approval/domain settings: not verifiable without admin console access — UNKNOWN.
- Conclusion: account eligibility for the Developer Preview Program is UNKNOWN, and the current connected identity is not demonstrably a Google Workspace account (DERIVED from the email domain). Having Drive/Docs/Slides access via REST does NOT grant MCP access (PROVEN by the same-token REST-vs-MCP comparison).

## 6. IAM / security prerequisite findings (Phase 6)

- `roles/mcp.toolUser` / `mcp.tools.call` is PROVEN as a requirement for **Google/Google Cloud MCP servers** (docs.cloud.google.com/mcp/access-control and set-up-authentication-mcp-servers).
- For the **Google Workspace MCP servers specifically**, the official Workspace configure docs (developers.google.com/workspace/guides/configure-mcp-servers and per-product pages) do NOT reference IAM roles at all; the documented authorization path is OAuth 2.0 with a Web application client. Whether the `mcp.toolUser` gate also applies to Workspace MCP servers is **UNKNOWN** (documented only under the Google Cloud MCP doc set).
- No local read-only IAM inspection is possible (gcloud absent; no console). IAM policy for project alpha-workspace-505404: **UNKNOWN**.
- Absence of `mcp.tools.call` can produce `403`/permission-denied for Google Cloud MCP servers (documented); for Workspace MCP servers this is not documented. The observed error is CONSISTENT with both the enrollment gate and (if applicable) the IAM gate.

## 7. Drive eligibility findings (Phase 8)

- Official Drive MCP file eligibility page: eligibility is governed by service availability, ACL (reader+), IRM/DLP IRM controls, CAA (canDownload), CSE, spam/malware, trash, and per-item checks for folders/shortcuts.
- The documented error for an ineligible single item is: "Item metadata cannot be retrieved for item <id> because it is ineligible to be used in generative AI contexts." — DISTINCT from the observed "The caller does not have permission".
- Prior evidence (TASK-057/061/062, reused): same user + same Drive PDF (1Bdo_1VkN385LFq_9_bbSId5Nlp5aIGRN) succeeds over REST (200, full content) and is rejected by Drive MCP. REST success proves the user has reader+ ACL; the item is not IRM/DLP/CAA/CSE-restricted in a way that blocks REST.
- Since the observed MCP rejection message is not the documented ineligible-item message, file-level Drive eligibility is NOT the cause of the observed failure (DERIVED). The test file was not modified.

## 8. Docs / Slides eligibility findings (Phase 9)

- Docs MCP and Slides MCP configure docs define no additional per-document/per-presentation eligibility rules beyond Drive-level rules (they inherit Drive access controls) and the OAuth scopes listed in section 2.
- Prior evidence (TASK-057, reused): same user + same Docs doc (1fa2RwKMK8T2sk2f7BFePiaA5ydUKXbMrcPc4pAzBl6M) and Slides presentation (1AyilWDzGtrbIMwglX3_brNjiApZM5AXTNgvbpnjQ5w0) succeed over REST and are rejected by MCP.
- No documented Docs/Slides-specific eligibility rule explains a same-user same-resource REST-success/MCP-failure split. NOT ROOT CAUSE for the observed failure. Documents/presentations were not modified.

## 9. Calendar findings (Phase 10)

- Calendar MCP requires Developer Preview enrollment like all other Workspace MCP servers (PROVEN via preview program feature list + Calendar configure page badge).
- Requires the standard Google Calendar API (calendar-json.googleapis.com) + Calendar MCP API (calendarmcp.googleapis.com) (PROVEN).
- Requires OAuth scopes: calendar.calendarlist.readonly, calendar.events.freebusy, calendar.events.readonly (PROVEN). These are NOT present in the current app connection scopes (connections.json scopes: drive.readonly, userinfo.email, presentations.readonly, spreadsheets, docs.readonly, script.projects, userinfo.profile, openid) — no calendar scope, and no calendar MCP token is persisted (mcp-auth.json hasToken=False for calendar). UNKNOWN/blocked.
- The prior "Authentication successful!" result did NOT persist a calendar MCP token (mcp-auth.json calendar hasToken=False). No read-only calendar call was attempted (no valid token; per task rules). No calendar events created/updated/deleted.

## 10. TASK-062 reconciliation (Phase 11)

| TASK-062 conclusion | Status in this task |
|---|---|
| Developer Preview Program as suspected external prerequisite | CONFIRMED — PROVEN as an explicit documented prerequisite (codelab + preview program + configure pages) |
| Branding verification not the cause | CONFIRMED — no official link to MCP permission denial; enrollment is the documented gate |
| OAuth client type (Web application) correct | CONFIRMED — all official configure pages require Web application |
| Redirect URI not the cause | CONFIRMED — no documented relationship to MCP enrollment; loopback functionally accepted (prior) |
| API enablement satisfied | CONFIRMED (prior evidence) — required but NOT sufficient for MCP eligibility |
| OAuth scopes satisfied | REFINED — Drive/Docs/Slides read scopes present and accepted; Calendar scopes absent (separate blocked path) |
| File ownership/access not the cause | CONFIRMED — REST 200 for same user+resource; Drive ineligible-item error differs from observed error |
| MCP-specific authorization | REFINED — no OAuth-client-level MCP authorization exists in Workspace docs; the authorization gate is project/account program enrollment (proven) + possible IAM mcp.toolUser (UNKNOWN applicability) |
| IAM | UNKNOWN — required for Google Cloud MCP; applicability to Workspace MCP not documented; cannot be inspected locally |

## 11. Evidence matrix (Phase 19)

| Service | API Enabled | OAuth | Preview Eligible | MCP Reachable | tools/list | tools/call | Data Returned | Root Cause | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| Drive | YES (prior) | Scopes present (prior) | UNKNOWN (not verifiable) | YES | YES (8 tools) | REJECTED (prior, permission) | NO | External prerequisite | BLOCKED |
| Docs | YES (prior) | Scopes present (prior) | UNKNOWN | YES | YES (2 tools) | REJECTED (prior, permission) | NO | External prerequisite | BLOCKED |
| Slides | YES (prior) | Scopes present (prior) | UNKNOWN | YES | YES (2 tools) | REJECTED (prior, permission) | NO | External prerequisite | BLOCKED |
| Calendar | YES (prior) | NO (no calendar scope/token) | UNKNOWN | YES | YES (9 tools) | NOT CALLED (no token) | NO | External prerequisite + scope/token | BLOCKED |
| Sheets | PROTECTED | PROTECTED | PROTECTED | PROTECTED | PROTECTED | DO NOT CALL | DO NOT CALL | PROTECTED | PROTECTED |

## 12. Root-cause classification (Phase 12 + Phase 7)

`FINAL VERDICT: PROVEN_EXTERNAL_PREREQUISITE`

ROOT CAUSE: The Google Workspace MCP servers (Drive, Docs, Slides, Calendar) are Developer Preview features whose use requires the Google Cloud project AND the Google account to be enrolled/accepted in the Google Workspace Developer Preview Program. This enrollment is an explicitly documented prerequisite (official codelab + Developer Preview Program), and the observed "The caller does not have permission" from the MCP gateway, despite a valid REST token and correct OAuth client configuration, is consistent with the documented enrollment gate. Whether project `alpha-workspace-505404` / the connected account are actually enrolled could not be verified read-only → enrollment status UNKNOWN.

## 13. Go-Live impact (Phase 13)

- Google Workspace MCP (Drive/Docs/Slides/Calendar): **BLOCKED** — cannot be declared production-ready; no real read-only MCP data retrieval has succeeded (required for READY).
- Drive MCP: BLOCKED. Docs MCP: BLOCKED. Slides MCP: BLOCKED. Calendar MCP: BLOCKED (additionally no scope/token).
- Blocker is NOT local Alpha One code (PROVEN — OAuth flow works, token valid for REST, MCP discovery works).
- Blocker is Google Cloud/Google-side: Developer Preview Program enrollment/eligibility (PROVEN as documented prerequisite) — requires action by the account holder in the Developer Preview Program and/or Google Workspace account; possibly an IAM `mcp.toolUser` grant on the Google Cloud project (UNKNOWN applicability).
- Google Sheets (local custom MCP): UNAFFECTED — PROTECTED, not called.

## 14. Minimal next action

1. Confirm/obtain acceptance into the Google Workspace Developer Preview Program at https://developers.google.com/workspace/preview using a Google Workspace account (the application requires Google Workspace account + Google Cloud project info; personal @gmail.com accounts are not documented as eligible).
2. Confirm Google Cloud project `alpha-workspace-505404` registration in the program (final email confirmation is the acceptance signal; verify the connected account is a Google Workspace account).
3. Where applicable, grant `roles/mcp.toolUser` (`mcp.tools.call`) on the project to the principal (console/IAM) — verify via console whether the Workspace MCP servers enforce it.
4. After enrollment is confirmed, mint a fresh MCP OAuth token per server and re-run read-only Drive/Docs/Slides MCP calls against the same proven resources.
5. For Calendar: add calendar scopes and authorize before read-only testing.
6. Do NOT modify OAuth client, redirect URIs, scopes, branding, or create API keys (no evidence these are needed).

## 15. Changes made

- Application source: NONE.
- OpenCode config (`opencode.jsonc`): NONE.
- OAuth client / redirect URIs / scopes / branding: NONE.
- Google Cloud project / IAM / APIs / MCP services: NONE.
- Google Workspace files/docs/presentations/calendar events: NONE.
- Sheets: PROTECTED — NO CALL / NO CHANGE.
- Committed: ONLY this task file.

SHEETS:
PROTECTED — NO CALL / NO CHANGE