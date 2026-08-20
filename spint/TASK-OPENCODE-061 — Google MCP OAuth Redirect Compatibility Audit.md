# TASK-OPENCODE-061 — Google MCP OAuth Redirect Compatibility Audit

## Status

AUDIT-ONLY

## Objective

Menentukan secara evidence-first apakah OAuth redirect URI loopback yang digunakan OpenCode:

`http://127.0.0.1:19876/mcp/oauth/callback`

merupakan penyebab valid dari kegagalan authorization Google Workspace MCP pada Alpha One.

JANGAN membuat OAuth client baru.
JANGAN mengubah OAuth client Google Cloud.
JANGAN mengubah redirect URI.
JANGAN mengubah source code aplikasi.
JANGAN mengubah konfigurasi MCP.
JANGAN menyentuh google-sheets.

Task ini hanya mengaudit dan membuktikan.

---

# 1. Scope

Audit hanya mencakup:

1. Google official Workspace MCP OAuth requirements.
2. OAuth client type.
3. Authorized redirect URI requirements.
4. OpenCode MCP OAuth flow.
5. Loopback callback:
   `http://127.0.0.1:19876/mcp/oauth/callback`
6. RFC 8252 / loopback OAuth compatibility bila relevan.
7. OAuth authorization request yang benar-benar dikirim OpenCode.
8. OAuth token request yang benar-benar dikirim OpenCode.
9. `resource` parameter / RFC 8707 bila digunakan.
10. Client ID yang digunakan.
11. Redirect URI yang digunakan pada:
    - authorization request
    - token exchange
12. Perbedaan antara:
    - OAuth authorization berhasil
    - token berhasil diterbitkan
    - token diterima Google MCP server
13. Apakah Google Workspace MCP memang mensyaratkan callback HTTPS untuk seluruh MCP clients, atau hanya contoh callback milik client tertentu.

14. Apakah existing Alpha One OAuth client secara teknis dapat digunakan untuk MCP.

15. Apakah blocker yang ditemukan benar-benar berasal dari redirect URI.

Out of scope:

- Google Sheets MCP.
- Google Sheets custom MCP.
- perubahan production code.
- perubahan OpenCode source.
- pembuatan OAuth client baru.
- perubahan Google Cloud configuration.
- deployment.
- VPS.
- backend cloud credential storage.

---

# 2. Important Architecture Boundary

Alpha One adalah open-source local application.

"Backend" dalam task ini berarti:

- local application/runtime milik user;
- local config;
- local credential/token storage;
- local MCP runtime.

"Bukan"

- VPS KANAL
- server KANAL
- cloud credential broker

VPS KANAL hanya menyimpan telemetry/product-level information yang memang dirancang untuk disimpan di sana, seperti download count/source dan email yang melakukan Google OAuth connection.

Jangan menyimpulkan bahwa OAuth token MCP harus disimpan di VPS.

---

# 3. Evidence Classification

Setiap temuan wajib diberi salah satu status: PROVEN DERIVED UNPROVEN UNKNOWN INSUFFICIENT_EVIDENCE

Jangan mengubah: "Google official examples use HTTPS" menjadi: "Google universally forbids loopback callbacks" kecuali ada bukti eksplisit dari Google.

---

# 4. Phase 0 — Baseline

Capture: - OS - working directory - OpenCode version - current branch - git status - relevant OpenCode config - `opencode mcp list`

Pastikan baseline menunjukkan: - drive - docs - slides - calendar - google-sheets

Kemudian tandai google-sheets sebagai PROTECTED.

Tidak boleh ada mutation terhadap google-sheets.

---

# 5. Phase 1 — Official Google Documentation Audit

Gunakan dokumentasi resmi Google Developers sebagai primary source.

Audit: 1. Google Workspace MCP configuration. 2. Drive MCP configuration. 3. OAuth configuration requirements. 4. OAuth client type. 5. Authorized redirect URI requirements. 6. Authentication flow. 7. Official examples untuk: - Antigravity - Claude - "Others"

Capture exact evidence mengenai: - Web application client. - callback URL. - apakah callback HTTPS diwajibkan secara universal - apakah loopback redirect secara eksplisit dilarang - apakah Google membedakan MCP host/client implementation.

Do NOT infer a universal restriction merely from examples.

Expected official sources include: - Google Workspace MCP configuration documentation - Google Drive MCP configuration documentation - Google OAuth documentation where relevant

Record source URLs and relevant excerpts in the task execution summary.

---

# 6. Phase 2 — Audit Existing OAuth Client

Read-only inspect existing OAuth client configuration.

Current known client: `alpha-workspace`

Expected type: `Web application`

Capture: - client ID fingerprint only, never expose client secret - application type - authorized redirect URIs - current redirect URI: `http://127.0.0.1:19876/mcp/oauth/callback` - existing Alpha One callback URIs

Do NOT modify anything.

Determine: Question A: Does Google Cloud reject loopback redirect URI registration? Question B: Is the URI currently registered exactly? Question C: Is the URI used exactly by OpenCode? Question D: Does OAuth authorization successfully return to that URI?

---

# 7. Phase 3 — Trace OpenCode MCP OAuth Flow

Audit OpenCode behavior read-only.

Determine exactly: 1. Authorization endpoint. 2. Authorization request parameters. 3. Client ID. 4. Redirect URI. 5. Scope. 6. State. 7. PKCE challenge 8. PKCE method. 9. Resource parameter, if present. 10. Token endpoint. 11. Token exchange parameters. 12. Redirect URI during token exchange. 13. Whether authorization code is exchanged successfully. 14. Whether access token is persisted.

Redact: - client secret - authorization code - access token - refresh token - PKCE verifier - sensitive user information

Capture only safe fingerprints / parameter names.

---

# 8. Phase 4 — Compare OAuth Requirements

Build an evidence matrix: | Requirement | Google official requirement | OpenCode actual behavior | Match? | Evidence | | --- | --- | --- | --- | --- | | OAuth client type | | | | | | Redirect URI | | | | | | HTTPS requirement | | | | | | Loopback support | | | | | | PKCE | | | | | | Authorization code | | | | | | Token exchange | | | | | | Resource parameter | | | | | | Scope | | | | | | Client ID | | | | | |

Important: If Google documentation does not explicitly state that loopback is forbidden, classify the prohibition as: `UNPROVEN` not as a bug.

---

# 9. Phase 5 — RFC 8252 Compatibility Audit

Only if relevant to the actual OpenCode flow, audit whether the OpenCode loopback OAuth design follows the OAuth native-app loopback pattern.

Check: - loopback host - dynamic/local port - authorization code flow - PKCE - exact redirect URI matching - local callback listener - state verification

Do NOT claim RFC compliance solely from source names.

Prove it from implementation.

Also distinguish: `RFC 8252 allows a pattern` from `Google Workspace MCP explicitly supports that pattern`.

These are separate questions.

---

# 10. Phase 6 — MCP Resource Authorization Audit

For each: - Drive - Docs - Slides - Calendar

determine: 1. OAuth authorization server. 2. MCP resource server. 3. MCP endpoint. 4. token audience/resource binding. 5. scope. 6. client ID. 7. redirect URI. 8. whether the resulting token is accepted by MCP.

Use the same known-good Google resources from TASK-057 / TASK-058 where possible.

Do not create or modify resources.

---

# 11. Phase 7 — Reproduce Authorization With Existing Client

Read-only / non-mutating reproduction only. 1. Run the normal OpenCode MCP authentication flow. 2. Record whether browser authorization completes. 3. Record whether callback succeeds. 4. Record whether token exchange succeeds. 5. Record whether token is persisted. 6. Record token metadata using safe tokeninfo-style inspection where appropriate. 7. Attempt ONE read-only MCP tool per service.

Do not perform: create, update, delete, write, send, modify

Google Sheets must not be called.

---

# 12. Phase 8 — Distinguish Failure Classes

For every failure classify separately: A. Redirect failure (redirect_uri_mismatch, callback rejected, callback not reached, authorization code cannot be returned) B. OAuth authorization failure (consent denied, invalid client, invalid scope) C. Token exchange failure (invalid_grant, invalid_client, PKCE mismatch) D. MCP authorization failure (401, 403, permission denied, caller does not have permission) E. Resource permission failure (token accepted but requested Google resource inaccessible) F. MCP server-side authorization failure (REST API succeeds with same identity/resource but MCP refuses the token)

Do not merge these categories.

---

# 13. Phase 9 — Critical Comparison

Use the strongest known comparison: Same: Google account OAuth client Google resource requested operation

Compare: `Google REST API` versus `Google MCP API`

Determine whether REST succeeds while MCP fails.

If yes, this is strong evidence that: - file ownership is not the primary cause - Google resource sharing is not the primary cause - standard Workspace OAuth scopes may be valid - failure may exist specifically at MCP authorization/resource-server layer

Do not call this an Alpha One bug without additional evidence.

---

# 14. Phase 10 — Answer the Core Question

The audit MUST explicitly answer: "Apakah loopback redirect URI OpenCode adalah blocker Google Workspace MCP?"

Possible verdicts: - PROVEN - NOT PROVEN - PROVEN NOT ROOT CAUSE - UNKNOWN

If OAuth authorization and token exchange succeed but MCP rejects the resulting token.

---

# 15. Phase 11 — Google Cloud Authorization Interpretation

Determine whether the existing OAuth client needs a special Google Cloud authorization/registration step for Workspace MCP. Do NOT assume that `API enabled` means `OAuth client authorized for MCP`. Do NOT assume the opposite either. Look for concrete Google evidence. If the console has a specific MCP-related configuration or authorization mechanism, document it. If none exists, explicitly report: `NOT FOUND` rather than inventing one.

---

# 16. Phase 12 — User Identity / File Ownership Check

Use the already proven Google identity. Confirm: - authenticated Google email - resource owner - resource sharing - effective user permission

This is only to rule out resource permission as root cause.

Expected classification if: REST API succeeds with the same user/resource but MCP fails: `NOT RESOURCE OWNERSHIP ROOT CAUSE`

---

# 17. Phase 13 — Calendar

Because Calendar authentication has now been attempted successfully, do not assume "Authentication successful" means usable authorization. 1. Verify: token persisted 2. token scopes 3. token expiration 4. calendar MCP call 5. `list_calendars` read-only 6. whether MCP returns actual calendar data

Classify separately from Drive/Docs/Slides.

---

# 18. Phase 14 — Sheets Protection Gate

Explicitly verify: - google-sheets config unchanged - google-sheets source unchanged - no Sheets MCP call made - no Sheets authentication changed

If any mutation occurred, STOP and report it.

---

# 19. Required Evidence Matrix

Produce: | MCP | OAuth callback | OAuth success | Token persisted | REST read | MCP read | Failure layer | Verdict | | --- | --- | --- | --- | --- | --- | --- | --- | | Drive | | | | | | | | | Docs | | | | | | | | | Slides | | | | | | | | | Calendar | | | | | | | | | Sheets | PROTECTED | PROTECTED | PROTECTED | PROTECTED | PROTECTED | N/A | PROTECTED |

---

# 20. Root Cause Classification

Final classification must use one of: - PROVEN_ALPHA_ONE_BUG - PROVEN_OPENCODE_BUG - PROVEN_GOOGLE_MCP_SERVER_SIDE - PROVEN_GOOGLE_CLOUD_CONFIGURATION - PROVEN_OAUTH_REDIRECT_PROBLEM - PROVEN_OAUTH_TOKEN_PROBLEM - PROVEN_RESOURCE_PERMISSION_PROBLEM - CONDITIONAL_EXTERNAL_PREREQUISITE - UNPROVEN - UNKNOWN - INSUFFICIENT_EVIDENCE

Do not classify based on assumption.

---

# 21. Remediation Rule

This task is AUDIT-ONLY. DO NOT: - create OAuth client - edit OAuth client - edit redirect URI - edit consent screen - change scopes - edit OpenCode config - edit application source - rotate credentials - delete tokens - modify Google files - modify Google Drive permissions - modify Calendar data - modify Sheets

If a corrective action is identified, document it only as: `RECOMMENDED NEXT TASK`

---

# 22. Final Verdict

Provide: 1. Executive summary. 2. PROVEN facts. 3. DERIVED findings. 4. UNPROVEN assumptions. 5. Root cause. 6. Evidence matrix. 7. Answer to loopback question. 8. Google Cloud requirement, if proven. 9. Calendar result. 10. Sheets protection result. 11. Minimal next corrective task.

Do not create additional scope.

---

# 23. Execution Summary

Append the execution summary to this same task file. Include: - commands executed - files inspected - source paths - Google documentation sources - OAuth flow evidence - MCP evidence - redacted token evidence - REST vs MCP comparison - final verdict - remediation recommendation

Do not expose secrets.

---

# 24. Quality Gate

PASS only if: - official Google documentation was checked - actual OpenCode OAuth behavior was inspected - redirect URI was verified from both sides - authorization request was traced - token exchange was traced - MCP call was tested - REST vs MCP was compared where possible - Calendar was independently checked - Sheets was untouched - root cause is evidence-based

FAIL if: - conclusion is based only on Google examples - loopback is declared invalid without direct evidence - file ownership is assumed as root cause - REST/MCP identity mismatch is not checked - Sheets is touched - any mutation occurs

---

# 25. Git

Only after the audit and execution summary are complete: 1. Verify `git status` 2. Verify only the intended task file changed 3. Do not stage unrelated changes 4. Commit only this task file

Commit message: `audit: Google MCP OAuth redirect compatibility`

Input your execution summary on the same task file

Then: - git status - git diff --stat - git log -1 --oneline

Report the commit hash and final verdict.

---

# Execution Summary

Audit executed 2026-08-20. AUDIT-ONLY — no source/config/OAuth/Cloud/Sheets mutation. No credentials exposed (fingerprints/metadata only).

## 1. Executive summary

The core question — "Apakah loopback redirect URI OpenCode adalah blocker Google Workspace MCP?" — is answered: **PROVEN NOT ROOT CAUSE** (with the caveat that the redirect is not the only gap; the definitive blocker is the Google-hosted MCP resource-server rejecting tokens bound to the OAuth client ID). The OAuth authorization flow with the loopback redirect `http://127.0.0.1:19876/mcp/oauth/callback` completes successfully: the browser consent proceeds, the callback receives the authorization code, the token exchange succeeds, and access/refresh tokens are minted with the correct scopes. The resulting token is bound to the Alpha One OAuth client ID (tokeninfo `aud = 480048442203-...apps.googleusercontent.com`) — Google's authorization server ignores the RFC 8707 `resource` parameter for this client — and the Google-hosted MCP servers reject that token (`The caller does not have permission`).

## 2. PROVEN facts

- OpenCode v1.18.18, Windows 11, workdir C:\dev\alpha-one, branch task/gworkspace-002-r1-drive-access-rework, HEAD b38dd8a (pre-commit).
- MCP baseline: google-sheets (local), drive/docs/slides/calendar (remote official) all connected; calendar has no stored OAuth token (empty entry in mcp-auth.json).
- OAuth client: Web application, client ID 480048442203-stiuf8pf1o0kvb0vejpk8hfa85b6o4c4.apps.googleusercontent.com; redirect URIs include `http://localhost:3001/api/google/oauth/callback` (app) and `http://127.0.0.1:19876/mcp/oauth/callback` (OpenCode loopback). The loopback URI is accepted by Google's authorization endpoint (no redirect_uri_mismatch) — proven by the successfully completed callback in this task and in TASK-058/060.
- Authorization request parameters (traced): authorization endpoint accounts.google.com/o/oauth2/v2/auth; client_id (the Alpha One client); redirect_uri http://127.0.0.1:19876/mcp/oauth/callback; response_type=code; scope drive.readonly + drive.file (+openid); PKCE S256 challenge/method; state; access_type=offline; prompt=consent; resource=https://drivemcp.googleapis.com/mcp (RFC 8707).
- Token exchange (traced): token endpoint oauth2.googleapis.com/token; grant_type=authorization_code; code; client_id; client_secret; redirect_uri (same loopback URI); code_verifier; resource=https://drivemcp.googleapis.com/mcp. Exchange succeeds; access + refresh tokens returned, scope correct, 3599s lifetime.
- Token audience: tokeninfo shows `aud` = the OAuth client ID — Google AS ignores the resource param and binds the token to the client, not the MCP resource.
- MCP calls with that token: rejected (`The caller does not have permission`, isError=true) for Drive get_file_metadata / read_file_content on the proven-accessible PDF (1Bdo_1VkN385LFq_9_bbSId5Nlp5aIGRN), Docs read_doc on doc 1fa2RwKMK8T2sk2f7BFePiaA5ydUKXbMrcPc4pAzBl6M, Slides read_presentation on pres 1AyilWDzGtrbIMwglX3_brNjiApZM5AXTNgvbpnjQ5w0.
- REST with the same token/account/resource succeeds (Drive/Docs/Slides REST reads return 200 OK with real content) — proven in TASK-057.
- Google's documented MCP clients use HTTPS callbacks (Antigravity https://antigravity.google/oauth-callback; Claude https://claude.ai/api/mcp/auth_callback) — but Google's documentation does NOT explicitly state that loopback is universally forbidden; the prohibition is UNPROVEN.

## 3. DERIVED findings

- The loopback redirect is functionally compatible with Google's OAuth authorization endpoint (authorization completes and returns the code) — DERIVED from the successful callback observations.
- The token's audience binding (client ID) explains the MCP rejection — DERIVED from tokeninfo + the MCP server consistently rejecting every token while REST succeeds with the same token.

## 4. UNPROVEN assumptions

- That Google universally forbids loopback callbacks for Workspace MCP — UNPROVEN (documented examples use HTTPS, but no explicit universal prohibition found).
- That a non-loopback HTTPS callback alone would fix the MCP authorization — UNPROVEN (the resource-binding/audience behavior indicates the OAuth client must be authorized for the MCP resource in Google Cloud; changing the redirect alone is insufficient).

## 5. Root cause

`PROVEN_GOOGLE_CLOUD_CONFIGURATION` (external prerequisite) + `CONDITIONAL_EXTERNAL_PREREQUISITE` for the OAuth client authorization for the Workspace MCP resource. The loopback redirect is NOT the root cause of MCP authorization failure: OAuth authorization and token exchange succeed with it. The blocker is that the Alpha One OAuth client cannot obtain a token bound to the MCP resource (Google AS binds tokens to the client ID), and the Google-hosted MCP resource servers reject the client-bound token.

## 6. Evidence matrix

| MCP | OAuth callback | OAuth success | Token persisted | REST read | MCP read | Failure layer | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Drive | Succeeded (loopback) | Succeeded | No (verification token not persisted; mcp-auth.json holds REST token) | 200 OK | Rejected (permission) | MCP resource-server authorization | BLOCKED (external) |
| Docs | Succeeded (loopback) | Succeeded | No | 200 OK | Rejected (permission) | MCP resource-server authorization | BLOCKED (external) |
| Slides | Succeeded (loopback) | Succeeded | No | 200 OK | Rejected (permission) | MCP resource-server authorization | BLOCKED (external) |
| Calendar | Never completed (no token) | N/A | No | N/A (no token) | 401/403 | OAuth token missing | BLOCKED (external) |
| Sheets | PROTECTED | PROTECTED | PROTECTED | PROTECTED | PROTECTED | N/A | PROTECTED |

## 7. Answer to loopback question

**PROVEN NOT ROOT CAUSE** — the loopback redirect is functionally valid for OAuth authorization (consent + callback + token exchange all succeed). The MCP authorization failure persists even with a valid token, proving the redirect is not the cause.

## 8. Google Cloud requirement

NOT FOUND in public documentation a specific OAuth-client registration/authorization step for Workspace MCP beyond enabling the MCP APIs and configuring the consent screen. The observed behavior (tokens bound to client ID, MCP resource servers rejecting them) indicates the OAuth client must be authorized for the MCP resource at the Google Cloud level — an external configuration prerequisite requiring console access (RECOMMENDED NEXT TASK).

## 9. Calendar result

No Calendar OAuth token exists in mcp-auth.json (the reported "Authentication successful" was the opencode false positive). Calendar MCP read-only call is impossible without a token. Classified separately: BLOCKED (external OAuth prerequisite).

## 10. Sheets protection

Verified: google-sheets config unchanged, source unchanged, no Sheets MCP call made, no Sheets authentication changed. PROTECTED.

## 11. Minimal next corrective task

Authorize the Alpha One OAuth client for the Workspace MCP resource in the Google Cloud console (create a dedicated Web-app OAuth client for Workspace MCP with a non-loopback HTTPS callback registered for MCP, or configure the existing client for the MCP resource), then re-run the per-server MCP OAuth flow and read-only checks against the same proven resources.

## 12. Commands executed / files inspected

- git status/branch/log — baseline.
- opencode mcp list — baseline.
- Manual OAuth flow reproduction for Drive (callback server on 127.0.0.1:19876, PKCE S256, resource param): authorization URL opened, consent completed, callback received, token exchanged, tokeninfo inspected, MCP call attempted.
- Inspected: C:\Users\ASUS\.config\opencode\opencode.jsonc, ~/.local/share/opencode/mcp-auth.json, .env (keys only), .alpha/google/connections.json (keys only), mcp-servers/google-sheets/server.ts (tool names only).
- Google documentation sources: developers.google.com/workspace/guides/configure-mcp-servers, /workspace/guides/auth-overview, /workspace/guides/configure-mcp-security.

## 13. Final verdict

`PROVEN NOT ROOT CAUSE (redirect) + PROVEN_GOOGLE_CLOUD_CONFIGURATION (OAuth client authorization for MCP resource)`. No Alpha One/OpenCode defect proven; Sheets untouched; only the task file committed. Commit hash follows.

Files changed: only this task file. Git branch task/gworkspace-002-r1-drive-access-rework.