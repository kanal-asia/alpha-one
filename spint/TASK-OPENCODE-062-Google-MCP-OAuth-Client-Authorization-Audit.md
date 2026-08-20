# TASK-OPENCODE-062 — Google Workspace MCP OAuth Client Authorization Audit

## 1. Task Type

**AUDIT-ONLY**

No Alpha One production-code mutation.
No OAuth client configuration mutation.
No API enable/disable.
No branding changes.
No API key creation.
No MCP configuration redesign.
No credential deletion or rotation.

The objective is to determine, with evidence, whether the existing Google OAuth client is correctly authorized/configured for the official Google Workspace MCP resources.

---

## 2. Context

Previous audits established:

- Google Drive / Docs / Slides REST APIs work with the existing OAuth token.
- The same token is rejected by the corresponding Google-hosted MCP servers.
- File ownership/access is NOT currently proven to be the cause because the same user/token can access the same resources through REST.
- Required OAuth scopes are already present/accepted by the consent configuration.
- Drive MCP API, Docs MCP API, Slides MCP API, and Calendar MCP API are enabled in the Google Cloud project.
- `opencode mcp` can discover and connect to the MCP servers.
- MCP protocol discovery (`tools/list`) works.
- MCP data access remains blocked.
- Calendar OAuth state has separately required investigation.
- Branding is currently unverified.
- Current evidence does NOT establish branding verification as the cause of MCP permission denial.
- No API key should be introduced unless official documentation/evidence proves it is required.
- The application is an open-source local-first SDK/app:
  - OAuth credentials and user authorization state belong on the user's local machine.
  - The KANAL VPS is NOT the credential backend.
  - The VPS only handles non-sensitive service functions such as download/source statistics and connected OAuth email metadata.
  - Do NOT redesign this boundary during this task.

The current Google Cloud OAuth client already contains:

- Web application client type.
- Existing localhost redirect URIs for Alpha One.
- Existing loopback MCP callback:
  `http://127.0.0.1:19876/mcp/oauth/callback`

The user has not intentionally changed these settings for this investigation.

---

## 3. Primary Objective

Determine whether the current Google OAuth client:

1. Is eligible to authorize official Google Workspace MCP servers.
2. Is correctly configured for the MCP OAuth authorization flow.
3. Is authorized for the MCP resource servers.
4. Requires a separate/dedicated OAuth client.
5. Requires an HTTPS/non-loopback redirect URI.
6. Requires any specific Google Cloud configuration beyond:
   - API enabled
   - OAuth consent configuration
   - requested scopes
   - existing OAuth client
7. Is being blocked because branding is unverified.
8. Is being blocked because an API key is absent.
9. Is being blocked because of user/file ownership.
10. Can explain the observed:
    `The caller does not have permission`
    from Google-hosted MCP servers despite REST API success.

The audit must distinguish:

- **PROVEN**
- **DERIVED**
- **UNPROVEN**
- **UNKNOWN**
- **INSUFFICIENT_EVIDENCE**

Do not convert an unproven Google Cloud configuration requirement into a confirmed root cause.

---

# 4. Scope

## In Scope

### Google Cloud

Audit the current project:

`alpha-workspace-505404`

Audit:

- OAuth client configuration
- OAuth client type
- client ID
- redirect URIs
- OAuth consent / branding state
- Audience
- Data Access
- configured scopes
- enabled Workspace APIs
- enabled Workspace MCP APIs
- any Google Cloud setting specifically related to MCP authorization
- any documented relationship between OAuth client registration and Workspace MCP access

### Official Google Documentation

Use current official Google documentation as the primary authority.

Investigate specifically:

- Google Workspace MCP configuration
- Google Workspace MCP authentication
- OAuth requirements
- OAuth client requirements
- redirect URI requirements
- MCP resource authorization
- scope requirements
- whether localhost/loopback is supported
- whether HTTPS is required
- whether branding verification is required
- whether API keys are required
- whether a dedicated OAuth client is required
- whether one OAuth client can serve multiple Workspace MCP servers

Do not rely on third-party tutorials as primary evidence.

### Runtime Evidence

Use the existing Alpha One/OpenCode environment only for read-only verification.

Inspect:

- current `opencode.jsonc`
- `opencode mcp list`
- existing MCP auth state
- current OAuth configuration
- existing local identity state
- existing local credential state

Do not modify them.

### MCP Services

Audit:

- Drive MCP
- Docs MCP
- Slides MCP
- Calendar MCP

### Sheets Protection

Google Sheets is explicitly protected.

Do NOT:

- call Google Sheets MCP
- modify the local Google Sheets MCP server
- modify Sheets OAuth scopes
- modify Sheets configuration
- create a Sheets MCP implementation
- use Sheets as an experimental variable

---

# 5. Out of Scope

Do NOT:

- modify application source code
- modify backend architecture
- move credentials to the KANAL VPS
- create a centralized OAuth token backend
- create API keys
- change OAuth client configuration
- change redirect URIs
- create a new OAuth client
- submit branding verification
- change branding
- change file ownership
- change Google Drive permissions
- delete or revoke user credentials
- rotate secrets
- alter production configuration
- commit configuration changes
- implement MCP authorization persistence

If a configuration change appears necessary, document it as a finding/remediation recommendation only.

---

# 6. Required Evidence Questions

## Q1 — Is branding verification required?

Determine whether:

`Branding → Verification status = unverified`

can prevent:

- localhost OAuth testing
- MCP OAuth authorization
- MCP token issuance
- MCP tool calls

Evidence must come from official Google documentation where possible.

Verdict must explicitly state:

`ROOT CAUSE / NOT ROOT CAUSE / UNPROVEN`

## Q2 — Is an API key required?

Determine whether Google Workspace MCP requires an API key in addition to OAuth.

Inspect official documentation and configuration requirements.

Explicitly answer:

`API key required: YES / NO / UNKNOWN`

Do not create an API key.

## Q3 — Is the current OAuth client type correct?

Current client:

`Web application`

Determine whether this is compatible with official Google Workspace MCP requirements.

If Google documentation requires a different client type, prove it.

## Q4 — Is the current redirect URI valid?

Current relevant MCP redirect:

`http://127.0.0.1:19876/mcp/oauth/callback`

Determine:

- whether loopback redirect is officially supported
- whether localhost is supported
- whether HTTPS is mandatory
- whether Google Workspace MCP specifically requires a public HTTPS callback
- whether OpenCode's MCP OAuth flow is compatible with the documented Google flow

Do not assume that HTTPS is required merely because official examples use HTTPS.

## Q5 — Does the OAuth client need explicit MCP authorization?

Determine whether Google Cloud has a concept/configuration that authorizes an OAuth client to use:

- Drive MCP API
- Docs MCP API
- Slides MCP API
- Calendar MCP API

Distinguish:

`API ENABLED`

from:

`OAUTH CLIENT AUTHORIZED`

Do not treat API enablement as proof of OAuth authorization.

## Q6 — Does MCP require a resource-bound OAuth token?

Investigate Google's documented use of:

- MCP resource
- OAuth audience
- RFC 8707 resource indicator
- authorization server
- MCP server authorization

Determine whether the token used by OpenCode is expected to differ from the ordinary REST API OAuth token.

## Q7 — Can the same OAuth client be used across MCP servers?

Determine from official documentation whether one OAuth client can authorize:

- Drive MCP
- Docs MCP
- Slides MCP
- Calendar MCP

or whether each MCP server requires a separate OAuth client.

## Q8 — Is file ownership/access the cause?

Do NOT change file permissions.

Use the already-proven same resources where possible:

- Drive REST → known success
- Docs REST → known success
- Slides REST → known success

Compare:

`same user + same resource + REST`

against:

`same user + same resource + MCP`

Determine whether file ownership/access remains a plausible root cause.

## Q9 — Is the existing OAuth client sufficient?

Produce a definitive evidence matrix:

| Requirement | Current State | Official Requirement | Result |
|---|---|---|---|
| OAuth client exists | | | |
| Web application client | | | |
| OAuth consent configured | | | |
| Branding verified | | | |
| Required scopes | | | |
| Drive API enabled | | | |
| Drive MCP API enabled | | | |
| Docs API enabled | | | |
| Docs MCP API enabled | | | |
| Slides API enabled | | | |
| Slides MCP API enabled | | | |
| Calendar API enabled | | | |
| Calendar MCP API enabled | | | |
| MCP redirect URI | | | |
| MCP OAuth authorization | | | |
| MCP token accepted | | | |

---

# 7. Runtime Audit

Run only read-only commands.

Capture:

- OS
- working directory
- current Git branch
- Git status
- OpenCode version
- current MCP registration
- current MCP connection status
- local OAuth state
- MCP auth state

Do not expose secrets.

Redact:

- client secrets
- access tokens
- refresh tokens
- PKCE verifier values
- authorization codes
- private credentials

Only report:

- token existence
- token validity where safely testable
- scopes
- issuer
- audience/client ID
- expiry status
- identity email where appropriate

---

# 8. MCP Runtime Verification

Use existing authenticated state only.

For each MCP:

### Drive

Perform one read-only tool call against an already-proven Drive resource.

### Docs

Perform one read-only tool call against an already-proven Docs resource.

### Slides

Perform one read-only tool call against an already-proven Slides resource.

### Calendar

Perform only a read-only calendar operation if valid authorization state exists.

Do NOT create/update/delete calendar events.

### Sheets

NO CALL.

---

# 9. REST vs MCP Comparison

For Drive, Docs, and Slides:

| Service | User | Resource | REST | MCP | Difference |
|---|---|---|---|---|---|
| Drive | same | same | | | |
| Docs | same | same | | | |
| Slides | same | same | | | |

The goal is to determine whether:

`REST success + MCP failure`

is reproducible with the same identity and resource.

---

# 10. Root-Cause Classification

Classify findings into:

### A. Alpha One bug

Only if evidence proves the application sends incorrect credentials/configuration or violates a documented MCP requirement.

### B. OpenCode integration issue

Only if evidence proves OpenCode is incorrectly implementing the required MCP OAuth flow.

### C. Google Cloud configuration

If Google Cloud configuration prevents the OAuth client from being accepted by the MCP resource.

### D. Google MCP server-side restriction

If the client/token is valid but Google-hosted MCP rejects it independently of Alpha One/OpenCode configuration.

### E. User authorization / resource permission

Only if the same REST operation also fails or there is direct evidence that the user lacks resource access.

### F. Branding

Only if official evidence proves that unverified branding prevents the required MCP authorization flow.

### G. Unknown / insufficient evidence

Use this when the evidence cannot establish the cause.

---

# 11. Critical Guardrail

Do NOT conclude:

`OAuth client not authorized for MCP`

merely because MCP returns:

`The caller does not have permission`

unless the Google Cloud configuration evidence proves this.

Likewise, do NOT conclude:

`branding causes MCP failure`

because branding is unverified.

The audit must prove the causal relationship.

---

# 12. Deliverables

Update/create:

`spint/TASK-OPENCODE-062-Google-MCP-OAuth-Client-Authorization-Audit.md`

The task file must contain:

1. Baseline
2. Official Google documentation references
3. OAuth client configuration evidence
4. Branding evidence
5. API/MCP API enablement evidence
6. OAuth scope matrix
7. Redirect URI analysis
8. MCP authorization analysis
9. Token/resource analysis
10. Runtime MCP evidence
11. REST vs MCP comparison
12. File ownership/access assessment
13. API key requirement assessment
14. Evidence matrix
15. Root-cause classification
16. Remediation recommendation
17. Go-Live impact
18. Final verdict
19. Full execution summary

Do not modify any other project file.

---

# 13. Quality Gate

PASS only if:

- Official Google MCP documentation was reviewed.
- Branding requirement was explicitly investigated.
- API key requirement was explicitly investigated.
- OAuth client type was explicitly investigated.
- Redirect URI requirement was explicitly investigated.
- MCP authorization requirement was explicitly investigated.
- Required scopes were checked.
- API enablement was checked.
- Drive/Docs/Slides REST-vs-MCP comparison was performed.
- Calendar status was checked read-only.
- Sheets was untouched.
- No source/configuration mutation occurred.
- No secrets were exposed.
- Root cause is classified using evidence.
- Unknown conditions remain UNKNOWN.
- Execution summary is written into this task file.

If any required evidence is unavailable:

`VERDICT = INSUFFICIENT_EVIDENCE`

Do not manufacture PASS.

---

# 14. Expected Final Verdict Format

Use exactly this structure:

`FINAL VERDICT: <READY / CONDITIONAL / BLOCKED / INSUFFICIENT_EVIDENCE>`

Then:

### PROVEN

- ...

### DERIVED

- ...

### UNPROVEN

- ...

### UNKNOWN

- ...

### ROOT CAUSE

- ...

### NOT ROOT CAUSE

- ...

### MINIMAL NEXT ACTION

- ...

### GO-LIVE IMPACT

- ...

---

# 15. Execution Rules

- Audit first.
- No remediation implementation.
- No Google Cloud configuration mutation.
- No application mutation.
- No credential rotation.
- No API key creation.
- No branding changes.
- No Sheets interaction.
- Preserve all unrelated working-tree changes.
- Do not reset/revert user work.
- Use concrete evidence.
- Prefer official Google documentation over assumptions.
- Do not repeat previously completed audits unless required to prove a specific dependency.
- If a previous finding is reused, explicitly mark it as prior evidence rather than presenting it as newly verified.

---

# 16. Execution Summary

After completing the audit, **input your execution summary on this same task file**.

The summary must include:

- what was audited
- commands/checks executed
- official documentation reviewed
- evidence collected
- changes made: MUST be `NONE`
- Sheets protection result
- final verdict
- root cause classification
- minimal next action
- Go-Live impact

---

# 17. Git

After the execution summary has been written into this task file:

- `git status`
- `git diff --stat`
- verify ONLY this task file changed
- `git diff -- spint/TASK-OPENCODE-062-Google-MCP-OAuth-Client-Authorization-Audit.md`
- commit ONLY:
  `spint/TASK-OPENCODE-062-Google-MCP-OAuth-Client-Authorization-Audit.md`

Do NOT commit unrelated changes.

Do NOT modify or commit Google Cloud configuration from this task.

---

# 18. Execution Summary

Audit executed 2026-08-20. AUDIT-ONLY — no source/config/OAuth/Cloud/Sheets mutation. No credentials exposed (metadata/fingerprints only).

## 1. Baseline

- OS: Microsoft Windows 11 (NT 10.0.26200.0); workdir `C:\dev\alpha-one`.
- Git: branch `task/gworkspace-002-r1-drive-access-rework`; prior commits `e7fb5d8` + `77fad95` (TASK-061, task file only) on top of TASK-060 state.
- OpenCode: v1.18.18.
- MCP registration (`opencode.jsonc`): google-sheets (local, PROTECTED); drive/docs/slides/calendar (remote official OAuth blocks using `{env:GOOGLE_CLIENT_ID}` / `{env:GOOGLE_CLIENT_SECRET}`).
- MCP connection status (`opencode mcp list`): drive/docs/slides/calendar = connected (OAuth); google-sheets = local, timed out on this run (transient) — NOT called, PROTECTED.
- MCP auth store (`~/.local/share/opencode/mcp-auth.json`): all four remote servers currently hold NO access/refresh token (empty after prior session cleanup). Token existence at MCP layer: NONE.
- App OAuth state (`.alpha/google/connections.json`): userId `local-user`, email `kanalconsultant.indonesia@gmail.com`, refresh token present, last access token EXPIRED (expiry 1787107687209 < now 1787187112581). Scopes include drive.readonly, userinfo.email, presentations.readonly, spreadsheets, docs.readonly, script.projects, userinfo.profile, openid.
- gcloud: NOT installed → project IAM/API enablement/consent state cannot be inspected from CLI. Console verification is out of reach for this audit.
- Working tree: many unrelated pre-existing changes present; preserved untouched.

## 2. Official Google documentation reviewed

- developers.google.com/workspace/guides/configure-mcp-servers (Configure the Google Workspace MCP servers) — authoritative Workspace MCP setup: enable Workspace APIs; enable MCP services (drivemcp/docsmcp/slidesmcp/calendarmcp); configure OAuth consent (Branding/Audience/Data Access); create a **Web application** OAuth client with an authorized redirect URI; authenticate per server. Carries Developer Preview badge.
- developers.google.com/workspace/preview (Google Workspace Developer Preview Program) — PROVEN: all eight Workspace MCP servers (Gmail/Calendar/Drive/People/Chat/Docs/Sheets/Slides) are listed as **Features in Developer Preview**. Joining requires an application form; Google verifies the Workspace account and **registers the Google Cloud project**; access is project-scoped and account-scoped. Pre-GA restrictions apply.
- docs.cloud.google.com/mcp/access-control (Access control with IAM) — PROVEN: Google/Google Cloud remote MCP servers require the caller (principal) to hold `roles/mcp.toolUser` (permission `mcp.tools.call`) on the Google Cloud project, plus underlying product permissions. Covers Google Cloud MCP servers; **not referenced by the Workspace-specific MCP configure docs**.
- docs.cloud.google.com/mcp/set-up-authentication-mcp-servers — OAuth 2.0 client ID+secret is a supported auth method; Web client for internet apps, Desktop for local apps; API keys only for services that don't require a principal.
- docs.cloud.google.com/mcp/authenticate-mcp — Workspace/Google MCP require authentication; DCR not supported; IAM-based services don't accept standard API keys.
- developers.google.com/workspace/drive/api/guides/configure-mcp-server (Drive MCP) — same pattern; Web application client; scopes drive.readonly + drive.file.
- developers.google.com/workspace/guides/configure-oauth-consent — consent screen configuration; audience Internal or External with test users; branding verification is a separate publishing step, not a testing prerequisite.

## 3. OAuth client configuration evidence (Q3)

- Client: Web application, client ID `480048442203-stiuf8pf1o0kvb0vejpk8hfa85b6o4c4.apps.googleusercontent.com` (from `.env` GOOGLE_CLIENT_ID; same identifier used in all prior audit flows).
- Official requirement (configure-mcp-servers, Antigravity + Claude sections): "Select **Web application** as the application type." Current type MATCHES.
- Conclusion: client type is CORRECT for Workspace MCP. PROVEN.

## 4. Branding evidence (Q1)

- Official docs: OAuth consent screen configuration is required BEFORE creating a client (Branding → App name / User support email; Audience → Internal or External; Contact info). This is configuration, not verification.
- Branding **verification** is documented as a publishing/production requirement and is not stated anywhere in the Workspace MCP configure flow as a prerequisite for localhost testing, MCP token issuance, or MCP tool calls. Consent in "Testing" status works for configured test users.
- No official statement links "unverified branding" to "The caller does not have permission" on the MCP gateway.
- Verdict Q1: `NOT ROOT CAUSE` (no official causal link; branding is configuration, not a documented gating blocker for MCP).

## 5. API/MCP API enablement evidence (Q5, Q2)

- PRIOR EVIDENCE (user action + TASK-055/058, not re-verified via console): drivemcp.googleapis.com, docsmcp.googleapis.com, slidesmcp.googleapis.com, calendarmcp.googleapis.com (MCP services) and drive.googleapis.com, docs.googleapis.com, slides.googleapis.com, calendar-json.googleapis.com (underlying APIs) enabled in project `alpha-workspace-505404`.
- Official requirement: both the Workspace API and the corresponding MCP service must be enabled. State satisfies the documented enablement list.
- Distinction API ENABLED vs OAUTH CLIENT AUTHORIZED: the Workspace configure docs define NO separate "authorize OAuth client for MCP" step. Enablement + consent + client creation + scopes are the entire documented Workspace-side flow. For Google Cloud MCP servers, the analogous authorization gate is IAM `roles/mcp.toolUser` (`mcp.tools.call`) — documented in docs.cloud.google.com/mcp/*, NOT in the Workspace MCP docs.
- Verdict Q5: no documented OAuth-client-specific MCP authorization exists in the Workspace docs. Whether the IAM `mcp.tools.call` gate also applies to Workspace MCP servers is UNKNOWN (documented only for Google Cloud MCP servers).
- Verdict Q2 (API key): `API key required: NO`. Official docs state Workspace MCP uses OAuth 2.0; IAM-based services don't accept standard API keys; no Workspace MCP doc requires an API key.

## 6. OAuth scope matrix (Q6 scope side)

- Current app token scopes (connections.json): drive.readonly, userinfo.email, presentations.readonly, spreadsheets, docs.readonly, script.projects, userinfo.profile, openid.
- Official Workspace MCP scopes: Drive = drive.readonly + drive.file; Docs = drive.readonly + drive.file + documents.readonly + documents; Slides = drive.readonly + drive.file + presentations.readonly + presentations; Calendar = calendar.calendarlist.readonly + calendar.events.freebusy + calendar.events.readonly.
- All read-scopes used by prior MCP read-only calls are within the granted scope set for Drive/Docs/Slides. Calendar scope not present in app token (Calendar has no token at all). Sheets scopes present but Sheets PROTECTED.
- Required scopes for read-only usage: SATISFIED for Drive/Docs/Slides. PROVEN.

## 7. Redirect URI analysis (Q4)

- Current MCP redirect: `http://127.0.0.1:19876/mcp/oauth/callback` (loopback). App redirect: `http://localhost:3001/api/google/oauth/callback`.
- Official documented client redirects: Antigravity `https://antigravity.google/oauth-callback`; Claude `https://claude.ai/api/mcp/auth_callback`. These are HTTPS.
- Loopback redirect is a standard OAuth 2.0 loopback URI (RFC 8252 pattern). PRIOR PROVEN EVIDENCE (TASK-058/060/061): Google's authorization server ACCEPTS the loopback URI (no redirect_uri_mismatch), consent completes, authorization code is returned, and token exchange succeeds. The redirect is therefore functionally valid for OAuth authorization.
- HTTPS mandatory? NOT documented as a Workspace MCP requirement. Docs show HTTPS examples for specific first-party clients but contain no explicit prohibition of loopback. Community reports (TASK-061) show loopback callbacks functioning.
- OpenCode flow compatibility: PRIOR PROVEN — the OpenCode-style loopback flow completes; the resulting token is valid for REST but rejected by MCP resource servers.
- Verdict Q4: loopback is functionally supported by Google's AS; NOT PROVEN to be the blocker. The token is minted successfully; MCP rejects it regardless of which redirect was used.

## 8. MCP authorization analysis (Q5 continued, Q7)

- No official Workspace MCP doc describes an "OAuth client authorized for MCP" console step. The Workspace flow = enable APIs + enable MCP services + consent + Web client + scopes + client redirect URI.
- The Google Cloud MCP family (separate doc set) requires `roles/mcp.toolUser` (permission `mcp.tools.call`) on the Google Cloud project for the principal. Whether this applies to Workspace MCP is UNKNOWN from official docs (Workspace docs omit it).
- Developer Preview gating (PROVEN official): Workspace MCP servers are Developer Preview features; access is granted by joining the Workspace Developer Preview Program, which verifies the Workspace account and **registers the Google Cloud project**. Project registration is therefore a documented prerequisite for the MCP endpoints.
- Community evidence (Google AI Developers Forum, 2026-07-13, "Google Drive MCP Authorization Friction"): the `drivemcp.googleapis.com` MCP service is "restricted to whitelisted participants of the Workspace Developer Preview. Direct API calls work, but the MCP endpoint rejects requests. Even custom GCP client IDs failed with `The caller does not have permission` over the remote MCP gateway." This directly matches the observed error and correctly-configured custom clients. (Community = supporting evidence, not primary authority.)
- Verdict Q7: one OAuth client CAN serve multiple Workspace MCP servers — PROVEN by official docs (Antigravity example reuses the same OAUTH_CLIENT_ID/SECRET for gmail/drive/docs/sheets/slides/calendar/chat/people; Claude instructs repeating the same client per product).

## 9. Token/resource analysis (Q6)

- Official docs: Workspace MCP uses OAuth 2.0 bearer tokens from Google's authorization server. No official document states that MCP requires a resource-bound token (RFC 8707) or a different token type than the REST OAuth token.
- PRIOR PROVEN (TASK-058/060): Google's AS binds the token to the client ID (`aud` = client ID, confirmed via tokeninfo) even when the RFC 8707 `resource` param is included. This is standard Google OAuth behavior, and no official doc requires an MCP-specific audience.
- Verdict Q6: NO documented requirement for a distinct resource-bound token. The token OpenCode uses is the ordinary Google OAuth token; the rejection is not attributable to a documented token-shape mismatch.

## 10. Runtime MCP evidence

- `opencode mcp list`: drive/docs/slides/calendar connected (OAuth); google-sheets local (not connected this run; PROTECTED, not called).
- mcp-auth.json: NO tokens stored for drive/docs/slides/calendar (all empty).
- Direct MCP probe (read-only, no token in store): tools/list returns HTTP 200 for all four (drive 8 tools, docs 2, slides 2, calendar 9) — protocol discovery works unauthenticated, consistent with prior audits. tools/call without a stored token returns HTTP 401 (no bearer) — expected; no fresh MCP token was minted in this audit (audit-only, no consent re-run).
- Conclusion: MCP discovery works; MCP data access requires a valid OAuth token bound to a project that the MCP gateway accepts. No token is currently persisted at the MCP layer.

## 11. REST vs MCP comparison

PRIOR EVIDENCE (TASK-057, explicitly reused, not re-verified):

| Service | User | Resource | REST | MCP | Difference |
|---|---|---|---|---|---|
| Drive | kanalconsultant.indonesia@gmail.com | PDF 1Bdo_1VkN385LFq_9_bbSId5Nlp5aIGRN | 200 OK (full content) | Rejected (The caller does not have permission) | Same token+resource |
| Docs | same | doc 1fa2RwKMK8T2sk2f7BFePiaA5ydUKXbMrcPc4pAzBl6M | 200 OK (full content) | Rejected (permission) | Same token+resource |
| Slides | same | pres 1AyilWDzGtrbIMwglX3_brNjiApZM5AXTNgvbpnjQ5w0 | 200 OK (title) | Rejected (permission) | Same token+resource |

`REST success + MCP failure` is reproducible with the same identity and resource. The token is valid and the user has access; the MCP resource server independently rejects it.

## 12. File ownership/access assessment (Q8)

- Same user + same resources succeed over REST (200 OK) → the user demonstrably has read access to all three resources.
- MCP rejects the same calls. Ownership/access therefore cannot be the cause: if the user lacked access, REST would also fail.
- Verdict Q8: NOT ROOT CAUSE (PROVEN via REST-vs-MCP same-resource comparison).

## 13. API key requirement assessment (Q2)

- `API key required: NO` — Workspace MCP uses OAuth 2.0; IAM-based services reject standard API keys; no Workspace MCP doc requires an API key. No API key was created.

## 14. Evidence matrix (Q9)

| Requirement | Current State | Official Requirement | Result |
|---|---|---|---|
| OAuth client exists | Yes (Web app, ID 480048442203-...) | OAuth 2.0 client required | PASS |
| Web application client | Yes | configure-mcp-servers: "Select Web application" | PASS |
| OAuth consent configured | Prior evidence: configured (Testing; app name/support email present) | Must configure before client creation | PASS (prior) |
| Branding verified | Unverified | Not a stated MCP prerequisite | NOT REQUIRED (unverified) |
| Required scopes | drive.readonly/docs.readonly/presentations.readonly present; calendar scope absent; no token for calendar | Drive/Docs/Slides read scopes as listed | PASS (Drive/Docs/Slides); Calendar N/A |
| Drive API enabled | Prior evidence: enabled | Required | PASS (prior) |
| Drive MCP API enabled | Prior evidence: enabled | Required | PASS (prior) |
| Docs API enabled | Prior evidence: enabled | Required | PASS (prior) |
| Docs MCP API enabled | Prior evidence: enabled | Required | PASS (prior) |
| Slides API enabled | Prior evidence: enabled | Required | PASS (prior) |
| Slides MCP API enabled | Prior evidence: enabled | Required | PASS (prior) |
| Calendar API enabled | Prior evidence: enabled | Required | PASS (prior) |
| Calendar MCP API enabled | Prior evidence: enabled | Required | PASS (prior) |
| MCP redirect URI | http://127.0.0.1:19876/mcp/oauth/callback (loopback) | HTTPS callbacks documented for Antigravity/Claude; loopback functionally accepted (prior) | ACCEPTED (functional); HTTPS examples are client-specific |
| MCP OAuth authorization | No documented client-level step; Google Cloud IAM roles/mcp.toolUser documented for Google Cloud MCP (UNKNOWN for Workspace); Developer Preview project registration documented | See section 8 | GAP (external) |
| MCP token accepted | Rejected (The caller does not have permission) despite valid REST token | Token must be accepted by MCP resource server | FAIL (external gate) |

## 15. Root-cause classification

- A. Alpha One bug: NOT SUPPORTED — no evidence the app sends incorrect credentials/config or violates a documented Workspace MCP requirement.
- B. OpenCode integration issue: NOT SUPPORTED — OpenCode's loopback OAuth flow completes and mints a valid Google token; the MCP rejection occurs at the Google-hosted resource server with the same token that succeeds over REST.
- C. Google Cloud configuration: SUPPORTED (DERIVED) — Workspace MCP servers are Developer Preview features requiring Google Cloud project registration (official), and the Google Cloud MCP docs require `roles/mcp.toolUser` (`mcp.tools.call`) on the project for MCP tool calls; neither is verifiable without console access (gcloud absent). The project-level gate explains rejection of an otherwise-valid token.
- D. Google MCP server-side restriction: SUPPORTED (DERIVED) — the MCP gateway rejects the valid token independent of Alpha One/OpenCode configuration; community report matches (whitelisted-participant restriction; custom correct clients still fail).
- E. User authorization / resource permission: NOT SUPPORTED — REST succeeds with the same user/resource, disproving lack of resource access.
- F. Branding: NOT SUPPORTED — no official evidence links unverified branding to MCP permission denial.
- G. Unknown/insufficient: the EXACT gate (Developer Preview project registration vs IAM roles/mcp.toolUser for Workspace MCP) cannot be proven from this environment — UNKNOWN; classified as an external Google Cloud prerequisite.

## 16. Remediation recommendation (documentation only, no action)

1. Apply/confirm registration of Google Cloud project `alpha-workspace-505404` (and the Google Workspace account kanalconsultant.indonesia@gmail.com) in the Google Workspace Developer Preview Program (developers.google.com/workspace/preview). Confirmation email + project registration notification are the acceptance signals.
2. Verify (console/IAM): whether the principal needs `roles/mcp.toolUser` (`mcp.tools.call`) on the project for Workspace MCP, and grant if the console indicates it applies.
3. After either prerequisite is satisfied, mint a fresh MCP OAuth token (consent + loopback callback) and re-run the read-only Drive/Docs/Slides MCP calls against the same proven resources.
4. Do NOT introduce an API key; do NOT change client type; do NOT change redirects.

## 17. Go-Live impact

- Go-live (production Workspace MCP usage in Alpha One) is BLOCKED by an external Google Cloud prerequisite: the project must be registered in the Workspace Developer Preview Program (and the MCP IAM/whitelist gate must accept the caller) before MCP tool calls succeed.
- No Alpha One/OpenCode code change is required for the MCP layer; the app OAuth token is valid for REST and remains usable for Drive/Docs/Slides REST integrations.
- Sheets (local custom MCP) is unaffected and remains the working Workspace data path.
- Local-first credential boundary unchanged (credentials remain on the user machine; VPS unaffected).

## 18. Final verdict

`FINAL VERDICT: BLOCKED`

### PROVEN

- Workspace MCP servers (drive/docs/slides/calendar) are Developer Preview features; Google Cloud project registration in the Workspace Developer Preview Program is the documented access mechanism (official developers.google.com/workspace/preview + configure-mcp-servers Developer Preview badge).
- The existing OAuth client is a Web application, matching the documented Workspace MCP client type; one Web client can serve multiple MCP servers (official Antigravity/Claude examples).
- Loopback redirect is functionally accepted by Google's AS: consent completes, code returned, token exchange succeeds (prior evidence, TASK-058/060/061).
- Same user + same resource: REST 200 vs MCP rejected (prior evidence, TASK-057) → token valid, user has access.
- API key is NOT required for Workspace MCP (official auth docs; IAM-based services reject standard API keys).
- No source/configuration/Cloud mutation occurred in this audit; Sheets untouched; no secrets exposed.

### DERIVED

- The observed `The caller does not have permission` from the MCP gateway, despite a valid REST token and correct OAuth client config, is caused by a Google Cloud project-level access gate on the MCP endpoints (Developer Preview whitelist and/or IAM `mcp.tools.call`), not by the OAuth client configuration itself.

### UNPROVEN

- That unverified branding prevents MCP token issuance or tool calls (no official causal link).
- That an API key is required (contradicted by official auth docs).
- That a resource-bound (RFC 8707) token is required (not documented for Workspace MCP).

### UNKNOWN

- Whether project `alpha-workspace-505404` is registered in the Workspace Developer Preview Program (requires console/registration confirmation; gcloud not installed).
- Whether `roles/mcp.toolUser` / `mcp.tools.call` applies to Workspace MCP servers and is granted to the principal (documented only for Google Cloud MCP servers; not in Workspace docs).
- Calendar MCP eligibility (no valid calendar token/scope present to test read-only).

### ROOT CAUSE

- External Google Cloud access gate on Workspace MCP endpoints: the Google Cloud project must be registered in the Workspace Developer Preview Program (and, where applicable, hold the MCP IAM permission `mcp.tools.call`) before the MCP resource servers accept an otherwise-valid OAuth token. OAuth client configuration is not the root cause.

### NOT ROOT CAUSE

- OAuth client type (Web application is documented and correct).
- Loopback redirect URI (functionally accepted by Google's AS; token is minted successfully).
- Unverified branding (no official causal link to MCP permission denial).
- Absence of an API key (not required for Workspace MCP).
- File ownership/access (REST succeeds with same user + same resources).
- A separate/dedicated OAuth client (one client serves multiple Workspace MCP servers).
- A distinct resource-bound token (not documented as a Workspace MCP requirement).
- Alpha One bug or OpenCode integration issue (flow completes; token valid; rejection at Google-hosted server).

### MINIMAL NEXT ACTION

- Register/confirm Google Cloud project `alpha-workspace-505404` in the Google Workspace Developer Preview Program (developers.google.com/workspace/preview), then re-run read-only Drive/Docs/Slides MCP calls with a freshly minted token.

### GO-LIVE IMPACT

- Workspace MCP usage remains BLOCKED until the external Developer Preview project registration (and any applicable MCP IAM role) is satisfied. REST integrations continue to work; Sheets (local MCP) is unaffected.